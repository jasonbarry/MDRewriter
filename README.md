# MDRewriter

Converts HTML to Markdown in a stream — no DOM, no buffering. Drop-in replacement for [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/) for all markdown use cases.

- **Streaming** — first Markdown bytes emit before the HTML finishes downloading
- **5-6x faster** than Turndown and node-html-markdown for string conversions
- **CommonMark + GFM extensions** — 100% spec-compliant with 1,000+ tests passing
- **Constant memory** — no DOM construction, so it works anywhere: Node, Bun, Deno, Cloudflare Workers

## Install

```sh
npm i mdrewriter
```

## Usage

### String in, string out

```typescript
import { MDRewriter } from "mdrewriter";

const markdown = new MDRewriter().transform("<h1>Hello</h1><p>World</p>");
// => "# Hello\n\nWorld\n"
```

### Stream a fetch response

```typescript
const response = await fetch("https://example.com");
const mdResponse = new MDRewriter().transform(response);
// => Response
```

### `.on(selector, handler)` — customize conversion

```typescript
const md = new MDRewriter()
  .on("a.internal", {
    element(el) {
      const href = el.getAttribute("href");
      el.setAttribute("href", href.replace("/docs/", "/wiki/"));
    },
  })
  .on("code[data-lang]", {
    element(el) {
      el.setLanguage(el.getAttribute("data-lang"));
    },
  })
  .transform(response);
```

### `.ignore(selector)` — strip elements

```typescript
const md = new MDRewriter()
  .ignore("nav, footer, .ads, script, style")
  .transform(response);
```

### Before / After

**Before** — HTMLRewriter to extract content, then Turndown to convert:

```typescript
import TurndownService from "turndown";

const turndown = new TurndownService();

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await fetch(request.url);

    // Buffer the entire page into a string
    let html = "";
    const rewriter = new HTMLRewriter()
      .on("nav, footer, script, style, .ads", {
        element(el) {
          el.remove();
        },
      })
      .on("article, p", {
        text(text) {
          html += text.text;
        },
      });

    await rewriter.transform(response).text();

    // Then convert the buffered HTML to Markdown
    const markdown = turndown.turndown(html);
    return new Response(markdown, {
      headers: { "content-type": "text/markdown" },
    });
  },
};
```

**After** — MDRewriter does both in a single streaming pass:

```typescript
import { MDRewriter } from "mdrewriter";

export default {
  async fetch(request: Request): Promise<Response> {
    const res = await fetch(request.url);

    return new MDRewriter()
      .ignore("nav, footer, script, style, .ads")
      .transform(res);
  },
};
```

## Benchmarks

### Scaling with page size

MDRewriter's advantage grows as pages get larger. On a log-log scatterplot of p99 latency vs DOM node count:

![p99 latency vs DOM nodes](https://raw.githubusercontent.com/jasonbarry/MDRewriter/refs/heads/main/docs/scatterplot.png)

```
$ pnpm bench
```

![benchmarks comparing turndown, node-html-markdown, and mdrewriter](https://raw.githubusercontent.com/jasonbarry/MDRewriter/refs/heads/main/docs/bench-table.png)

### htmlparser-benchmark (258 real-world HTML files)

Across 258 real-world HTML files, MDRewriter averages **1.16 ms/file** — 4.6x faster than Turndown and 6x faster than node-html-markdown. These results are from the [htmlparser-benchmark](https://www.npmjs.com/package/htmlparser-benchmark) benchmark:

```
$ pnpm bench:parser

Benchmarking against 258 real-world HTML files…

  MDRewriter: 258/258
  Turndown: 258/258
  node-html-markdown: 258/258

Results (ms/file):

| Library             |    Mean |      ± SD |
|---------------------|---------|-----------|
| MDRewriter          | 1.15806 |  0.793826 |
| Turndown            | 5.39425 |   3.36502 |
| node-html-markdown  | 7.01406 |   7.10821 |

Speedup vs MDRewriter:

  Turndown: 4.66x slower
  node-html-markdown: 6.06x slower
```

## Compliance

- **CommonMark** — 652 spec examples pass roundtrip conversion
- **GFM extensions** — tables, strikethrough, task lists, autolinks (24 spec examples)
- **1,028 tests** across 9 test suites

## License

MIT
