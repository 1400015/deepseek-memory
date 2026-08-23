import { mutatePayload, stripBlocksFromJsonValue } from "./payload-mutator.js";

export function patchXmlHttpRequest(state, isChatCompletionUrl, requestFreshConfig) {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._dsm = { m: String(method || "GET").toUpperCase(), u: String(url || "") };
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      const meta = this._dsm || {};
      if (!isChatCompletionUrl(meta.u)) return originalSend.call(this, body);

      // Request fresh config before mutating
      if (requestFreshConfig) requestFreshConfig();

      // Strip injected blocks from ALL conversation-related XHR responses
      if (meta.u.includes("/api/v0/chat_session/fetch_page") ||
          meta.u.includes("/api/v0/chat_session") ||
          meta.u.includes("/api/v0/conversation") ||
          meta.u.includes("/api/chat") ||
          meta.u.includes("chat_session")) {
        this.addEventListener("load", () => {
          try {
            // Quick check: if no injected markers, skip
            if (!this.responseText ||
                (!this.responseText.includes("MEMORY_SYSTEM") &&
                 !this.responseText.includes("dsmemory") &&
                 !this.responseText.includes("DSM:"))) {
              return;
            }
            const data = JSON.parse(this.responseText);
            // Strip ALL injected blocks from chat history
            const cleaned = stripBlocksFromJsonValue(data);
            const cleanedStr = JSON.stringify(cleaned);
            // Replace both responseText and response so all consumers see clean data
            try {
              Object.defineProperty(this, "responseText", { value: cleanedStr, writable: false, configurable: true });
            } catch (_) {}
            try {
              Object.defineProperty(this, "response", { value: cleanedStr, writable: false, configurable: true });
            } catch (_) {}
          } catch (e) {}
        });
        return originalSend.call(this, body);
      }

      const bodyText = getXhrBodyText(body);
      if (!bodyText) return originalSend.call(this, body);

      let payload;
      try { payload = JSON.parse(bodyText); } catch { return originalSend.call(this, body); }

      const mutation = mutatePayload(payload, state);
      if (!mutation.changed) return originalSend.call(this, body);

      return originalSend.call(this, JSON.stringify(mutation.payload));
    } catch (error) {
      return originalSend.call(this, body);
    }
  };
}

function getXhrBodyText(body) {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}