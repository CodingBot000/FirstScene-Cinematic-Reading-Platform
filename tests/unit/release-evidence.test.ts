import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildReleaseReceipts,
  validateSmokeEvidence,
} from "../../tools/release-evidence.mjs";

const origin = "https://firstscene.example.org";
const projectId = "prj_firstsceneFixture";
const reference = "fixture approval reference";

function evidence() {
  return {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    approval: {
      targetId: projectId,
      publicUrl: origin,
      reference,
      smokeWrites: true,
    },
    provider: {
      status: "VERIFIED",
      projectId,
      publicUrl: origin,
      plan: "hobby",
      secretStorage: "vercel-environment",
    },
    database: {
      provider: "neon",
      major: 17,
      plan: "free",
      tlsVerified: true,
      pooled: true,
      restrictedRuntimeRole: true,
    },
    costWithinApproval: true,
    deployment: {
      projectId,
      publicUrl: origin,
      id: "dpl_firstsceneFixture",
      commit: "a".repeat(40),
      state: "READY",
      target: "production",
      aliasVerified: true,
    },
  };
}

describe("release evidence", () => {
  it("binds a verified deployment to the approved project and HTTPS origin", () => {
    const { preflight, deployment } = buildReleaseReceipts(evidence());
    expect(preflight).toMatchObject({
      status: "PREFLIGHT_PASSED",
      approvedReleaseTarget: true,
      targetId: projectId,
      publicUrl: origin,
    });
    expect(deployment).toMatchObject({
      status: "DEPLOYED",
      evidenceSha256: preflight.evidenceSha256,
      commit: "a".repeat(40),
    });
    expect(validateSmokeEvidence(preflight, deployment, origin)).toBe(origin);
  });

  it("passes target preflight before the release is deployed", () => {
    const { deployment, ...target } = evidence();
    const receipts = buildReleaseReceipts(target);
    expect(receipts.preflight.status).toBe("PREFLIGHT_PASSED");
    expect(receipts.deployment).toBeUndefined();
    expect(() =>
      validateSmokeEvidence(
        receipts.preflight,
        buildReleaseReceipts({ ...target, deployment }).deployment,
        origin,
      ),
    ).toThrow("APPROVED_DEPLOYMENT_EVIDENCE_REQUIRED");
  });

  it.each<[(input: ReturnType<typeof evidence>) => void, string]>([
    [
      (input) => (input.provider.status = "FORBIDDEN"),
      "VERCEL_TARGET_UNVERIFIED",
    ],
    [
      (input) => (input.approval.targetId = "prj_different"),
      "RELEASE_TARGET_APPROVAL_REQUIRED",
    ],
    [
      (input) => (input.approval.publicUrl = "https://different.example.org"),
      "RELEASE_TARGET_APPROVAL_REQUIRED",
    ],
    [(input) => (input.costWithinApproval = false), "RELEASE_COST_UNVERIFIED"],
    [(input) => (input.database.major = 16), "NEON_RUNTIME_UNVERIFIED"],
    [
      (input) => (input.database.tlsVerified = false),
      "NEON_RUNTIME_UNVERIFIED",
    ],
    [(input) => (input.database.pooled = false), "NEON_RUNTIME_UNVERIFIED"],
    [
      (input) => (input.database.restrictedRuntimeRole = false),
      "NEON_RUNTIME_UNVERIFIED",
    ],
    [
      (input) => (input.deployment.aliasVerified = false),
      "PRODUCTION_DEPLOYMENT_UNVERIFIED",
    ],
    [
      (input) => (input.deployment.target = "preview"),
      "PRODUCTION_DEPLOYMENT_UNVERIFIED",
    ],
    [
      (input) => (input.deployment.projectId = "prj_different"),
      "PRODUCTION_DEPLOYMENT_UNVERIFIED",
    ],
  ])("blocks incomplete or mismatched evidence %#", (change, reason) => {
    const input = evidence();
    change(input);
    expect(() => buildReleaseReceipts(input)).toThrow(reason);
  });

  it("rejects a different origin and receipts without a verified binding", () => {
    const { preflight, deployment } = buildReleaseReceipts(evidence());
    expect(() =>
      validateSmokeEvidence(
        preflight,
        deployment,
        "https://different.example.org",
      ),
    ).toThrow("APPROVED_DEPLOYMENT_EVIDENCE_REQUIRED");
    expect(() =>
      validateSmokeEvidence(preflight, deployment, "https://127.0.0.1"),
    ).toThrow("CANONICAL_PUBLIC_HTTPS_REQUIRED");
    expect(() =>
      validateSmokeEvidence(
        { ...preflight, targetId: undefined },
        { ...deployment, targetId: undefined },
        origin,
      ),
    ).toThrow("APPROVED_DEPLOYMENT_EVIDENCE_REQUIRED");
  });

  it("issues the files in an isolated directory and blocks writes without their own approval", () => {
    const cwd = mkdtempSync(join(tmpdir(), "firstscene-deploy-evidence-"));
    const cli = (file: string, ...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL("../../tools/" + file, import.meta.url)),
          ...args,
        ],
        { cwd, encoding: "utf8" },
      );
    const read = (name: string) =>
      JSON.parse(
        readFileSync(join(cwd, "evidence/deploy", name + ".json"), "utf8"),
      );
    try {
      const input = evidence();
      input.approval.smokeWrites = false;
      mkdirSync(join(cwd, "evidence/deploy"), { recursive: true });
      const file = join(cwd, "evidence/deploy/release-target.json");
      writeFileSync(file, JSON.stringify(input));
      const ready = cli("deploy-preflight.mjs");
      expect(ready.status).toBe(0);
      expect(ready.stdout).not.toContain(reference);
      expect(read("preflight")).toMatchObject({
        status: "PREFLIGHT_PASSED",
        smokeWritesApproved: false,
      });
      expect(read("deployment").deploymentId).toBe(input.deployment.id);
      const smoke = cli("deploy-smoke.mjs", "--base-url", origin);
      expect(smoke.status).toBe(2);
      expect(read("final-smoke")).toMatchObject({
        reason: "OPERATIONAL_SMOKE_WRITE_APPROVAL_REQUIRED",
        mutationPerformed: false,
      });
      rmSync(file);
      expect(cli("deploy-preflight.mjs").status).toBe(2);
      expect(read("preflight")).toMatchObject({
        status: "BLOCKED_EXTERNAL",
        reason: "RELEASE_TARGET_EVIDENCE_REQUIRED",
      });
      expect(existsSync(join(cwd, "evidence/deploy/deployment.json"))).toBe(
        true,
      );
      expect(cli("deploy-smoke.mjs", "--base-url", origin).status).toBe(2);
      expect(read("final-smoke").mutationPerformed).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
