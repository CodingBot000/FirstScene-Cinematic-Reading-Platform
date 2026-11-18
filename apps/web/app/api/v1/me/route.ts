import {
  apiRequest,
  readMe,
  jsonResponse,
  assertApiResponse,
  readJsonWrite,
  requestToken,
  expiredCookie,
  deleteSession,
  validSessionToken,
} from "@firstscene/server-data";
import {
  dataPool,
  requireSession,
  runtimePool,
  httpPolicy,
  rateSecret,
} from "../../../../lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiRequest("/api/v1/me", async () => {
    const data = await readMe(dataPool(), await requireSession(request));
    assertApiResponse(data, "Me");
    return jsonResponse(data);
  });
}
export async function DELETE(request: Request) {
  return apiRequest("/api/v1/me", async (_requestId, deadline) => {
    const policy = httpPolicy();
    await readJsonWrite(request, policy, "Empty", deadline);
    const token = requestToken(request, policy);
    if (validSessionToken(token))
      await deleteSession(await runtimePool(), token, rateSecret(), deadline);
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "private, no-store",
        vary: "Cookie",
        "set-cookie": expiredCookie(policy),
      },
    });
  });
}
