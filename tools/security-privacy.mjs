import fs from "node:fs";
import { createHash } from "node:crypto";
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
