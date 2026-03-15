import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname =
  import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures", "html");

const files = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".html"))
  .sort();

async function streamTransform(html: string): Promise<string> {
  const response = new Response(html);
  const mdResponse = new MDRewriter().transform(response);
  return mdResponse.text();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("streaming vs one-chunk", () => {
  for (const file of files) {
    it(file.replace(/\.html$/, ""), async () => {
      const html = readFileSync(join(FIXTURES_DIR, file), "utf-8");

      // One-chunk conversion
      const oneChunk = new MDRewriter().transform(html);

      // Streaming transform() conversion
      const streamed = await streamTransform(html);

      // Both paths must produce identical output
      expect(oneChunk).toBe(streamed);

      // Sanity: output is non-empty
      expect(oneChunk.length).toBeGreaterThan(0);
    });
  }
});
