import { it, expect } from "vitest";
// @ts-expect-error Internal Node orchestration module, not a public runtime package.
import { validatePrivacyReceipt } from "../../tools/security-privacy.mjs";
// @ts-expect-error Internal Node orchestration module, not a public runtime package.
import { assertExecutedPerformance } from "../../tools/suite-evidence.mjs";
const fingerprint = { files: 20, sha256: "a".repeat(64) };
const receipt = {
  status: "PRIVATE_SOURCE_NAMES_ABSENT",
  privateTermsPrinted: false,
  observedAt: "2026-11-18T00:00:00Z",
  sourceFingerprint: fingerprint,
};
it("CI without private input requires an exact locally scanned source receipt", () => {
  expect(validatePrivacyReceipt(receipt, fingerprint).status).toBe("PASS");
  expect(() => validatePrivacyReceipt(null, fingerprint)).toThrow(
    /REVIEW_REQUIRED/,
  );
  expect(() =>
    validatePrivacyReceipt(receipt, { ...fingerprint, sha256: "b".repeat(64) }),
  ).toThrow(/REVIEW_REQUIRED/);
  expect(() =>
    validatePrivacyReceipt(receipt, { ...fingerprint, files: 21 }),
  ).toThrow(/REVIEW_REQUIRED/);
});
it("an empty or unreviewed privacy scope cannot produce a CI pass", () => {
  expect(() =>
    validatePrivacyReceipt({ ...receipt, status: "IN_PROGRESS" }, fingerprint),
  ).toThrow();
  expect(() =>
    validatePrivacyReceipt(receipt, { files: 0, sha256: fingerprint.sha256 }),
  ).toThrow();
});
const navigation = { runs: Array.from({ length: 9 }, () => ({})) };
const browser = {
  stats: {
    startTime: "2026-11-18T00:00:00Z",
    expected: 4,
    unexpected: 0,
    skipped: 0,
    flaky: 0,
  },
};
it("nine successful navigation audits cannot hide an unstarted browser performance suite", () => {
  expect(() => assertExecutedPerformance(navigation, null)).toThrow(
    /NOT_EXECUTED/,
  );
  expect(() =>
    assertExecutedPerformance(navigation, {
      stats: { ...browser.stats, expected: 0 },
    }),
  ).toThrow(/NOT_EXECUTED/);
  expect(() =>
    assertExecutedPerformance(navigation, {
      stats: { ...browser.stats, expected: 3, skipped: 1 },
    }),
  ).toThrow(/NOT_EXECUTED/);
});
it("executed failing performance tests remain collectable while missing navigation runs do not", () => {
  expect(() =>
    assertExecutedPerformance(navigation, {
      stats: { ...browser.stats, expected: 3, unexpected: 1 },
    }),
  ).not.toThrow();
  expect(() =>
    assertExecutedPerformance({ runs: navigation.runs.slice(1) }, browser),
  ).toThrow(/NOT_EXECUTED/);
});
