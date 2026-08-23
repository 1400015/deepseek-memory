/**
 * Injected script — runs in MAIN world.
 * Patches fetch/XHR to inject skills + memory context into API calls.
 * Also strips injected tags from DOM to prevent them from being visible.
 * Stealth: no global flags, no console output, no fingerprintable patterns.
 */

import { normalizeConfig } from "./config.js";
import { patchFetch } from "./fetch-patch.js";
import { patchXmlHttpRequest } from "./xhr-patch.js";

(function () {
  "use strict";

  const CHAT_COMPLETION_PATH = "/api/v0/chat/completion";

  const state = {
    config: normalizeConfig({}),
    sessionUserMsgCounts: {},
  };

  // Use a non-enumerable, hard-to-detect flag
  const flag = Symbol.for("__dsm");
  if (Object.getOwnPropertyDescriptor(window, flag)) return;
  Object.defineProperty(window, flag, { value: true, writable: false, configurable: false });

  // ═══════════════════════════════════════════════════════════
  // DOM LEAK PREVENTION — runs in MAIN world (earliest possible)
  // This strips injected tags from the DOM immediately on page load,
  // before DeepSeek renders the conversation history.
  // ═══════════════════════════════════════════════════════════

  const LEAK_PATTERN = /MEMORY_SYSTEM|<dsmemory>|<\/dsmemory>|<DSM:SKILLS|<DSM:memory_calls|<DSM:memory_write|<\/DSM:SKILLS>|<\/DSM:memory_calls>|<\/DSM:memory_write>/;

  function stripFromText(text) {
    if (!text || !LEAK_PATTERN.test(text)) return text;
    return text
      .replace(/<MEMORY_SYSTEM[^>]*>[\s\S]*?<\/MEMORY_SYSTEM>/gi, "")
      .replace(/<dsmemory[^>]*>[\s\S]*?<\/dsmemory>/gi, "")
      .replace(/<DSM:SKILLS[^>]*>[\s\S]*?<\/DSM:SKILLS>/gi, "")
      .replace(/<DSM:memory_calls[^>]*>[\s\S]*?<\/DSM:memory_calls>/gi, "")
      .replace(/<DSM:memory_write[^>]*>[\s\S]*?<\/DSM:memory_write>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Strip injected tags from a single text node.
   * If the text node contains a complete tag pair, strip it.
   */
  function stripNode(node) {
    if (node.nodeType === 3) {
      const text = node.textContent;
      const cleaned = stripFromText(text);
      if (cleaned !== text) {
        if (cleaned) {
          node.textContent = cleaned;
        } else {
          const parent = node.parentElement;
          if (parent) {
            parent.setAttribute("dsm-stripped", "true");
            parent.style.display = "none";
          }
        }
      }
    } else if (node.nodeType === 1) {
      const tag = node.tagName?.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "noscript") return;
      stripElementDeep(node);
    }
  }

  /**
   * Strip injected tags from an element and all its children.
   * Handles React's text node splitting by checking the parent's
   * full textContent first.
   */
  function stripElementDeep(el) {
    if (!el || el.nodeType !== 1) return;

    // First: check if the parent's full text content contains injected tags.
    // This handles the case where React splits tags across multiple text nodes.
    const fullText = el.textContent || "";
    if (!LEAK_PATTERN.test(fullText)) return;

    // Method 1: Try to strip from the parent's innerHTML
    // This is the most reliable way to handle split text nodes
    if (el.innerHTML && el.innerHTML.length < 100000) {
      let html = el.innerHTML;
      const originalHtml = html;

      // Strip tag pairs from innerHTML
      html = html.replace(/<MEMORY_SYSTEM[^>]*>[\s\S]*?<\/MEMORY_SYSTEM>/gi, "");
      html = html.replace(/<dsmemory[^>]*>[\s\S]*?<\/dsmemory>/gi, "");
      html = html.replace(/<DSM:SKILLS[^>]*>[\s\S]*?<\/DSM:SKILLS>/gi, "");
      html = html.replace(/<DSM:memory_calls[^>]*>[\s\S]*?<\/DSM:memory_calls>/gi, "");
      html = html.replace(/<DSM:memory_write[^>]*>[\s\S]*?<\/DSM:memory_write>/gi, "");

      if (html !== originalHtml) {
        // Clean up whitespace
        html = html.replace(/\n{3,}/g, "\n\n").trim();

        if (!html || html === "<br>" || html === "<br/>" || html === "<br />") {
          el.setAttribute("dsm-stripped", "true");
          el.style.display = "none";
        } else {
          el.innerHTML = html;
          el.setAttribute("dsm-stripped", "true");
        }
        return;
      }
    }

    // Method 2: Walk text nodes individually (fallback)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const textNode of nodes) {
      const text = textNode.textContent;
      const cleaned = stripFromText(text);
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
   * Aggressive global strip: scan the entire document for injected tags.
   * This is the primary defense against visible injected prompts.
   */
  function aggressiveGlobalStrip() {
    if (!document.body) return;

    // Find all elements that might contain injected tags
    const selectors = [
      '.ds-markdown',
      '[class*="markdown"]',
      '[class*="message"]',
      '[class*="chat"]',
      '[class*="content"]',
      '[class*="text"]',
      'pre', 'code', 'p', 'div',
    ];

    const checked = new Set();

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // Skip if already checked or already stripped
          if (checked.has(el) || el.getAttribute("dsm-stripped") === "true") continue;
          checked.add(el);

          // Skip small elements (likely not containing injected tags)
          if (el.textContent.length < 50 || el.textContent.length > 100000) continue;

          if (LEAK_PATTERN.test(el.textContent)) {
            stripElementDeep(el);
          }
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // Also walk all text nodes for any remaining leaks
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let tn;
    while ((tn = walker.nextNode())) {
      if (LEAK_PATTERN.test(tn.textContent) && tn.textContent.length < 50000) {
        textNodes.push(tn);
      }
    }
    for (const textNode of textNodes) {
      stripNode(textNode);
    }
  }

  // Set up DOM observer IMMEDIATELY (before page renders)
  const domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        stripNode(mutation.target);
      }
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          stripNode(node);
        }
      }
    }
  });

  if (document.body) {
    domObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  } else {
    // Wait for body to exist
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        bodyObserver.disconnect();
        domObserver.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        aggressiveGlobalStrip();
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Aggressive strips at key intervals after page load
  aggressiveGlobalStrip();
  setTimeout(aggressiveGlobalStrip, 50);
  setTimeout(aggressiveGlobalStrip, 150);
  setTimeout(aggressiveGlobalStrip, 300);
  setTimeout(aggressiveGlobalStrip, 500);
  setTimeout(aggressiveGlobalStrip, 800);
  setTimeout(aggressiveGlobalStrip, 1200);
  setTimeout(aggressiveGlobalStrip, 2000);
  setTimeout(aggressiveGlobalStrip, 3500);
  setTimeout(aggressiveGlobalStrip, 5000);
  setTimeout(aggressiveGlobalStrip, 8000);

  // Continuous scanning via requestAnimationFrame for the first 3 seconds
  // This catches any content that React renders asynchronously
  let rafStart = performance.now();
  function rafStrip() {
    aggressiveGlobalStrip();
    if (performance.now() - rafStart < 3000) {
      requestAnimationFrame(rafStrip);
    }
  }
  requestAnimationFrame(rafStrip);

  // ═══════════════════════════════════════════════════════════
  // END DOM LEAK PREVENTION
  // ═══════════════════════════════════════════════════════════

  window.addEventListener("dsm:cu", (event) => {
    let nextConfig = event && event.detail ? event.detail : {};
    if (typeof nextConfig === "string") {
      try { nextConfig = JSON.parse(nextConfig); } catch (e) { return; }
    }
    state.config = normalizeConfig(nextConfig || {});
  });

  // Request config immediately and also after a short delay
  window.dispatchEvent(new CustomEvent("dsm:rq"));
  setTimeout(() => window.dispatchEvent(new CustomEvent("dsm:rq")), 500);
  setTimeout(() => window.dispatchEvent(new CustomEvent("dsm:rq")), 1500);

  // Request fresh config before every message send.
  function requestFreshConfig() {
    window.dispatchEvent(new CustomEvent("dsm:rq"));
  }

  patchFetch(state, isChatUrl, requestFreshConfig);
  patchXmlHttpRequest(state, isChatUrl, requestFreshConfig);

  function isChatUrl(url) {
    const s = String(url || "");
    return s.includes(CHAT_COMPLETION_PATH)
      || s.includes("/api/v0/chat/edit_message")
      || s.includes("/api/v0/chat_session/fetch_page")
      || s.includes("/api/v0/chat_session")
      || s.includes("/api/v0/conversation");
  }
})();