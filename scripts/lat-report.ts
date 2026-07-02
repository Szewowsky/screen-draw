import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

const TAG = "[LAT-161]";

export interface LatencySample {
  totalMs: number;
  stages: Record<string, number | null | undefined>;
}

export interface SummaryRow {
  scenario: string;
  stage: string;
  count: number;
  median: number;
  p95: number;
}

function round(value: number): number {
  return Number(value.toFixed(1));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? Number.NaN;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return Number.NaN;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? Number.NaN;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function parseLatencyLines(text: string): LatencySample[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith(`${TAG} {`))
    .map((line) => JSON.parse(line.slice(TAG.length + 1)) as LatencySample)
    .filter((sample) => typeof sample.totalMs === "number" && typeof sample.stages === "object");
}

export function summarizeSamples(samples: LatencySample[], scenario: string): SummaryRow[] {
  const stageNames = new Set<string>(["totalMs"]);
  for (const sample of samples) {
    for (const stage of Object.keys(sample.stages)) stageNames.add(stage);
  }

  return [...stageNames].sort().map((stage) => {
    const values = samples
      .map((sample) => (stage === "totalMs" ? sample.totalMs : sample.stages[stage]))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .sort((a, b) => a - b);

    return {
      scenario,
      stage,
      count: values.length,
      median: round(median(values)),
      p95: round(percentile(values, 0.95)),
    };
  });
}

export function formatSummaryTable(rows: SummaryRow[]): string {
  const lines = ["| scenario | stage | count | median_ms | p95_ms |", "|---|---:|---:|---:|---:|"];
  for (const row of rows) {
    lines.push(
      `| ${row.scenario} | ${row.stage} | ${row.count} | ${row.median} | ${row.p95} |`,
    );
  }
  return lines.join("\n");
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function main(): void {
  const scenario = readArg("--scenario") ?? "unknown";
  const skip = Number(readArg("--skip") ?? "0");
  const file = process.argv[process.argv.length - 1];
  if (!file || file.startsWith("--")) {
    throw new Error("Usage: tsx scripts/lat-report.ts --scenario A --skip 0 <latency.log>");
  }
  const samples = parseLatencyLines(fs.readFileSync(file, "utf-8")).slice(skip);
  console.log(formatSummaryTable(summarizeSamples(samples, scenario)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
