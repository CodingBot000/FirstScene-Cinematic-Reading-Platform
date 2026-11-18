import { apiRequest, jsonResponse } from "@firstscene/server-data";
import { dataPool } from "../../../lib/api";
export const runtime = "nodejs";
export function GET() {
  return apiRequest("/health/ready", async () => {
    await dataPool().query("SELECT 1");
    return jsonResponse({ status: "ok" });
  });
}
