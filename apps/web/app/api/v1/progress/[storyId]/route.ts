import {
  apiRequest,
  readJsonWrite,
  jsonResponse,
} from "@firstscene/server-data";
import type { ProgressWrite } from "@firstscene/server-data";
import { httpPolicy, requireSession } from "../../../../../lib/api";
import { stateRepository } from "../../../../../lib/state-api";
export const runtime = "nodejs";
export function PUT(
  request: Request,
  { params }: { params: Promise<{ storyId: string }> },
) {
  return apiRequest("/api/v1/progress/:storyId", async (_id, deadline) => {
    const input = (await readJsonWrite(
      request,
      httpPolicy(),
      "ProgressWrite",
      deadline,
    )) as ProgressWrite;
    const context = await requireSession(request);
    const { storyId } = await params;
    const result = await stateRepository().putProgress(
      context,
      storyId,
      input,
      deadline,
    );
    return jsonResponse(result.body, result.status);
  });
}
