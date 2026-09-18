/**
 * Robust extractor for memory writes from assistant message text.
 *
 * Supports:
 * 1. Standard XML tags with arbitrary attribute order and quote styles:
 *    <DSM:memory_write key="..." importance="...">value</DSM:memory_write>
 *    <DSM:memory_write importance="..." key="...">value</DSM:memory_write>
 * 2. Self-closing tags:
 *    <DSM:memory_write key="..." value="..." importance="..." />
 * 3. Case-insensitive tags (<dsm:memory_write>, <memory_write>)
 * 4. HTML-encoded angle brackets (&lt;DSM:memory_write ...&gt;)
 * 5. Structured JSON arrays inside <dsmemory>[...]</dsmemory>
 * 6. Multilingual values (Bengali, Japanese, English, etc.)
 */

/**
 * @param {string} text - Raw text from an assistant message
 * @returns {Array<{key: string, value: string, importance: 'always'|'called'}>}
 */
export function extractMemoryWrites(text) {
  if (!text || typeof text !== "string") return [];

  // Unescape common HTML entities
  const clean = text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");

  const writes = [];
  const seenKeys = new Set();

  // 1. Check for XML tags: <DSM:memory_write ...>...</DSM:memory_write>
  const tagRegex = /<(?:dsm:)?memory_write\b([^>]*)>([\s\S]*?)<\/(?:dsm:)?memory_write>/gi;
  let match;

  while ((match = tagRegex.exec(clean)) !== null) {
    const attrs = match[1];
    const bodyValue = match[2].trim();

    const key = parseAttribute(attrs, "key");
    const importance = parseAttribute(attrs, "importance");
    const value = bodyValue || parseAttribute(attrs, "value");

    const sanitizedKey = sanitizeKey(key);
    if (sanitizedKey && value && !seenKeys.has(sanitizedKey)) {
      seenKeys.add(sanitizedKey);
      writes.push({
        key: sanitizedKey,
        value: cleanValue(value),
        importance: normalizeImportance(importance),
      });
    }
  }

  // 2. Check for self-closing tags: <DSM:memory_write key="..." value="..." />
  const selfClosingRegex = /<(?:dsm:)?memory_write\b([^>]*?)\/>/gi;
  let selfMatch;

  while ((selfMatch = selfClosingRegex.exec(clean)) !== null) {
    const attrs = selfMatch[1];
    const key = parseAttribute(attrs, "key");
    const value = parseAttribute(attrs, "value");
    const importance = parseAttribute(attrs, "importance");

    const sanitizedKey = sanitizeKey(key);
    if (sanitizedKey && value && !seenKeys.has(sanitizedKey)) {
      seenKeys.add(sanitizedKey);
      writes.push({
        key: sanitizedKey,
        value: cleanValue(value),
        importance: normalizeImportance(importance),
      });
    }
  }

  // 3. Check for JSON format inside text or tags (e.g. [{"key": "...", "value": "..."}])
  const jsonWrites = extractJsonWrites(clean);
  for (const jw of jsonWrites) {
    if (!seenKeys.has(jw.key)) {
      seenKeys.add(jw.key);
      writes.push(jw);
    }
  }

  return writes;
}

/**
 * Extract memory writes wrapped inside <dsmemory> blocks.
 */
export function extractMemoryWritesFromBlock(text) {
  if (!text || typeof text !== "string") return [];

  const blockRegex = /<dsmemory[^>]*>([\s\S]*?)<\/dsmemory>/gi;
  let allWrites = [];
  let blockMatch;

  while ((blockMatch = blockRegex.exec(text)) !== null) {
    const blockContent = blockMatch[1];
    const writes = extractMemoryWrites(blockContent);
    allWrites = allWrites.concat(writes);
  }

  // Fallback: check outside of dsmemory tags if no writes found inside
  if (allWrites.length === 0) {
    allWrites = extractMemoryWrites(text);
  }

  return allWrites;
}

/**
 * Helper to extract an attribute value from an attribute string.
 * Handles single quotes, double quotes, or unquoted values.
 */
function parseAttribute(attrsString, attrName) {
  if (!attrsString) return "";
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrsString.match(re);
  if (!m) return "";
  return m[1] || m[2] || m[3] || "";
}

/**
 * Extract JSON format memory writes if model emitted JSON.
 */
function extractJsonWrites(text) {
  const list = [];
  try {
    const jsonMatch = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const key = sanitizeKey(item.key);
          const value = cleanValue(item.value);
          if (key && value) {
            list.push({
              key,
              value,
              importance: normalizeImportance(item.importance),
            });
          }
        }
      }
    }
  } catch (_) {
    // Not valid JSON, ignore
  }
  return list;
}

function sanitizeKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

function normalizeImportance(input) {
  const s = String(input || "").trim().toLowerCase();
  return s === "always" ? "always" : "called";
}

function cleanValue(input) {
  return String(input || "")
    .replace(/<\/?(?:dsm:)?[^>]*>/gi, "")
    .trim()
    .slice(0, 500);
}
