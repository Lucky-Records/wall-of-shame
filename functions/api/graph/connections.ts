import type { DiscordEnv } from "../../_lib/discord";
import { handleConnectionsPost } from "../../_lib/graphHandlers";
import { getCloudflareGraphStore } from "../../_lib/cfStore";

export async function onRequestPost(context: {
  request: Request;
  env: DiscordEnv;
}): Promise<Response> {
  return handleConnectionsPost(
    context.request,
    context.env,
    getCloudflareGraphStore(),
  );
}
