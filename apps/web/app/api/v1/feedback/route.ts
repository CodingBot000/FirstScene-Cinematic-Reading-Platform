import {
  apiRequest,
  readJsonWrite,
  jsonResponse,
} from "@firstscene/server-data";
import type { FeedbackWrite } from "@firstscene/server-data";
import { httpPolicy, requireSession } from "../../../../lib/api";
import { stateRepository } from "../../../../lib/state-api";
export const runtime = "nodejs";
export function POST(request: Request) {
  return apiRequest("/api/v1/feedback", async (_id, deadline) => {
    const input = (await readJsonWrite(
      request,
      httpPolicy(),
      "FeedbackWrite",
      deadline,
    )) as FeedbackWrite;
    const context = await requireSession(request);
    const result = await stateRepository().submitFeedback(
      context,
      input,
      deadline,
    );
    return jsonResponse(result.body, result.status);
  });
}
