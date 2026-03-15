import { createRequire } from "node:module";
import { NodeHtmlMarkdown } from "node-html-markdown";
import TurndownService from "turndown";
import { MDRewriter } from "../src/index";

const require = createRequire(import.meta.url);
const Benchmark = require("htmlparser-benchmark");

// ---------------------------------------------------------------------------
// Parser wrappers — each conforms to (html, callback) signature
// ---------------------------------------------------------------------------

const mdRewriter = new MDRewriter();
function mdrewriterParser(html: string, callback: () => void) {
  mdRewriter.transform(html);
  callback();
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: "---",
  bulletListMarker: "-",
});
function turndownParser(html: string, callback: (err?: Error) => void) {
  try {
    turndown.turndown(html);
    callback();
  } catch (err) {
    callback(err as Error);
  }
}

const nhm = new NodeHtmlMarkdown();
function nhmParser(html: string, callback: (err?: Error) => void) {
  try {
    nhm.translate(html);
    callback();
  } catch (err) {
    callback(err as Error);
  }
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

interface BenchResult {
  mean: number;
  sd: number;
}

function runBenchmark(
  name: string,
  parser: (html: string, cb: (err?: Error) => void) => void,
): Promise<BenchResult> {
  return new Promise((resolve, reject) => {
    let completed = 0;
    const bench = new Benchmark(parser);

    bench.on("progress", () => {
      completed++;
      process.stderr.write(`\r  ${name}: ${completed}/${Benchmark.TOTAL}`);
    });

    bench.once("result", (stat: { mean(): number; sd(): number }) => {
      process.stderr.write("\n");
      resolve({ mean: stat.mean(), sd: stat.sd() });
    });

    bench.once("error", (err: Error) => {
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const parsers = [
  ["MDRewriter", mdrewriterParser],
  ["Turndown", turndownParser],
  ["node-html-markdown", nhmParser],
] as const;

async function main() {
  console.log(
    `\nBenchmarking against ${Benchmark.TOTAL} real-world HTML files…\n`,
  );

  const results: { name: string; result: BenchResult }[] = [];

  for (const [name, parser] of parsers) {
    const result = await runBenchmark(name, parser);
    results.push({ name, result });
  }

  console.log("\nResults (ms/file):\n");

  const pad = (n: number, w = 9) => n.toPrecision(6).padStart(w);

  console.log("| Library             |    Mean |      ± SD |");
  console.log("|---------------------|---------|-----------|");
  for (const { name, result } of results) {
    console.log(
      `| ${name.padEnd(19)} | ${pad(result.mean, 7)} | ${pad(result.sd, 9)} |`,
    );
  }

  const mdMean = results[0].result.mean;
  console.log("\nSpeedup vs MDRewriter:\n");
  for (const { name, result } of results.slice(1)) {
    const ratio = result.mean / mdMean;
    console.log(`  ${name}: ${ratio.toFixed(2)}x slower`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
