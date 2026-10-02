import { hasTwitchCredentials, jsonResponse } from "../_lib/twitch";

interface Env {
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
}

export async function onRequestGet(context: {
  env: Env;
}): Promise<Response> {
  const ready = hasTwitchCredentials({
    clientId: context.env.TWITCH_CLIENT_ID ?? "",
    clientSecret: context.env.TWITCH_CLIENT_SECRET ?? "",
  });
  return jsonResponse({ ready });
}
