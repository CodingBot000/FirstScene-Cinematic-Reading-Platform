import { randomUUID } from "node:crypto";
import { ApiError, assertApi } from "./contracts.js";
import type { ApiSchemaName, SessionDto } from "./contracts.js";
import type { HttpPolicy } from "./environment.js";
import { requestDiagnostics } from "./request-diagnostics.js";
export type { HttpPolicy } from "./environment.js";
export { deriveOriginPolicy as deriveHttpPolicy } from "./environment.js";
export function requestToken(
  request: Request,
  policy: HttpPolicy,
): string | null {
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim());
  const matches = cookies.filter((part) =>
    part.startsWith(policy.cookieName + "="),
  );
  if (matches.length !== 1) return null;
  return matches[0]!.slice(policy.cookieName.length + 1);
}
export function sessionCookie(
  policy: HttpPolicy,
  token: string,
  session: SessionDto,
): string {
  const maxAge = Math.min(
    30 * 86400,
    Math.max(
      0,
      Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000),
    ),
  );
  return `${policy.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(session.expiresAt).toUTCString()}${policy.local ? "" : "; Secure"}`;
}
export function expiredCookie(policy: HttpPolicy): string {
  return `${policy.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${policy.local ? "" : "; Secure"}`;
}
export async function readJsonWrite(
  request: Request,
  policy: HttpPolicy,
  name: ApiSchemaName,
  deadline = Date.now() + 10000,
): Promise<unknown> {
  const site = request.headers.get("sec-fetch-site");
  if (
    request.headers.get("origin") !== policy.origin ||
    (site !== null && site !== "same-origin") ||
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
  )
    throw new ApiError(
      403,
      "ORIGIN_REFUSED",
      "같은 사이트의 JSON 요청만 허용해요.",
    );
  const length = request.headers.get("content-length");
  if (length && Number(length) > 16384)
    throw new ApiError(
      413,
      "BODY_TOO_LARGE",
      "요청 크기가 허용 범위를 넘었어요.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON", "JSON 본문이 필요해요.");
  const chunks: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ApiError(
            503,
            "REQUEST_TIMEOUT",
            "요청 본문을 받는 시간이 초과됐어요.",
          ),
        ),
      Math.max(0, deadline - Date.now()),
    );
  });
  let total = 0;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 16384) {
        await reader.cancel();
        throw new ApiError(
          413,
          "BODY_TOO_LARGE",
          "요청 크기가 허용 범위를 넘었어요.",
        );
      }
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "올바른 JSON 본문이 필요해요.");
  }
  assertApi(value, name);
  return value;
}
export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const safeHeaders = new Headers(headers);
  safeHeaders.set("cache-control", "private, no-store");
  safeHeaders.set("vary", "Cookie");
  return Response.json(body, {
    status,
    headers: safeHeaders,
  });
}
export async function apiRequest(
  route: string,
  action: (requestId: string, deadline: number) => Promise<Response>,
): Promise<Response> {
  const requestId = randomUUID(),
    started = performance.now();
  let response: Response;
  let code = "OK";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const diagnostics = { transaction: null };
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ApiError(
              503,
              "REQUEST_TIMEOUT",
              "요청 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.",
            ),
          ),
        10000,
      );
    });
    response = await Promise.race([
      requestDiagnostics.run(diagnostics, () =>
        action(requestId, Date.now() + 10000),
      ),
      timeout,
    ]);
  } catch (error) {
    const known =
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "STORAGE_UNAVAILABLE",
            "본문은 계속 읽을 수 있어요. 기록 동기화는 잠시 멈췄어요.",
          );
    code = known.code;
    response = jsonResponse(
      {
        error: {
          code: known.code,
          message: known.message,
          requestId,
          ...(known.details ? { details: known.details } : {}),
        },
      },
      known.status,
      known.retryAfter
        ? { "retry-after": String(known.retryAfter) }
        : undefined,
    );
  }
  clearTimeout(timer);
  response.headers.set("x-request-id", requestId);
  const release = process.env.VERCEL_GIT_COMMIT_SHA;
  console.info(
    JSON.stringify({
      requestId,
      route,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      code,
      retryable: response.status === 429 || response.status === 503,
      releaseSha: release && /^[a-f0-9]{40}$/.test(release) ? release : null,
      transaction: diagnostics.transaction,
    }),
  );
  return response;
}
