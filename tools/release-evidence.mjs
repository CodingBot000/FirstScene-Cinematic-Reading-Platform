import { createHash } from "node:crypto";
import { isIP } from "node:net";

const sha256 = /^[a-f0-9]{64}$/;
const commitSha = /^[a-f0-9]{40}$/;
const projectId = /^prj_[A-Za-z0-9]+$/;
const deploymentId = /^dpl_[A-Za-z0-9]+$/;
const tier = /^[a-z0-9][a-z0-9-]*$/;

function matches(pattern, value) {
  return typeof value === "string" && pattern.test(value);
}

export function canonicalPublicOrigin(value) {
  const url = URL.parse(value);
  if (
    url?.protocol !== "https:" ||
    url.origin !== value ||
    !url.hostname.includes(".") ||
    isIP(url.hostname) ||
    /\.(?:localhost|local)$/.test(url.hostname)
  )
    throw new Error("CANONICAL_PUBLIC_HTTPS_REQUIRED");
  return url.origin;
}

export function buildReleaseReceipts(
  evidence,
  observedAt = new Date().toISOString(),
) {
  const { approval, provider, database, deployment } = evidence ?? {};
  if (
    evidence?.schemaVersion !== 1 ||
    typeof evidence.observedAt !== "string" ||
    !Number.isFinite(Date.parse(evidence.observedAt)) ||
    Date.parse(evidence.observedAt) > Date.parse(observedAt)
  )
    throw new Error("RELEASE_EVIDENCE_INVALID");
  if (
    !matches(projectId, provider?.projectId) ||
    provider.status !== "VERIFIED" ||
    !matches(tier, provider.plan) ||
    provider.secretStorage !== "vercel-environment"
  )
    throw new Error("VERCEL_TARGET_UNVERIFIED");
  const publicUrl = canonicalPublicOrigin(provider.publicUrl);
  if (
    approval?.targetId !== provider.projectId ||
    approval.publicUrl !== publicUrl ||
    typeof approval.reference !== "string" ||
    !approval.reference.trim() ||
    typeof approval.smokeWrites !== "boolean"
  )
    throw new Error("RELEASE_TARGET_APPROVAL_REQUIRED");
  if (evidence.costWithinApproval !== true)
    throw new Error("RELEASE_COST_UNVERIFIED");
  if (
    database?.provider !== "neon" ||
    database.major !== 17 ||
    !matches(tier, database.plan) ||
    database.tlsVerified !== true ||
    database.pooled !== true ||
    database.restrictedRuntimeRole !== true
  )
    throw new Error("NEON_RUNTIME_UNVERIFIED");
  if (
    deployment !== undefined &&
    (deployment?.projectId !== provider.projectId ||
      deployment.publicUrl !== publicUrl ||
      deployment.state !== "READY" ||
      deployment.target !== "production" ||
      deployment.aliasVerified !== true ||
      !matches(deploymentId, deployment.id) ||
      !matches(commitSha, deployment.commit))
  )
    throw new Error("PRODUCTION_DEPLOYMENT_UNVERIFIED");

  const targetId = provider.projectId;
  const evidenceSha256 = createHash("sha256")
    .update(JSON.stringify(evidence))
    .digest("hex");
  const binding = { schemaVersion: 1, targetId, publicUrl, evidenceSha256 };
  return {
    preflight: {
      ...binding,
      observedAt,
      evidenceObservedAt: evidence.observedAt,
      status: "PREFLIGHT_PASSED",
      providerAccess: provider.status,
      approvedReleaseTarget: true,
      smokeWritesApproved: approval.smokeWrites,
      costTier: provider.plan,
      costWithinApproval: true,
      secretStorage: provider.secretStorage,
      externalDatabase: {
        provider: database.provider,
        major: database.major,
        plan: database.plan,
        tlsVerified: true,
        pooled: true,
        restrictedRuntimeRole: true,
      },
      mutationPerformed: false,
      secretsPrinted: false,
    },
    deployment: deployment && {
      ...binding,
      observedAt: evidence.observedAt,
      status: "DEPLOYED",
      commit: deployment.commit,
      deploymentId: deployment.id,
    },
  };
}

export function validateSmokeEvidence(preflight, deployment, baseUrl) {
  const origin = canonicalPublicOrigin(baseUrl);
  if (
    preflight?.schemaVersion !== 1 ||
    preflight.status !== "PREFLIGHT_PASSED" ||
    preflight.approvedReleaseTarget !== true ||
    preflight.publicUrl !== origin ||
    !matches(projectId, preflight.targetId) ||
    !matches(sha256, preflight.evidenceSha256) ||
    deployment?.schemaVersion !== 1 ||
    deployment.status !== "DEPLOYED" ||
    deployment.targetId !== preflight.targetId ||
    deployment.publicUrl !== origin ||
    deployment.evidenceSha256 !== preflight.evidenceSha256 ||
    !matches(deploymentId, deployment.deploymentId) ||
    !matches(commitSha, deployment.commit)
  )
    throw new Error("APPROVED_DEPLOYMENT_EVIDENCE_REQUIRED");
  if (preflight.smokeWritesApproved !== true)
    throw new Error("OPERATIONAL_SMOKE_WRITE_APPROVAL_REQUIRED");
  return origin;
}
