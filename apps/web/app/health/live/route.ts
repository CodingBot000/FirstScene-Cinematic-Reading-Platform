import { jsonResponse } from "@firstscene/server-data";
export function GET() {
  return jsonResponse({ status: "ok" });
}
