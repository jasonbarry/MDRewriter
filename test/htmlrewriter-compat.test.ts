import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

/** Shorthand: create an MDRewriter, apply setup, convert HTML to markdown. */
function rewrite(html: string, setup: (r: MDRewriter) => void): string {
  const r = new MDRewriter();
  setup(r);
  return r.transform(html);
}

describe("HTMLRewriter API Compatibility", () => {
  // =======================================================================
  // Constructor & chaining
  // =======================================================================
  describe("Constructor & chaining", () => {
    it("new MDRewriter() creates instance", () => {
      expect(new MDRewriter()).toBeInstanceOf(MDRewriter);
    });

    it(".on() returns this for chaining", () => {
      const r = new MDRewriter();
      expect(r.on("p", { element() {} })).toBe(r);
    });

    it(".on().on().transform() chains like HTMLRewriter", () => {
      const md = new MDRewriter()
        .on("b", {
          element(el) {
            el.remove();
          },
        })
        .on("i", {
          element(el) {
            el.remove();
          },
        })
        .transform("<p>Hello <b>bold</b> and <i>italic</i></p>");
      expect(md).not.toContain("**bold**");
      expect(md).not.toContain("*italic*");
    });

    it(".transform(Response) returns Response (same as HTMLRewriter)", async () => {
      const res = new MDRewriter().transform(new Response("<p>Hello</p>"));
      expect(res).toBeInstanceOf(Response);
      const text = await res.text();
      expect(text).toBe("Hello\n");
    });
  });

  // =======================================================================
  // .on(selector, handler) — handler shape
  // =======================================================================
  describe(".on(selector, handler) — handler shape", () => {
    it("element handler fires for matching elements", () => {
      let fired = false;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("handler as object literal { element(el) {} }", () => {
      let tag = "";
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            tag = el.tagName;
          },
        }),
      );
      expect(tag).toBe("p");
    });

    it("handler as class instance (new ElementHandler())", () => {
      class ElementHandler {
        public tag = "";
        element(el: { tagName: string }) {
          this.tag = el.tagName;
        }
      }
      const handler = new ElementHandler();
      new MDRewriter().on("p", handler).transform("<p>Text</p>");
      expect(handler.tag).toBe("p");
    });

    it("multiple .on() calls accumulate handlers", () => {
      const tags: string[] = [];
      new MDRewriter()
        .on("h1", {
          element(el) {
            tags.push(el.tagName);
          },
        })
        .on("p", {
          element(el) {
            tags.push(el.tagName);
          },
        })
        .transform("<h1>Title</h1><p>Body</p>");
      expect(tags).toEqual(["h1", "p"]);
    });

    it("handler on non-matching selector never fires", () => {
      let fired = false;
      rewrite("<p>Text</p>", (r) =>
        r.on("div", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(false);
    });
  });

  // =======================================================================
  // Element properties
  // =======================================================================
  describe("Element properties", () => {
    it("tagName — lowercase string", () => {
      let tag = "";
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            tag = el.tagName;
          },
        }),
      );
      expect(tag).toBe("p");
    });

    it("tagName — uppercase HTML normalized to lowercase", () => {
      let tag = "";
      rewrite("<H1>Title</H1>", (r) =>
        r.on("h1", {
          element(el) {
            tag = el.tagName;
          },
        }),
      );
      expect(tag).toBe("h1");
    });

    it("attributes — iterable [name, value] pairs", () => {
      let attrs: Record<string, string> = {};
      rewrite('<p><a href="/url" class="link">x</a></p>', (r) =>
        r.on("a", {
          element(el) {
            attrs = { ...el.attributes };
          },
        }),
      );
      expect(attrs.href).toBe("/url");
      expect(attrs.class).toBe("link");
    });

    it("removed — false initially", () => {
      let initial = true;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            initial = el.removed;
          },
        }),
      );
      expect(initial).toBe(false);
    });

    it("removed — true after remove()", () => {
      let after = false;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            el.remove();
            after = el.removed;
          },
        }),
      );
      expect(after).toBe(true);
    });
  });

  // =======================================================================
  // Element attribute methods
  // =======================================================================
  describe("Element attribute methods", () => {
    it("getAttribute(name) returns value", () => {
      let href = "";
      rewrite('<p><a href="/url">x</a></p>', (r) =>
        r.on("a", {
          element(el) {
            href = el.getAttribute("href")!;
          },
        }),
      );
      expect(href).toBe("/url");
    });

    it("getAttribute(name) returns null for missing", () => {
      let val: string | null = "not-null";
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            val = el.getAttribute("data-missing");
          },
        }),
      );
      expect(val).toBeNull();
    });

    it("getAttribute — boolean attribute returns empty string", () => {
      let val: string | null = null;
      rewrite("<input disabled>", (r) =>
        r.on("input", {
          element(el) {
            val = el.getAttribute("disabled");
          },
        }),
      );
      expect(val).toBe("");
    });

    it("hasAttribute(name) — true/false", () => {
      let has = false;
      let hasNot = true;
      rewrite('<p><a href="/url">x</a></p>', (r) =>
        r.on("a", {
          element(el) {
            has = el.hasAttribute("href");
            hasNot = el.hasAttribute("target");
          },
        }),
      );
      expect(has).toBe(true);
      expect(hasNot).toBe(false);
    });

    it("setAttribute(name, value) — sets new attribute", () => {
      let val: string | null = null;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            el.setAttribute("data-x", "42");
            val = el.getAttribute("data-x");
          },
        }),
      );
      expect(val).toBe("42");
    });

    it("setAttribute(name, value) — overwrites existing", () => {
      const md = rewrite('<p><a href="/old">Link</a></p>', (r) =>
        r.on("a", {
          element(el) {
            el.setAttribute("href", "/new");
          },
        }),
      );
      expect(md).toContain("[Link](/new)");
    });

    it("setAttribute returns Element for chaining", () => {
      let returned: any;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            returned = el.setAttribute("x", "1");
          },
        }),
      );
      expect(returned).toBeDefined();
      expect(returned.tagName).toBe("p");
    });
  });

  // =======================================================================
  // Element mutation methods
  // =======================================================================
  describe("Element mutation methods", () => {
    it("before(content) — inserts content before element", () => {
      const md = rewrite("<p>Hello</p>", (r) =>
        r.on("p", {
          element(el) {
            el.before("BEFORE ");
          },
        }),
      );
      expect(md).toContain("BEFORE");
      expect(md.indexOf("BEFORE")).toBeLessThan(md.indexOf("Hello"));
    });

    it("after(content) — inserts content after element", () => {
      const md = rewrite("<p>Hello</p>", (r) =>
        r.on("p", {
          element(el) {
            el.after(" AFTER");
          },
        }),
      );
      expect(md).toContain("AFTER");
    });

    it("replace(content) — replaces element with content", () => {
      const md = rewrite("<p>Hello</p>", (r) =>
        r.on("p", {
          element(el) {
            el.replace("REPLACED");
          },
        }),
      );
      expect(md).toContain("REPLACED");
      expect(md).not.toContain("Hello");
    });

    it("remove() — removes element and children", () => {
      const md = rewrite("<p>Keep</p><div>Gone</div>", (r) =>
        r.on("div", {
          element(el) {
            el.remove();
          },
        }),
      );
      expect(md).toContain("Keep");
      expect(md).not.toContain("Gone");
    });

    it("remove() returns Element for chaining", () => {
      let returned: any;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            returned = el.remove();
          },
        }),
      );
      expect(returned).toBeDefined();
      expect(returned.tagName).toBe("p");
    });

    it("removeAndKeepContent() — unwraps element", () => {
      const md = rewrite("<div><p>Hello</p></div>", (r) =>
        r.on("div", {
          element(el) {
            el.removeAndKeepContent();
          },
        }),
      );
      expect(md).toContain("Hello");
    });

    it("removeAndKeepContent() returns Element for chaining", () => {
      let returned: any;
      rewrite("<div>Text</div>", (r) =>
        r.on("div", {
          element(el) {
            returned = el.removeAndKeepContent();
          },
        }),
      );
      expect(returned).toBeDefined();
      expect(returned.tagName).toBe("div");
    });
  });

  // =======================================================================
  // Element.onEndTag()
  // =======================================================================
  describe("Element.onEndTag()", () => {
    it("handler fires when end tag is reached", () => {
      let fired = false;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            el.onEndTag(() => {
              fired = true;
            });
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("handler receives object with name property", () => {
      let name = "";
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            el.onEndTag((tag) => {
              name = tag.name;
            });
          },
        }),
      );
      expect(name).toBe("p");
    });

    it("multiple onEndTag handlers fire in order", () => {
      const order: number[] = [];
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            el.onEndTag(() => {
              order.push(1);
            });
            el.onEndTag(() => {
              order.push(2);
            });
          },
        }),
      );
      expect(order).toEqual([1, 2]);
    });
  });

  // =======================================================================
  // Selector support (mirrors HTMLRewriter docs)
  // =======================================================================
  describe("Selector support", () => {
    it("* — universal", () => {
      let count = 0;
      rewrite("<p>A</p><div>B</div>", (r) =>
        r.on("*", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it("E — type selector", () => {
      let fired = false;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("E.class — class selector", () => {
      let fired = false;
      rewrite('<p class="special">Text</p>', (r) =>
        r.on("p.special", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("E#id — ID selector", () => {
      let fired = false;
      rewrite('<p id="main">Text</p>', (r) =>
        r.on("p#main", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("E[attr] — attribute presence", () => {
      let fired = false;
      rewrite('<p><a href="/url">Link</a></p>', (r) =>
        r.on("a[href]", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it('E[attr="val"] — attribute equals', () => {
      let fired = false;
      rewrite('<input type="checkbox">', (r) =>
        r.on('input[type="checkbox"]', {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it('E[attr^="val"] — attribute starts with', () => {
      let fired = false;
      rewrite('<p><a href="https://example.com">Link</a></p>', (r) =>
        r.on('a[href^="https"]', {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it('E[attr$="val"] — attribute ends with', () => {
      let fired = false;
      rewrite('<p><img src="photo.png"></p>', (r) =>
        r.on('img[src$=".png"]', {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it('E[attr*="val"] — attribute contains', () => {
      let fired = false;
      rewrite('<p class="nav-main-bar">Text</p>', (r) =>
        r.on('p[class*="main"]', {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("E F — descendant combinator", () => {
      let fired = false;
      rewrite("<div><section><p>Deep</p></section></div>", (r) =>
        r.on("div p", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("E > F — child combinator", () => {
      let fired = false;
      rewrite("<div><p>Direct child</p></div>", (r) =>
        r.on("div > p", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it("E > F does not match non-direct children", () => {
      let fired = false;
      rewrite("<div><section><p>Not direct</p></section></div>", (r) =>
        r.on("div > p", {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(false);
    });

    it("selector1, selector2 — comma (union)", () => {
      const tags: string[] = [];
      rewrite("<h1>A</h1><p>B</p><h2>C</h2>", (r) =>
        r.on("h1, h2", {
          element(el) {
            tags.push(el.tagName);
          },
        }),
      );
      expect(tags).toContain("h1");
      expect(tags).toContain("h2");
      expect(tags).not.toContain("p");
    });
  });

  // =======================================================================
  // Multiple handlers on same element
  // =======================================================================
  describe("Multiple handlers on same element", () => {
    it("all handlers fire in registration order", () => {
      const order: number[] = [];
      new MDRewriter()
        .on("p", {
          element() {
            order.push(1);
          },
        })
        .on("p", {
          element() {
            order.push(2);
          },
        })
        .transform("<p>Text</p>");
      expect(order).toEqual([1, 2]);
    });

    it("later handler sees mutations from earlier handler", () => {
      let val: string | null = null;
      new MDRewriter()
        .on("p", {
          element(el) {
            el.setAttribute("data-x", "set");
          },
        })
        .on("p", {
          element(el) {
            val = el.getAttribute("data-x");
          },
        })
        .transform("<p>Text</p>");
      expect(val).toBe("set");
    });

    it("remove() in first handler doesn't prevent second from firing", () => {
      let secondFired = false;
      new MDRewriter()
        .on("p", {
          element(el) {
            el.remove();
          },
        })
        .on("p", {
          element() {
            secondFired = true;
          },
        })
        .transform("<p>Text</p>");
      expect(secondFired).toBe(true);
    });
  });

  // =======================================================================
  // transform(Response) — streaming
  // =======================================================================
  describe("transform(Response) — streaming", () => {
    it("returns Response object", () => {
      const res = new MDRewriter().transform(new Response("<p>Hello</p>"));
      expect(res).toBeInstanceOf(Response);
    });

    it("response has content-type text/markdown", () => {
      const res = new MDRewriter().transform(new Response("<p>Hello</p>"));
      expect(res.headers.get("content-type")).toBe(
        "text/markdown; charset=utf-8",
      );
    });

    it("body is readable stream with markdown content", async () => {
      const res = new MDRewriter().transform(
        new Response("<h1>Title</h1><p>Body</p>"),
      );
      const text = await res.text();
      expect(text).toContain("# Title");
      expect(text).toContain("Body");
    });

    it("handlers fire during streaming transform", async () => {
      let fired = false;
      const res = new MDRewriter()
        .on("p", {
          element() {
            fired = true;
          },
        })
        .transform(new Response("<p>Text</p>"));
      await res.text();
      expect(fired).toBe(true);
    });
  });

  // =======================================================================
  // Element.removeAttribute()                    [.fails — unimplemented]
  // =======================================================================
  describe("Element.removeAttribute()", () => {
    it("removeAttribute(name) removes attribute", () => {
      let hasAfter = true;
      rewrite('<p><a href="/url" target="_blank">Link</a></p>', (r) =>
        r.on("a", {
          element(el) {
            el.removeAttribute("target");
            hasAfter = el.hasAttribute("target");
          },
        }),
      );
      expect(hasAfter).toBe(false);
    });
  });

  // =======================================================================
  // Element.prepend() / append()                 [.fails — unimplemented]
  // =======================================================================
  describe("Element.prepend() / append()", () => {
    it("prepend(content) inserts after start tag", () => {
      const md = rewrite("<p>World</p>", (r) =>
        r.on("p", {
          element(el) {
            el.prepend("Hello ");
          },
        }),
      );
      expect(md).toContain("Hello World");
    });

    it("append(content) inserts before end tag", () => {
      const md = rewrite("<p>Hello</p>", (r) =>
        r.on("p", {
          element(el) {
            el.append(" World");
          },
        }),
      );
      expect(md).toContain("Hello World");
    });
  });

  // =======================================================================
  // Element.setInnerContent()                    [.fails — unimplemented]
  // =======================================================================
  describe("Element.setInnerContent()", () => {
    it("setInnerContent(content) replaces children", () => {
      const md = rewrite("<p>Old content</p>", (r) =>
        r.on("p", {
          element(el) {
            el.setInnerContent("New content");
          },
        }),
      );
      expect(md).toContain("New content");
      expect(md).not.toContain("Old content");
    });
  });

  // =======================================================================
  // Element.namespaceURI                         [.fails — unimplemented]
  // =======================================================================
  describe("Element.namespaceURI", () => {
    it("namespaceURI returns namespace string", () => {
      let ns: string | undefined;
      rewrite("<p>Text</p>", (r) =>
        r.on("p", {
          element(el) {
            ns = el.namespaceURI;
          },
        }),
      );
      expect(ns).toBe("http://www.w3.org/1999/xhtml");
    });
  });

  // =======================================================================
  // Text handlers — .on(sel, { text(text) {} })
  // =======================================================================
  describe("Text handlers", () => {
    it("text.text returns text content", () => {
      let textContent = "";
      rewrite("<p>Hello</p>", (r) =>
        r.on("p", {
          text(t) {
            textContent += t.text;
          },
        }),
      );
      expect(textContent).toBe("Hello");
    });

    it("text.lastInTextNode is boolean", () => {
      let last: boolean | undefined;
      rewrite("<p>Hello</p>", (r) =>
        r.on("p", {
          text(t) {
            last = t.lastInTextNode;
          },
        }),
      );
      expect(typeof last).toBe("boolean");
    });

    it("text.replace(content) replaces text", () => {
      const md = rewrite("<p>Hello</p>", (r) =>
        r.on("p", {
          text(t) {
            if (t.text === "Hello") t.replace("World");
          },
        }),
      );
      expect(md).toContain("World");
      expect(md).not.toContain("Hello");
    });

    it("text.remove() removes text chunk", () => {
      const md = rewrite("<p>Remove me</p>", (r) =>
        r.on("p", {
          text(t) {
            t.remove();
          },
        }),
      );
      expect(md.trim()).toBe("");
    });

    it("text.before() / text.after()", () => {
      const md = rewrite("<p>World</p>", (r) =>
        r.on("p", {
          text(t) {
            if (t.text === "World") {
              t.before("Hello ");
              t.after("!");
            }
          },
        }),
      );
      expect(md).toContain("Hello World!");
    });
  });

  // =======================================================================
  // Comment handlers                             [.fails — unimplemented]
  // =======================================================================
  describe("Comment handlers", () => {
    it("comment.text returns comment text", () => {
      let commentText = "";
      rewrite("<!-- hello --><p>Text</p>", (r) =>
        r.on("p", {
          comments(c) {
            commentText = c.text;
          },
        }),
      );
      expect(commentText).toBe(" hello ");
    });

    it("comment.remove() removes comment", () => {
      const md = rewrite("<p>Text<!-- comment --></p>", (r) =>
        r.on("p", {
          comments(c) {
            c.remove();
          },
        }),
      );
      expect(md).not.toContain("comment");
    });
  });

  // =======================================================================
  // Document handlers — .onDocument()            [.fails — unimplemented]
  // =======================================================================
  describe("Document handlers — .onDocument()", () => {
    it("doctype handler fires", () => {
      let fired = false;
      const r = new MDRewriter();
      r.onDocument({
        doctype() {
          fired = true;
        },
      });
      r.transform("<!DOCTYPE html><p>Text</p>");
      expect(fired).toBe(true);
    });

    it("text handler fires for all text", () => {
      let allText = "";
      const r = new MDRewriter();
      r.onDocument({
        text(t) {
          allText += t.text;
        },
      });
      r.transform("<p>Hello</p><p>World</p>");
      expect(allText).toContain("Hello");
      expect(allText).toContain("World");
    });

    it("comments handler fires for all comments", () => {
      let fired = false;
      const r = new MDRewriter();
      r.onDocument({
        comments() {
          fired = true;
        },
      });
      r.transform("<!-- comment --><p>Text</p>");
      expect(fired).toBe(true);
    });

    it("end handler fires at document end", () => {
      let fired = false;
      const r = new MDRewriter();
      r.onDocument({
        end() {
          fired = true;
        },
      });
      r.transform("<p>Text</p>");
      expect(fired).toBe(true);
    });
  });

  // =======================================================================
  // Pseudo-class selectors                       [.fails — unimplemented]
  // =======================================================================
  describe("Pseudo-class selectors", () => {
    it("E:nth-child(n)", () => {
      let count = 0;
      rewrite("<ul><li>A</li><li>B</li><li>C</li></ul>", (r) =>
        r.on("li:nth-child(2)", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBe(1);
    });

    it("E:first-child", () => {
      let count = 0;
      rewrite("<div><p>First</p><p>Second</p></div>", (r) =>
        r.on("p:first-child", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBe(1);
    });

    it("E:nth-of-type(n)", () => {
      let count = 0;
      rewrite("<div><p>A</p><p>B</p></div>", (r) =>
        r.on("p:nth-of-type(2)", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBe(1);
    });

    it("E:first-of-type", () => {
      let count = 0;
      rewrite("<div><span>X</span><p>A</p><p>B</p></div>", (r) =>
        r.on("p:first-of-type", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBe(1);
    });

    it("E:not(s)", () => {
      let count = 0;
      rewrite('<p class="keep">A</p><p class="skip">B</p>', (r) =>
        r.on("p:not(.skip)", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBe(1);
    });
  });

  // =======================================================================
  // Additional attribute selectors               [.fails — unimplemented]
  // =======================================================================
  describe("Additional attribute selectors", () => {
    it('E[attr~="val"] — word match', () => {
      let fired = false;
      rewrite('<p class="foo bar baz">Text</p>', (r) =>
        r.on('p[class~="bar"]', {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });

    it('E[attr|="val"] — dash-separated match', () => {
      let fired = false;
      rewrite('<p lang="en-US">Text</p>', (r) =>
        r.on('p[lang|="en"]', {
          element() {
            fired = true;
          },
        }),
      );
      expect(fired).toBe(true);
    });
  });

  // =======================================================================
  // Additional combinators                       [.fails — unimplemented]
  // =======================================================================
  describe("Additional combinators", () => {
    it("E + F — adjacent sibling", () => {
      let count = 0;
      rewrite("<h1>Title</h1><p>First</p><p>Second</p>", (r) =>
        r.on("h1 + p", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBe(1);
    });

    it("E ~ F — general sibling", () => {
      let count = 0;
      rewrite("<h1>Title</h1><div>Mid</div><p>Later</p>", (r) =>
        r.on("h1 ~ p", {
          element() {
            count++;
          },
        }),
      );
      expect(count).toBe(1);
    });
  });

  // =======================================================================
  // MDRewriter-specific extensions (not in HTMLRewriter)
  // =======================================================================
  describe("MDRewriter-specific extensions", () => {
    it("prefix/suffix properties on element", () => {
      const md = rewrite("<div><p>Note text</p></div>", (r) =>
        r.on("div", {
          element(el) {
            el.prefix = "> **Note:** ";
            el.suffix = "\n";
          },
        }),
      );
      expect(md).toContain("> **Note:**");
    });

    it("setLanguage() for code blocks", () => {
      const md = rewrite(
        '<pre><code data-lang="ts">const x = 1;</code></pre>',
        (r) =>
          r.on("code[data-lang]", {
            element(el) {
              el.setLanguage(el.getAttribute("data-lang")!);
            },
          }),
      );
      expect(md).toContain("```ts");
    });

    it("transform(string) overload returns string", () => {
      const result = new MDRewriter().transform("<p>Hello</p>");
      expect(typeof result).toBe("string");
      expect(result).toContain("Hello");
    });

    it(".ignore() sugar for .on(sel, { element(el) { el.remove() } })", () => {
      const md = new MDRewriter()
        .ignore("nav, .ads")
        .transform('<p>Keep</p><nav>Nav</nav><div class="ads">Ad</div>');
      expect(md).toContain("Keep");
      expect(md).not.toContain("Nav");
      expect(md).not.toContain("Ad");
    });
  });

  // =======================================================================
  // Real-world HTMLRewriter migration patterns
  // =======================================================================
  describe("Real-world HTMLRewriter migration patterns", () => {
    it("Cloudflare Workers: strip nav/footer/script/style", () => {
      const html = `
				<nav><a href="/">Home</a></nav>
				<article><h1>Title</h1><p>Content</p></article>
				<footer>Copyright</footer>
				<script>alert(1)</script>
				<style>.x{}</style>
			`;
      const md = new MDRewriter()
        .ignore("nav, footer, script, style")
        .transform(html);
      expect(md).toContain("# Title");
      expect(md).toContain("Content");
      expect(md).not.toContain("Home");
      expect(md).not.toContain("Copyright");
      expect(md).not.toContain("alert");
    });

    it("Cloudflare Workers: rewrite link hrefs", () => {
      const md = new MDRewriter()
        .on("a", {
          element(el) {
            const href = el.getAttribute("href");
            if (href) el.setAttribute("href", href.replace("/docs/", "/wiki/"));
          },
        })
        .transform('<p><a href="/docs/page">Docs link</a></p>');
      expect(md).toContain("[Docs link](/wiki/page)");
    });

    it("Cloudflare Workers: extract article content", async () => {
      const html = `
				<header><nav>Menu</nav></header>
				<article><h1>Article</h1><p>Body text.</p></article>
				<aside>Sidebar</aside>
			`;
      const res = new MDRewriter()
        .ignore("header, aside")
        .on("article", {
          element(el) {
            el.removeAndKeepContent();
          },
        })
        .transform(new Response(html));
      expect(res.headers.get("content-type")).toBe(
        "text/markdown; charset=utf-8",
      );
      const text = await res.text();
      expect(text).toContain("# Article");
      expect(text).toContain("Body text.");
      expect(text).not.toContain("Menu");
      expect(text).not.toContain("Sidebar");
    });

    it("Bun: class-based handler pattern", () => {
      class LinkRewriter {
        private baseUrl: string;
        constructor(baseUrl: string) {
          this.baseUrl = baseUrl;
        }
        element(el: {
          getAttribute(n: string): string | null;
          setAttribute(n: string, v: string): any;
        }) {
          const src = el.getAttribute("src");
          if (src?.startsWith("/")) {
            el.setAttribute("src", `${this.baseUrl}${src}`);
          }
        }
      }
      const md = new MDRewriter()
        .on("img", new LinkRewriter("https://cdn.example.com"))
        .transform('<p><img src="/photo.jpg" alt="Photo"></p>');
      expect(md).toContain("https://cdn.example.com/photo.jpg");
    });
  });
});
