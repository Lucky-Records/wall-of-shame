import type { SessionMember } from "../../_lib/auth";
import { jsonResponse } from "../../_lib/http";

/** The middleware already refreshed last_seen_at (throttled to 1×/min). */
export async function onRequestPost(context: {
  data: { member?: SessionMember };
}): Promise<Response> {
  if (!context.data.member) {
    return jsonResponse({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }
  return jsonResponse({ ok: true, at: Date.now() });
}
