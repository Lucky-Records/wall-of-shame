import type { DiscordEnv } from "../../../_lib/discord";
import { handlePersonPatch } from "../../../_lib/graphHandlers";
import { getCloudflareGraphStore } from "../../../_lib/cfStore";

export async function onRequestPatch(context: {
  request: Request;
  env: DiscordEnv;
  params: { id: string };
}): Promise<Response> {
  return handlePersonPatch(
    context.request,
    context.env,
    getCloudflareGraphStore(),
    context.params.id,
  );
}
