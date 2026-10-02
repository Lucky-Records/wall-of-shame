import type { DiscordEnv } from "../../_lib/discord";
import { handlePeoplePost } from "../../_lib/graphHandlers";
import { getCloudflareGraphStore } from "../../_lib/cfStore";

export async function onRequestPost(context: {
  request: Request;
  env: DiscordEnv;
}): Promise<Response> {
  return handlePeoplePost(
    context.request,
    context.env,
    getCloudflareGraphStore(),
  );
}
