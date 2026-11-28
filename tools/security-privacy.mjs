import fs from "node:fs";
import { createHash } from "node:crypto";

export function loadPrivateSourceDigests(input) {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.some(
      (digest) => typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest),
    )
  )
    throw new Error("PRIVATE_SOURCE_DIGESTS_INVALID");
  return new Set(input);
}

export function hasExcludedSourceIdentifier(value, digests) {
  const matches = (identifier) =>
    digests.has(createHash("sha256").update(identifier).digest("hex"));
  const text = value.normalize("NFKC").toLowerCase();
  for (const [word] of text.matchAll(/(?<![a-z0-9])[a-z0-9]+(?![a-z0-9])/g)) {
    if (matches(word)) return true;
  }
  for (const [, first, last] of text.matchAll(
    /(?<![a-z0-9])(?=([a-z]{2,3})[ \t._/-]*([a-z]{2,5}|[\uac00-\ud7a3]{2})(?![a-z0-9]))/gu,
  )) {
    if (matches(first + last)) return true;
  }
  for (const [, pair] of text.matchAll(/(?=([\uac00-\ud7a3]{2}))/gu)) {
    if (matches(pair)) return true;
  }
  return false;
}
export function publicSourceFingerprint(files) {
  const entries = [...new Set(files)]
    .sort()
    .map((file) => [
      file,
      createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    ]);
  return {
    files: entries.length,
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}
export function validatePrivacyReceipt(receipt, current) {
  if (
    !receipt ||
    receipt.status !== "PRIVATE_SOURCE_NAMES_ABSENT" ||
    receipt.privateTermsPrinted !== false ||
    !Number.isFinite(Date.parse(receipt.observedAt)) ||
    !current.files ||
    receipt.sourceFingerprint?.files !== current.files ||
    receipt.sourceFingerprint?.sha256 !== current.sha256
  )
    throw new Error("LOCAL_PRIVACY_REVIEW_REQUIRED");
  return {
    status: "PASS",
    files: current.files,
    method:
      "Exact source fingerprint of locally scanned private-name absence; no private terms supplied to CI",
  };
}
