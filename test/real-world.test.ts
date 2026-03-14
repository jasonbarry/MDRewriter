import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

// ---------------------------------------------------------------------------
// 20 diverse, content-heavy websites
// ---------------------------------------------------------------------------
const SITES = [
  "https://en.wikipedia.org/wiki/Markdown",
  "https://github.com/commonmark/commonmark-spec",
  "https://developer.mozilla.org/en-US/docs/Web/HTML",
  "https://news.ycombinator.com/",
  "https://stackoverflow.com/questions/tagged/markdown",
  "https://www.bbc.com/news",
  "https://www.nytimes.com/",
  "https://www.reddit.com/r/programming/",
  "https://medium.com/",
  "https://dev.to/",
  "https://docs.python.org/3/tutorial/index.html",
  "https://doc.rust-lang.org/book/",
  "https://www.w3.org/TR/html52/",
  "https://www.nasa.gov/",
  "https://archive.org/",
  "https://www.npmjs.com/",
  "https://blog.cloudflare.com/",
  "https://www.smashingmagazine.com/",
  "https://css-tricks.com/",
  "https://spec.commonmark.org/0.31.2/",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures", "real-world");

function urlToFilename(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/_$/, "")
    + ".html";
}

function loadHtml(url: string): string | null {
  const filepath = join(FIXTURES_DIR, urlToFilename(url));
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath, "utf-8");
}

async function streamTransform(html: string): Promise<string> {
  const response = new Response(html);
  const mdResponse = new MDRewriter().transform(response);
  return mdResponse.text();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("real-world sites", () => {
  for (const url of SITES) {
    it(url, async () => {
      const html = loadHtml(url);
      if (html == null) {
        console.log(`  SKIP ${url} — fixture not found (run: bun test/download-fixtures.ts)`);
        return;
      }

      // One-chunk conversion
      const oneChunk = new MDRewriter().transform(html);

      // Streaming transform() conversion
      const streamed = await streamTransform(html);

      // Both paths must produce identical output
      expect(oneChunk).toBe(streamed);

      // Sanity: output is non-empty and contains some content
      expect(oneChunk.length).toBeGreaterThan(0);

      console.log(
        `  OK ${url} — HTML: ${(html.length / 1024).toFixed(1)}KB → MD: ${(oneChunk.length / 1024).toFixed(1)}KB`,
      );
    });
  }
});
