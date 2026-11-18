export function assertExecutedBrowserReport(value, minimum) {
  if (
    !value?.stats ||
    !Number.isFinite(Date.parse(value.stats.startTime)) ||
    ["expected", "unexpected", "skipped", "flaky"].some(
      (key) => !Number.isInteger(value.stats[key]) || value.stats[key] < 0,
    ) ||
    value.stats.skipped ||
    value.stats.expected + value.stats.unexpected < minimum
  )
    throw new Error("BROWSER_SUBSUITE_NOT_EXECUTED");
}
export function assertExecutedPerformance(navigation, browser) {
  if (navigation?.runs?.length !== 9)
    throw new Error("COLD_NAVIGATION_SUBSUITE_NOT_EXECUTED");
  assertExecutedBrowserReport(browser, 4);
}
