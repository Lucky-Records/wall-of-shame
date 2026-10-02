import { handleAuthLogoutPost } from "../../_lib/authHandlers";
import type { DiscordEnv } from "../../_lib/discord";

export async function onRequestPost(context: {
  request: Request;
  env: DiscordEnv;
}): Promise<Response> {
  return handleAuthLogoutPost(context.request, context.env);
}
