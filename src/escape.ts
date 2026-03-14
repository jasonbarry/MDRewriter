import { VOID_ELEMENTS } from "./constants";

export function escapeText(text: string, inlineOnly: boolean = false): string {
  // Escape backslash first to avoid double-escaping
  let r = text.replace(/\\/g, "\\\\");
  // Convert literal non-breaking spaces to &nbsp; entity so CommonMark
  // doesn't strip them as whitespace (it decodes &nbsp; back on render)
  r = r.replace(/\u00a0/g, "&nbsp;");
  // Escape inline special characters (not &, <, > — entities are preserved)
  r = r.replace(/([*_`[\]~|])/g, "\\$1");
  // Escape ! before [ (image syntax)
  r = r.replace(/!(?=\\\[)/g, "\\!");

  if (!inlineOnly) {
    // Block-level: # at start of line (ATX headings)
    r = r.replace(/^(#{1,6})([ \t]|$)/gm, "\\$1$2");
    // Block-level: ordered list markers (digit(s) + . or ) + space)
    r = r.replace(/^(\d{1,9})([.)])([ \t])/gm, "$1\\$2$3");
    // Block-level: unordered list markers (- or + followed by space)
    // (* already escaped inline)
    r = r.replace(/^([-+])([ \t])/gm, "\\$1$2");
    // Block-level: thematic break (3+ dashes, possibly with spaces)
    r = r.replace(/^( {0,3})(-)( *- *-[- ]*)$/gm, "$1\\$2$3");
    // Block-level: setext heading underlines (= or - on own line)
    r = r.replace(/^( {0,3})(=+) *$/gm, "$1\\$2");
  }

  return r;
}

export function reconstructTag(
  name: string,
  attrs: Record<string, string>,
): string {
  let tag = `<${name}`;
  for (const [key, val] of Object.entries(attrs)) {
    if (key.startsWith("_")) continue; // skip internal attrs
    if (val === "") tag += ` ${key}`;
    else tag += ` ${key}="${val}"`;
  }
  if (VOID_ELEMENTS.has(name)) tag += "/";
  return `${tag}>`;
}
