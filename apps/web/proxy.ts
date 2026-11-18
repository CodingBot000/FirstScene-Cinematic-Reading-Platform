import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString("base64"),
    isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (process.env.APP_ORIGIN?.startsWith("https://"))
    response.headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  if (!request.nextUrl.pathname.startsWith("/api/"))
    response.headers.set("cache-control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|assets/|favicon.ico).*)"],
};
