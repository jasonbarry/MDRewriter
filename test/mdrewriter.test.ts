import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

describe("MDRewriter handler system", () => {
  // ----- remove() -----
  describe("remove()", () => {
    it("removes element and its children", () => {
      const md = new MDRewriter()
        .on("div.sidebar", {
          element(el) {
            el.remove();
          },
        })
        .transform(
          '<p>Keep</p><div class="sidebar"><p>Gone</p></div><p>Also keep</p>',
        );
      expect(md).toBe("Keep\n\nAlso keep\n");
    });

    it("removes nested elements inside removed parent", () => {
      const md = new MDRewriter()
        .on("nav", {
          element(el) {
            el.remove();
          },
        })
        .transform(
          '<p>Hello</p><nav><a href="/">Home</a><a href="/about">About</a></nav><p>World</p>',
        );
      expect(md).toBe("Hello\n\nWorld\n");
    });

    it("removes inline element", () => {
      const md = new MDRewriter()
        .on("em.secret", {
          element(el) {
            el.remove();
          },
        })
        .transform('<p>Hello <em class="secret">hidden</em> world</p>');
      expect(md).toBe("Hello  world\n");
    });
  });

  // ----- ignore() -----
  describe("ignore()", () => {
    it("is sugar for remove()", () => {
      const md = new MDRewriter()
        .ignore("nav, footer, .ads")
        .transform(
          '<p>Content</p><nav><a href="/">Nav</a></nav><footer>Foot</footer><div class="ads">Ad</div>',
        );
      expect(md).toBe("Content\n");
    });

    it("ignores script and style", () => {
      const md = new MDRewriter()
        .ignore("script, style")
        .transform(
          "<p>Hello</p><script>alert(1)</script><style>.x{}</style><p>World</p>",
        );
      expect(md).toBe("Hello\n\nWorld\n");
    });
  });

  // ----- setAttribute() -----
  describe("setAttribute()", () => {
    it("rewrites link href", () => {
      const md = new MDRewriter()
        .on("a", {
          element(el) {
            const href = el.getAttribute("href");
            if (href) el.setAttribute("href", href.replace("/docs/", "/wiki/"));
          },
        })
        .transform('<p><a href="/docs/page">Link</a></p>');
      expect(md).toBe("[Link](/wiki/page)\n");
    });

    it("rewrites image src", () => {
      const md = new MDRewriter()
        .on("img", {
          element(el) {
            const src = el.getAttribute("src");
            if (src?.startsWith("/")) {
              el.setAttribute("src", `https://cdn.example.com${src}`);
            }
          },
        })
        .transform('<p><img alt="pic" src="/images/photo.jpg"></p>');
      expect(md).toBe("![pic](https://cdn.example.com/images/photo.jpg)\n");
    });
  });

  // ----- removeAndKeepContent() -----
  describe("removeAndKeepContent()", () => {
    it("unwraps a div, keeping children", () => {
      const md = new MDRewriter()
        .on("div.wrapper", {
          element(el) {
            el.removeAndKeepContent();
          },
        })
        .transform('<div class="wrapper"><p>Inside</p></div>');
      expect(md).toBe("Inside\n");
    });

    it("unwraps article tag", () => {
      const md = new MDRewriter()
        .on("article", {
          element(el) {
            el.removeAndKeepContent();
          },
        })
        .transform("<article><h1>Title</h1><p>Body text</p></article>");
      expect(md).toBe("# Title\n\nBody text\n");
    });

    it("unwraps inline span", () => {
      const md = new MDRewriter()
        .on("span.highlight", {
          element(el) {
            el.removeAndKeepContent();
          },
        })
        .transform('<p>Hello <span class="highlight">world</span>!</p>');
      expect(md).toBe("Hello world!\n");
    });
  });

  // ----- prefix / suffix -----
  describe("prefix and suffix", () => {
    it("adds prefix to a heading", () => {
      const md = new MDRewriter()
        .on("h1", {
          element(el) {
            el.prefix = "## ";
          },
        })
        .transform("<h1>Title</h1>");
      // prefix goes before the default heading markdown
      expect(md).toContain("## ");
      expect(md).toContain("Title");
    });

    it("wraps element with prefix and suffix", () => {
      const md = new MDRewriter()
        .on("div.callout", {
          element(el) {
            el.removeAndKeepContent();
            el.prefix = "> **Note:** ";
            el.suffix = "\n";
          },
        })
        .transform('<div class="callout">Important info</div>');
      expect(md).toContain("> **Note:** ");
      expect(md).toContain("Important info");
    });
  });

  // ----- setLanguage() -----
  describe("setLanguage()", () => {
    it("overrides code block language", () => {
      const md = new MDRewriter()
        .on("code", {
          element(el) {
            const lang = el.getAttribute("data-lang");
            if (lang) el.setLanguage(lang);
          },
        })
        .transform(
          '<pre><code data-lang="typescript">const x = 1;</code></pre>',
        );
      expect(md).toContain("```typescript\n");
      expect(md).toContain("const x = 1;");
    });

    it("sets language on code with class", () => {
      const md = new MDRewriter()
        .on("code[data-lang]", {
          element(el) {
            el.setLanguage(el.getAttribute("data-lang") || "");
          },
        })
        .transform(
          '<pre><code class="language-js" data-lang="javascript">let y = 2;</code></pre>',
        );
      expect(md).toContain("```javascript\n");
    });
  });

  // ----- before() / after() -----
  describe("before() and after()", () => {
    it("inserts content before element", () => {
      const md = new MDRewriter()
        .on("p.note", {
          element(el) {
            el.before("---\n");
          },
        })
        .transform('<p class="note">A note</p>');
      expect(md).toContain("---\n");
      expect(md).toContain("A note");
    });

    it("inserts content after element", () => {
      const md = new MDRewriter()
        .on("p.note", {
          element(el) {
            el.after("\n---\n");
          },
        })
        .transform('<p class="note">A note</p>');
      expect(md).toContain("A note");
      expect(md).toContain("\n---\n");
    });
  });

  // ----- replace() -----
  describe("replace()", () => {
    it("replaces element with custom content", () => {
      const md = new MDRewriter()
        .on("div.placeholder", {
          element(el) {
            el.replace("[PLACEHOLDER]");
          },
        })
        .transform(
          '<div class="placeholder">Original content</div><p>After</p>',
        );
      expect(md).toContain("[PLACEHOLDER]");
      expect(md).not.toContain("Original content");
    });

    it("replaces inline element", () => {
      const md = new MDRewriter()
        .on("span.badge", {
          element(el) {
            el.replace("(badge)");
          },
        })
        .transform('<p>Status: <span class="badge">Active</span></p>');
      expect(md).toContain("(badge)");
      expect(md).not.toContain("Active");
    });
  });

  // ----- onEndTag() -----
  describe("onEndTag()", () => {
    it("fires callback on close tag", () => {
      let endTagName = "";
      const md = new MDRewriter()
        .on("p", {
          element(el) {
            el.onEndTag((tag) => {
              endTagName = tag.name;
            });
          },
        })
        .transform("<p>Hello</p>");
      expect(endTagName).toBe("p");
      expect(md).toBe("Hello\n");
    });
  });

  // ----- Multiple handlers -----
  describe("multiple handlers", () => {
    it("applies multiple handlers on same element", () => {
      const md = new MDRewriter()
        .on("a", {
          element(el) {
            const href = el.getAttribute("href");
            if (href) el.setAttribute("href", href.replace("http:", "https:"));
          },
        })
        .on("a", {
          element(el) {
            el.suffix = " (link)";
          },
        })
        .transform('<p><a href="http://example.com">Example</a></p>');
      expect(md).toContain("https://example.com");
      expect(md).toContain("(link)");
    });

    it("applies handlers from different selectors", () => {
      const md = new MDRewriter()
        .on("strong", {
          element(el) {
            el.prefix = ">>";
            el.suffix = "<<";
          },
        })
        .ignore(".ads")
        .transform('<p><strong>Bold</strong></p><div class="ads">Ad</div>');
      expect(md).toContain(">>**Bold**<<");
      expect(md).not.toContain("Ad");
    });
  });

  // ----- Selector matching end-to-end -----
  describe("selector matching", () => {
    it("matches tag selector", () => {
      const md = new MDRewriter()
        .on("em", {
          element(el) {
            el.prefix = "[";
            el.suffix = "]";
          },
        })
        .transform("<p><em>text</em></p>");
      expect(md).toContain("[*text*]");
    });

    it("matches class selector", () => {
      const md = new MDRewriter()
        .on(".special", {
          element(el) {
            el.removeAndKeepContent();
          },
        })
        .transform('<p>Before <span class="special">inner</span> after</p>');
      expect(md).toContain("inner");
    });

    it("matches compound selector", () => {
      const md = new MDRewriter()
        .on("a.internal", {
          element(el) {
            el.setAttribute("href", "/rewritten");
          },
        })
        .transform('<p><a class="internal" href="/original">Link</a></p>');
      expect(md).toContain("/rewritten");
    });

    it("matches descendant selector", () => {
      const md = new MDRewriter()
        .on("blockquote p", {
          element(el) {
            el.prefix = ">>";
          },
        })
        .transform("<blockquote><p>Nested</p></blockquote>");
      expect(md).toContain(">>");
    });

    it("matches child selector", () => {
      const md = new MDRewriter()
        .on("blockquote > p", {
          element(el) {
            el.prefix = "!!";
          },
        })
        .transform("<blockquote><p>Quoted</p></blockquote>");
      expect(md).toContain("!!");
    });

    it("matches comma-separated selectors", () => {
      const md = new MDRewriter()
        .ignore("nav, footer")
        .transform("<nav>Nav</nav><p>Content</p><footer>Foot</footer>");
      expect(md).toBe("Content\n");
    });

    it("matches attribute selectors", () => {
      const md = new MDRewriter()
        .on("[data-type]", {
          element(el) {
            el.removeAndKeepContent();
          },
        })
        .transform('<p><span data-type="mention">@user</span> said hi</p>');
      expect(md).toContain("@user");
    });
  });

  // ----- No-handler regression -----
  describe("no-handler regression", () => {
    it("produces identical output without handlers", () => {
      const testCases = [
        "<h1>Hello</h1>",
        "<p>World</p>",
        "<ul><li>One</li><li>Two</li></ul>",
        '<p><a href="url">link</a></p>',
        "<blockquote><p>Quote</p></blockquote>",
        "<pre><code>code</code></pre>",
        "<p><strong>bold</strong> and <em>italic</em></p>",
        '<p><img alt="alt" src="src"></p>',
        "<hr>",
      ];
      for (const html of testCases) {
        const bare = new MDRewriter().transform(html);
        const withRewriter = new MDRewriter().transform(html);
        expect(withRewriter).toBe(bare);
      }
    });
  });

  // ----- Element API -----
  describe("MDElement API", () => {
    it("getAttribute returns attribute value or null", () => {
      let result: string | null = null;
      new MDRewriter()
        .on("a", {
          element(el) {
            result = el.getAttribute("href");
          },
        })
        .transform('<p><a href="test">x</a></p>');
      expect(result).toBe("test");
    });

    it("getAttribute returns null for missing attribute", () => {
      let result: string | null = "initial";
      new MDRewriter()
        .on("p", {
          element(el) {
            result = el.getAttribute("class");
          },
        })
        .transform("<p>x</p>");
      expect(result).toBeNull();
    });

    it("hasAttribute checks existence", () => {
      let has = false;
      new MDRewriter()
        .on("a", {
          element(el) {
            has = el.hasAttribute("href");
          },
        })
        .transform('<p><a href="url">x</a></p>');
      expect(has).toBe(true);
    });

    it("tagName is correct", () => {
      let tag = "";
      new MDRewriter()
        .on("h2", {
          element(el) {
            tag = el.tagName;
          },
        })
        .transform("<h2>Title</h2>");
      expect(tag).toBe("h2");
    });

    it("attributes object is accessible", () => {
      let attrs: Record<string, string> = {};
      new MDRewriter()
        .on("a", {
          element(el) {
            attrs = { ...el.attributes };
          },
        })
        .transform('<p><a href="url" title="t">x</a></p>');
      expect(attrs.href).toBe("url");
      expect(attrs.title).toBe("t");
    });
  });

  // ----- Static string() -----
  describe("transform(string)", () => {
    it("converts HTML string to markdown", () => {
      expect(new MDRewriter().transform("<h1>Hello</h1><p>World</p>")).toBe(
        "# Hello\n\nWorld\n",
      );
    });
  });

  // ----- transform() with Response -----
  describe("transform()", () => {
    it("transforms a Response to markdown", async () => {
      const html = "<h1>Hello</h1><p>World</p>";
      const response = new Response(html, {
        headers: { "content-type": "text/html" },
      });
      const mdResponse = new MDRewriter().transform(response);
      const md = await mdResponse.text();
      expect(md).toBe("# Hello\n\nWorld\n");
    });

    it("transforms with handlers", async () => {
      const html = '<p><a href="/old">Link</a></p><div class="ads">Ad</div>';
      const response = new Response(html, {
        headers: { "content-type": "text/html" },
      });
      const mdResponse = new MDRewriter()
        .on("a", {
          element(el) {
            el.setAttribute("href", "/new");
          },
        })
        .ignore(".ads")
        .transform(response);
      const md = await mdResponse.text();
      expect(md).toContain("[Link](/new)");
      expect(md).not.toContain("Ad");
    });
  });

  // ----- Edge cases -----
  describe("edge cases", () => {
    it("remove() suppresses deeply nested content", () => {
      const md = new MDRewriter()
        .on("div.remove-me", {
          element(el) {
            el.remove();
          },
        })
        .transform(
          '<div class="remove-me"><div><p>Deep <strong>bold</strong></p></div></div><p>Keep</p>',
        );
      expect(md).not.toContain("Deep");
      expect(md).not.toContain("bold");
      expect(md).toBe("Keep\n");
    });

    it("handlers don't affect non-matching elements", () => {
      const md = new MDRewriter()
        .on("h1", {
          element(el) {
            el.prefix = ">>";
          },
        })
        .transform("<h2>Not H1</h2>");
      expect(md).toBe("## Not H1\n");
    });

    it("before and after with remove", () => {
      const md = new MDRewriter()
        .on("div.widget", {
          element(el) {
            el.replace("<!-- widget -->");
          },
        })
        .transform(
          '<div class="widget"><p>Complex widget</p></div><p>After</p>',
        );
      expect(md).toContain("<!-- widget -->");
      expect(md).not.toContain("Complex widget");
    });

    it("chaining methods on MDElement", () => {
      const md = new MDRewriter()
        .on("a", {
          element(el) {
            el.setAttribute("href", "/new").before("(").after(")");
          },
        })
        .transform('<p><a href="/old">Link</a></p>');
      expect(md).toContain("(");
      expect(md).toContain("[Link](/new)");
      expect(md).toContain(")");
    });
  });
});
