import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MDRewriter } from "../src/index";

const fixturesDir = resolve(__dirname, "fixtures");
const html = readFileSync(resolve(fixturesDir, "kitchen-sink.html"), "utf8");
const expectedMd = readFileSync(
  resolve(fixturesDir, "kitchen-sink.md"),
  "utf8",
);

describe("kitchen-sink fixture", () => {
  it("matches the expected markdown snapshot", () => {
    const actual = new MDRewriter().transform(html);
    expect(actual).toBe(expectedMd);
  });
});
