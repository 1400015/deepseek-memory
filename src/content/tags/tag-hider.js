/**
 * Tag Hider — Strips injected DSM tags from the DOM.
 *
 * Handles both raw `<` and HTML-encoded `&lt;` angle brackets,
 * since DeepSeek's renderer may present tags in either form.
 *
 * Uses innerHTML replacement (not text node manipulation) to handle
 * React's virtual DOM text node splitting.
 */

/**
 * Clean DSM tags from a string (innerHTML or textContent).
 * Handles:
 *   1. Fully closed tags: <MEMORY_SYSTEM>...</MEMORY_SYSTEM>
 *   2. Unclosed tags (truncated): <MEMORY_SYSTEM>...
 *   3. Stray/orphaned open/close tags
 *   4. HTML-encoded: &lt;MEMORY_SYSTEM&gt;...&lt;/MEMORY_SYSTEM&gt;
 *   5. All DSM-prefixed tags: <DSM:...>...</DSM:...>
 */
export function cleanDsmString(text) {
  if (!text) return "";
  let s = String(text);

  // Handle HTML-encoded angle brackets
  s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");

  // 1. Fully closed <MEMORY_SYSTEM ...>...</MEMORY_SYSTEM>
  //    Note: opening tag may have attributes like language_hint="auto"
  s = s.replace(/<MEMORY_SYSTEM[^>]*>[\s\S]*?<\/MEMORY_SYSTEM>/gi, "");

  // 2. Fully closed <dsmemory>...</dsmemory>
  s = s.replace(/<dsmemory[^>]*>[\s\S]*?<\/dsmemory>/gi, "");

  // 3. Fully closed <DSM:TAG>...</DSM:TAG> (any DSM-prefixed tag)
  s = s.replace(/<DSM:([A-Za-z0-9_:]+)[^>]*>[\s\S]*?<\/DSM:\1>/gi, "");

  // 4. Unclosed <MEMORY_SYSTEM ...>... (truncated, rest of string)
  s = s.replace(/<MEMORY_SYSTEM[^>]*>[\s\S]*/gi, "");

  // 5. Unclosed <dsmemory>... (truncated)
  s = s.replace(/<dsmemory[^>]*>[\s\S]*/gi, "");

  // 6. Unclosed <DSM:...>... (truncated)
  s = s.replace(/<DSM:[A-Za-z0-9_:]+[^>]*>[\s\S]*/gi, "");

  // 7. Stray/opening-only tags (with or without attributes)
  s = s.replace(/<\/?MEMORY_SYSTEM[^>]*>/gi, "");
  s = s.replace(/<\/?dsmemory[^>]*>/gi, "");
  s = s.replace(/<\/?DSM:[A-Za-z0-9_:]+[^>]*>/gi, "");

  // Clean up excessive whitespace
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  return s;
}

// WeakSet to avoid re-processing the same DOM node
const userMsgCleaned = new WeakSet();

/**
 * Strip DSM tags from a user message DOM node.
 * Uses innerHTML replacement to handle React text node splitting.
 *
 * @param {Element} node - The message container element
 * @returns {boolean} true if tags were found and stripped
 */
export function stripDsmTagsFromUserMessage(node) {
  if (!node || userMsgCleaned.has(node)) return false;

  // Find the text container — DeepSeek uses .ds-markdown or similar classes
  const textContainer =
    node.querySelector(".ds-markdown") ||
    node.querySelector('[class*="markdown"]') ||
    node.querySelector('[class*="message-content"]');

  if (!textContainer) return false;

  const plainText = textContainer.textContent || "";
  // Quick check for any injected markers
  if (!/MEMORY_SYSTEM|dsmemory|DSM:/i.test(plainText)) return false;

  userMsgCleaned.add(node);

  // Use innerHTML for replacement — handles React text node splitting
  const html = textContainer.innerHTML;
  const cleanedHtml = cleanDsmString(html);

  if (cleanedHtml && cleanedHtml !== html) {
    // Parse cleaned HTML and replace children
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedHtml, "text/html");
    textContainer.replaceChildren(...doc.body.childNodes);
    return true;
  } else if (!cleanedHtml || cleanedHtml.length < 3) {
    // Entire message was injected content — hide it
    node.style.display = "none";
    node.setAttribute("dsm-stripped", "true");
    return true;
  }

  return false;
}

/**
 * Hide DSM tags in sidebar titles.
 */
export function hideTagsInSidebar() {
  // DeepSeek sidebar uses various class names for titles
  const selectors = [
    '[class*="chat-item"] [class*="title"]',
    '[class*="sidebar"] [class*="title"]',
    '[class*="session"] [class*="title"]',
    'nav [class*="text"]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent || "";
      if (!/MEMORY_SYSTEM|dsmemory|DSM:/i.test(text)) continue;
      const cleaned = cleanDsmString(text);
      if (cleaned !== text) {
        el.textContent = cleaned;
      }
    }
  }
}

/**
 * Hide DSM tags in the chat header title.
 */
export function hideTagsInHeader() {
  const selectors = [
    '[class*="chat-title"]',
    '[class*="header"] [class*="title"]',
    '[class*="conversation-title"]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent || "";
      if (!/MEMORY_SYSTEM|dsmemory|DSM:/i.test(text)) continue;
      const cleaned = cleanDsmString(text);
      if (cleaned !== text) {
        el.textContent = cleaned;
      }
    }
  }
}

/**
 * Hide DSM tags in popovers, virtual lists, version history, etc.
 */
export function hideDsmTagsInPopovers() {
  const selectors = [
    '[class*="popover"]',
    '[class*="dropdown"]',
    '[class*="tooltip"]',
    '[class*="virtual-list"]',
    '[class*="version"]',
    '[class*="summary"]',
    '[class*="preview"]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent || "";
      if (!/MEMORY_SYSTEM|dsmemory|DSM:/i.test(text)) continue;

      // Check if already cleaned
      if (el.getAttribute("dsm-cleaned") === "true") continue;
      el.setAttribute("dsm-cleaned", "true");

      const cleaned = cleanDsmString(el.textContent || "");
      if (cleaned !== el.textContent) {
        el.textContent = cleaned;
      }
    }
  }
}
