// @ts-expect-error - commonmark-spec has no types
import spec from "commonmark-spec";
import { micromark } from "micromark";
import {
  gfmStrikethrough,
  gfmStrikethroughHtml,
} from "micromark-extension-gfm-strikethrough";
import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

/**
 * CommonMark test harness for MDRewriter.
 *
 * The CommonMark spec provides {markdown, html} pairs. Our converter goes
 * html -> markdown. To validate correctness we do a roundtrip:
 *
 *   spec.html  -->  MDRewriter  -->  our_markdown
 *   our_markdown  -->  micromark parser  -->  roundtrip_html
 *
 * Then we compare roundtrip_html to spec.html. They should be semantically
 * equivalent (same DOM structure), though whitespace may differ.
 *
 * We add the GFM strikethrough extension to micromark because our converter
 * emits ~~ for <del>/<s>. This is the only GFM extension needed; the rest
 * of micromark is plain CommonMark.
 */

function markdownToHtml(md: string): string {
  return micromark(md, {
    allowDangerousHtml: true,
    allowDangerousProtocol: true,
    extensions: [gfmStrikethrough()],
    htmlExtensions: [gfmStrikethroughHtml()],
  });
}

function normalize(html: string): string {
  return html
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .replace(/^\s+|\s+$/g, "")
    .replace(/ \/>/g, " />") // normalize self-closing
    .replace(/<br>/g, "<br />") // normalize br
    .replace(/<hr>/g, "<hr />") // normalize hr
    .toLowerCase();
}

// -----------------------------------------------------------------------
// Build test suites per section, run ALL spec tests sorted by number
// -----------------------------------------------------------------------

const testsBySection: Record<string, typeof spec.tests> = {};
for (const t of spec.tests) {
  if (!testsBySection[t.section]) testsBySection[t.section] = [];
  testsBySection[t.section].push(t);
}

const sections = Object.keys(testsBySection).sort((a, b) => {
  return testsBySection[a][0].number - testsBySection[b][0].number;
});

for (const section of sections) {
  const tests = testsBySection[section].sort(
    (a: (typeof spec.tests)[0], b: (typeof spec.tests)[0]) =>
      a.number - b.number,
  );

  describe(`CommonMark: ${section}`, () => {
    for (const t of tests) {
      const label = `#${t.number}: ${JSON.stringify(t.markdown).slice(0, 60)}`;

      it(label, () => {
        // Step 1: Convert spec HTML -> Markdown via MDRewriter
        const ourMarkdown = new MDRewriter().transform(t.html);

        // Step 2: Parse our markdown back to HTML via commonmark.js
        const roundtripHtml = markdownToHtml(ourMarkdown);

        // Step 3: Compare normalized HTML
        const expected = normalize(t.html);
        const actual = normalize(roundtripHtml);

        expect(actual).toBe(expected);
      });
    }
  });
}
