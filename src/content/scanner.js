/**
 * DOM observation and memory-write scanning.
 *
 * Based on Better DeepSeek's architecture:
 * - MutationObserver for real-time DOM change detection
 * - innerHTML-based stripping (handles React text node splitting)
 * - WeakSet-based deduplication (avoids re-processing)
 * - Continuous scanning at multiple intervals
 */

import state from "./state.js";
import { extractMemoryWritesFromBlock } from "./parser/memory-parser.js";
import {
  cleanDsmString,
  stripDsmTagsFromUserMessage,
  hideTagsInSidebar,
  hideTagsInHeader,
  hideDsmTagsInPopovers,
} from "./tags/tag-hider.js";

const PROCESSED_HASH = new Set();
const TAG_REGEX = /<dsmemory>[\s\S]*?<\/dsmemory>/gi;
const LEAK_RE = /MEMORY_SYSTEM|dsmemory|DSM:/i;

/** @type {MutationObserver | null} */
let observer = null;

/** @type {number | null} */
let periodicTimer = null;

/** @type {number | null} */
let debounceTimer = null;

// WeakSet to track processed message nodes
const messageProcessed = new WeakSet();

/**
 * Start the memory scanner.
 */
export function initMemoryScanner() {
  if (observer) return;
  if (!document.body) return;

  // Immediate strip on page load
  aggressiveInitialStrip();

  // MutationObserver — detect new DOM nodes as DeepSeek renders
  observer = new MutationObserver((mutations) => {
    let hasNewNodes = false;

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            hasNewNodes = true;
          }
          if (node.nodeType === 3) {
            const t = node.textContent || "";
            if (t.includes("DSM:memory_write")) {
              processTextNode(node);
            }
          }
        }
      }
      if (mutation.type === "characterData") {
        const text = mutation.target.textContent || "";
        if (text.includes("DSM:memory_write")) {
          processTextNode(mutation.target);
        }
      }
    }

    // Debounced full scan (100ms — fast enough to catch before user sees)
    if (hasNewNodes) {
      scheduleScan();
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    characterDataOldValue: false,
  });

  // Periodic scan fallback (every 1.5 seconds)
  periodicTimer = setInterval(() => {
    scanAllElements();
    scanAllMessages();
    stripEditTagFromTextareas();
    hideTagsInSidebar();
    hideTagsInHeader();
    hideDsmTagsInPopovers();
  }, 1500);

  // Aggressive scans after page load — catch React's async rendering
  setTimeout(aggressiveInitialStrip, 50);
  setTimeout(aggressiveInitialStrip, 150);
  setTimeout(aggressiveInitialStrip, 300);
  setTimeout(aggressiveInitialStrip, 500);
  setTimeout(aggressiveInitialStrip, 800);
  setTimeout(aggressiveInitialStrip, 1200);
  setTimeout(aggressiveInitialStrip, 2000);
  setTimeout(aggressiveInitialStrip, 3500);
  setTimeout(aggressiveInitialStrip, 5000);
  setTimeout(aggressiveInitialStrip, 8000);

  // Continuous scanning via requestAnimationFrame for first 4 seconds
  let rafStart = performance.now();
  function rafStrip() {
    scanAllElements();
    if (performance.now() - rafStart < 4000) {
      requestAnimationFrame(rafStrip);
    }
  }
  requestAnimationFrame(rafStrip);

  // Listen for visibility changes (tab switch, focus)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      aggressiveInitialStrip();
    }
  });

  window.addEventListener("focus", () => {
    setTimeout(aggressiveInitialStrip, 50);
  });

  // SPA navigation detection
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // New page — run aggressive strip after short delay
      setTimeout(aggressiveInitialStrip, 200);
      setTimeout(aggressiveInitialStrip, 500);
      setTimeout(aggressiveInitialStrip, 1000);
      // WeakSet doesn't have .clear() — just create new one
      // (old WeakSet will be garbage collected when elements are removed from DOM)
    }
  }, 1000);

  // Initial scans
  scanForMemoryTags();
  scanAllElements();
  scanAllMessages();
}

/**
 * Debounced scan — triggered by MutationObserver.
 * Runs 140ms after the last DOM mutation to batch updates.
 */
function scheduleScan() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    scanAllElements();
    scanAllMessages();
    hideTagsInSidebar();
    hideTagsInHeader();
    hideDsmTagsInPopovers();
    debounceTimer = null;
  }, 100);
}

/**
 * Stop the scanner.
 */
export function stopMemoryScanner() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// ── Edit Textarea Stripping ──

/**
 * Strip injected tags from edit textareas.
 * When a user clicks "edit" on a message, DeepSeek shows a textarea
 * with the full message content including injected tags. We need to
 * detect this and strip the tags from the textarea value.
 */
function stripEditTagFromTextareas() {
  if (!document.body) return;

  // DeepSeek edit textareas — try multiple selectors
  const selectors = [
    'textarea[class*="edit"]',
    'textarea[class*="message"]',
    'div[contenteditable="true"]',
    '[class*="edit"] textarea',
    '[class*="edit"] [contenteditable="true"]',
    'textarea',
  ];

  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const value = el.value || el.textContent || "";
        if (!LEAK_RE.test(value)) continue;

        const cleaned = cleanDsmString(value);
        if (cleaned !== value) {
          if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
            el.value = cleaned;
            // Trigger React's change detection
            el.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            el.textContent = cleaned;
          }
        }
      }
    } catch (e) {
      // Invalid selector, skip
    }
  }
}

// ── Aggressive Initial Strip ──

/**
 * Strip ALL leaked tags from the entire document.
 * Scans EVERY element, not just specific class names.
 * This is the primary defense against visible injected prompts.
 */
function aggressiveInitialStrip() {
  if (!document.body) return;

  // 1. Scan EVERY element that contains injected tags
  scanAllElements();

  // 2. Strip from edit textareas
  stripEditTagFromTextareas();

  // 3. Strip from sidebar, header, popovers
  hideTagsInSidebar();
  hideTagsInHeader();
  hideDsmTagsInPopovers();

  // 3. Walk all remaining text nodes for any leaks
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const t = node.textContent || "";
        if (LEAK_RE.test(t) && t.length < 50000) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  const textNodes = [];
  let tn;
  while ((tn = walker.nextNode())) textNodes.push(tn);

  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    const cleaned = text
      .replace(/<MEMORY_SYSTEM[^>]*>[\s\S]*?<\/MEMORY_SYSTEM>/gi, "")
      .replace(/<dsmemory>[\s\S]*?<\/dsmemory>/gi, "")
      .replace(/<DSM:[A-Za-z0-9_:]+[^>]*>[\s\S]*?<\/DSM:[A-Za-z0-9_:]+>/gi, "")
      .replace(/<\/?MEMORY_SYSTEM>/gi, "")
      .replace(/<\/?dsmemory>/gi, "")
      .replace(/<\/?DSM:[A-Za-z0-9_:]+[^>]*>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleaned !== text) {
      if (cleaned) {
        textNode.textContent = cleaned;
      } else {
        const parent = textNode.parentElement;
        if (parent) {
          parent.setAttribute("dsm-stripped", "true");
          parent.style.display = "none";
        }
      }
    }
  }
}

/**
 * Scan the DOM for injected tags and strip them.
 *
 * The key insight: React splits injected tags across MULTIPLE text nodes.
 * So we can't just scan individual text nodes — we must go up to the
 * PARENT element and strip from its innerHTML, which contains the full
 * text including all child text nodes.
 */
function scanAllElements() {
  if (!document.body) return;

  // Step 1: Find text nodes that contain any leak marker
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const t = node.textContent || "";
        if (LEAK_RE.test(t) && t.length < 50000) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  const leakNodes = [];
  let tn;
  while ((tn = walker.nextNode())) leakNodes.push(tn);

  // Step 2: For each leak text node, walk UP to find the nearest ancestor
  // whose innerHTML contains the full injected block (both opening and closing tags).
  // Then strip from that ancestor's innerHTML.
  const strippedAncestors = new WeakSet();

  for (const textNode of leakNodes) {
    // Walk up the DOM tree to find an ancestor with full block
    let ancestor = textNode.parentElement;
    let found = false;

    while (ancestor && ancestor !== document.body) {
      if (strippedAncestors.has(ancestor)) {
        found = true;
        break;
      }

      const ancestorText = ancestor.textContent || "";
      const ancestorHtml = ancestor.innerHTML || "";

      // Check if this ancestor contains a FULL injected block
      // (both opening and closing tags in its textContent)
      const hasFullBlock =
        /<MEMORY_SYSTEM[^>]*>[\s\S]*?<\/MEMORY_SYSTEM>/i.test(ancestorText) ||
        /<dsmemory>[\s\S]*?<\/dsmemory>/i.test(ancestorText) ||
        /<DSM:[A-Za-z0-9_:]+[\s\S]*?<\/DSM:[A-Za-z0-9_:]+>/i.test(ancestorText);

      // Also check for partial blocks (just opening tag without closing)
      const hasPartialBlock =
        /MEMORY_SYSTEM/.test(ancestorText) ||
        /dsmemory/.test(ancestorText) ||
        /DSM:/.test(ancestorText);

      if (hasFullBlock || hasPartialBlock) {
        // This ancestor contains the injected content — strip from its innerHTML
        if (ancestorHtml && ancestorHtml.length < 200000) {
          const cleanedHtml = cleanDsmString(ancestorHtml);
          if (cleanedHtml !== ancestorHtml) {
            ancestor.innerHTML = cleanedHtml;
            ancestor.setAttribute("dsm-stripped", "true");
            strippedAncestors.add(ancestor);
            found = true;
            break;
          }
        }
      }

      // If ancestor is a "container" (has class names suggesting it's a message),
      // stop climbing to avoid breaking the page
      if (
        ancestor.classList?.contains("ds-markdown") ||
        ancestor.classList?.contains("ds-message") ||
        ancestor.className?.includes("markdown") ||
        ancestor.className?.includes("message")
      ) {
        // Try stripping from this container
        if (ancestorHtml && ancestorHtml.length < 200000) {
          const cleanedHtml = cleanDsmString(ancestorHtml);
          if (cleanedHtml !== ancestorHtml) {
            ancestor.innerHTML = cleanedHtml;
            ancestor.setAttribute("dsm-stripped", "true");
            strippedAncestors.add(ancestor);
          }
        }
        found = true;
        break;
      }

      ancestor = ancestor.parentElement;
    }

    // Fallback: if no ancestor was found, strip from the text node itself
    if (!found) {
      const text = textNode.textContent || "";
      const cleaned = text
        .replace(/<MEMORY_SYSTEM>[\s\S]*?<\/MEMORY_SYSTEM>/gi, "")
        .replace(/<dsmemory>[\s\S]*?<\/dsmemory>/gi, "")
        .replace(/<DSM:[A-Za-z0-9_:]+[^>]*>[\s\S]*?<\/DSM:[A-Za-z0-9_:]+>/gi, "")
        .replace(/<\/?MEMORY_SYSTEM[^>]*>/gi, "")
        .replace(/<\/?dsmemory>/gi, "")
        .replace(/<\/?DSM:[A-Za-z0-9_:]+[^>]*>/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (cleaned !== text) {
        if (cleaned) {
          textNode.textContent = cleaned;
        } else {
          const parent = textNode.parentElement;
          if (parent) {
            parent.setAttribute("dsm-stripped", "true");
            parent.style.display = "none";
          }
        }
      }
    }
  }
}

// ── Message Scanning ──

/**
 * Scan ALL user messages in the DOM and strip injected tags.
 * Fallback for specific message containers.
 */
function scanAllMessages() {
  if (!document.body) return;

  // Find all user message containers — try multiple selectors
  const messages = document.querySelectorAll(
    '.ds-message, [class*="message"], [class*="chat"], [class*="user-msg"]'
  );

  for (const msg of messages) {
    if (messageProcessed.has(msg)) continue;
    if (msg.getAttribute("dsm-stripped") === "true") continue;

    processMessageNode(msg);
  }
}

/**
 * Process a single message node.
 * Strip injected tags using innerHTML replacement.
 */
function processMessageNode(node) {
  if (!node || messageProcessed.has(node)) return;

  // Find the text container — try multiple selectors
  const textContainer =
    node.querySelector(".ds-markdown") ||
    node.querySelector('[class*="markdown"]') ||
    node.querySelector('[class*="message-content"]') ||
    node.querySelector('[class*="text"]') ||
    node.querySelector("p") ||
    node.querySelector("div");

  if (!textContainer) return;

  const plainText = textContainer.textContent || "";
  if (!LEAK_RE.test(plainText)) return;

  messageProcessed.add(node);

  // Use innerHTML for replacement — handles React text node splitting
  const html = textContainer.innerHTML;
  const cleanedHtml = cleanDsmString(html);

  if (cleanedHtml && cleanedHtml !== html) {
    // Parse cleaned HTML and replace children
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanedHtml, "text/html");
    textContainer.replaceChildren(...doc.body.childNodes);
  } else if (!cleanedHtml || cleanedHtml.length < 3) {
    // Entire message was injected content — hide it
    node.style.display = "none";
    node.setAttribute("dsm-stripped", "true");
  }
}

// ── Memory Write Scanning ──

function scanForMemoryTags() {
  if (!document.body) return;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const text = node.textContent || "";
        if (text.includes("DSM:memory_write")) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  let textNode;
  while ((textNode = walker.nextNode())) {
    processTextNode(textNode);
  }
}

function processTextNode(textNode) {
  const text = textNode.textContent || "";
  if (!text.includes("DSM:memory_write")) return;

  const hash = hashText(text);
  if (PROCESSED_HASH.has(hash)) return;
  PROCESSED_HASH.add(hash);

  if (PROCESSED_HASH.size > 1000) {
    const first = PROCESSED_HASH.values().next().value;
    PROCESSED_HASH.delete(first);
  }

  const writes = extractMemoryWritesFromBlock(text);
  if (writes.length > 0) {
    saveMemoryWrites(writes);
  }

  hideTagsFromTextNode(textNode);
}

function hideTagsFromTextNode(textNode) {
  const text = textNode.textContent || "";
  if (!text.includes("<dsmemory>")) return;

  const cleaned = text.replace(TAG_REGEX, "").trim();
  if (cleaned !== text) {
    if (cleaned) {
      textNode.textContent = cleaned;
    } else {
      const parent = textNode.parentElement;
      if (parent) {
        parent.style.display = "none";
      }
    }
  }
}

// ── Memory Write Saving ──

const BLACKLISTED_VALUES = new Set([
  "example_name", "extracted_name", "extracted_country", "extracted_language",
  "placeholder", "example", "[fact from user", "[extracted_",
  "[user_name]", "[user_country]", "[user_language]",
  "your_name_here", "your_country_here", "sample_name",
]);

function isValidMemoryWrite(write, existing) {
  if (!write.key || !write.value) return false;

  const valueLower = write.value.toLowerCase().trim();

  for (const blacklisted of BLACKLISTED_VALUES) {
    if (valueLower.includes(blacklisted)) return false;
  }

  // Only reject if the ENTIRE value is a bracketed placeholder like [user_name]
  if (/^\[[^\]]*\]$/.test(write.value.trim()) || /^<[^>]*>$/.test(write.value.trim())) return false;
  if (write.key === "user_name" && write.value.length < 2) return false;

  return true;
}

async function saveMemoryWrites(writes) {
  try {
    const existing = state.memories || {};
    let changed = false;
    const savedKeys = [];

    for (const write of writes) {
      if (!isValidMemoryWrite(write, existing)) continue;

      const existingEntry = existing[write.key];
      if (existingEntry && existingEntry.value === write.value && existingEntry.importance === write.importance) continue;

      existing[write.key] = {
        value: write.value,
        importance: write.importance,
        updatedAt: Date.now(),
      };
      changed = true;
      savedKeys.push(write.key);
    }

    if (changed) {
      state.memories = existing;

      const { saveMemoriesToStorage } = await import("./storage.js");
      await saveMemoriesToStorage(existing);

      const { pushConfigToPage } = await import("./bridge.js");
      pushConfigToPage();

      if (state.ui) {
        state.ui.refreshMemories();
      }

      if (savedKeys.length > 0) {
        showInlineNotification(savedKeys);
      }
    }
  } catch (error) {
    // Silent fail
  }
}

function showInlineNotification(keys) {
  const thinkingBlock =
    document.querySelector('[class*="ds-thinking"]') ||
    document.querySelector('[class*="thinking"]') ||
    document.querySelector('[class*="thought"]');

  if (!thinkingBlock) return;

  const notif = document.createElement("div");
  notif.className = "dsmemory-inline-notif";
  notif.textContent = `Memory saved: ${keys.join(", ")}`;
  notif.style.cssText = `
    padding: 6px 12px;
    margin-bottom: 8px;
    font-size: 12px;
    color: #8e8ea0;
    background: transparent;
    border-radius: 6px;
    animation: dsmemory-fade 3s ease forwards;
  `;

  thinkingBlock.parentElement?.insertBefore(notif, thinkingBlock);

  setTimeout(() => {
    notif.remove();
  }, 3200);
}

function hashText(text) {
  return `${text.slice(0, 200)}:${text.length}`;
}
