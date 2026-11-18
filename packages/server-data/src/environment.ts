export type HttpPolicy = {
  origin: string;
  local: boolean;
  cookieName: "firstscene_dev" | "__Host-firstscene";
};
export function deriveOriginPolicy(origin: string, target: string): HttpPolicy {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("APP_ORIGIN_INVALID");
  }
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("APP_ORIGIN_INVALID");
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
    url.hostname,
  );
  const local = target === "local" && loopback && url.protocol === "http:";
  if (target === "local" && !loopback)
    throw new Error("LOCAL_COOKIE_ON_PUBLIC_ORIGIN");
  if (!local && url.protocol !== "https:")
    throw new Error("PUBLIC_HTTPS_REQUIRED");
  if (!["local", "public"].includes(target))
    throw new Error("DEPLOY_TARGET_REQUIRED");
  return {
    origin,
    local,
    cookieName: local ? "firstscene_dev" : "__Host-firstscene",
  };
}
export function validateRuntimeEnvironment(
  env: Record<string, string | undefined>,
) {
  if (env.DIRECT_DATABASE_URL?.trim() || env.LOCAL_POSTGRES_PASSWORD?.trim())
    throw new Error("OWNER_CREDENTIALS_FORBIDDEN_AT_RUNTIME");
  for (const [key, value] of Object.entries(env))
    if (
      value &&
      /^NEXT_PUBLIC_.*(?:SECRET|PASSWORD|DATABASE_URL|API_KEY|PRIVATE_KEY|TOKEN)/.test(
        key,
      )
    )
      throw new Error("PUBLIC_SECRET_FORBIDDEN");
  const policy = deriveOriginPolicy(
    env.APP_ORIGIN ?? "",
    env.DEPLOY_TARGET ?? "",
  );
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  let database: URL, username: string, password: string;
  try {
    database = new URL(env.DATABASE_URL);
    username = decodeURIComponent(database.username);
    password = decodeURIComponent(database.password);
  } catch {
    throw new Error("DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    !database.pathname.slice(1) ||
    !username ||
    !password ||
    username.includes("\0") ||
    password.includes("\0")
  )
    throw new Error("DATABASE_URL_INVALID");
  if (["firstscene_owner", "firstscene_ci_owner"].includes(username))
    throw new Error("OWNER_DATABASE_ROLE_FORBIDDEN");
  const localDatabase = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
    database.hostname,
  );
  if (
    !localDatabase &&
    ["disable", "no-verify"].includes(
      database.searchParams.get("sslmode") ?? "",
    )
  )
    throw new Error("REMOTE_TLS_REQUIRED");
  if (
    env.DEPLOY_TARGET === "local" &&
    (!localDatabase ||
      !/^\/firstscene_(?:dev|test_[a-f0-9]+|ci)$/.test(database.pathname))
  )
    throw new Error("OWNED_LOCAL_DATABASE_REQUIRED");
  if (!env.RATE_LIMIT_HMAC_SECRET || env.RATE_LIMIT_HMAC_SECRET.length < 32)
    throw new Error("RATE_SECRET_REQUIRED");
  if (!policy.local && !hasTrustedPublicIngress(env))
    throw new Error("TRUSTED_PUBLIC_INGRESS_REQUIRED");
  // Pure configuration validation: a temporary DB outage must not prevent public manuscript SSR.
  return Object.freeze({
    origin: policy.origin,
    target: env.DEPLOY_TARGET!,
    cookieName: policy.cookieName,
    local: policy.local,
  });
}

// This opt-in is deployment configuration, never an HTTP header. It must only
// be enabled after verifying that the actual ingress is Vercel's protected edge.
export function hasTrustedPublicIngress(
  env: Record<string, string | undefined>,
) {
  return (
    env.FIRSTSCENE_TRUSTED_INGRESS === "vercel" &&
    env.VERCEL === "1" &&
    ["production", "preview"].includes(env.VERCEL_ENV ?? "") &&
    /^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? "")
  );
}

export function shouldRunRequestCleanup(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.FIRSTSCENE_PRESERVE_EXISTING_RECORDS !== "1" &&
    env.DEPLOY_TARGET !== "local-neon"
  );
}
