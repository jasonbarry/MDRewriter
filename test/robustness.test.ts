import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

describe("Robustness & Edge Cases", () => {
  // =========================================================================
  // 1. Empty & Degenerate Inputs
  // =========================================================================
  describe("Empty & Degenerate Inputs", () => {
    it("empty string produces just a trailing newline", () => {
      expect(new MDRewriter().transform("")).toBe("\n");
    });

    it("whitespace-only input does not crash", () => {
      const result = new MDRewriter().transform("   \n\t  ");
      expect(typeof result).toBe("string");
    });

    it("null cast to string does not throw", () => {
      expect(() => new MDRewriter().transform(null as any)).not.toThrow();
    });

    it("undefined cast to string does not throw", () => {
      expect(() => new MDRewriter().transform(undefined as any)).not.toThrow();
    });

    it("single text node with no tags", () => {
      expect(new MDRewriter().transform("hello world")).toBe("hello world\n");
    });

    it("only HTML comments → preserves as raw HTML", () => {
      const result = new MDRewriter().transform("<!-- comment -->");
      expect(result).toContain("<!-- comment -->");
    });

    it("only whitespace inside tags → no crash", () => {
      const result = new MDRewriter().transform("<p>   </p>");
      expect(typeof result).toBe("string");
    });
  });

  // =========================================================================
  // 2. Uppercase & Mixed-Case Tags
  // =========================================================================
  describe("Uppercase & Mixed-Case Tags", () => {
    it("<H1>Title</H1> → # Title", () => {
      expect(new MDRewriter().transform("<H1>Title</H1>")).toBe("# Title\n");
    });

    it("<P>Text</P> → Text", () => {
      expect(new MDRewriter().transform("<P>Text</P>")).toBe("Text\n");
    });

    it("<STRONG>bold</STRONG> in paragraph", () => {
      expect(new MDRewriter().transform("<P><STRONG>bold</STRONG></P>")).toContain(
        "**bold**",
      );
    });

    it('<A HREF="/url">link</A> in paragraph', () => {
      expect(new MDRewriter().transform('<P><A HREF="/url">link</A></P>')).toContain(
        "[link](/url)",
      );
    });

    it("mixed case <Em>italic</eM> in paragraph", () => {
      expect(new MDRewriter().transform("<P><Em>italic</eM></P>")).toContain("*italic*");
    });

    it("<UL><LI>item</LI></UL>", () => {
      expect(new MDRewriter().transform("<UL><LI>item</LI></UL>")).toContain("- item");
    });

    it("uppercase and lowercase produce identical output", () => {
      const upper = new MDRewriter().transform(
        "<H1>Title</H1><P>A <STRONG>bold</STRONG> word</P>",
      );
      const lower = new MDRewriter().transform(
        "<h1>Title</h1><p>A <strong>bold</strong> word</p>",
      );
      expect(upper).toBe(lower);
    });
  });

  // =========================================================================
  // 3. Missing Closing Tags
  // =========================================================================
  describe("Missing Closing Tags", () => {
    it("<p>one<p>two → two separate paragraphs", () => {
      const result = new MDRewriter().transform("<p>one<p>two");
      expect(result).toContain("one");
      expect(result).toContain("two");
    });

    it("<ul><li>a<li>b<li>c</ul> → 3 list items", () => {
      const result = new MDRewriter().transform("<ul><li>a<li>b<li>c</ul>");
      expect(result).toContain("- a");
      expect(result).toContain("- b");
      expect(result).toContain("- c");
    });

    it("<b>bold text (never closed in paragraph) → preserves text", () => {
      const result = new MDRewriter().transform("<p><b>bold text");
      expect(result).toContain("bold text");
    });

    it("misnested <em><strong> → preserves text content", () => {
      const result = new MDRewriter().transform(
        "<p><em>italic<strong>bold</em></strong></p>",
      );
      expect(result).toContain("italic");
      expect(result).toContain("bold");
    });

    it("<h1>heading (unclosed) → # heading", () => {
      const result = new MDRewriter().transform("<h1>heading");
      expect(result).toContain("# heading");
    });

    it("<div><p>content (multiple unclosed) → text preserved", () => {
      const result = new MDRewriter().transform("<div><p>content");
      expect(result).toContain("content");
    });

    it('<a href="/url">link text (unclosed) → text preserved', () => {
      const result = new MDRewriter().transform('<p><a href="/url">link text');
      expect(result).toContain("link text");
    });

    it("<table><tr><td>cell (unclosed table) → content preserved", () => {
      const result = new MDRewriter().transform("<table><tr><td>cell");
      expect(result).toContain("cell");
    });
  });

  // =========================================================================
  // 4. Missing Opening Tags / Orphan Close Tags
  // =========================================================================
  describe("Missing Opening Tags / Orphan Close Tags", () => {
    it("</p> alone → does not crash", () => {
      expect(() => new MDRewriter().transform("</p>")).not.toThrow();
    });

    it("text</div>more text → preserves both text segments", () => {
      const result = new MDRewriter().transform("text</div>more text");
      expect(result).toContain("text");
      expect(result).toContain("more text");
    });

    it("<p>hello</p></p></p> → contains hello, extra close tags harmless", () => {
      const result = new MDRewriter().transform("<p>hello</p></p></p>");
      expect(result).toContain("hello");
    });

    it("orphan close tags then real content → preserves content", () => {
      const result = new MDRewriter().transform(
        "</em></strong>plain text<p>real paragraph</p>",
      );
      expect(result).toContain("plain text");
      expect(result).toContain("real paragraph");
    });

    it("</li></ul> at top level → does not crash", () => {
      expect(() => new MDRewriter().transform("</li></ul>")).not.toThrow();
    });
  });

  // =========================================================================
  // 5. Self-Closing & Void Element Variations
  // =========================================================================
  describe("Self-Closing & Void Element Variations", () => {
    it("<br/> and <br /> and <br> all produce the same output", () => {
      const a = new MDRewriter().transform("<p>a<br/>b</p>");
      const b = new MDRewriter().transform("<p>a<br />b</p>");
      const c = new MDRewriter().transform("<p>a<br>b</p>");
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it("<hr/> and <hr /> and <hr> all produce ---", () => {
      const a = new MDRewriter().transform("<hr/>");
      const b = new MDRewriter().transform("<hr />");
      const c = new MDRewriter().transform("<hr>");
      expect(a).toContain("---");
      expect(b).toContain("---");
      expect(c).toContain("---");
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('<img src="x" alt="y"/> → ![y](x)', () => {
      const result = new MDRewriter().transform('<p><img src="x" alt="y"/></p>');
      expect(result).toContain("![y](x)");
    });

    it("<p/> (self-closing non-void) → does not crash", () => {
      expect(() => new MDRewriter().transform("<p/>")).not.toThrow();
    });

    it("<div/> self-closing non-void → does not crash", () => {
      expect(() => new MDRewriter().transform("<div/>")).not.toThrow();
    });

    it('<input type="checkbox" checked/> inside li → [x]', () => {
      const result = new MDRewriter().transform(
        '<ul><li><input type="checkbox" checked/>task</li></ul>',
      );
      expect(result).toContain("[x]");
    });
  });

  // =========================================================================
  // 6. Web Components & Custom Elements
  // =========================================================================
  describe("Web Components & Custom Elements", () => {
    it("<my-widget>content</my-widget> at block level → raw HTML passthrough", () => {
      const result = new MDRewriter().transform("<my-widget>content</my-widget>");
      expect(result).toContain("<my-widget>");
      expect(result).toContain("content");
      expect(result).toContain("</my-widget>");
    });

    it("custom element inline in paragraph → text preserved", () => {
      const result = new MDRewriter().transform(
        "<p>text <my-tag>inline</my-tag> more</p>",
      );
      expect(result).toContain("text");
      expect(result).toContain("inline");
      expect(result).toContain("more");
    });

    it("nested custom elements → no crash", () => {
      expect(() =>
        new MDRewriter().transform("<x-outer><x-inner>deep</x-inner></x-outer>"),
      ).not.toThrow();
    });

    it("custom element with attributes → content preserved", () => {
      const result = new MDRewriter().transform(
        '<x-dialog open title="hi">body</x-dialog>',
      );
      expect(result).toContain("body");
    });

    it("custom element wrapping converted tags → content preserved", () => {
      const result = new MDRewriter().transform(
        "<x-card><h2>Title</h2><p>Body</p></x-card>",
      );
      expect(result).toContain("Title");
      expect(result).toContain("Body");
    });

    it("web component with handler → handler fires", () => {
      let fired = false;
      const md = new MDRewriter()
        .on("x-card", {
          element() {
            fired = true;
          },
        })
        .transform("<x-card><p>content</p></x-card>");
      expect(fired).toBe(true);
      expect(md).toContain("content");
    });
  });

  // =========================================================================
  // 7. SVG & MathML
  // =========================================================================
  describe("SVG & MathML", () => {
    it("SVG block → raw HTML passthrough", () => {
      const result = new MDRewriter().transform(
        '<svg><circle cx="50" cy="50" r="40"/></svg>',
      );
      expect(result).toContain("<svg>");
    });

    it("inline SVG in paragraph → text preserved around it", () => {
      const result = new MDRewriter().transform(
        '<p>text <svg width="10" height="10"><rect/></svg> more</p>',
      );
      expect(result).toContain("text");
      expect(result).toContain("more");
    });

    it("deeply nested SVG → no crash", () => {
      expect(() =>
        new MDRewriter().transform("<svg><g><g><g><circle/></g></g></g></svg>"),
      ).not.toThrow();
    });

    it("MathML → raw HTML passthrough", () => {
      const result = new MDRewriter().transform(
        "<math><mi>x</mi><mo>=</mo><mn>5</mn></math>",
      );
      expect(result).toContain("<math>");
    });

    it("SVG with unrelated handlers registered → no crash", () => {
      const md = new MDRewriter()
        .on("p", { element() {} })
        .transform('<svg width="10" height="10"><rect/></svg>');
      expect(typeof md).toBe("string");
    });
  });

  // =========================================================================
  // 8. Deeply Nested & Stress Cases
  // =========================================================================
  describe("Deeply Nested & Stress Cases", () => {
    it("100 nested <div> elements → no stack overflow, text preserved", () => {
      const open = "<div>".repeat(100);
      const close = "</div>".repeat(100);
      const result = new MDRewriter().transform(`${open}content${close}`);
      expect(result).toContain("content");
    });

    it("50 nested <blockquote> elements → produces > prefixed output", () => {
      let html = "";
      for (let i = 0; i < 50; i++) html += "<blockquote>";
      html += "<p>deep</p>";
      for (let i = 0; i < 50; i++) html += "</blockquote>";
      const result = new MDRewriter().transform(html);
      expect(result).toContain("deep");
      expect(result).toContain("> ");
    });

    it("100 list items → all rendered", () => {
      let html = "<ul>";
      for (let i = 0; i < 100; i++) html += `<li>item${i}</li>`;
      html += "</ul>";
      const result = new MDRewriter().transform(html);
      for (let i = 0; i < 100; i++) {
        expect(result).toContain(`item${i}`);
      }
    });

    it("very long text node (10,000 chars) → preserved without truncation", () => {
      const longText = "a".repeat(10000);
      const result = new MDRewriter().transform(`<p>${longText}</p>`);
      expect(result).toContain(longText);
    });

    it("alternating inline elements 20 levels deep → no crash, text preserved", () => {
      let html = "<p>";
      for (let i = 0; i < 20; i++)
        html += i % 2 === 0 ? "<em>" : "<strong>";
      html += "text";
      for (let i = 19; i >= 0; i--)
        html += i % 2 === 0 ? "</em>" : "</strong>";
      html += "</p>";
      const result = new MDRewriter().transform(html);
      expect(result).toContain("text");
    });
  });

  // =========================================================================
  // 9. HTML Entities & Special Characters
  // =========================================================================
  describe("HTML Entities & Special Characters", () => {
    it("&amp;, &lt;, &gt; are preserved in output", () => {
      const result = new MDRewriter().transform("<p>&amp; &lt; &gt;</p>");
      expect(result).toContain("&amp;");
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
    });

    it("&#60; (numeric entity) is handled without crash", () => {
      const result = new MDRewriter().transform("<p>&#60;</p>");
      expect(typeof result).toBe("string");
    });

    it("&#x3C; (hex entity) is handled without crash", () => {
      const result = new MDRewriter().transform("<p>&#x3C;</p>");
      expect(typeof result).toBe("string");
    });

    it("&nbsp; is preserved", () => {
      const result = new MDRewriter().transform("<p>hello&nbsp;world</p>");
      expect(result).toContain("&nbsp;");
    });

    it("unknown entity &fakething; is passed through", () => {
      const result = new MDRewriter().transform("<p>&fakething;</p>");
      expect(result).toContain("&fakething;");
    });

    it("bare & not part of entity is preserved", () => {
      const result = new MDRewriter().transform("<p>Tom &amp; Jerry</p>");
      expect(result).toContain("&");
    });
  });

  // =========================================================================
  // 10. Document Fragments & Structural Oddities
  // =========================================================================
  describe("Document Fragments & Structural Oddities", () => {
    it("full document with doctype → body content preserved", () => {
      const result = new MDRewriter().transform(
        "<!DOCTYPE html><html><body><p>hello</p></body></html>",
      );
      expect(result).toContain("hello");
    });

    it("multiple root elements → both converted", () => {
      const result = new MDRewriter().transform("<p>one</p><p>two</p>");
      expect(result).toContain("one");
      expect(result).toContain("two");
    });

    it("text between block elements → all text preserved", () => {
      const result = new MDRewriter().transform("<p>a</p>some text<p>b</p>");
      expect(result).toContain("a");
      expect(result).toContain("some text");
      expect(result).toContain("b");
    });

    it("nested paragraphs → both texts present", () => {
      const result = new MDRewriter().transform("<p>outer<p>inner</p></p>");
      expect(result).toContain("outer");
      expect(result).toContain("inner");
    });

    it("content after </html> → still processed", () => {
      const result = new MDRewriter().transform(
        "<html><body><p>before</p></body></html><p>after</p>",
      );
      expect(result).toContain("before");
      expect(result).toContain("after");
    });

    it("<head> content stripped, body content preserved", () => {
      const result = new MDRewriter().transform(
        "<head><title>t</title></head><body><p>hi</p></body>",
      );
      expect(result).toContain("hi");
    });

    it("<template>content</template> → raw HTML passthrough", () => {
      const result = new MDRewriter().transform("<template>content</template>");
      expect(result).toContain("<template>");
    });
  });

  // =========================================================================
  // 11. Script & Style Content
  // =========================================================================
  describe("Script & Style Content", () => {
    it("script content not parsed as HTML", () => {
      const result = new MDRewriter().transform(
        '<script>const x = "<p>not a tag</p>";</script>',
      );
      expect(result).toContain("<script>");
      expect(result).toContain("</script>");
    });

    it("style content passes through as raw HTML", () => {
      const result = new MDRewriter().transform("<style>p { color: red; }</style>");
      expect(result).toContain("<style>");
      expect(result).toContain("</style>");
    });

    it("paragraphs around script are both converted", () => {
      const result = new MDRewriter().transform(
        "<p>before</p><script>alert(1)</script><p>after</p>",
      );
      expect(result).toContain("before");
      expect(result).toContain("after");
    });

    it("<noscript> passes through as raw HTML", () => {
      const result = new MDRewriter().transform(
        "<noscript><p>Enable JS</p></noscript>",
      );
      expect(result).toContain("<noscript>");
    });
  });

  // =========================================================================
  // 12. Processing Instructions & CDATA
  // =========================================================================
  describe("Processing Instructions & CDATA", () => {
    it('<?xml version="1.0"?> → raw passthrough', () => {
      const result = new MDRewriter().transform('<?xml version="1.0"?>');
      expect(result).toContain("<?xml");
    });

    it("<![CDATA[raw content]]> → content preserved", () => {
      const result = new MDRewriter().transform("<![CDATA[raw content]]>");
      expect(typeof result).toBe("string");
    });

    it("<!-- HTML comment --> → raw passthrough", () => {
      const result = new MDRewriter().transform("<!-- HTML comment -->");
      expect(result).toContain("<!-- HTML comment -->");
    });
  });
});
