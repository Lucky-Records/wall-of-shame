export type TwitchCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
};

type TokenCache = {
  token: string;
  expiresAt: number;
  clientId: string;
};

let cachedToken: TokenCache | null = null;

export function hasTwitchCredentials(
  env: Partial<TwitchCredentials>,
): env is TwitchCredentials {
  return Boolean(env.clientId?.trim() && env.clientSecret?.trim());
}

export async function getAppAccessToken(
  creds: TwitchCredentials,
): Promise<string> {
  if (
    cachedToken &&
    cachedToken.clientId === creds.clientId &&
    Date.now() < cachedToken.expiresAt - 60_000
  ) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Twitch token request failed (${res.status}): ${text.slice(0, 180)}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    clientId: creds.clientId,
  };
  return cachedToken.token;
}

export async function fetchTwitchUserByLogin(
  creds: TwitchCredentials,
  login: string,
): Promise<
  | { ok: true; user: TwitchUser }
  | { ok: false; status: number; error: string }
> {
  const token = await getAppAccessToken(creds);
  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;
  const res = await fetch(url, {
    headers: {
      "Client-Id": creds.clientId,
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 429) {
    return {
      ok: false,
      status: 429,
      error: "Twitch rate limit hit. Try again in a moment.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: res.status,
      error: "Twitch auth failed. Check Client ID and Client Secret.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: `Twitch API error (${res.status}).`,
    };
  }

  const data = (await res.json()) as { data: TwitchUser[] };
  const user = data.data?.[0];
  if (!user) {
    return {
      ok: false,
      status: 404,
      error: `No Twitch user found for “${login}”.`,
    };
  }
  return { ok: true, user };
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}
