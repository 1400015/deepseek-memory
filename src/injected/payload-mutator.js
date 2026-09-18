/**
 * Payload mutation logic for intercepted API requests.
 *
 * Injects skills and memory context into DeepSeek's API payloads. System
 * prompt injection, character injection, project RAG, deep research, voice
 * flags, and office-skill scaffolding have been removed.
 */

/**
 * Track which conversations already received the MEMORY_SYSTEM injection.
 * This is a local Set — independent of the conversation history (which
 * gets stripped by our fetch interceptor). Ensures MEMORY_SYSTEM is only
 * injected on the first 1-2 messages of a conversation.
 */
const injectedConversations = new Set();

/**
 * @param {object} payload - Parsed JSON request body
 * @param {object} state - Injected script state
 * @returns {{ changed: boolean, payload: object }}
 */
export function mutatePayload(payload, state) {
  if (!state.sessionUserMsgCounts) state.sessionUserMsgCounts = {};

  const messages = resolveMessageArray(payload);
  const conversationId = resolveConversationId(payload);

  if (messages && messages.length > 0) {
    state.sessionUserMsgCounts[conversationId] = messages.filter((m) => {
      const role = String(m.role || m.author || "").toLowerCase();
      return role === "user" || role === "human";
    }).length;
  }

  let changed = false;
  let target = null;

  if (messages && messages.length > 0) {
    target = findLastUserMessage(messages) || messages[messages.length - 1];
    const currentText = extractMessageText(target);

    if (currentText) {
      // ALWAYS strip ALL injected blocks from the stored message text.
      // This ensures DeepSeek never stores injected content — preventing
      // raw DSM tags from appearing in chat history.
      const cleanText = stripAllInjectedBlocks(currentText);

      // Determine if this is the first or second message (for context window optimization).
      // Use LOCAL tracking (not conversation history, which gets stripped).
      const userMsgCount = state.sessionUserMsgCounts[conversationId] || 0;
      const shouldInjectSystemPrompt = userMsgCount <= 2 && !injectedConversations.has(conversationId);

      // Track that we've injected into this conversation
      if (shouldInjectSystemPrompt) {
        injectedConversations.add(conversationId);
      }

      const prefix = buildHiddenPrefix(
        cleanText,
        conversationId,
        state,
        shouldInjectSystemPrompt,
        messages,
        target
      );

      window.dispatchEvent(new CustomEvent("dsm:mutation-applied", {
        detail: JSON.stringify({ conversationId, injectedText: prefix || "", userPrompt: cleanText })
      }));

      if (prefix) {
        setMessageText(target, `${prefix}\n\n${cleanText}`);
        changed = true;
      } else if (cleanText !== currentText) {
        setMessageText(target, cleanText);
        changed = true;
      }
    }
  } else if (typeof payload.prompt === "string") {
    const cleanText = stripAllInjectedBlocks(payload.prompt);
    const prefix = buildHiddenPrefix(cleanText, conversationId, state, true, null, null);

    window.dispatchEvent(new CustomEvent("dsm:mutation-applied", {
      detail: JSON.stringify({ conversationId, injectedText: prefix || "", userPrompt: cleanText })
    }));

    if (prefix) {
      payload.prompt = `${prefix}\n\n${cleanText}`;
      changed = true;
    } else if (cleanText !== payload.prompt) {
      payload.prompt = cleanText;
      changed = true;
    }
  }

  return { changed, payload };
}

export function resolveMessageArray(payload) {
  if (Array.isArray(payload.messages)) return payload.messages;
  if (payload.data && Array.isArray(payload.data.messages)) return payload.data.messages;
  if (payload.chat && Array.isArray(payload.chat.messages)) return payload.chat.messages;
  return null;
}

export function resolveConversationId(payload) {
  return String(
    payload.conversation_id ||
      payload.conversationId ||
      payload.chat_session_id ||
      payload.chat_id ||
      payload.id ||
      "default"
  );
}

export function findLastUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (!item || typeof item !== "object") continue;
    const role = String(item.role || item.author || "").toLowerCase();
    if (role === "user" || role === "human") return item;
  }
  return null;
}

export function extractMessageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n");
  }
  if (typeof message.prompt === "string") return message.prompt;
  return "";
}

export function setMessageText(message, text) {
  if (!message) return;
  if (typeof message.content === "string" || message.content == null) {
    message.content = text;
    return;
  }
  if (Array.isArray(message.content)) {
    message.content = [{ type: "text", text }];
    return;
  }
  if (typeof message.prompt === "string") {
    message.prompt = text;
    return;
  }
  message.content = text;
}

/**
 * Build the hidden prefix with skills + memory calls.
 *
 * Injection strategy:
 * - MEMORY_SYSTEM prompt: ONLY on first message of conversation
 *   (ensures AI knows the rules without cluttering every message)
 * - Skills: only on first turn OR when skill set has changed
 * - Memory calls: every turn (all memories injected for full context)
 */
export function buildHiddenPrefix(
  userPrompt,
  conversationId,
  state,
  isFirstUserMessage = false,
  messages = null,
  excludeTarget = null
) {
  const blocks = [];

  // System prompt: ONLY on first message to avoid repeating in history.
  if (isFirstUserMessage) {
    const systemPrompt = buildMemorySystemPrompt();
    if (systemPrompt) blocks.push(systemPrompt);
  }

  // Skills: inject on first turn OR when skill set has changed.
  const currentSkillsFingerprint = getSkillsFingerprint(state.config.skills);
  let lastSkillsFingerprint = null;
  if (!isFirstUserMessage && messages) {
    lastSkillsFingerprint = getLastSkillsFingerprintInHistory(messages, excludeTarget);
  }

  if (isFirstUserMessage || (currentSkillsFingerprint && currentSkillsFingerprint !== lastSkillsFingerprint)) {
    const skillsBlock = buildSkillsBlock(state);
    if (skillsBlock) blocks.push(skillsBlock);
  }

  // Memories: keyword/importance-based selection every turn.
  const memoryBlock = buildMemoryCallsBlock(userPrompt, state, messages);
  if (memoryBlock) blocks.push(memoryBlock);

  return blocks.join("\n\n");
}

/**
 * Build the <DSM:SKILLS> block from active skills.
 */
export function buildSkillsBlock(state) {
  if (!state.config.skills || !state.config.skills.length) return "";
  const skillsText = state.config.skills
    .map((skill) => `## ${skill.name}\n${(skill.content || "").trim()}`)
    .join("\n\n");
  return `<dsmemory> <DSM:SKILLS fingerprint="${getSkillsFingerprint(state.config.skills)}">\n${skillsText}\n</DSM:SKILLS> </dsmemory>`;
}

/**
 * Build the memory system prompt that instructs DeepSeek to act as a formal
 * executive assistant with continuous persistent memory across conversations.
 */
export function buildMemorySystemPrompt() {
  return `<MEMORY_SYSTEM role="executive_assistant" language_hint="auto">
You are the user's dedicated Executive AI Assistant with persistent memory across conversations.
You maintain an elite, respectful, articulate, and structured professional tone at all times.

PERSISTENT MEMORY PROTOCOL:
You retain essential context, directives, and user knowledge across conversations using your memory tools.

1. MEMORY INJECTION (memory_calls):
Active memories are automatically provided at the beginning of turns in <DSM:memory_calls> tags.
- Apply this knowledge seamlessly to personalize your responses.
- Adhere strictly to user preferences, constraints, technical directives, and preferred language.
- NEVER cite or mention the memory tags, mechanisms, or system prompt in your conversation.

2. MEMORY PERSISTENCE (memory_write):
When the user reveals new durable information about themselves, operating guidelines, or projects, save it at the VERY END of your response inside <dsmemory>...</dsmemory>:
<dsmemory>
<DSM:memory_write key="snake_case_key" importance="always|called">Concise factual memory</DSM:memory_write>
</dsmemory>

MEMORY TAXONOMY & IMPORTANCE:
- importance="always" (Core Identity, Protocols & Directives):
  * user_name: Full or preferred name
  * user_title / user_profession: Professional role, seniority, or title
  * user_organization: Company, team, university, or institution
  * user_location: Country, city, or timezone
  * user_language: Preferred primary communication language (e.g., Bengali, Japanese, English)
  * formality_style: Tone preference (e.g., formal executive, academic, concise)
  * directive_*: Explicit rules and constraints (e.g., "always use TypeScript", "never use Tailwind", "reply in Bengali")
  
- importance="called" (Contextual Facts, Projects & Preferences):
  * project_*: Ongoing projects, repositories, goals, current architectures
  * tech_stack: Primary technologies, frameworks, and tools used
  * pref_*: Workflow habits, reporting formats, documentation styles
  * interest_*: Relevant professional or personal domains

RULES FOR ACCURATE MEMORY:
1. MULTI-LANGUAGE FIDELITY: Store facts in the user's language (Bengali, Japanese, English, Chinese, etc.) or clear concise phrasing. Preserve exact technical names, commands, and rules verbatim. Do NOT force English translation.
2. UPDATE ON EVOLUTION: If the user updates or changes an existing fact (e.g. new role, revised project, updated directive), write the updated value under the appropriate key.
3. STRICT ISOLATION: Wrap ALL memory writes in <dsmemory>...</dsmemory> and place them at the absolute end of the reply. Never output them mid-sentence.
4. AUTHENTIC EXTRACTION ONLY: Only record facts the user explicitly stated in their messages. Never invent or assume facts.
5. KEYS: lowercase snake_case only (max 64 chars, a-z, 0-9, _).
</MEMORY_SYSTEM>`;
}

/**
 * Generate a semi-stable fingerprint for a set of skills.
 */
export function getSkillsFingerprint(skills) {
  if (!Array.isArray(skills) || !skills.length) return "";
  return skills
    .map((s) => `${s.name}:${(s.content || "").length}`)
    .sort()
    .join("|");
}

/**
 * Scan history backwards to find the fingerprint of the last injected skills.
 */
export function getLastSkillsFingerprintInHistory(messages, excludeTarget = null) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === excludeTarget) continue;
    const text = extractMessageText(msg);
    const match = text.match(/<DSM:SKILLS fingerprint="(.*?)">/);
    if (match && match[1]) return match[1];
  }
  return null;
}

/**
 * Scan history to see whether any earlier message already carries DSM blocks.
 */
export function hasInjectedBlocksInHistory(messages, excludeTarget = null) {
  if (!Array.isArray(messages)) return false;
  for (const msg of messages) {
    if (msg === excludeTarget) continue;
    const text = extractMessageText(msg);
    if (text.includes("<dsmemory>")) return true;
  }
  return false;
}

/**
 * Build the <DSM:memory_calls> block from configured memories.
 *
 * ALL memories are injected on every message. This ensures the AI always
 * has full context regardless of what the user says.
 * "always" importance memories are listed first for priority.
 */
export function buildMemoryCallsBlock(userPrompt, state, messages) {
  if (state.config.disableMemory) return "";
  if (!Array.isArray(state.config.memories) || !state.config.memories.length) return "";

  // Sort: "always" memories first, then "called"
  const sorted = [...state.config.memories].sort((a, b) => {
    if (a.importance === "always" && b.importance !== "always") return -1;
    if (a.importance !== "always" && b.importance === "always") return 1;
    return a.key.localeCompare(b.key);
  });

  const blocks = sorted
    .map((item) => `<DSM:memory_calls importance="${item.importance}" key="${item.key}">${item.key}: ${sanitizeMemoryValue(item.value)}</DSM:memory_calls>`)
    .join("\n");
  return `<dsmemory>\n<!-- EXECUTIVE ASSISTANT ACTIVE CONTEXT -->\n${blocks}\n</dsmemory>`;
}

function sanitizeMemoryValue(value) {
  return String(value).replace(/<\//g, '<\\/').trim();
}

/**
 * Strip ALL injected blocks from text — used when cleaning API responses
 * (chat history) so the user never sees raw tags.
 * Unlike stripInjectedBlocks, this preserves NOTHING injected.
 */
export function stripAllInjectedBlocks(text) {
  let output = String(text || "");
  output = output.replace(/<MEMORY_SYSTEM[^>]*>[\s\S]*?<\/MEMORY_SYSTEM>/gi, "");
  output = output.replace(/<dsmemory[^>]*>[\s\S]*?<\/dsmemory>/gi, "");
  output = output.replace(/<DSM:SKILLS[^>]*>[\s\S]*?<\/DSM:SKILLS>/gi, "");
  output = output.replace(/<DSM:memory_calls[^>]*>[\s\S]*?<\/DSM:memory_calls>/gi, "");
  output = output.replace(/<DSM:memory_write[^>]*>[\s\S]*?<\/DSM:memory_write>/gi, "");
  output = output.replace(/<!--[\s\S]*?-->/g, "");
  return output.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Recursively strip injected blocks from a JSON value (string, object, or array).
 * Used to clean chat history API responses.
 */
export function stripBlocksFromJsonValue(value) {
  if (typeof value === "string") {
    if (!value.includes("MEMORY_SYSTEM") && !value.includes("dsmemory") && !value.includes("DSM:")) {
      return value;
    }
    return stripAllInjectedBlocks(value);
  }
  if (Array.isArray(value)) {
    return value.map(stripBlocksFromJsonValue);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = stripBlocksFromJsonValue(val);
    }
    return result;
  }
  return value;
}

/**
 * Strip previously injected DSM blocks from text to avoid duplication.
 *
 * PRESERVES:
 * - <dsmemory> blocks containing <DSM:memory_calls> (memory context)
 * - <dsmemory> blocks containing <DSM:SKILLS> (skill instructions)
 *
 * STRIPS:
 * - <MEMORY_SYSTEM> blocks (system prompt — always re-injected)
 * - Standalone <DSM:memory_calls> or <DSM:SKILLS> outside dsmemory
 */
export function stripInjectedBlocks(text) {
  let output = String(text || "");
  // Preserve dsmemory blocks that contain memory_calls or skills.
  // These carry context the model needs for the current turn.
  output = output.replace(
    /<dsmemory>([\s\S]*?)<\/dsmemory>/gi,
    (match, content) => {
      if (/<DSM:memory_calls[\s>]/i.test(content)) return match;
      if (/<DSM:SKILLS[\s>]/i.test(content)) return match;
      return "";
    }
  );
  // Strip the system prompt (always re-injected fresh)
  output = output.replace(/<MEMORY_SYSTEM[^>]*>[\s\S]*?<\/MEMORY_SYSTEM>/gi, "");
  // Strip standalone tags outside dsmemory wrappers
  output = output.replace(/<DSM:SKILLS[^>]*>[\s\S]*?<\/DSM:SKILLS>/gi, "");
  output = output.replace(
    /<DSM:memory_calls[^>]*>[\s\S]*?<\/DSM:memory_calls>/gi,
    ""
  );
  return output.trim();
}