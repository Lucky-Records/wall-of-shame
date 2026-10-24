import { publicMember, type SessionMember } from "../../_lib/auth";
import { jsonResponse } from "../../_lib/http";

export async function onRequestGet(context: {
  data: { member?: SessionMember };
}): Promise<Response> {
  const member = context.data.member;
  if (!member) {
    return jsonResponse({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }
  return jsonResponse({ ok: true, member: publicMember(member) });
}
