import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Parser as HtmlParser } from "htmlparser2";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { Bench } from "tinybench";
import TurndownService from "turndown";
import { MDRewriter } from "../src/index";

// ---------------------------------------------------------------------------
// Load real-world HTML fixtures, sorted by size ascending
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "fixtures/real-world");
const files = fs
  .readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => {
    const html = fs.readFileSync(path.join(fixturesDir, f), "utf8");
    return {
      name: f,
      html,
      size: fs.statSync(path.join(fixturesDir, f)).size,
      nodes: countNodes(html),
    };
  })
  .sort((a, b) => a.nodes - b.nodes);

// ---------------------------------------------------------------------------
// Shared library instances (reused across iterations like a real app would)
// ---------------------------------------------------------------------------

const mdRewriter = new MDRewriter();

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: "---",
  bulletListMarker: "-",
});

const nhm = new NodeHtmlMarkdown();

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function countNodes(html: string): number {
  let count = 0;
  const parser = new HtmlParser({
    onopentag() { count++; },
    ontext() { count++; },
    oncomment() { count++; },
  });
  parser.end(html);
  return count;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${Math.round(hz).toLocaleString()}`;
  if (hz >= 100) return `${Math.round(hz)}`;
  if (hz >= 10) return `${hz.toFixed(1)}`;
  return `${hz.toFixed(2)}`;
}

function formatP99(ms: number): string {
  if (ms >= 100) return `${Math.round(ms)}ms`;
  if (ms >= 10) return `${ms.toFixed(1)}ms`;
  return `${ms.toFixed(2)}ms`;
}

function formatCell(hz: number, p99: number): string {
  return `${formatHz(hz).padStart(7)} ops/s ${formatP99(p99).padStart(8)}`;
}

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function colorRank(cells: string[], hzValues: number[]): string[] {
  const sorted = [...hzValues].sort((a, b) => b - a);
  return cells.map((cell, i) => {
    if (hzValues[i] === sorted[0]) return green(cell);
    if (hzValues[i] === sorted[sorted.length - 1]) return red(cell);
    return yellow(cell);
  });
}

// ---------------------------------------------------------------------------
// Run benchmarks
// ---------------------------------------------------------------------------

type FileResult = {
  name: string;
  size: number;
  nodes: number;
  mdrewriter: { hz: number; p99: number };
  turndown: { hz: number; p99: number };
  nhm: { hz: number; p99: number };
};

async function main() {
  const results: FileResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    process.stderr.write(
      `\rBenchmarking ${i + 1}/${files.length} real-world HTML files…`,
    );

    const bench = new Bench({ iterations: 5, warmupIterations: 2 });

    bench
      .add("MDRewriter", () => {
        mdRewriter.transform(file.html);
      })
      .add("Turndown", () => {
        turndown.turndown(file.html);
      })
      .add("node-html-markdown", () => {
        nhm.translate(file.html);
      });

    await bench.warmup();
    await bench.run();

    const get = (name: string) => {
      const task = bench.getTask(name);
      const r = task!.result!;
      return { hz: r.hz, p99: r.p99 };
    };

    results.push({
      name: file.name,
      size: file.size,
      nodes: file.nodes,
      mdrewriter: get("MDRewriter"),
      turndown: get("Turndown"),
      nhm: get("node-html-markdown"),
    });

  }
  process.stderr.write("\n\n");

  // ---------------------------------------------------------------------------
  // Print consolidated table
  // ---------------------------------------------------------------------------

  const nameW = 26;
  const sizeW = 12;
  const nodesW = 8;
  const cellW = 23;

  const header = [
    "Website".padEnd(nameW),
    "Nodes".padStart(nodesW),
    "Size".padStart(sizeW),
    "Turndown".padStart(cellW),
    "node-html-markdown".padStart(cellW),
    "MDRewriter".padStart(cellW),
  ].join(" ");

  const separator = "─".repeat(header.length);

  console.log(header);
  console.log(separator);

  for (const r of results) {
    const cells = [
      formatCell(r.turndown.hz, r.turndown.p99).padStart(cellW),
      formatCell(r.nhm.hz, r.nhm.p99).padStart(cellW),
      formatCell(r.mdrewriter.hz, r.mdrewriter.p99).padStart(cellW),
    ];
    const colored = colorRank(cells, [r.turndown.hz, r.nhm.hz, r.mdrewriter.hz]);
    const row = [
      r.name.replace(/\.html$/, "").replace(/_.*/, "").padEnd(nameW),
      r.nodes.toLocaleString().padStart(nodesW),
      formatSize(r.size).padStart(sizeW),
      ...colored,
    ].join(" ");
    console.log(row);
  }

  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
