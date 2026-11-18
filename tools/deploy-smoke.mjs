import fs from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { request } from "@playwright/test";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const directory = "evidence/deploy";
fs.mkdirSync(directory, { recursive: true });
const report = {
  observedAt: new Date().toISOString(),
  status: "BLOCKED_EXTERNAL",
  publicReleaseReady: false,
  checks: [],
  mutationPerformed: false,
  secretsPrinted: false,
  reason: "APPROVED_HTTPS_DEPLOYMENT_REQUIRED",
};
const save = () =>
  fs.writeFileSync(
    directory + "/final-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
let a, b;
let authorized = false;
const created = [];
try {
  if (args.length !== 2 || args[0] !== "--base-url")
    throw new Error("VERIFIED_BASE_URL_REQUIRED");
  const url = new URL(args[1]);
  if (
    url.protocol !== "https:" ||
    url.origin !== args[1] ||
    url.username ||
    url.password ||
    /^(?:localhost|127\.|\[?::1)/.test(url.hostname)
  )
    throw new Error("CANONICAL_PUBLIC_HTTPS_REQUIRED");
  const preflightFile = directory + "/preflight.json",
    deploymentFile = directory + "/deployment.json";
  if (!fs.existsSync(preflightFile) || !fs.existsSync(deploymentFile))
    throw new Error("APPROVED_DEPLOYMENT_EVIDENCE_REQUIRED");
  const preflight = JSON.parse(fs.readFileSync(preflightFile)),
    deployment = JSON.parse(fs.readFileSync(deploymentFile));
  if (
    preflight.status !== "PREFLIGHT_PASSED" ||
    preflight.approvedReleaseTarget !== true ||
    deployment.status !== "DEPLOYED" ||
    deployment.publicUrl !== url.origin ||
    !deployment.commit ||
    !deployment.deploymentId ||
    deployment.targetId !== preflight.targetId
  )
    throw new Error("APPROVED_DEPLOYMENT_EVIDENCE_REQUIRED");
  authorized = true;
  report.baseUrl = url.origin;
  report.deploymentCommit = deployment.commit;
  report.deploymentId = deployment.deploymentId;
  report.receipts = [preflightFile, deploymentFile].map((path) => ({
    path,
    sha256: createHash("sha256").update(fs.readFileSync(path)).digest("hex"),
  }));
  const headers = { origin: url.origin, "content-type": "application/json" };
  a = await request.newContext({
    baseURL: url.origin,
    extraHTTPHeaders: headers,
    ignoreHTTPSErrors: false,
  });
  b = await request.newContext({
    baseURL: url.origin,
    extraHTTPHeaders: headers,
    ignoreHTTPSErrors: false,
  });
  for (const endpoint of ["/health/live", "/health/ready"]) {
    const response = await a.get(endpoint);
    if (
      response.status() !== 200 ||
      new URL(response.url()).origin !== url.origin
    )
      throw new Error("HTTPS_HEALTH_FAILED");
    report.checks.push({ name: endpoint, status: "PASS" });
  }
  const epochs = [];
  for (const context of [a, b]) {
    const response = await context.post("/api/v1/session", { data: {} });
    if (response.status() !== 200) throw new Error("SESSION_CREATE_FAILED");
    created.push(context);
    report.mutationPerformed = true;
    const cookie = response.headers()["set-cookie"] ?? "";
    if (
      !cookie.startsWith("__Host-firstscene=") ||
      !cookie.includes("HttpOnly") ||
      !cookie.includes("Secure") ||
      !cookie.includes("SameSite=Lax") ||
      /;\s*Domain=/i.test(cookie)
    )
      throw new Error("PUBLIC_COOKIE_POLICY_FAILED");
    epochs.push((await response.json()).epoch);
  }
  if (!epochs[0] || epochs[0] === epochs[1])
    throw new Error("SESSION_ISOLATION_FAILED");
  const beforeA = await (await a.get("/api/v1/me")).json(),
    beforeB = await (await b.get("/api/v1/me")).json();
  if (
    beforeA.progress.length ||
    beforeA.bookmarks.length ||
    beforeB.progress.length ||
    beforeB.bookmarks.length
  )
    throw new Error("FRESH_SESSION_NOT_EMPTY");
  const put = await a.put("/api/v1/preferences", {
    data: {
      mode: "plain",
      effects: "reduced",
      fontSize: 24,
      theme: "light",
      expectedRevision: beforeA.preferences.revision,
      operationId: randomUUID(),
    },
  });
  if (put.status() !== 200) throw new Error("DATABASE_WRITE_FAILED");
  const state = await a.storageState();
  const reload = await request.newContext({
    baseURL: url.origin,
    storageState: state,
    extraHTTPHeaders: headers,
  });
  try {
    const restored = await (await reload.get("/api/v1/me")).json(),
      isolated = await (await b.get("/api/v1/me")).json();
    if (
      restored.session.epoch !== epochs[0] ||
      restored.preferences.fontSize !== 24 ||
      isolated.preferences.fontSize !== beforeB.preferences.fontSize ||
      isolated.session.epoch !== epochs[1]
    )
      throw new Error("WRITE_RELOAD_ISOLATION_FAILED");
  } finally {
    await reload.dispose();
  }
  report.checks.push({
    name: "opaque-secure-session-A-B-database-write-reload-isolation",
    status: "PASS",
  });
  const manifest = JSON.parse(fs.readFileSync("content/generated/assets.json"));
  let assets = 0;
  for (const asset of manifest.assets) {
    const variant = asset.variants.find((item) => item.format === "avif");
    const response = await a.get(variant.path);
    const bytes = await response.body();
    if (
      response.status() !== 200 ||
      !response.headers()["content-type"]?.includes("image/avif") ||
      createHash("sha256").update(bytes).digest("hex") !== variant.sha256
    )
      throw new Error("DEPLOYED_ASSET_HASH_FAILED");
    assets++;
  }
  report.checks.push({
    name: "actual-deployed-public-assets",
    status: "PASS",
    assets,
  });
  report.status = "PUBLIC_SMOKE_PASSED_ROLLBACK_UNVERIFIED";
  report.reason =
    "Rollback requires separate approved preview evidence; this smoke does not promote or rollback.";
} catch (error) {
  report.status = authorized ? "FAILED" : "BLOCKED_EXTERNAL";
  report.reason = /^[A-Z_]+$/.test(error.message)
    ? error.message
    : "DEPLOY_SMOKE_UNAVAILABLE";
  process.exitCode = authorized ? 1 : 2;
} finally {
  for (const context of created) {
    try {
      const response = await context.delete("/api/v1/me", { data: {} });
      if (response.status() !== 204) {
        report.checks.push({
          name: "synthetic-smoke-session-cleanup",
          status: "FAIL",
        });
        report.status = "FAILED";
        process.exitCode = 1;
      }
    } catch {
      report.checks.push({
        name: "synthetic-smoke-session-cleanup",
        status: "FAIL",
      });
      report.status = "FAILED";
      process.exitCode = 1;
    }
  }
  await Promise.allSettled([a?.dispose(), b?.dispose()]);
  report.finishedAt = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      status: report.status,
      reason: report.reason,
      report: directory + "/final-smoke.json",
      publicReleaseReady: false,
    }),
  );
}
