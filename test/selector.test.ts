import { describe, expect, it } from "vitest";
import {
  buildMatchContext,
  type MatchContext,
  matchSelector,
  parseSelector,
} from "../src/selector";

// Helper: build a MatchContext from tag + attrs
function ctx(tag: string, attrs: Record<string, string> = {}): MatchContext {
  return buildMatchContext(tag, attrs);
}

// Helper: build a match stack and test
function matches(selector: string, stack: MatchContext[]): boolean {
  return matchSelector(parseSelector(selector), stack);
}

describe("parseSelector", () => {
  it("parses a tag selector", () => {
    const sel = parseSelector("div");
    expect(sel).toHaveLength(1);
    expect(sel[0]).toHaveLength(1);
    expect(sel[0][0].compound.tag).toBe("div");
  });

  it("parses a class selector", () => {
    const sel = parseSelector(".foo");
    expect(sel[0][0].compound.classes).toEqual(["foo"]);
    expect(sel[0][0].compound.tag).toBeUndefined();
  });

  it("parses an ID selector", () => {
    const sel = parseSelector("#bar");
    expect(sel[0][0].compound.id).toBe("bar");
  });

  it("parses universal selector", () => {
    const sel = parseSelector("*");
    expect(sel[0][0].compound.tag).toBeUndefined();
    expect(sel[0][0].compound.classes).toEqual([]);
  });

  it("parses compound tag.class#id", () => {
    const sel = parseSelector("div.foo#bar");
    const c = sel[0][0].compound;
    expect(c.tag).toBe("div");
    expect(c.classes).toEqual(["foo"]);
    expect(c.id).toBe("bar");
  });

  it("parses multiple classes", () => {
    const sel = parseSelector(".foo.bar.baz");
    expect(sel[0][0].compound.classes).toEqual(["foo", "bar", "baz"]);
  });

  it("parses [attr] existence", () => {
    const sel = parseSelector("[href]");
    expect(sel[0][0].compound.attrs).toEqual([{ name: "href", op: "exists" }]);
  });

  it("parses [attr=val]", () => {
    const sel = parseSelector("[type=checkbox]");
    expect(sel[0][0].compound.attrs).toEqual([
      { name: "type", op: "=", value: "checkbox" },
    ]);
  });

  it("parses [attr^=val]", () => {
    const sel = parseSelector("[href^=https]");
    expect(sel[0][0].compound.attrs).toEqual([
      { name: "href", op: "^=", value: "https" },
    ]);
  });

  it("parses [attr$=val]", () => {
    const sel = parseSelector("[src$=.png]");
    expect(sel[0][0].compound.attrs).toEqual([
      { name: "src", op: "$=", value: ".png" },
    ]);
  });

  it("parses [attr*=val]", () => {
    const sel = parseSelector("[class*=nav]");
    expect(sel[0][0].compound.attrs).toEqual([
      { name: "class", op: "*=", value: "nav" },
    ]);
  });

  it("parses quoted attribute values", () => {
    const sel = parseSelector('[data-lang="typescript"]');
    expect(sel[0][0].compound.attrs).toEqual([
      { name: "data-lang", op: "=", value: "typescript" },
    ]);
  });

  it("parses single-quoted attribute values", () => {
    const sel = parseSelector("[data-lang='typescript']");
    expect(sel[0][0].compound.attrs).toEqual([
      { name: "data-lang", op: "=", value: "typescript" },
    ]);
  });

  it("parses compound with attribute", () => {
    const sel = parseSelector("code[data-lang]");
    const c = sel[0][0].compound;
    expect(c.tag).toBe("code");
    expect(c.attrs).toEqual([{ name: "data-lang", op: "exists" }]);
  });

  it("parses descendant combinator", () => {
    const sel = parseSelector("div p");
    expect(sel[0]).toHaveLength(2);
    expect(sel[0][0].compound.tag).toBe("p"); // subject first
    expect(sel[0][0].combinator).toBe("");
    expect(sel[0][1].compound.tag).toBe("div");
    expect(sel[0][1].combinator).toBe(" ");
  });

  it("parses child combinator", () => {
    const sel = parseSelector("ul > li");
    expect(sel[0]).toHaveLength(2);
    expect(sel[0][0].compound.tag).toBe("li");
    expect(sel[0][1].compound.tag).toBe("ul");
    expect(sel[0][1].combinator).toBe(">");
  });

  it("parses comma-separated selectors", () => {
    const sel = parseSelector("h1, h2, h3");
    expect(sel).toHaveLength(3);
    expect(sel[0][0].compound.tag).toBe("h1");
    expect(sel[1][0].compound.tag).toBe("h2");
    expect(sel[2][0].compound.tag).toBe("h3");
  });

  it("parses complex mixed selector", () => {
    const sel = parseSelector("div.container > p.text, a[href]");
    expect(sel).toHaveLength(2);
    // First alternative: div.container > p.text
    expect(sel[0][0].compound.tag).toBe("p");
    expect(sel[0][0].compound.classes).toEqual(["text"]);
    expect(sel[0][1].compound.tag).toBe("div");
    expect(sel[0][1].compound.classes).toEqual(["container"]);
    expect(sel[0][1].combinator).toBe(">");
    // Second alternative: a[href]
    expect(sel[1][0].compound.tag).toBe("a");
    expect(sel[1][0].compound.attrs).toEqual([{ name: "href", op: "exists" }]);
  });

  it("normalizes tag names to lowercase", () => {
    const sel = parseSelector("DIV");
    expect(sel[0][0].compound.tag).toBe("div");
  });

  it("parses three-level descendant", () => {
    const sel = parseSelector("div ul li");
    expect(sel[0]).toHaveLength(3);
    expect(sel[0][0].compound.tag).toBe("li");
    expect(sel[0][1].compound.tag).toBe("ul");
    expect(sel[0][2].compound.tag).toBe("div");
  });
});

describe("buildMatchContext", () => {
  it("extracts classes from class attribute", () => {
    const mc = buildMatchContext("div", { class: "foo bar baz" });
    expect(mc.tag).toBe("div");
    expect(mc.classes).toEqual(new Set(["foo", "bar", "baz"]));
  });

  it("extracts id", () => {
    const mc = buildMatchContext("span", { id: "main" });
    expect(mc.id).toBe("main");
  });

  it("handles missing class/id", () => {
    const mc = buildMatchContext("p", {});
    expect(mc.classes).toEqual(new Set());
    expect(mc.id).toBeNull();
  });
});

describe("matchSelector", () => {
  it("matches tag selector", () => {
    expect(matches("div", [ctx("div")])).toBe(true);
    expect(matches("div", [ctx("span")])).toBe(false);
  });

  it("matches class selector", () => {
    expect(matches(".foo", [ctx("div", { class: "foo bar" })])).toBe(true);
    expect(matches(".foo", [ctx("div", { class: "bar" })])).toBe(false);
  });

  it("matches ID selector", () => {
    expect(matches("#main", [ctx("div", { id: "main" })])).toBe(true);
    expect(matches("#main", [ctx("div", { id: "other" })])).toBe(false);
  });

  it("matches universal selector", () => {
    expect(matches("*", [ctx("div")])).toBe(true);
    expect(matches("*", [ctx("span")])).toBe(true);
  });

  it("matches compound selector", () => {
    expect(
      matches("div.foo#bar", [ctx("div", { class: "foo", id: "bar" })]),
    ).toBe(true);
    expect(
      matches("div.foo#bar", [ctx("div", { class: "foo", id: "baz" })]),
    ).toBe(false);
    expect(
      matches("div.foo#bar", [ctx("span", { class: "foo", id: "bar" })]),
    ).toBe(false);
  });

  it("matches attribute existence", () => {
    expect(matches("[href]", [ctx("a", { href: "https://x.com" })])).toBe(true);
    expect(matches("[href]", [ctx("a", {})])).toBe(false);
  });

  it("matches attribute equals", () => {
    expect(
      matches("[type=checkbox]", [ctx("input", { type: "checkbox" })]),
    ).toBe(true);
    expect(matches("[type=checkbox]", [ctx("input", { type: "text" })])).toBe(
      false,
    );
  });

  it("matches attribute starts-with", () => {
    expect(
      matches("[href^=https]", [ctx("a", { href: "https://example.com" })]),
    ).toBe(true);
    expect(
      matches("[href^=https]", [ctx("a", { href: "http://example.com" })]),
    ).toBe(false);
  });

  it("matches attribute ends-with", () => {
    expect(matches("[src$=.png]", [ctx("img", { src: "image.png" })])).toBe(
      true,
    );
    expect(matches("[src$=.png]", [ctx("img", { src: "image.jpg" })])).toBe(
      false,
    );
  });

  it("matches attribute contains", () => {
    expect(
      matches("[class*=nav]", [ctx("div", { class: "main-nav-bar" })]),
    ).toBe(true);
    expect(matches("[class*=nav]", [ctx("div", { class: "footer" })])).toBe(
      false,
    );
  });

  it("matches descendant combinator", () => {
    const stack = [ctx("div"), ctx("ul"), ctx("li")];
    expect(matches("div li", stack)).toBe(true);
    expect(matches("div ul", stack)).toBe(false); // ul is not the subject (li is)
    expect(matches("span li", stack)).toBe(false);
  });

  it("matches child combinator", () => {
    const stack = [ctx("div"), ctx("ul"), ctx("li")];
    expect(matches("ul > li", stack)).toBe(true);
    expect(matches("div > li", stack)).toBe(false); // div is not direct parent
  });

  it("matches comma-separated (union)", () => {
    expect(matches("h1, h2, h3", [ctx("h2")])).toBe(true);
    expect(matches("h1, h2, h3", [ctx("h4")])).toBe(false);
  });

  it("matches deep descendant", () => {
    const stack = [
      ctx("body"),
      ctx("div", { class: "container" }),
      ctx("article"),
      ctx("p"),
    ];
    expect(matches(".container p", stack)).toBe(true);
    expect(matches("body p", stack)).toBe(true);
    expect(matches("body > p", stack)).toBe(false);
  });

  it("matches with empty stack returns false", () => {
    expect(matches("div", [])).toBe(false);
  });

  it("matches multi-level child combinator", () => {
    const stack = [ctx("div"), ctx("ul"), ctx("li")];
    expect(matches("div > ul > li", stack)).toBe(true);
    const stack2 = [ctx("div"), ctx("p"), ctx("ul"), ctx("li")];
    expect(matches("div > ul > li", stack2)).toBe(false); // p breaks chain
  });

  it("matches mixed descendant and child", () => {
    const stack = [ctx("div"), ctx("section"), ctx("ul"), ctx("li")];
    expect(matches("div ul > li", stack)).toBe(true);
    expect(matches("div > ul > li", stack)).toBe(false); // section breaks div > ul
  });

  it("matches attribute with tag", () => {
    expect(
      matches("a.internal-link", [ctx("a", { class: "internal-link" })]),
    ).toBe(true);
  });
});
