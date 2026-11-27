import type { Progress } from "./transport.generated";
import { isTransport } from "./validate";
export class TransportFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: {
      currentRevision?: number;
      currentProgress?: Progress;
    } = {},
    public retryAfter = 0,
    public requestId: string | null = null,
  ) {
    super(code);
  }
}
export function createRequest(fetchRequest: typeof fetch) {
  return async function request(
    path: string,
    method = "GET",
    body?: unknown,
    keepalive = false,
    expectedStatus?: number,
  ) {
    const response = await fetchRequest(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      keepalive,
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok && expectedStatus && response.status !== expectedStatus)
      throw new TransportFailure(503, "INVALID_FEEDBACK_RESPONSE");
    if (response.status === 204) return null;
    if (method === "DELETE" && response.ok)
      throw new TransportFailure(503, "INVALID_DELETE_RESPONSE");
    const value: unknown = await response.json();
    if (!response.ok) {
      const header = response.headers.get("x-request-id");
      const requestId =
        header &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          header,
        )
          ? header
          : null;
      if (isTransport("Error", value))
        throw new TransportFailure(
          response.status,
          value.error.code,
          value.error.details,
          Math.max(0, Number(response.headers.get("retry-after")) || 0),
          requestId,
        );
      throw new TransportFailure(
        response.status,
        "INVALID_RESPONSE",
        {},
        0,
        requestId,
      );
    }
    return value;
  };
}
