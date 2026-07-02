import { describe, expect, it } from "vitest";

import {
  formatSummaryTable,
  parseLatencyLines,
  summarizeSamples,
} from "../scripts/lat-report";

describe("latency report helpers", () => {
  it("parses only structured LAT-161 activation lines", () => {
    const samples = parseLatencyLines(
      [
        "[LAT-161] trigger command=toggle",
        '[LAT-161] {"totalMs":10,"stages":{"applyModeMs":4,"browserWindowFocusMs":7}}',
        "ordinary log line",
        '[LAT-161] {"totalMs":30,"stages":{"applyModeMs":8,"browserWindowFocusMs":12}}',
        "",
      ].join("\n"),
    );

    expect(samples).toHaveLength(2);
    expect(samples[0]?.totalMs).toBe(10);
    expect(samples[1]?.stages.applyModeMs).toBe(8);
  });

  it("summarizes count, median, and p95 per stage", () => {
    const rows = summarizeSamples(
      [
        { totalMs: 10, stages: { applyModeMs: 2, appFocusCallMs: 1 } },
        { totalMs: 20, stages: { applyModeMs: 4, appFocusCallMs: 2 } },
        { totalMs: 30, stages: { applyModeMs: 100, appFocusCallMs: null } },
      ],
      "A",
    );

    expect(rows).toContainEqual({
      scenario: "A",
      stage: "applyModeMs",
      count: 3,
      median: 4,
      p95: 100,
    });
    expect(rows).toContainEqual({
      scenario: "A",
      stage: "appFocusCallMs",
      count: 2,
      median: 1.5,
      p95: 2,
    });
    expect(rows).toContainEqual({
      scenario: "A",
      stage: "totalMs",
      count: 3,
      median: 20,
      p95: 30,
    });
  });

  it("formats markdown tables for issue comments", () => {
    const table = formatSummaryTable([
      { scenario: "B", stage: "totalMs", count: 10, median: 12.3, p95: 45.6 },
    ]);

    expect(table).toContain("| scenario | stage | count | median_ms | p95_ms |");
    expect(table).toContain("| B | totalMs | 10 | 12.3 | 45.6 |");
  });
});

