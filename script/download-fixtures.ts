/**
 * Downloads HTML from real-world sites and saves to test/fixtures/real-world/.
 * Run with: bun test/download-fixtures.ts
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITES = [
  "https://arxiv.org/html/2603.11152v1",
  "https://blog.cloudflare.com/",
  "https://claude.com/blog/1m-context-ga",
  "https://css-tricks.com/",
  "https://dev.to/",
  "https://developer.mozilla.org/en-US/docs/Web/HTML",
  "https://doc.rust-lang.org/book/",
  "https://docs.python.org/3/tutorial/index.html",
  "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "https://github.com/commonmark/commonmark-spec",
  "https://jvns.ca/blog/2026/03/10/examples-for-the-tcpdump-and-dig-man-pages/",
  "https://karpathy.bearblog.dev/power-to-the-people/",
  "https://news.ycombinator.com/",
  "https://simonwillison.net/guides/agentic-engineering-patterns/code-is-cheap/",
  "https://spec.commonmark.org/0.31.2/",
  "https://stackoverflow.com/questions/tagged/markdown",
  "https://steipete.me/posts/2026/openclaw",
  "https://workos.com/blog/series-c",
  "https://www.bbc.com/news",
  "https://www.calebleak.com/posts/dog-game/",
  "https://www.nasa.gov/",
  "https://www.nytimes.com/",
  "https://www.reddit.com/r/programming/",
  "https://www.smashingmagazine.com/",
  "https://www.w3.org/TR/html52/",
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
