import { isIP } from "node:net";
import { hasTrustedPublicIngress } from "./environment.js";
import type { HttpPolicy } from "./environment.js";
export type SessionNetworkScope = "loopback" | `vercel:${string}`;
export function validSessionNetwork(
  scope: unknown,
): scope is SessionNetworkScope {
  if (scope === "loopback") return true;
  if (typeof scope !== "string" || !scope.startsWith("vercel:")) return false;
  const address = scope.slice(7);
  return address.length <= 45 && !address.includes("%") && isIP(address) > 0;
}
// Trusted operator opt-in plus platform runtime metadata is mandatory. A header
// name alone does not establish provenance; arbitraryXFF is never a fallback.
export function creationNetworkScope(
  request: Request,
  policy: HttpPolicy,
  env: Record<string, string | undefined>,
): SessionNetworkScope | null {
  if (policy.local) return "loopback";
  if (!hasTrustedPublicIngress(env)) return null;
  const address = request.headers
    .get("x-vercel-forwarded-for")
    ?.trim()
    .toLowerCase();
  const scope = address ? `vercel:${address}` : null;
  return validSessionNetwork(scope) ? scope : null;
}
