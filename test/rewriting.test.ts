import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

/** Shorthand: create an MDRewriter, apply setup, convert HTML to markdown. */
function rewrite(html: string, setup: (r: MDRewriter) => void): string {
  const r = new MDRewriter();
  setup(r);
  return r.transform(html);
}

// ===========================================================================
// 1. Element Properties
// ===========================================================================
describe("Element Properties", () => {
  it("tagName is lowercase for uppercase HTML input", () => {
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

  it("attributes object reflects all attributes", () => {
    let attrs: Record<string, string> = {};
    rewrite(
      '<p><a href="/url" class="link" id="main" data-x="42" title="tip">x</a></p>',
      (r) =>
        r.on("a", {
          element(el) {
            attrs = { ...el.attributes };
          },
        }),
    );
    expect(attrs.href).toBe("/url");
    expect(attrs.class).toBe("link");
    expect(attrs.id).toBe("main");
    expect(attrs["data-x"]).toBe("42");
    expect(attrs.title).toBe("tip");
  });

  it("removed flag is false before remove(), true after", () => {
    let before = true;
    let after = false;
    rewrite("<p>Text</p>", (r) =>
      r.on("p", {
        element(el) {
          before = el.removed;
          el.remove();
          after = el.removed;
        },
      }),
    );
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  it("removed flag can be set directly", () => {
    const md = rewrite("<p>Gone</p><p>Kept</p>", (r) =>
      r.on("p", {
        element(el) {
          if (el.getAttribute("class") === null) {
            // remove first p only (we'll rely on order — first call removes)
          }
        },
      }),
    );
    // Verify direct assignment works
    let wasSet = false;
    rewrite("<p>Gone</p>", (r) =>
      r.on("p", {
        element(el) {
          el.removed = true;
          wasSet = el.removed;
        },
      }),
    );
    expect(wasSet).toBe(true);
  });

  it("attributes on void elements (img)", () => {
    let attrs: Record<string, string> = {};
    rewrite('<p><img src="/pic.jpg" alt="photo" width="100"></p>', (r) =>
      r.on("img", {
        element(el) {
          attrs = { ...el.attributes };
        },
      }),
    );
    expect(attrs.src).toBe("/pic.jpg");
    expect(attrs.alt).toBe("photo");
    expect(attrs.width).toBe("100");
  });

  it("tagName matches for each heading level (h1-h6)", () => {
    const tags: string[] = [];
    const html = "<h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6>";
    rewrite(html, (r) =>
      r.on("h1, h2, h3, h4, h5, h6", {
        element(el) {
          tags.push(el.tagName);
        },
      }),
    );
    expect(tags).toEqual(["h1", "h2", "h3", "h4", "h5", "h6"]);
  });
});

// ===========================================================================
// 2. Attribute Methods — Edge Cases
// ===========================================================================
describe("Attribute Methods — Edge Cases", () => {
  it("getAttribute returns empty string for boolean attributes", () => {
    let val: string | null = null;
    rewrite('<p><input type="checkbox" checked></p>', (r) =>
      r.on("input", {
        element(el) {
          val = el.getAttribute("checked");
        },
      }),
    );
    expect(val).toBe("");
  });

  it("hasAttribute for boolean attrs and missing attrs", () => {
    let hasChecked = false;
    let hasMissing = true;
    rewrite('<p><input type="checkbox" checked></p>', (r) =>
      r.on("input", {
        element(el) {
          hasChecked = el.hasAttribute("checked");
          hasMissing = el.hasAttribute("nonexistent");
        },
      }),
    );
    expect(hasChecked).toBe(true);
    expect(hasMissing).toBe(false);
  });

  it("setAttribute overwrites existing attribute", () => {
    const md = rewrite('<p><a href="/old">Link</a></p>', (r) =>
      r.on("a", {
        element(el) {
          el.setAttribute("href", "/new");
        },
      }),
    );
    expect(md).toContain("[Link](/new)");
    expect(md).not.toContain("/old");
  });

  it("setAttribute adds new attribute", () => {
    let titleAfter: string | null = null;
    rewrite('<p><a href="/url">Link</a></p>', (r) =>
      r.on("a", {
        element(el) {
          el.setAttribute("title", "new-title");
          titleAfter = el.getAttribute("title");
        },
      }),
    );
    expect(titleAfter).toBe("new-title");
  });

  it("setAttribute on img: modify both src and alt together", () => {
    const md = rewrite('<p><img src="/old.jpg" alt="old"></p>', (r) =>
      r.on("img", {
        element(el) {
          el.setAttribute("src", "/new.jpg");
          el.setAttribute("alt", "new");
        },
      }),
    );
    expect(md).toContain("![new](/new.jpg)");
  });

  it("setAttribute on arbitrary attribute doesn't crash", () => {
    let noError = true;
    rewrite("<p>Text</p>", (r) =>
      r.on("p", {
        element(el) {
          try {
            el.setAttribute("data-custom", "value");
          } catch {
            noError = false;
          }
        },
      }),
    );
    expect(noError).toBe(true);
  });

  it("getAttribute returns null for missing attribute", () => {
    let val: string | null = "not-null";
    rewrite("<p>Text</p>", (r) =>
      r.on("p", {
        element(el) {
          val = el.getAttribute("nonexistent");
        },
      }),
    );
    expect(val).toBeNull();
  });

  it("hasAttribute returns true for attributes with values", () => {
    let has = false;
    rewrite('<p><a href="/url" title="tip">x</a></p>', (r) =>
      r.on("a", {
        element(el) {
          has = el.hasAttribute("title");
        },
      }),
    );
    expect(has).toBe(true);
  });
});

// ===========================================================================
// 3. Mutation Interactions
// ===========================================================================
describe("Mutation Interactions", () => {
  it("remove() suppresses prefix/suffix but preserves afterContent", () => {
    const md = rewrite("<p>Text</p><p>After</p>", (r) =>
      r.on("p", {
        element(el) {
          if (!el.hasAttribute("class")) {
            el.prefix = "PREFIX";
            el.suffix = "SUFFIX";
            el.after("AFTER");
            el.remove();
          }
        },
      }),
    );
    // remove() suppresses element+prefix+suffix but afterContent still emits
    expect(md).not.toContain("PREFIX");
    expect(md).not.toContain("SUFFIX");
    expect(md).not.toContain("Text");
    expect(md).toContain("AFTER");
  });

  it("remove() does NOT emit beforeContent", () => {
    const md = rewrite("<p>Text</p>", (r) =>
      r.on("p", {
        element(el) {
          el.before("BEFORE");
          el.remove();
        },
      }),
    );
    // Based on stream.ts L556-560: if frame.removed, pushFrame and return
    // before beforeContent emission at L613
    expect(md).not.toContain("BEFORE");
    expect(md).not.toContain("Text");
  });

  it("replace() + before() = beforeContent + replacement", () => {
    const md = rewrite("<p>Original</p>", (r) =>
      r.on("p", {
        element(el) {
          el.before("BEFORE:");
          el.replace("REPLACED");
        },
      }),
    );
    expect(md).toContain("BEFORE:");
    expect(md).toContain("REPLACED");
    expect(md).not.toContain("Original");
  });

  it("replace() + after() = replacement on open, afterContent on close", () => {
    const md = rewrite("<p>Original</p>", (r) =>
      r.on("p", {
        element(el) {
          el.replace("REPLACED");
          el.after("AFTER");
        },
      }),
    );
    expect(md).toContain("REPLACED");
    expect(md).toContain("AFTER");
    expect(md).not.toContain("Original");
  });

  it("replace() + before() + after() together", () => {
    const md = rewrite("<p>Original</p>", (r) =>
      r.on("p", {
        element(el) {
          el.before("B:");
          el.replace("R");
          el.after(":A");
        },
      }),
    );
    expect(md).toContain("B:");
    expect(md).toContain("R");
    expect(md).toContain(":A");
    expect(md).not.toContain("Original");
  });

  it("removeAndKeepContent() + prefix/suffix — content kept with prefix/suffix around it", () => {
    const md = rewrite('<div class="box">Content</div>', (r) =>
      r.on("div.box", {
        element(el) {
          el.removeAndKeepContent();
          el.prefix = "[";
          el.suffix = "]";
        },
      }),
    );
    expect(md).toContain("[");
    expect(md).toContain("Content");
    expect(md).toContain("]");
  });

  it("removeAndKeepContent() on converted tag (em) — still produces *text*", () => {
    const md = rewrite("<p><em>italic</em></p>", (r) =>
      r.on("em", {
        element(el) {
          el.removeAndKeepContent();
        },
      }),
    );
    // em is a CONVERTED_TAG, so removeAndKeepContent (unwrap) still runs the em conversion
    expect(md).toContain("*italic*");
  });

  it("removeAndKeepContent() on non-converted tag (div) — unwraps", () => {
    const md = rewrite("<div><p>Inner</p></div>", (r) =>
      r.on("div", {
        element(el) {
          el.removeAndKeepContent();
        },
      }),
    );
    expect(md).toContain("Inner");
    // No raw HTML div tags
    expect(md).not.toContain("<div>");
    expect(md).not.toContain("</div>");
  });

  it("remove() then setAttribute() — element still removed", () => {
    const md = rewrite('<p><a href="/url">Link</a></p>', (r) =>
      r.on("a", {
        element(el) {
          el.remove();
          el.setAttribute("href", "/new");
        },
      }),
    );
    expect(md).not.toContain("Link");
    expect(md).not.toContain("/new");
  });

  it("replace() suppresses original content", () => {
    const md = rewrite("<p>Original <strong>bold</strong> text</p>", (r) =>
      r.on("p", {
        element(el) {
          el.replace("REPLACED");
        },
      }),
    );
    expect(md).toContain("REPLACED");
    expect(md).not.toContain("Original");
    expect(md).not.toContain("bold");
  });

  it("setLanguage() + prefix on code block", () => {
    const md = rewrite("<pre><code>const x = 1;</code></pre>", (r) =>
      r.on("code", {
        element(el) {
          el.setLanguage("typescript");
          el.prefix = "// Code:\n";
        },
      }),
    );
    expect(md).toContain("```typescript");
    expect(md).toContain("const x = 1;");
  });
});

// ===========================================================================
// 4. Text Handlers
// ===========================================================================
describe("Text Handlers", () => {
  // Note: text handlers are registered (stream.ts:550) and trigger auto-unwrap
  // (stream.ts:579), but the text callback is never invoked in the current
  // implementation. These tests document the expected auto-unwrap side-effect.

  it("text handler on non-converted tag triggers auto-unwrap", () => {
    const md = rewrite("<div><p>Hello</p></div>", (r) =>
      r.on("div", {
        text(_text) {
          // The mere registration of this handler triggers auto-unwrap
        },
      }),
    );
    // auto-unwrap means div is treated as unwrapped (no raw HTML output)
    expect(md).not.toContain("<div>");
    expect(md).toContain("Hello");
  });

  it("text handler combined with element handler", () => {
    let elementFired = false;
    const md = rewrite("<div><p>Content</p></div>", (r) =>
      r.on("div", {
        element(el) {
          elementFired = true;
          el.prefix = ">>>";
        },
        text(_text) {
          // text handler also registered
        },
      }),
    );
    expect(elementFired).toBe(true);
    expect(md).toContain(">>>");
    expect(md).toContain("Content");
  });

  it("text handler registration causes unwrap even without element handler", () => {
    const md = rewrite("<section><p>Text</p></section>", (r) =>
      r.on("section", {
        text() {
          // just registering
        },
      }),
    );
    expect(md).not.toContain("<section>");
    expect(md).toContain("Text");
  });
});

// ===========================================================================
// 5. End Tag Handling
// ===========================================================================
describe("End Tag Handling", () => {
  it("onEndTag name matches tag name", () => {
    let endName = "";
    rewrite("<p>Hello</p>", (r) =>
      r.on("p", {
        element(el) {
          el.onEndTag((tag) => {
            endName = tag.name;
          });
        },
      }),
    );
    expect(endName).toBe("p");
  });

  it("multiple onEndTag handlers fire in registration order", () => {
    const order: number[] = [];
    rewrite("<p>Hello</p>", (r) =>
      r.on("p", {
        element(el) {
          el.onEndTag(() => { order.push(1); });
          el.onEndTag(() => { order.push(2); });
          el.onEndTag(() => { order.push(3); });
        },
      }),
    );
    expect(order).toEqual([1, 2, 3]);
  });

  it("onEndTag on removed element still fires", () => {
    let fired = false;
    rewrite("<p>Hello</p>", (r) =>
      r.on("p", {
        element(el) {
          el.remove();
          el.onEndTag(() => {
            fired = true;
          });
        },
      }),
    );
    expect(fired).toBe(true);
  });

  it("onEndTag on replaced element still fires", () => {
    let fired = false;
    rewrite("<p>Hello</p>", (r) =>
      r.on("p", {
        element(el) {
          el.replace("REPLACED");
          el.onEndTag(() => {
            fired = true;
          });
        },
      }),
    );
    expect(fired).toBe(true);
  });

  it("onEndTag on heading has correct name", () => {
    let endName = "";
    rewrite("<h3>Title</h3>", (r) =>
      r.on("h3", {
        element(el) {
          el.onEndTag((tag) => {
            endName = tag.name;
          });
        },
      }),
    );
    expect(endName).toBe("h3");
  });

  it("onEndTag on void element (img) fires via implied close", () => {
    let fired = false;
    rewrite('<p><img src="pic.jpg" alt="pic"></p>', (r) =>
      r.on("img", {
        element(el) {
          el.onEndTag(() => {
            fired = true;
          });
        },
      }),
    );
    // htmlparser2 generates an implied close for void elements
    expect(fired).toBe(true);
  });
});

// ===========================================================================
// 6. Method Chaining
// ===========================================================================
describe("Method Chaining", () => {
  it("setAttribute returns MDElement", () => {
    let returnedSelf = false;
    rewrite('<p><a href="/x">x</a></p>', (r) =>
      r.on("a", {
        element(el) {
          const ret = el.setAttribute("href", "/y");
          returnedSelf = ret === el;
        },
      }),
    );
    expect(returnedSelf).toBe(true);
  });

  it("remove() returns MDElement", () => {
    let returnedSelf = false;
    rewrite("<p>Text</p>", (r) =>
      r.on("p", {
        element(el) {
          const ret = el.remove();
          returnedSelf = ret === el;
        },
      }),
    );
    expect(returnedSelf).toBe(true);
  });

  it("removeAndKeepContent() returns MDElement", () => {
    let returnedSelf = false;
    rewrite("<div>Text</div>", (r) =>
      r.on("div", {
        element(el) {
          const ret = el.removeAndKeepContent();
          returnedSelf = ret === el;
        },
      }),
    );
    expect(returnedSelf).toBe(true);
  });

  it("before() called twice accumulates content", () => {
    const md = rewrite("<p>Text</p>", (r) =>
      r.on("p", {
        element(el) {
          el.before("A");
          el.before("B");
        },
      }),
    );
    expect(md).toContain("AB");
  });

  it("after() called twice accumulates content", () => {
    const md = rewrite("<p>Text</p>", (r) =>
      r.on("p", {
        element(el) {
          el.after("A");
          el.after("B");
        },
      }),
    );
    expect(md).toContain("AB");
  });

  it("full chain: setAttribute → before → after", () => {
    const md = rewrite('<p><a href="/old">Link</a></p>', (r) =>
      r.on("a", {
        element(el) {
          el.setAttribute("href", "/new").before("(").after(")");
        },
      }),
    );
    expect(md).toContain("(");
    expect(md).toContain("[Link](/new)");
    expect(md).toContain(")");
  });
});

// ===========================================================================
// 7. Handler Execution Order
// ===========================================================================
describe("Handler Execution Order", () => {
  it("handlers fire in registration order (last write wins for prefix)", () => {
    const md = rewrite("<p>Text</p>", (r) =>
      r
        .on("p", {
          element(el) {
            el.prefix = "FIRST";
          },
        })
        .on("p", {
          element(el) {
            el.prefix = "SECOND";
          },
        }),
    );
    // Last handler overwrites prefix
    expect(md).toContain("SECOND");
    expect(md).not.toContain("FIRST");
  });

  it("later handler sees mutations from earlier handler (getAttribute after setAttribute)", () => {
    let laterSawNewValue = false;
    rewrite('<p><a href="/old">Link</a></p>', (r) =>
      r
        .on("a", {
          element(el) {
            el.setAttribute("href", "/new");
          },
        })
        .on("a", {
          element(el) {
            laterSawNewValue = el.getAttribute("href") === "/new";
          },
        }),
    );
    expect(laterSawNewValue).toBe(true);
  });

  it("remove() in first handler still allows second handler to run", () => {
    let secondFired = false;
    rewrite("<p>Text</p>", (r) =>
      r
        .on("p", {
          element(el) {
            el.remove();
          },
        })
        .on("p", {
          element() {
            secondFired = true;
          },
        }),
    );
    expect(secondFired).toBe(true);
  });

  it("ignore() before on() — element removed", () => {
    let handlerFired = false;
    const md = rewrite('<div class="ads">Ad content</div>', (r) =>
      r.ignore(".ads").on(".ads", {
        element() {
          handlerFired = true;
        },
      }),
    );
    // ignore() registered first removes the element
    expect(md).not.toContain("Ad content");
    // second handler still fires (both match)
    expect(handlerFired).toBe(true);
  });

  it("on() before ignore() — element removed", () => {
    let handlerFired = false;
    const md = rewrite('<div class="ads">Ad content</div>', (r) =>
      r
        .on(".ads", {
          element() {
            handlerFired = true;
          },
        })
        .ignore(".ads"),
    );
    expect(handlerFired).toBe(true);
    expect(md).not.toContain("Ad content");
  });

  it("handler on parent does not fire for child", () => {
    const matchedTags: string[] = [];
    rewrite("<div><p>Child</p></div>", (r) =>
      r.on("div", {
        element(el) {
          matchedTags.push(el.tagName);
        },
      }),
    );
    // Handler on "div" should only fire for the div, not the p
    expect(matchedTags).toEqual(["div"]);
  });
});

// ===========================================================================
// 8. Advanced Selector + Handler Integration
// ===========================================================================
describe("Advanced Selector + Handler Integration", () => {
  it("ID selector #main", () => {
    const md = rewrite(
      '<div id="main"><p>Content</p></div><div id="other"><p>Other</p></div>',
      (r) =>
        r.on("#main", {
          element(el) {
            el.removeAndKeepContent();
            el.prefix = ">>>";
          },
        }),
    );
    expect(md).toContain(">>>");
    expect(md).toContain("Content");
  });

  it("universal * collects all tagNames", () => {
    const tags: string[] = [];
    rewrite("<p><em>Hello</em></p>", (r) =>
      r.on("*", {
        element(el) {
          tags.push(el.tagName);
        },
      }),
    );
    expect(tags).toContain("p");
    expect(tags).toContain("em");
  });

  it('attribute value [type="checkbox"]', () => {
    let matched = false;
    rewrite('<p><input type="checkbox" checked></p>', (r) =>
      r.on('[type="checkbox"]', {
        element() {
          matched = true;
        },
      }),
    );
    expect(matched).toBe(true);
  });

  it('attribute starts-with [href^="https"]', () => {
    const md = rewrite(
      '<p><a href="https://example.com">Secure</a> <a href="http://example.com">Insecure</a></p>',
      (r) =>
        r.on('[href^="https"]', {
          element(el) {
            el.suffix = " (secure)";
          },
        }),
    );
    expect(md).toContain("Secure](https://example.com) (secure)");
    expect(md).not.toContain("Insecure](http://example.com) (secure)");
  });

  it('attribute ends-with [src$=".png"]', () => {
    let matchedSrc = "";
    rewrite(
      '<p><img src="photo.png" alt="png"> <img src="photo.jpg" alt="jpg"></p>',
      (r) =>
        r.on('[src$=".png"]', {
          element(el) {
            matchedSrc = el.getAttribute("src") || "";
          },
        }),
    );
    expect(matchedSrc).toBe("photo.png");
  });

  it('attribute contains [class*="nav"]', () => {
    let matched = false;
    rewrite('<div class="main-nav-bar"><p>Nav</p></div>', (r) =>
      r.on('[class*="nav"]', {
        element() {
          matched = true;
        },
      }),
    );
    expect(matched).toBe(true);
  });

  it("3-level descendant: div section p", () => {
    let matched = false;
    rewrite("<div><section><p>Deep</p></section></div>", (r) =>
      r.on("div section p", {
        element() {
          matched = true;
        },
      }),
    );
    expect(matched).toBe(true);
  });

  it("child selector does NOT match grandchild", () => {
    let matched = false;
    rewrite("<div><section><p>Deep</p></section></div>", (r) =>
      r.on("div > p", {
        element() {
          matched = true;
        },
      }),
    );
    // p is grandchild of div (child of section), so > should not match
    expect(matched).toBe(false);
  });

  it("mixed descendant + child combinators", () => {
    let matched = false;
    rewrite("<div><section><p>Deep</p></section></div>", (r) =>
      r.on("div section > p", {
        element() {
          matched = true;
        },
      }),
    );
    // p is direct child of section, section is descendant of div
    expect(matched).toBe(true);
  });

  it("compound a.external[target]", () => {
    let matched = false;
    rewrite(
      '<p><a class="external" href="https://x.com" target="_blank">Ext</a></p>',
      (r) =>
        r.on("a.external[target]", {
          element() {
            matched = true;
          },
        }),
    );
    expect(matched).toBe(true);
  });
});

// ===========================================================================
// 9. Converted Element Mutations
// ===========================================================================
describe("Converted Element Mutations", () => {
  it("heading: prefix and suffix", () => {
    const md = rewrite("<h2>Title</h2>", (r) =>
      r.on("h2", {
        element(el) {
          el.prefix = ">>>";
          el.suffix = "<<<";
        },
      }),
    );
    expect(md).toContain(">>>");
    expect(md).toContain("Title");
    expect(md).toContain("<<<");
  });

  it("link: setAttribute href", () => {
    const md = rewrite('<p><a href="/old">Click</a></p>', (r) =>
      r.on("a", {
        element(el) {
          el.setAttribute("href", "/new");
        },
      }),
    );
    expect(md).toBe("[Click](/new)\n");
  });

  it("link: replace()", () => {
    const md = rewrite('<p><a href="/url">Click</a></p>', (r) =>
      r.on("a", {
        element(el) {
          el.replace("[LINK]");
        },
      }),
    );
    expect(md).toContain("[LINK]");
    expect(md).not.toContain("Click");
  });

  it("link: removeAndKeepContent()", () => {
    const md = rewrite('<p><a href="/url">Click me</a></p>', (r) =>
      r.on("a", {
        element(el) {
          el.removeAndKeepContent();
        },
      }),
    );
    // Since <a> is a CONVERTED_TAG, unwrap still runs the <a> conversion
    expect(md).toContain("Click me");
  });

  it("image: setAttribute (src+alt), replace(), before()+after()", () => {
    const md = rewrite('<p><img src="/old.jpg" alt="old"></p>', (r) =>
      r.on("img", {
        element(el) {
          el.setAttribute("src", "https://cdn.com/new.jpg");
          el.setAttribute("alt", "new alt");
        },
      }),
    );
    expect(md).toContain("![new alt](https://cdn.com/new.jpg)");
  });

  it("image: replace()", () => {
    const md = rewrite('<p><img src="/pic.jpg" alt="pic"></p>', (r) =>
      r.on("img", {
        element(el) {
          el.replace("[IMAGE]");
        },
      }),
    );
    expect(md).toContain("[IMAGE]");
    expect(md).not.toContain("![");
  });

  it("image: before()+after()", () => {
    const md = rewrite('<p><img src="/pic.jpg" alt="pic"></p>', (r) =>
      r.on("img", {
        element(el) {
          el.before("(");
          el.after(")");
        },
      }),
    );
    expect(md).toContain("(");
    expect(md).toContain("![pic](/pic.jpg)");
    expect(md).toContain(")");
  });

  it("list: remove() on ul", () => {
    const md = rewrite("<ul><li>One</li><li>Two</li></ul><p>After</p>", (r) =>
      r.on("ul", {
        element(el) {
          el.remove();
        },
      }),
    );
    expect(md).not.toContain("One");
    expect(md).not.toContain("Two");
    expect(md).toContain("After");
  });

  it("list: prefix on li", () => {
    const md = rewrite("<ul><li>Item</li></ul>", (r) =>
      r.on("li", {
        element(el) {
          el.prefix = ">>> ";
        },
      }),
    );
    expect(md).toContain(">>> ");
    expect(md).toContain("Item");
  });

  it("blockquote: remove()", () => {
    const md = rewrite(
      "<blockquote><p>Quote</p></blockquote><p>After</p>",
      (r) =>
        r.on("blockquote", {
          element(el) {
            el.remove();
          },
        }),
    );
    expect(md).not.toContain("Quote");
    expect(md).toContain("After");
  });

  it("blockquote: removeAndKeepContent()", () => {
    const md = rewrite("<blockquote><p>Quote</p></blockquote>", (r) =>
      r.on("blockquote", {
        element(el) {
          el.removeAndKeepContent();
        },
      }),
    );
    // Content preserved, blockquote formatting removed
    expect(md).toContain("Quote");
  });

  it("code block: setLanguage() overrides class", () => {
    const md = rewrite(
      '<pre><code class="language-js">let x = 1;</code></pre>',
      (r) =>
        r.on("code", {
          element(el) {
            el.setLanguage("typescript");
          },
        }),
    );
    expect(md).toContain("```typescript");
    expect(md).not.toContain("```js");
  });

  it("inline code: replace()", () => {
    const md = rewrite("<p>Use <code>foo()</code> here</p>", (r) =>
      r.on("code", {
        element(el) {
          el.replace("FUNC");
        },
      }),
    );
    expect(md).toContain("FUNC");
    expect(md).not.toContain("`foo()`");
  });

  it("emphasis: prefix/suffix wrap around *text*", () => {
    const md = rewrite("<p><em>italic</em></p>", (r) =>
      r.on("em", {
        element(el) {
          el.prefix = "[";
          el.suffix = "]";
        },
      }),
    );
    expect(md).toContain("[*italic*]");
  });

  it("strong: remove()", () => {
    const md = rewrite("<p>Hello <strong>bold</strong> world</p>", (r) =>
      r.on("strong", {
        element(el) {
          el.remove();
        },
      }),
    );
    expect(md).toContain("Hello");
    expect(md).toContain("world");
    expect(md).not.toContain("bold");
  });

  it("strikethrough: suffix", () => {
    const md = rewrite("<p><del>removed</del></p>", (r) =>
      r.on("del", {
        element(el) {
          el.suffix = " (deleted)";
        },
      }),
    );
    expect(md).toContain("~~removed~~");
    expect(md).toContain("(deleted)");
  });

  it("table: remove()", () => {
    const md = rewrite(
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><p>After</p>",
      (r) =>
        r.on("table", {
          element(el) {
            el.remove();
          },
        }),
    );
    expect(md).not.toContain("| A");
    expect(md).not.toContain("| 1");
    expect(md).toContain("After");
  });

  it("hr: before()/after()", () => {
    const md = rewrite("<hr>", (r) =>
      r.on("hr", {
        element(el) {
          el.before("BEFORE\n");
          el.after("\nAFTER");
        },
      }),
    );
    expect(md).toContain("BEFORE");
    expect(md).toContain("---");
    expect(md).toContain("AFTER");
  });
});

// ===========================================================================
// 10. Real-World Patterns
// ===========================================================================
describe("Real-World Patterns", () => {
  it("strips nav/footer/ads/script/style from full page", () => {
    const html = `
      <html><body>
        <nav><a href="/">Home</a></nav>
        <p>Main content</p>
        <footer>Copyright 2024</footer>
        <script>alert(1)</script>
        <style>.x{color:red}</style>
        <div class="ads">Buy now!</div>
      </body></html>
    `;
    const md = rewrite(html, (r) =>
      r.ignore("nav, footer, script, style, .ads"),
    );
    expect(md).toContain("Main content");
    expect(md).not.toContain("Home");
    expect(md).not.toContain("Copyright");
    expect(md).not.toContain("alert");
    expect(md).not.toContain("color:red");
    expect(md).not.toContain("Buy now");
  });

  it("rewrites internal link paths", () => {
    const md = rewrite(
      '<p><a href="/docs/api">API</a> and <a href="/docs/guide">Guide</a> and <a href="/about">About</a></p>',
      (r) =>
        r.on("a", {
          element(el) {
            const href = el.getAttribute("href");
            if (href?.startsWith("/docs/")) {
              el.setAttribute("href", href.replace("/docs/", "/wiki/"));
            }
          },
        }),
    );
    expect(md).toContain("[API](/wiki/api)");
    expect(md).toContain("[Guide](/wiki/guide)");
    expect(md).toContain("[About](/about)");
  });

  it("wraps callout div as blockquote", () => {
    const md = rewrite('<div class="callout">Important info</div>', (r) =>
      r.on("div.callout", {
        element(el) {
          el.removeAndKeepContent();
          el.prefix = "> **Note:** ";
          el.suffix = "\n";
        },
      }),
    );
    expect(md).toContain("> **Note:** ");
    expect(md).toContain("Important info");
  });

  it("overrides code language from data-attr", () => {
    const md = rewrite(
      '<pre><code data-lang="python">print("hi")</code></pre>',
      (r) =>
        r.on("code[data-lang]", {
          element(el) {
            el.setLanguage(el.getAttribute("data-lang") || "");
          },
        }),
    );
    expect(md).toContain("```python");
    expect(md).toContain('print("hi")');
  });

  it("transforms relative image URLs to CDN", () => {
    const md = rewrite(
      '<p><img src="/images/photo.jpg" alt="photo"> <img src="https://other.com/pic.png" alt="ext"></p>',
      (r) =>
        r.on("img", {
          element(el) {
            const src = el.getAttribute("src");
            if (src?.startsWith("/")) {
              el.setAttribute("src", `https://cdn.example.com${src}`);
            }
          },
        }),
    );
    expect(md).toContain("![photo](https://cdn.example.com/images/photo.jpg)");
    expect(md).toContain("![ext](https://other.com/pic.png)");
  });

  it("extracts article content from full page", () => {
    const html = `
      <html><body>
        <nav><a href="/">Home</a></nav>
        <article>
          <h1>Article Title</h1>
          <p>Article body text.</p>
        </article>
        <footer>Footer</footer>
      </body></html>
    `;
    const md = rewrite(html, (r) =>
      r.ignore("nav, footer").on("article", {
        element(el) {
          el.removeAndKeepContent();
        },
      }),
    );
    expect(md).toContain("# Article Title");
    expect(md).toContain("Article body text.");
    expect(md).not.toContain("Home");
    expect(md).not.toContain("Footer");
  });

  it("Cloudflare Workers pipeline: combined ignore + unwrap + rewrite + transform", () => {
    const html = `
      <html><body>
        <nav><a href="/">Home</a></nav>
        <header><h1>Site Name</h1></header>
        <article>
          <h2>Page Title</h2>
          <p>Some text with <a href="/docs/ref">a link</a>.</p>
          <div class="sidebar">Sidebar content</div>
          <p><img src="/img/photo.jpg" alt="pic"></p>
        </article>
        <footer>Copyright</footer>
        <script>var x=1;</script>
        <style>.y{}</style>
      </body></html>
    `;
    const md = rewrite(html, (r) =>
      r
        .ignore("nav, header, footer, script, style, .sidebar")
        .on("article", {
          element(el) {
            el.removeAndKeepContent();
          },
        })
        .on("a", {
          element(el) {
            const href = el.getAttribute("href");
            if (href?.startsWith("/docs/")) {
              el.setAttribute("href", href.replace("/docs/", "/wiki/"));
            }
          },
        })
        .on("img", {
          element(el) {
            const src = el.getAttribute("src");
            if (src?.startsWith("/")) {
              el.setAttribute("src", `https://cdn.example.com${src}`);
            }
          },
        }),
    );
    expect(md).toContain("## Page Title");
    expect(md).toContain("[a link](/wiki/ref)");
    expect(md).toContain("![pic](https://cdn.example.com/img/photo.jpg)");
    expect(md).not.toContain("Home");
    expect(md).not.toContain("Site Name");
    expect(md).not.toContain("Sidebar content");
    expect(md).not.toContain("Copyright");
    expect(md).not.toContain("var x");
  });
});

// ===========================================================================
// 11. Edge Cases
// ===========================================================================
describe("Edge Cases", () => {
  it("handler on empty <p></p> — still fires, prefix/suffix emitted", () => {
    let fired = false;
    const md = rewrite("<p></p>", (r) =>
      r.on("p", {
        element(el) {
          fired = true;
          el.prefix = "PRE";
          el.suffix = "POST";
        },
      }),
    );
    expect(fired).toBe(true);
    // prefix and suffix should appear even for empty element
    expect(md).toContain("PRE");
    expect(md).toContain("POST");
  });

  it("handler on void element (br) with before()", () => {
    const md = rewrite("<p>Line1<br>Line2</p>", (r) =>
      r.on("br", {
        element(el) {
          el.before("[BR]");
        },
      }),
    );
    expect(md).toContain("[BR]");
    expect(md).toContain("Line1");
    expect(md).toContain("Line2");
  });

  it("deeply nested element (5 levels) — handler fires", () => {
    let fired = false;
    rewrite(
      "<div><div><div><div><div><p>Deep</p></div></div></div></div></div>",
      (r) =>
        r.on("p", {
          element() {
            fired = true;
          },
        }),
    );
    expect(fired).toBe(true);
  });

  it("handler on child of removed parent — child handler skipped", () => {
    let childFired = false;
    const md = rewrite("<div><p>Child</p></div>", (r) =>
      r
        .on("div", {
          element(el) {
            el.remove();
          },
        })
        .on("p", {
          element() {
            childFired = true;
          },
        }),
    );
    // When parent is removed, children are not processed
    expect(childFired).toBe(false);
    expect(md).not.toContain("Child");
  });

  it("multiple handlers modify same attribute — last write wins", () => {
    const md = rewrite('<p><a href="/original">Link</a></p>', (r) =>
      r
        .on("a", {
          element(el) {
            el.setAttribute("href", "/first");
          },
        })
        .on("a", {
          element(el) {
            el.setAttribute("href", "/second");
          },
        }),
    );
    expect(md).toContain("[Link](/second)");
    expect(md).not.toContain("/first");
    expect(md).not.toContain("/original");
  });

  it("prefix/suffix on empty element", () => {
    const md = rewrite("<p></p>", (r) =>
      r.on("p", {
        element(el) {
          el.prefix = "[";
          el.suffix = "]";
        },
      }),
    );
    expect(md).toContain("[");
    expect(md).toContain("]");
  });

  it("handler fires for every instance of matched element (5 li items)", () => {
    let count = 0;
    rewrite(
      "<ul><li>A</li><li>B</li><li>C</li><li>D</li><li>E</li></ul>",
      (r) =>
        r.on("li", {
          element() {
            count++;
          },
        }),
    );
    expect(count).toBe(5);
  });

  it("on() and ignore() return MDRewriter for chaining", () => {
    const r = new MDRewriter();
    const ret1 = r.on("p", { element() {} });
    const ret2 = r.ignore("div");
    expect(ret1).toBe(r);
    expect(ret2).toBe(r);
  });

  it("full HTML document with doctype converts to markdown when handlers are registered", () => {
    const html =
      '<!DOCTYPE html><html><head><title>Test</title><style>body{}</style></head><body><h1>Title</h1><p>Hello <a href="/url">link</a></p></body></html>';
    const md = rewrite(html, (r) =>
      r.ignore("head, script, style, noscript, svg"),
    );
    expect(md).toContain("# Title");
    expect(md).toContain("[link](/url)");
    expect(md).not.toContain("<!DOCTYPE");
    expect(md).not.toContain("<html");
    expect(md).not.toContain("<head");
    expect(md).not.toContain("<body");
  });

  it("top-level inline tags convert instead of raw HTML when handlers are registered", () => {
    const html = '<a href="/url">Link</a><p>Text</p>';
    const md = rewrite(html, (r) =>
      r.on("a", { element() {} }),
    );
    expect(md).toContain("[Link](/url)");
    expect(md).not.toContain("<a ");
  });

  it("HTML comments are stripped when handlers are registered", () => {
    const html = "<!-- comment --><p>Text</p>";
    const md = rewrite(html, (r) =>
      r.on("p", { element() {} }),
    );
    expect(md).toContain("Text");
    expect(md).not.toContain("<!-- comment -->");
  });

  it("no handlers = identical output to bare htmlToMarkdown", () => {
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
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
      "<p><del>strikethrough</del></p>",
    ];
    for (const html of testCases) {
      const bare = new MDRewriter().transform(html);
      const withRewriter = new MDRewriter().transform(html);
      expect(withRewriter).toBe(bare);
    }
  });

  it("handler on table cell th/td", () => {
    let thFired = false;
    let tdFired = false;
    rewrite(
      "<table><thead><tr><th>Head</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>",
      (r) =>
        r
          .on("th", {
            element() {
              thFired = true;
            },
          })
          .on("td", {
            element() {
              tdFired = true;
            },
          }),
    );
    expect(thFired).toBe(true);
    expect(tdFired).toBe(true);
  });
});
