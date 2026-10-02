import { handleMeGet } from "../_lib/authHandlers";
import type { DiscordEnv } from "../_lib/discord";

export async function onRequestGet(context: {
  request: Request;
  env: DiscordEnv;
}): Promise<Response> {
  return handleMeGet(context.request, context.env);
}
