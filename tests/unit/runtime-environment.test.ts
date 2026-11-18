import { it, expect } from "vitest";
import {
  validateRuntimeEnvironment,
  deriveOriginPolicy,
} from "../../packages/server-data/src/environment";
const fixture = () => ({
  APP_ORIGIN: "http://127.0.0.1:3100",
  DEPLOY_TARGET: "local",
  DATABASE_URL:
    "postgresql://firstscene_runtime:fixture-only-no-live-authority@127.0.0.1:55432/firstscene_dev",
  RATE_LIMIT_HMAC_SECRET: "fixture-only-no-live-authority-".repeat(2),
});
it("runtime validation permits actual optimized loopback artifacts and chooses public host cookies only for HTTPS", () => {
  expect(validateRuntimeEnvironment(fixture())).toMatchObject({
    local: true,
    cookieName: "firstscene_dev",
  });
  expect(
    validateRuntimeEnvironment({
      ...fixture(),
      FIRSTSCENE_TRUSTED_INGRESS: "vercel",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_DEPLOYMENT_ID: "dpl_fixture12345",
      APP_ORIGIN: "https://reader.example",
      DEPLOY_TARGET: "public",
      DATABASE_URL:
        "postgresql://runtime:fixture-only@db.firstscene.invalid/story?sslmode=require",
    }),
  ).toMatchObject({ local: false, cookieName: "__Host-firstscene" });
});
it("runtime rejects owner credentials, public secrets, insecure public origin, unsafe TLS and missing rate secrets", () => {
  const cases = [
    [
      { DIRECT_DATABASE_URL: "fixture-only" },
      "OWNER_CREDENTIALS_FORBIDDEN_AT_RUNTIME",
    ],
    [
      { LOCAL_POSTGRES_PASSWORD: "fixture-only" },
      "OWNER_CREDENTIALS_FORBIDDEN_AT_RUNTIME",
    ],
    [
      { NEXT_PUBLIC_RATE_LIMIT_HMAC_SECRET: "fixture-only" },
      "PUBLIC_SECRET_FORBIDDEN",
    ],
    [{ APP_ORIGIN: "http://reader.example" }, "LOCAL_COOKIE_ON_PUBLIC_ORIGIN"],
    [{ DEPLOY_TARGET: "public" }, "PUBLIC_HTTPS_REQUIRED"],
    [
      {
        DATABASE_URL:
          "postgresql://firstscene_owner:fixture-only@127.0.0.1:55432/firstscene_dev",
      },
      "OWNER_DATABASE_ROLE_FORBIDDEN",
    ],
    [
      {
        DATABASE_URL:
          "postgresql://runtime:fixture-only@db.firstscene.invalid/story?sslmode=disable",
        APP_ORIGIN: "https://reader.example",
        DEPLOY_TARGET: "public",
      },
      "REMOTE_TLS_REQUIRED",
    ],
    [{ RATE_LIMIT_HMAC_SECRET: "" }, "RATE_SECRET_REQUIRED"],
    [
      {
        DATABASE_URL:
          "postgresql://runtime:fixture-only@127.0.0.1:55432/other_project",
      },
      "OWNED_LOCAL_DATABASE_REQUIRED",
    ],
  ] as const;
  for (const [override, code] of cases)
    expect(() =>
      validateRuntimeEnvironment({ ...fixture(), ...override }),
    ).toThrow(code);
});
it("configuration errors never retain or serialize the malformed credential input", () => {
  const secret = "fixture-only-private-marker";
  for (const action of [
    () => deriveOriginPolicy(secret + "::bad origin", "public"),
    () =>
      validateRuntimeEnvironment({
        ...fixture(),
        DATABASE_URL: secret + "::bad URL",
      }),
  ]) {
    let error: unknown;
    try {
      action();
    } catch (value) {
      error = value;
    }
    expect(error).toBeInstanceOf(Error);
    expect(
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    ).not.toContain(secret);
  }
});
it("pure startup validation does not connect to a temporarily unavailable loopback database", () => {
  expect(
    validateRuntimeEnvironment({
      ...fixture(),
      DATABASE_URL:
        "postgresql://runtime:fixture-only@127.0.0.1:1/firstscene_test_deadbeef",
    }),
  ).toMatchObject({ local: true });
});
