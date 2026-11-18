import {
  apiRequest,
  readJsonWrite,
  requestToken,
  issueSession,
  creationNetworkScope,
  sessionCookie,
  jsonResponse,
  assertApiResponse,
} from "@firstscene/server-data";
import { runtimePool, httpPolicy, rateSecret } from "../../../../lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return apiRequest("/api/v1/session", async (_requestId, deadline) => {
    const policy = httpPolicy();
    await readJsonWrite(request, policy, "Empty", deadline);
    const result = await issueSession(
      await runtimePool(),
      rateSecret(),
      requestToken(request, policy),
      creationNetworkScope(request, policy, process.env),
      deadline,
    );
    assertApiResponse(result.session, "Session");
    return jsonResponse(
      result.session,
      200,
      result.token
        ? { "set-cookie": sessionCookie(policy, result.token, result.session) }
        : undefined,
    );
  });
}
