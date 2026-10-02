import { resolveTwitchUser } from "../_lib/twitch";
import { jsonResponse } from "../_lib/http";

interface Env {
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
}

export async function onRequestGet(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const url = new URL(context.request.url);
  const login = (url.searchParams.get("login") ?? "").trim().toLowerCase();

  if (!login || !/^[a-z0-9_]{1,25}$/.test(login)) {
    return jsonResponse(
      { ok: false, error: "Ungültiger Twitch-Login." },
      { status: 400 },
    );
  }

  try {
    const result = await resolveTwitchUser(login, {
      clientId: context.env.TWITCH_CLIENT_ID ?? "",
      clientSecret: context.env.TWITCH_CLIENT_SECRET ?? "",
    });
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }
    return jsonResponse({
      ok: true,
      source: result.source,
      user: {
        login: result.user.login,
        display_name: result.user.display_name,
        profile_image_url: result.user.profile_image_url,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unerwarteter Fehler beim Twitch-Resolver.";
    return jsonResponse({ ok: false, error: message }, { status: 502 });
  }
}
