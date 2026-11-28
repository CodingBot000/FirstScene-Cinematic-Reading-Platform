import fs from "node:fs";
import {
  hasExcludedSourceIdentifier,
  loadPrivateSourceDigests,
  publicSourceFingerprint,
  validatePrivacyReceipt,
} from "./security-privacy.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { parseEnv } from "node:util";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length > 1 || args.some((arg) => arg !== "--portable"))
  throw new Error("SECURITY_MODE_INVALID");
const portable = args.includes("--portable");
const directory = "evidence/security/current";
fs.mkdirSync(directory, { recursive: true });
let managedSourceAudit = "NOT_PERFORMED_TOOL_BLOCKED";
try {
  const managed = JSON.parse(
    fs.readFileSync("evidence/security/managed-scan-preflight.json", "utf8"),
  );
  if (
    managed.scanCreated &&
    managed.sourceReviewPerformed &&
    managed.sealed === false
  )
    managedSourceAudit = "SOURCE_REVIEW_PERFORMED_UNSEALED";
} catch {
  /* Missing/invalid managed evidence never becomes a source-audit pass. */
}
const report = {
  status: "IN_PROGRESS",
  mode: portable ? "portable" : "strict",
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  releaseReady: false,
  managedSourceAudit,
  commands: [],
  artifacts: [],
  checks: [],
  errors: [],
};
const save = () =>
  fs.writeFileSync(
    directory + "/result.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function check(name, action) {
  try {
    const detail = action();
    report.checks.push({ name, status: "PASS", ...detail });
  } catch {
    report.checks.push({ name, status: "FAIL" });
    report.errors.push(name);
  }
}
async function command(args, artifact) {
  if (fs.existsSync(artifact)) fs.unlinkSync(artifact);
  const row = {
    command: "pnpm " + args.join(" "),
    startedAt: new Date().toISOString(),
    exitCode: null,
  };
  report.commands.push(row);
  save();
  row.exitCode = await new Promise((resolve) => {
    const child = spawn("pnpm", args, { stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
  row.finishedAt = new Date().toISOString();
  if (fs.existsSync(artifact)) {
    const copy = directory + "/" + path.basename(artifact);
    if (copy !== artifact) fs.copyFileSync(artifact, copy);
    report.artifacts.push({ path: copy, sha256: hash(copy) });
  } else report.errors.push("REPORT_MISSING");
  if (row.exitCode) report.errors.push("SECURITY_COMMAND_FAILED");
  save();
}
save();
await command(
  [
    "exec",
    "vitest",
    "run",
    "tests/unit/compiler.test.ts",
    "tests/unit/http.test.ts",
    "tests/unit/runtime-environment.test.ts",
    "tests/unit/request-network.test.ts",
    "--reporter=json",
    "--outputFile=" + directory + "/unit-results.json",
  ],
  directory + "/unit-results.json",
);
await command(["test:api"], "evidence/api/test-results.json");
check("ACTUAL_NEGATIVE_REPORTS", () => {
  const unit = JSON.parse(fs.readFileSync(directory + "/unit-results.json"));
  const api = JSON.parse(fs.readFileSync(directory + "/test-results.json"));
  if (
    !unit.success ||
    unit.numTotalTests < 20 ||
    unit.numPendingTests ||
    unit.numFailedTests ||
    api.stats.expected < 25 ||
    api.stats.unexpected ||
    api.stats.skipped ||
    api.stats.flaky
  )
    throw new Error();
  return {
    compilerHttpEnvironmentTests: unit.numTotalTests,
    apiTests: api.stats.expected,
    coverage: [
      "CSRF",
      "opaque-cookie",
      "IDOR",
      "concurrent-rate",
      "16KiB",
      "malformed-input",
      "nonce-CSP",
      "SQL-CAS",
      "receipt-replay",
      "session-expiry",
      "deletion",
    ],
  };
});
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => file && fs.existsSync(file) && fs.statSync(file).isFile());
const secrets = new Set();
for (const [key, value] of Object.entries(process.env))
  if (
    value &&
    value.length >= 24 &&
    /(?:PASSWORD|SECRET|DATABASE_URL|TOKEN|API_KEY)/.test(key)
  ) {
    secrets.add(value);
    if (/DATABASE_URL/.test(key)) {
      try {
        const password = decodeURIComponent(new URL(value).password);
        if (password.length >= 24) secrets.add(password);
      } catch {
        /* A credential may be a non-URL token. */
      }
    }
  }
for (const file of [".env.local", "apps/web/.env.local"])
  if (fs.existsSync(file))
    for (const [key, value] of Object.entries(
      parseEnv(fs.readFileSync(file, "utf8")),
    )) {
      if (
        value.length >= 24 &&
        /(?:PASSWORD|SECRET|DATABASE_URL|TOKEN|API_KEY)/.test(key)
      )
        secrets.add(value);
      if (/DATABASE_URL/.test(key)) {
        try {
          const password = decodeURIComponent(new URL(value).password);
          if (password.length >= 24) secrets.add(password);
        } catch {
          /* Not a connection URL. */
        }
      }
    }
function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith(".env") ||
      [
        "node_modules",
        ".next",
        "dist",
        ".git",
        "__pycache__",
        ".venv",
      ].includes(entry.name)
    )
      return [];
    const file = path.join(root, entry.name);
    return entry.isSymbolicLink()
      ? []
      : entry.isDirectory()
        ? filesUnder(file)
        : [file];
  });
}
const publicFiles = [
  "README.md",
  "RELEASE_REPORT.md",
  "package.json",
  "Dockerfile",
  "Dockerfile.qa",
  "execution/browser-runtime-lock.json",
  ...[
    "apps",
    "packages",
    "tools",
    "tests",
    "contracts",
    "content",
    "design",
    "docs/public",
    ".github",
  ].flatMap(filesUnder),
].filter((file) => fs.existsSync(file));
const trackedPublicFiles = publicFiles.filter((file) => tracked.includes(file));
check("TRACKED_CREDENTIAL_AND_PATH_SCAN", () => {
  for (const file of tracked) {
    if (
      (/(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".example")) ||
      file.startsWith("references/private/") ||
      file.startsWith("artifacts/private/")
    )
      throw new Error();
    const bytes = fs.readFileSync(file);
    if ([...secrets].some((value) => bytes.includes(Buffer.from(value))))
      throw new Error();
    if (
      /\.(?:[cm]?[jt]sx?|json|ya?ml|md|txt|toml)$/.test(file) &&
      /(?:sk-proj-[A-Za-z0-9_-]{32,}|ghp_[A-Za-z0-9]{36}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)/.test(
        bytes.toString("utf8"),
      )
    )
      throw new Error();
  }
  return { files: tracked.length, credentialValuesPrinted: false };
});
check("PUBLIC_PRIVATE_SOURCE_NAME_SCAN", () => {
  const digestFile = process.env.FIRSTSCENE_PRIVATE_SOURCE_DIGESTS_FILE;
  const digests = digestFile
    ? loadPrivateSourceDigests(JSON.parse(fs.readFileSync(digestFile, "utf8")))
    : null;
  const metadata = "references/source-provenance.json";
  const supplied =
    !digests && fs.existsSync(metadata)
      ? JSON.parse(fs.readFileSync(metadata)).name
      : null;
  const stems = supplied
    ? [
        path
          .basename(supplied)
          .replace(/frontend\.md$/i, "")
          .replace(/\.md$/, ""),
      ].filter((value) => value.length >= 2)
    : [];
  if (!digests && !stems.length) {
    const receiptFile = "evidence/security/public-source-review.json";
    if (!process.env.CI && !portable) throw new Error();
    try {
      const receipt = JSON.parse(fs.readFileSync(receiptFile));
      return validatePrivacyReceipt(
        receipt,
        publicSourceFingerprint(trackedPublicFiles),
      );
    } catch (error) {
      if (!portable) throw error;
      return {
        status: "DEFERRED_TO_RELEASE",
        reason: "Private source input or exact review receipt is unavailable",
      };
    }
  }
  for (const file of new Set([...publicFiles, ...tracked])) {
    if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|md|txt|py|toml)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (
      digests
        ? hasExcludedSourceIdentifier(file, digests, {
            embeddedHangul: true,
          }) || hasExcludedSourceIdentifier(text, digests)
        : stems.some((term) => file.includes(term) || text.includes(term))
    )
      throw new Error("EXCLUDED_SOURCE_IDENTIFIER_FOUND");
  }
  const receiptFile = "evidence/security/public-source-review.json";
  const sourceFingerprint = publicSourceFingerprint(trackedPublicFiles);
  fs.writeFileSync(
    receiptFile,
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        status: "PRIVATE_SOURCE_NAMES_ABSENT",
        privateTermsPrinted: false,
        sourceFingerprint,
      },
      null,
      2,
    ) + "\n",
  );
  report.artifacts.push({ path: receiptFile, sha256: hash(receiptFile) });
  return {
    files: publicFiles.length,
    privateTermsPrinted: false,
    sourceFingerprint,
  };
});
check("PRODUCTION_CLIENT_BUNDLE_SCAN", () => {
  const chunks = filesUnder("apps/web/.next/static/chunks").filter((file) =>
    file.endsWith(".js"),
  );
  if (!chunks.length) throw new Error();
  for (const file of chunks) {
    const text = fs.readFileSync(file, "utf8");
    if (
      [...secrets].some((value) => text.includes(value)) ||
      /(?:DIRECT_DATABASE_URL|LOCAL_POSTGRES_PASSWORD|RATE_LIMIT_HMAC_SECRET)/.test(
        text,
      )
    )
      throw new Error();
  }
  return { javascriptChunks: chunks.length };
});
check("NO_RUNTIME_AUTH_OR_MOCK_TEST_BYPASS", () => {
  const files = ["apps/web/app", "apps/web/lib", "packages/server-data/src"]
    .flatMap(filesUnder)
    .filter((file) => /\.tsx?$/.test(file));
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (
      /(?:process\.env\.(?:TEST_AUTH|AUTH_BYPASS|MOCK_DB|FAKE_SESSION)|(?:mockDatabase|bypassAuthentication)\s*\()/.test(
        text,
      )
    )
      throw new Error();
  }
  return {
    runtimeSources: files.length,
    method: "Bounded forbidden-pattern regression; not exhaustive source audit",
  };
});
report.finishedAt = new Date().toISOString();
report.status = report.errors.length
  ? "FAILED"
  : portable
    ? "PORTABLE_SECURITY_NEGATIVES_PASSED"
    : "AUTOMATED_SECURITY_NEGATIVES_PASSED";
save();
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.length,
    report: directory + "/result.json",
    managedSourceAudit: report.managedSourceAudit,
    releaseReady: false,
  }),
);
if (report.errors.length) process.exitCode = 1;
