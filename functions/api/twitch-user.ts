import {
  fetchTwitchUserByLogin,
  hasTwitchCredentials,
  jsonResponse,
} from "../_lib/twitch";

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
      { ok: false, error: "Invalid Twitch login." },
      { status: 400 },
    );
  }

  const creds = {
    clientId: context.env.TWITCH_CLIENT_ID ?? "",
    clientSecret: context.env.TWITCH_CLIENT_SECRET ?? "",
  };

  if (!hasTwitchCredentials(creds)) {
    return jsonResponse(
      {
        ok: false,
        demo: true,
        error:
          "Twitch is not configured. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await fetchTwitchUserByLogin(creds, login);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }
    return jsonResponse({
      ok: true,
      user: {
        login: result.user.login,
        display_name: result.user.display_name,
        profile_image_url: result.user.profile_image_url,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected Twitch resolver error.";
    return jsonResponse({ ok: false, error: message }, { status: 502 });
  }
}
