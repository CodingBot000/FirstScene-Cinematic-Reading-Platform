import { it, expect } from "vitest";
import {
  creationNetworkScope,
  validSessionNetwork,
} from "../../packages/server-data/src/request-network";
import {
  deriveOriginPolicy,
  validateRuntimeEnvironment,
} from "../../packages/server-data/src/environment";
const trusted = {
  FIRSTSCENE_TRUSTED_INGRESS: "vercel",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_DEPLOYMENT_ID: "dpl_fixture12345",
};
const publicPolicy = deriveOriginPolicy("https://reader.example", "public");
const request = (headers: Record<string, string>) =>
  new Request("https://reader.example/api/v1/session", { headers });
it("untrusted ingress never gets a public bucket merely by supplying forwarded headers or partial metadata", () => {
  const req = request({
    "x-forwarded-for": "192.0.2.1",
    "x-vercel-forwarded-for": "198.51.100.1",
  });
  for (const env of [
    {},
    { VERCEL: "1" },
    { ...trusted, FIRSTSCENE_TRUSTED_INGRESS: undefined },
    { ...trusted, VERCEL_DEPLOYMENT_ID: undefined },
    { ...trusted, VERCEL_ENV: "development" },
  ])
    expect(creationNetworkScope(req, publicPolicy, env)).toBeNull();
});
it("verified ingress uses only its single protected address, not spoofable XFF or malformed lists", () => {
  expect(
    creationNetworkScope(
      request({
        "x-vercel-forwarded-for": "192.0.2.1",
        "x-forwarded-for": "203.0.113.100",
      }),
      publicPolicy,
      trusted,
    ),
  ).toBe("vercel:192.0.2.1");
  expect(
    creationNetworkScope(
      request({ "x-vercel-forwarded-for": "2001:DB8::1" }),
      publicPolicy,
      trusted,
    ),
  ).toBe("vercel:2001:db8::1");
  for (const v of [
    "",
    "192.0.2.1,198.51.100.1",
    "192.0.2.1:80",
    "garbage",
    "fe80::1%en0",
  ])
    expect(
      creationNetworkScope(
        request({ "x-vercel-forwarded-for": v }),
        publicPolicy,
        trusted,
      ),
    ).toBeNull();
});
it("loopback keeps one explicit local network and cannot be split by client XFF or Vercel-looking headers", () => {
  const policy = deriveOriginPolicy("http://127.0.0.1:3100", "local");
  expect(
    creationNetworkScope(
      request({
        "x-forwarded-for": "192.0.2.1",
        "x-vercel-forwarded-for": "198.51.100.1",
      }),
      policy,
      {},
    ),
  ).toBe("loopback");
  expect(validSessionNetwork("global-fallback")).toBe(false);
  expect(validSessionNetwork(null)).toBe(false);
});
it("public startup requires actual platform metadata and explicit ingress opt-in", () => {
  const env = {
    APP_ORIGIN: "https://reader.example",
    DEPLOY_TARGET: "public",
    DATABASE_URL:
      "postgresql://runtime:fixture-only@db.firstscene.invalid/story",
    RATE_LIMIT_HMAC_SECRET: "fixture-only-no-live-authority-".repeat(2),
  };
  expect(() => validateRuntimeEnvironment(env)).toThrow(
    "TRUSTED_PUBLIC_INGRESS_REQUIRED",
  );
  expect(() =>
    validateRuntimeEnvironment({ ...env, ...trusted }),
  ).not.toThrow();
});
