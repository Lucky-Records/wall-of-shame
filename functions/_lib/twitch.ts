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

export type TwitchResolveResult =
  | { ok: true; user: TwitchUser; source: "helix" | "public" }
  | { ok: false; status: number; error: string };

type TokenCache = {
  token: string;
  expiresAt: number;
  clientId: string;
};

let cachedToken: TokenCache | null = null;

/** Helix Client Credentials only when both ID and Secret are present. */
export function hasHelixCredentials(
  env: Partial<TwitchCredentials>,
): env is TwitchCredentials {
  return Boolean(env.clientId?.trim() && env.clientSecret?.trim());
}

/** @deprecated Prefer hasHelixCredentials — public resolve needs no secret. */
export function hasTwitchCredentials(
  env: Partial<TwitchCredentials>,
): env is TwitchCredentials {
  return hasHelixCredentials(env);
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
      `Twitch-Token-Anfrage fehlgeschlagen (${res.status}): ${text.slice(0, 180)}`,
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

async function fetchViaHelix(
  creds: TwitchCredentials,
  login: string,
): Promise<TwitchResolveResult> {
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
      error: "Twitch Rate-Limit. Bitte gleich nochmal versuchen.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: res.status,
      error:
        "Twitch Helix-Auth fehlgeschlagen. Client ID und Secret prüfen — oder Secret weglassen (öffentlicher Fallback).",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: `Twitch Helix-Fehler (${res.status}).`,
    };
  }

  const data = (await res.json()) as { data: TwitchUser[] };
  const user = data.data?.[0];
  if (!user) {
    return {
      ok: false,
      status: 404,
      error: `Kein Twitch-Profil für „${login}“ gefunden.`,
    };
  }
  return { ok: true, user, source: "helix" };
}

/** Public IVR Twitch lookup — no OAuth secret required. */
async function fetchViaIvr(login: string): Promise<TwitchUser | null> {
  const res = await fetch(
    `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(login)}`,
    { headers: { Accept: "application/json" } },
  );
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`ivr.fi ${res.status}`);

  const data = (await res.json()) as Array<{
    id?: string;
    login?: string;
    displayName?: string;
    logo?: string;
  }>;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.login) return null;
  return {
    id: row.id ?? login,
    login: row.login,
    display_name: row.displayName || row.login,
    profile_image_url:
      row.logo || `https://unavatar.io/twitch/${encodeURIComponent(row.login)}`,
  };
}

/**
 * Twitch website GQL (public web Client-ID). No app secret.
 * Same data the twitch.tv frontend uses for channel shells.
 */
async function fetchViaTwitchGql(login: string): Promise<TwitchUser | null> {
  const res = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query($login:String!){user(login:$login){id login displayName profileImageURL(width:300)}}`,
      variables: { login },
    }),
  });
  if (!res.ok) throw new Error(`Twitch GQL ${res.status}`);

  const payload = (await res.json()) as {
    data?: {
      user?: {
        id?: string;
        login?: string;
        displayName?: string;
        profileImageURL?: string;
      } | null;
    };
    errors?: unknown[];
  };

  const user = payload.data?.user;
  if (!user?.login) return null;
  return {
    id: user.id ?? login,
    login: user.login,
    display_name: user.displayName || user.login,
    profile_image_url:
      user.profileImageURL ||
      `https://unavatar.io/twitch/${encodeURIComponent(user.login)}`,
  };
}

/** Last-resort: public avatar CDN + login as display name. */
function fallbackUnavatar(login: string): TwitchUser {
  return {
    id: login,
    login,
    display_name: login,
    profile_image_url: `https://unavatar.io/twitch/${encodeURIComponent(login)}`,
  };
}

/**
 * Resolve a Twitch user by login.
 * Prefer Helix when both Client ID + Secret are set; otherwise use free public
 * sources (ivr.fi → Twitch GQL → unavatar). No secret required for the board.
 */
export async function resolveTwitchUser(
  login: string,
  env: Partial<TwitchCredentials> = {},
): Promise<TwitchResolveResult> {
  const normalized = login.trim().toLowerCase();
  if (!normalized || !/^[a-z0-9_]{1,25}$/.test(normalized)) {
    return {
      ok: false,
      status: 400,
      error: "Ungültiger Twitch-Login.",
    };
  }

  if (hasHelixCredentials(env)) {
    try {
      const helix = await fetchViaHelix(env, normalized);
      if (helix.ok) return helix;
      // Mismatched secrets / Helix outage → fall through to public sources
      // unless the user truly does not exist (404).
      if (helix.status === 404) return helix;
    } catch {
      // Fall through to public sources.
    }
  }

  try {
    const ivr = await fetchViaIvr(normalized);
    if (ivr) return { ok: true, user: ivr, source: "public" };
  } catch {
    // Try next public source.
  }

  try {
    const gql = await fetchViaTwitchGql(normalized);
    if (gql) return { ok: true, user: gql, source: "public" };
    return {
      ok: false,
      status: 404,
      error: `Kein Twitch-Profil für „${normalized}“ gefunden.`,
    };
  } catch {
    // Final soft fallback: avatar URL works even when metadata APIs fail.
    return {
      ok: true,
      user: fallbackUnavatar(normalized),
      source: "public",
    };
  }
}

/** @deprecated Use resolveTwitchUser — kept for call-site compatibility. */
export async function fetchTwitchUserByLogin(
  creds: TwitchCredentials,
  login: string,
): Promise<TwitchResolveResult> {
  return resolveTwitchUser(login, creds);
}
