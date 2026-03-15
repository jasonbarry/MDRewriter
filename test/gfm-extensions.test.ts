import { readFileSync } from "node:fs";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

/**
 * GFM extension test harness for MDRewriter.
 *
 * Parses labeled examples (table, strikethrough, autolink, tagfilter,
 * disabled/tasklist) from the official cmark-gfm spec.txt and validates
 * via roundtrip: spec.html -> MDRewriter -> markdown -> micromark -> html.
 *
 * Tests that fail indicate GFM conversions still to be implemented.
 */

// ---------------------------------------------------------------------------
// Parse GFM extension examples from spec.txt
// ---------------------------------------------------------------------------

interface GfmExample {
  extension: string;
  html: string;
  markdown: string;
  number: number;
}

function parseGfmSpec(specText: string): GfmExample[] {
  const examples: GfmExample[] = [];
  let number = 0;

  // Match ALL examples (labeled and unlabeled) to get correct numbering
  const allExampleRe =
    /^`{32} example(?: (\w+))?\n([\s\S]*?)^\.\n([\s\S]*?)^`{32}$/gm;

  let match: RegExpExecArray | null;
  while ((match = allExampleRe.exec(specText)) !== null) {
    number++;
    const label = match[1]; // undefined for unlabeled (standard CommonMark) examples
    if (label) {
      examples.push({
        extension: label,
        markdown: match[2],
        html: match[3],
        number,
      });
    }
  }

  return examples;
}

const specText = readFileSync(
  new URL("./fixtures/spec/gfm-spec.txt", import.meta.url),
  "utf8",
);
const examples = parseGfmSpec(specText);

// ---------------------------------------------------------------------------
// Roundtrip helper: markdown -> HTML via micromark with GFM extensions
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  return micromark(md, {
    allowDangerousHtml: true,
    allowDangerousProtocol: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}

function normalize(html: string): string {
  return html
    .replace(/\s+/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/> </g, "><")
    .replace(/^\s+|\s+$/g, "")
    .replace(/ \/>/g, ">")
    .replace(/<br>/g, "<br>")
    .replace(/<hr>/g, "<hr>")
    .replace(/<input ([^>]*)>/g, (_, attrs) => {
      const sorted = attrs.trim().split(/\s+/).sort().join(" ");
      return `<input ${sorted}>`;
    })
    .toLowerCase();
}

// HTML tags that should NOT appear as raw HTML in the markdown output for
// each extension type.  If the converter just passes these through as raw
// HTML, micromark will preserve them and the roundtrip "passes" trivially
// without the converter ever producing real GFM markdown syntax.
const FORBIDDEN_RAW_HTML: Record<string, RegExp | null> = {
  table: /<\/?(?:table|thead|tbody|tr|th|td)[\s>]/i,
  strikethrough: /<\/?(?:del|s)[\s>]/i,
  disabled: /<input[\s>]/i,
  autolink: null, // autolinks convert to [text](url) — no raw HTML concern
  tagfilter: null, // tagfilter tests raw HTML handling — passthrough expected
};

// ---------------------------------------------------------------------------
// Group by extension and run tests
// ---------------------------------------------------------------------------

const byExtension: Record<string, GfmExample[]> = {};
for (const ex of examples) {
  if (!byExtension[ex.extension]) byExtension[ex.extension] = [];
  byExtension[ex.extension].push(ex);
}

for (const [extension, tests] of Object.entries(byExtension)) {
  describe(`GFM: ${extension}`, () => {
    for (const t of tests) {
      const label = `#${t.number}: ${JSON.stringify(t.html.trimEnd()).slice(0, 60)}`;

      it(label, () => {
        // Step 1: Convert spec HTML -> Markdown via MDRewriter
        const ourMarkdown = new MDRewriter().transform(t.html);

        // Step 2: Reject raw HTML passthrough — the converter must produce
        //         real GFM markdown syntax, not just echo back HTML tags.
        const forbidden = FORBIDDEN_RAW_HTML[t.extension];
        if (forbidden) {
          expect(ourMarkdown).not.toMatch(forbidden);
        }

        // Step 3: Parse our markdown back to HTML via micromark
        const roundtripHtml = markdownToHtml(ourMarkdown);

        // Step 4: Compare normalized HTML
        const expected = normalize(t.html);
        const actual = normalize(roundtripHtml);

        expect(actual).toBe(expected);
      });
    }
  });
}
