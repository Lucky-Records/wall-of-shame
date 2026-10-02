import { handleAuthCallbackGet } from "../../_lib/authHandlers";
import type { DiscordEnv } from "../../_lib/discord";

export async function onRequestGet(context: {
  request: Request;
  env: DiscordEnv;
}): Promise<Response> {
  return handleAuthCallbackGet(context.request, context.env);
}
