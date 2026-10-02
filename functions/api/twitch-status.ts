import { hasHelixCredentials } from "../_lib/twitch";
import { jsonResponse } from "../_lib/http";

interface Env {
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
}

/**
 * Twitch resolve is always available via public fallbacks (no secret).
 * `helix` is true only when both Client ID + Secret are configured.
 */
export async function onRequestGet(context: {
  env: Env;
}): Promise<Response> {
  const helix = hasHelixCredentials({
    clientId: context.env.TWITCH_CLIENT_ID ?? "",
    clientSecret: context.env.TWITCH_CLIENT_SECRET ?? "",
  });
  return jsonResponse({ ready: true, helix });
}
