import {
  apiRequest,
  readJsonWrite,
  jsonResponse,
} from "@firstscene/server-data";
import type { BookmarkWrite, MutationInput } from "@firstscene/server-data";
import { httpPolicy, requireSession } from "../../../../../../lib/api";
import { stateRepository } from "../../../../../../lib/state-api";
export const runtime = "nodejs";
type Route = { params: Promise<{ storyId: string; targetId: string }> };
export function PUT(request: Request, { params }: Route) {
  return apiRequest(
    "/api/v1/bookmarks/:storyId/:targetId",
    async (_id, deadline) => {
      const input = (await readJsonWrite(
        request,
        httpPolicy(),
        "BookmarkWrite",
        deadline,
      )) as BookmarkWrite;
      const context = await requireSession(request);
      const { storyId, targetId } = await params;
      const result = await stateRepository().putBookmark(
        context,
        storyId,
        targetId,
        input,
        deadline,
      );
      return jsonResponse(result.body, result.status);
    },
  );
}
export function DELETE(request: Request, { params }: Route) {
  return apiRequest(
    "/api/v1/bookmarks/:storyId/:targetId",
    async (_id, deadline) => {
      const input = (await readJsonWrite(
        request,
        httpPolicy(),
        "Mutation",
        deadline,
      )) as MutationInput;
      const context = await requireSession(request);
      const { storyId, targetId } = await params;
      await stateRepository().deleteBookmark(
        context,
        storyId,
        targetId,
        input,
        deadline,
      );
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "private, no-store", vary: "Cookie" },
      });
    },
  );
}
