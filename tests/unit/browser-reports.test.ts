import { it, expect } from "vitest";
// @ts-expect-error Private JS test orchestration, no public declaration.
import { mergeBrowserReports } from "../../tools/browser-runtime.mjs";
// @ts-expect-error Private JS execution proof validator.
import { assertExecutedBrowserReport } from "../../tools/suite-evidence.mjs";
const report = (expected: number, unexpected = 0) => ({
  stats: {
    startTime: "2026-11-18T00:00:00Z",
    duration: 100,
    expected,
    unexpected,
    skipped: 0,
    flaky: 0,
  },
  suites: [{ title: "fixture" }],
  errors: [],
});
it("batch aggregation preserves failing and skipped results instead of turning collection into a pass", () => {
  const a = report(14, 1),
    b = report(23);
  b.stats.skipped = 2;
  const combined = mergeBrowserReports([a, b]);
  expect(combined.stats).toMatchObject({
    expected: 37,
    unexpected: 1,
    skipped: 2,
  });
  expect(a.stats.unexpected).toBe(1);
  expect(() => assertExecutedBrowserReport(combined, 38)).toThrow(
    /NOT_EXECUTED/,
  );
});
it("missing or partial browser statistics cannot satisfy execution proof throughNaN comparisons", () => {
  expect(() => mergeBrowserReports([report(1), {}])).toThrow();
  expect(() =>
    mergeBrowserReports([
      { stats: { startTime: "2026-11-18T00:00:00Z", expected: 47 } },
    ]),
  ).toThrow();
  expect(() =>
    assertExecutedBrowserReport(
      { stats: { startTime: "2026-11-18T00:00:00Z", expected: 47 } },
      47,
    ),
  ).toThrow();
});
