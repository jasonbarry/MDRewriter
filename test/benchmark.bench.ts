import { NodeHtmlMarkdown } from "node-html-markdown";
import TurndownService from "turndown";
import { bench, describe } from "vitest";
import { MDRewriter } from "../src/index";

// ---------------------------------------------------------------------------
// Test fixture builder — generates HTML to a target byte size
// ---------------------------------------------------------------------------

// Rotating section templates that exercise different tag combinations.
// Each call to buildHtml cycles through all templates so the benchmark
// covers the full range of HTML→Markdown conversions.

const sectionTemplates = [
  // 0 — headings, basic inline formatting, links
  (i: number) => `<section>
<h1>Section ${i}: Main Heading</h1>
<h2>Subheading with <code>inline code</code></h2>
<h3>Tertiary heading</h3>
<p>This is paragraph <strong>number ${i}</strong> with <em>various</em> inline <code>formatting</code> elements.</p>
<p>Here's a <a href="https://example.com/page/${i}">link to page ${i}</a> and a <a href="https://example.com/other" title="titled link">titled link</a>.</p>
</section>\n`,

  // 1 — unordered list, ordered list, nested lists
  (i: number) => `<section>
<h2>Lists (${i})</h2>
<ul>
<li>Item one with <strong>bold</strong></li>
<li>Item two with <em>emphasis</em></li>
<li>Item three with <code>code</code></li>
<li>Nested:
<ul>
<li>Sub-item A</li>
<li>Sub-item B with <a href="https://example.com">a link</a></li>
</ul>
</li>
</ul>
<ol>
<li>First ordered item</li>
<li>Second with <b>bold (b tag)</b> and <i>italic (i tag)</i></li>
<li>Third item</li>
</ol>
</section>\n`,

  // 2 — code blocks, blockquotes, horizontal rules
  (i: number) => `<section>
<h2>Code &amp; Quotes (${i})</h2>
<pre><code class="language-javascript">function example${i}() {
  const x = ${i};
  return x * 2;
}
</code></pre>
<pre><code class="language-python">def example_${i}():
    return ${i} * 2
</code></pre>
<blockquote><p>This is a blockquote in section ${i}.</p>
<blockquote><p>Nested blockquote with <strong>bold</strong> text.</p></blockquote></blockquote>
<hr>
</section>\n`,

  // 3 — images, line breaks, strikethrough, sub/sup
  (i: number) => `<section>
<h2>Media &amp; Inline HTML (${i})</h2>
<p><img src="https://example.com/img/${i}.png" alt="Image ${i}"> followed by text.</p>
<p>Line one.<br>Line two after a break.<br>Line three.</p>
<p><del>Deleted text ${i}</del> and <s>strikethrough text</s>.</p>
<p>H<sub>2</sub>O is water. E = mc<sup>2</sup>.</p>
<p><ins>Inserted text</ins> and <mark>highlighted text</mark>.</p>
</section>\n`,

  // 4 — tables
  (i: number) => `<section>
<h2>Table (${i})</h2>
<table>
<thead>
<tr><th>Name</th><th>Value</th><th>Description</th></tr>
</thead>
<tbody>
<tr><td>Alpha</td><td>${i * 10}</td><td>First row with <strong>bold</strong></td></tr>
<tr><td>Beta</td><td>${i * 20}</td><td>Second row with <em>emphasis</em></td></tr>
<tr><td>Gamma</td><td>${i * 30}</td><td>Third row with <code>code</code></td></tr>
</tbody>
</table>
</section>\n`,

  // 5 — task lists, definition-like content, details/summary
  (i: number) => `<section>
<h2>Interactive (${i})</h2>
<ul>
<li><input type="checkbox" disabled> Unchecked task ${i}</li>
<li><input type="checkbox" checked disabled> Checked task ${i}</li>
<li><input type="checkbox" disabled> Another task with <a href="https://example.com">link</a></li>
</ul>
<details>
<summary>Click to expand section ${i}</summary>
<p>Hidden content with <strong>formatting</strong> and <code>code</code>.</p>
</details>
<dl>
<dt>Term ${i}</dt>
<dd>Definition with <em>emphasis</em> and <a href="#">a link</a>.</dd>
</dl>
</section>\n`,

  // 6 — mixed inline: kbd, abbr, small, time, nested emphasis
  (i: number) => `<section>
<h2>Rich Inline (${i})</h2>
<p>Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy. The <abbr title="HyperText Markup Language">HTML</abbr> spec is large.</p>
<p><small>Small print for section ${i}.</small></p>
<p>Published on <time datetime="2025-01-${String((i % 28) + 1).padStart(2, "0")}">January ${(i % 28) + 1}, 2025</time>.</p>
<p><strong><em>Bold italic</em></strong> and <em><strong>italic bold</strong></em> and <em><code>italic code</code></em>.</p>
<p>A paragraph with <strong>bold containing <em>nested italic</em> text</strong> and trailing words.</p>
</section>\n`,

  // 7 — figures, nav, footer, script/style (ignored content)
  (i: number) => `<section>
<h2>Structural (${i})</h2>
<figure>
<img src="https://example.com/fig/${i}.jpg" alt="Figure ${i}">
<figcaption>Figure ${i}: A sample diagram</figcaption>
</figure>
<nav><a href="/prev">Previous</a> | <a href="/next">Next</a></nav>
<article>
<h3>Embedded article ${i}</h3>
<p>Article body with <a href="https://example.com/article/${i}">a deep link</a>.</p>
</article>
<footer><p>Footer for section ${i}.</p></footer>
<div class="sidebar"><p>Sidebar content ${i}.</p></div>
</section>\n`,
];

function buildHtml(targetBytes: number): string {
  const header = "<html><body>\n";
  const footer = "</body></html>\n";
  const sections: string[] = [header];
  let size = header.length + footer.length;
  let i = 0;

  while (size < targetBytes) {
    const template = sectionTemplates[i % sectionTemplates.length];
    const section = template(i);
    sections.push(section);
    size += section.length;
    i++;
  }

  sections.push(footer);
  return sections.join("");
}

const TINY_HTML = buildHtml(10 * 1024); // 10 KB
const SMALL_HTML = buildHtml(100 * 1024); // 100 KB
const MEDIUM_HTML = buildHtml(512 * 1024); // 512 KB
const LARGE_HTML = buildHtml(1024 * 1024); // 1 MB
const HUGE_HTML = buildHtml(2 * 1024 * 1024); // 2 MB

// ---------------------------------------------------------------------------
// Turndown instance (reused across iterations like a real app would)
// ---------------------------------------------------------------------------

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: "---",
  bulletListMarker: "-",
});

// ---------------------------------------------------------------------------
// node-html-markdown instance (reused across iterations like a real app would)
// ---------------------------------------------------------------------------

// const nhm = new NodeHtmlMarkdown();

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("tiny HTML (~10KB)", () => {
  bench("MDRewriter", () => {
    new MDRewriter().transform(TINY_HTML);
  });

  bench("Turndown", () => {
    turndown.turndown(TINY_HTML);
  });

  // bench("node-html-markdown", () => {
  //   nhm.translate(TINY_HTML);
  // });
});

describe("small HTML (~100KB)", () => {
  bench("MDRewriter", () => {
    new MDRewriter().transform(SMALL_HTML);
  });

  bench("Turndown", () => {
    turndown.turndown(SMALL_HTML);
  });

  // bench("node-html-markdown", () => {
  //   nhm.translate(SMALL_HTML);
  // });
});

describe("medium HTML (~512KB)", () => {
  bench("MDRewriter", () => {
    new MDRewriter().transform(MEDIUM_HTML);
  });

  bench("Turndown", () => {
    turndown.turndown(MEDIUM_HTML);
  });

  // bench("node-html-markdown", () => {
  //   nhm.translate(MEDIUM_HTML);
  // });
});

describe("large HTML (~1MB)", () => {
  bench("MDRewriter", () => {
    new MDRewriter().transform(LARGE_HTML);
  });

  bench("Turndown", () => {
    turndown.turndown(LARGE_HTML);
  });

  // bench("node-html-markdown", () => {
  //   nhm.translate(LARGE_HTML);
  // });
});

describe("huge HTML (~2MB)", () => {
  bench("MDRewriter", () => {
    new MDRewriter().transform(HUGE_HTML);
  });

  bench("Turndown", () => {
    turndown.turndown(HUGE_HTML);
  });

  // bench("node-html-markdown", () => {
  //   nhm.translate(HUGE_HTML);
  // });
});
