import { it, expect } from "vitest";
import { createHash } from "node:crypto";
// @ts-expect-error Internal Node orchestration module, not a public runtime package.
import {
  hasExcludedSourceIdentifier,
  loadPrivateSourceDigests,
  validatePrivacyReceipt,
} from "../../tools/security-privacy.mjs";
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
it("scans normalized identifiers from hashes without loading the source text", () => {
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const values = loadPrivateSourceDigests([
    digest("firstsceneportable"),
    digest("fstest"),
    digest("검수"),
  ]);
  expect(
    hasExcludedSourceIdentifier("ＦＩＲＳＴＳＣＥＮＥＰＯＲＴＡＢＬＥ", values),
  ).toBe(true);
  expect(hasExcludedSourceIdentifier("source/FS-test.json", values)).toBe(true);
  expect(hasExcludedSourceIdentifier("화면 검수", values)).toBe(true);
  expect(hasExcludedSourceIdentifier("검수에게 전달", values)).toBe(true);
  expect(hasExcludedSourceIdentifier("검수자료실", values)).toBe(false);
  expect(
    hasExcludedSourceIdentifier("검수자료실.md", values, {
      embeddedHangul: true,
    }),
  ).toBe(true);
  expect(hasExcludedSourceIdentifier("다른 파일", values)).toBe(false);
  expect(() => loadPrivateSourceDigests([])).toThrow(
    "PRIVATE_SOURCE_DIGESTS_INVALID",
  );
  expect(() => loadPrivateSourceDigests(["firstsceneportable"])).toThrow(
    "PRIVATE_SOURCE_DIGESTS_INVALID",
  );
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
