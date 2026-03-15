/**
 * Downloads HTML from real-world sites and saves to test/fixtures/real-world/.
 * Run with: bun test/download-fixtures.ts
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITES = [
  "https://claude.com/blog/1m-context-ga",
  "https://workos.com/blog/agents-need-authorization-not-just-authentication",
  "https://simonwillison.net/guides/agentic-engineering-patterns/code-is-cheap/",
  "https://steipete.me/posts/2026/openclaw",
  "https://www.calebleak.com/posts/dog-game/",
  "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "https://github.com/commonmark/commonmark-spec",
  "https://developer.mozilla.org/en-US/docs/Web/HTML",
  "https://news.ycombinator.com/",
  "https://stackoverflow.com/questions/tagged/markdown",
  "https://www.bbc.com/news",
  "https://www.nytimes.com/2026/01/22/movies/2026-oscar-nominees-list.html",
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

function urlToFilename(url: string): string {
  return (
    url
      .replace(/^https?:\/\//, "")
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/_$/, "") + ".html"
  );
}

async function main() {
  const __dirname =
    import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
  const dir = join(__dirname, "..", "test", "fixtures", "real-world");
  mkdirSync(dir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const url of SITES) {
    const filename = urlToFilename(url);
    const filepath = join(dir, filename);

    if (existsSync(filepath)) {
      console.log(`SKIP (exists) ${filename}`);
      skipped++;
      continue;
    }

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MDRewriter-Test/1.0; +https://github.com/example/mdrewriter)",
          Accept: "text/html",
        },
        redirect: "follow",
      });
      const html = await res.text();
      writeFileSync(filepath, html, "utf-8");
      console.log(`OK ${filename} (${(html.length / 1024).toFixed(1)}KB)`);
      downloaded++;
    } catch (err) {
      console.log(`FAIL ${url} — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(
    `\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`,
  );
}

main();
