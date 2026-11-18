import {
  apiRequest,
  readJsonWrite,
  jsonResponse,
} from "@firstscene/server-data";
import type { PreferencesWrite } from "@firstscene/server-data";
import { httpPolicy, requireSession } from "../../../../lib/api";
import { stateRepository } from "../../../../lib/state-api";
export const runtime = "nodejs";
export function PUT(request: Request) {
  return apiRequest("/api/v1/preferences", async (_id, deadline) => {
    const input = (await readJsonWrite(
      request,
      httpPolicy(),
      "PreferencesWrite",
      deadline,
    )) as PreferencesWrite;
    const context = await requireSession(request);
    const result = await stateRepository().putPreferences(
      context,
      input,
      deadline,
    );
    return jsonResponse(result.body, result.status);
  });
}
