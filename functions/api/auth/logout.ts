import {
  clearSessionCookie,
  readSessionToken,
  sha256Hex,
  type AuthEnv,
} from "../../_lib/auth";
import { jsonResponse } from "../../_lib/http";

export async function onRequestPost(context: {
  request: Request;
  env: AuthEnv;
}): Promise<Response> {
  const token = readSessionToken(context.request);
  if (token && context.env.DB) {
    await context.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1")
      .bind(await sha256Hex(token))
      .run();
  }
  return jsonResponse(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie() } },
  );
}
