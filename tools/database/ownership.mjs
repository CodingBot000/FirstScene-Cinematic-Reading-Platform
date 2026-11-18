import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { root } from "./environment.mjs";
const volume = "firstscene-local_firstscene_pgdata";
const receipt = path.join(root, "execution/local-database.json");
const workspaceHash = createHash("sha256").update(root).digest("hex");
function creation() {
  const inspected = spawnSync(
    "docker",
    ["volume", "inspect", volume, "--format", "{{.CreatedAt}}"],
    { encoding: "utf8" },
  );
  return inspected.status === 0 ? inspected.stdout.trim() : null;
}
export function assertVolumeOwnership() {
  const createdAt = creation();
  if (!createdAt) return false;
  if (!fs.existsSync(receipt))
    throw new Error("EXISTING_VOLUME_OWNERSHIP_UNCONFIRMED");
  const value = JSON.parse(fs.readFileSync(receipt, "utf8"));
  if (
    value.volume !== volume ||
    value.workspaceHash !== workspaceHash ||
    value.createdAt !== createdAt
  )
    throw new Error("EXISTING_VOLUME_OWNERSHIP_MISMATCH");
  return true;
}
export function recordNewVolume() {
  const createdAt = creation();
  if (!createdAt) throw new Error("OWNED_VOLUME_NOT_CREATED");
  fs.writeFileSync(
    receipt,
    JSON.stringify(
      {
        schemaVersion: 1,
        volume,
        workspaceHash,
        createdAt,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
}
