# MDRewriter

## Concept

Streaming HTML-to-Markdown transformer with a jQuery-like selector API.
Think HTMLRewriter but the output is CommonMark-spec Markdown instead of HTML.

## API Design

```typescript
import { MDRewriter } from "mdrewriter";

// Basic: stream HTML response to Markdown
const md = new MDRewriter().transform(response); // Returns Response with MD body

// With selectors: customize how elements become Markdown
const md = new MDRewriter()
  .on("h1, h2, h3", {
    element(el) {
      // el.tagName, el.attributes, etc.
      el.prefix = "## "; // override the default heading level
    },
  })
  .on("a.internal-link", {
    element(el) {
      // rewrite link targets during conversion
      const href = el.getAttribute("href");
      el.setAttribute("href", href.replace("/docs/", "/wiki/"));
    },
  })
  .on("div.sidebar", {
    element(el) {
      el.remove(); // strip sidebars from markdown output
    },
  })
  .on("div.callout", {
    element(el) {
      // wrap in blockquote with emoji prefix
      el.prefix = "> **Note:** ";
      el.suffix = "\n";
    },
  })
  .on("code[data-lang]", {
    element(el) {
      // override language hint for fenced code blocks
      el.setLanguage(el.getAttribute("data-lang"));
    },
  })
  .on("img", {
    element(el) {
      // transform image URLs
      const src = el.getAttribute("src");
      if (src.startsWith("/")) {
        el.setAttribute("src", `https://cdn.example.com${src}`);
      }
    },
  })
  .ignore("nav, footer, .ads, script, style") // sugar for .on(sel, { element(el) { el.remove() } })
  .transform(response);
```

## Core Architecture

```
HTTP Response (HTML stream)
    |
    v
[SAX-like streaming HTML parser]  -- emits tokens: open tag, text, close tag
    |
    v
[Selector matcher]  -- matches CSS selectors against streaming token state
    |                   (maintains a lightweight stack, NOT a full DOM)
    v
[User handlers]  -- .on() callbacks fire, can modify/remove/annotate
    |
    v
[Markdown emitter]  -- converts token stream to CommonMark
    |                   (maintains indent/list/blockquote stack)
    v
ReadableStream (Markdown text)
```

### Key design decisions:

1. **No DOM construction** - operates on a token stream like HTMLRewriter
2. **Streaming** - first bytes of Markdown output before HTML finishes downloading
3. **Stack-based context** - tracks nesting (list depth, blockquote depth, etc.)
4. **CommonMark-spec** - output should pass commonmark.js roundtrip for supported elements

## Default HTML → Markdown Mappings

| HTML                    | Markdown                |
| ----------------------- | ----------------------- |
| `<h1>` - `<h6>`         | `#` - `######`          |
| `<p>`                   | double newline          |
| `<strong>`, `<b>`       | `**text**`              |
| `<em>`, `<i>`           | `*text*`                |
| `<code>`                | `` `text` ``            |
| `<pre><code>`           | fenced code block ```   |
| `<a href>`              | `[text](url)`           |
| `<img>`                 | `![alt](src)`           |
| `<ul>/<li>`             | `- item`                |
| `<ol>/<li>`             | `1. item`               |
| `<blockquote>`          | `> text`                |
| `<hr>`                  | `---`                   |
| `<br>`                  | double space + newline  |
| `<table>`               | GFM table (pipe syntax) |
| `<del>`, `<s>`          | `~~text~~`              |
| `<input type=checkbox>` | `- [ ]` / `- [x]`       |

## Streaming Challenge: The Link Problem

The hardest part of streaming HTML→MD is `<a href="url">text</a>`.
In Markdown, links are `[text](url)` - you need the href BEFORE the text content.
But in streaming HTML, you get the href in the open tag, then text, then close tag.
This works perfectly because the open tag has the href attribute!

The ACTUAL hard case is reference-style links `[text][id]` with `[id]: url` at bottom.
Solution: don't use reference-style by default. Inline links stream fine.

Other streaming challenges:

- **Tables**: need to know column count from first row to emit header separator
  Solution: buffer first `<tr>` to count columns, then stream the rest
- **Nested lists**: need indent tracking
  Solution: maintain a depth counter on the stack

## Element API (for handlers)

```typescript
interface MDElement {
  // Read-only properties
  readonly tagName: string;
  readonly attributes: IterableIterator<[string, string]>;
  readonly removed: boolean;

  // Attribute access
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;

  // Mutations (affect markdown output)
  setAttribute(name: string, value: string): MDElement;
  remove(): MDElement; // remove element and children from output
  removeAndKeepContent(): MDElement; // unwrap: keep text, lose the element

  // Markdown-specific
  prefix: string; // prepend to markdown output of this element
  suffix: string; // append to markdown output of this element
  setLanguage(lang: string): void; // for code blocks

  // Content insertion
  before(content: string): MDElement;
  after(content: string): MDElement;
  replace(content: string): MDElement;

  // End tag handler
  onEndTag(handler: (tag: MDEndTag) => void | Promise<void>): void;
}
```

## Usage with Cloudflare Workers

```typescript
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    const response = await fetch(target);

    return new MDRewriter()
      .ignore("nav, header, footer, script, style, .ads")
      .on("article", {
        element(el) {
          el.removeAndKeepContent();
        },
      })
      .transform(response, {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
  },
};
```

## Usage with Node.js / Bun / Deno

```typescript
import { MDRewriter } from "mdrewriter";

// Works with any Response object (Fetch API)
const res = await fetch("https://example.com");
const mdResponse = new MDRewriter().transform(res);
const markdown = await mdResponse.text();

// Also works with ReadableStreams directly
const mdStream = new MDRewriter().transform(htmlReadableStream);

// Or just strings
const markdown = new MDRewriter().transform("<h1>Hello</h1><p>World</p>");
// => "# Hello\n\nWorld\n"
```

## Test Strategy

1. **CommonMark roundtrip tests**: Convert HTML→MD, then parse MD with commonmark.js,
   verify the semantic structure matches
2. **Streaming correctness**: Verify output is identical whether input arrives as
   one chunk or byte-by-byte
3. **HTMLRewriter API parity**: Test that selector matching behaves identically
4. **Turndown test suite**: Turndown (the leading HTML→MD lib) has tests we can
   validate against
5. **Real-world pages**: Crawl top 100 sites, convert, verify no crashes/hangs

## Implementation Plan

### Phase 1: Core streaming parser + emitter (no selectors)

- Streaming HTML tokenizer (or use existing: htmlparser2 is already streaming)
- Stack-based markdown emitter
- All default mappings working
- String + Response + ReadableStream inputs
- CommonMark-spec output

### Phase 2: Selector engine

- CSS selector matching on streaming token state
- .on() handler registration
- .ignore() sugar
- Element mutation API

### Phase 3: Edge cases + polish

- Table support (with buffering)
- Nested list edge cases
- Code block language detection
- GFM extensions (strikethrough, task lists, tables)
- Performance benchmarks vs Turndown

### Phase 4: Publish

- npm package
- Cloudflare Workers example
- Benchmarks showing streaming advantage over Turndown
- README with comparison

## Why This Matters

Turndown (the current standard) buffers the entire DOM before converting.
For a 500KB HTML page, that means:

1. Download entire page
2. Parse into DOM (jsdom or browser)
3. Walk DOM tree
4. Emit markdown

MDRewriter would:

1. Start emitting markdown as the first HTML bytes arrive
2. Never build a DOM
3. Use constant memory regardless of page size
4. Work on edge/serverless where jsdom isn't available

This makes it ideal for:

- Edge workers converting pages on-the-fly
- AI/LLM pipelines that need web content as markdown
- RSS/feed processors
- Web scrapers
- Documentation site generators
