import { randomUUID, createHash } from "node:crypto";
export { isolatedDatabase } from "../../tools/database/isolated.mjs";
export function sessionFixture() {
  const token = randomUUID() + randomUUID();
  return {
    id: randomUUID(),
    epoch: randomUUID(),
    tokenHash: createHash("sha256").update(token).digest(),
  };
}
