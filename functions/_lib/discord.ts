export type DiscordEnv = {
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_EDITOR_ROLE_ID?: string;
  SESSION_SECRET?: string;
  APP_ORIGIN?: string;
};

export type DiscordIdentity = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
};

const DISCORD_API = "https://discord.com/api/v10";
const OAUTH_SCOPES = ["identify", "guilds", "guilds.members.read"].join(" ");

export function hasDiscordOAuthConfig(env: DiscordEnv): boolean {
  return Boolean(
    env.DISCORD_CLIENT_ID?.trim() &&
      env.DISCORD_CLIENT_SECRET?.trim() &&
      env.SESSION_SECRET?.trim(),
  );
}

export function hasRoleGateConfig(env: DiscordEnv): boolean {
  return Boolean(
    env.DISCORD_GUILD_ID?.trim() && env.DISCORD_EDITOR_ROLE_ID?.trim(),
  );
}

export function getAppOrigin(request: Request, env: DiscordEnv): string {
  if (env.APP_ORIGIN?.trim()) {
    return env.APP_ORIGIN.replace(/\/$/, "");
  }
  const url = new URL(request.url);
  return url.origin;
}

export function getRedirectUri(request: Request, env: DiscordEnv): string {
  return `${getAppOrigin(request, env)}/api/auth/callback`;
}

export function buildAuthorizeUrl(
  request: Request,
  env: DiscordEnv,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID!.trim(),
    response_type: "code",
    scope: OAUTH_SCOPES,
    redirect_uri: getRedirectUri(request, env),
    state,
    prompt: "none",
  });
  // prompt=none can fail if not logged in; use consent for first-time reliability
  params.set("prompt", "consent");
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(
  request: Request,
  env: DiscordEnv,
  code: string,
): Promise<{ access_token: string; token_type: string } | { error: string }> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID!.trim(),
    client_secret: env.DISCORD_CLIENT_SECRET!.trim(),
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(request, env),
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      error: `Discord token exchange failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  return (await res.json()) as { access_token: string; token_type: string };
}

export async function fetchDiscordIdentity(
  accessToken: string,
): Promise<DiscordIdentity | { error: string }> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      error: `Discord identity failed (${res.status}): ${text.slice(0, 160)}`,
    };
  }
  const data = (await res.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  return {
    id: data.id,
    username: data.username,
    global_name: data.global_name ?? null,
    avatar: data.avatar ?? null,
  };
}

type MemberRoles = { roles: string[]; inGuild: boolean };

async function memberViaOAuth(
  accessToken: string,
  guildId: string,
): Promise<MemberRoles | { error: string }> {
  const res = await fetch(
    `${DISCORD_API}/users/@me/guilds/${encodeURIComponent(guildId)}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status === 404) {
    return { roles: [], inGuild: false };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      error: `Discord guild member (OAuth) failed (${res.status}): ${text.slice(0, 160)}`,
    };
  }
  const data = (await res.json()) as { roles?: string[] };
  return { roles: data.roles ?? [], inGuild: true };
}

async function memberViaBot(
  botToken: string,
  guildId: string,
  userId: string,
): Promise<MemberRoles | { error: string }> {
  const res = await fetch(
    `${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bot ${botToken}` } },
  );
  if (res.status === 404) {
    return { roles: [], inGuild: false };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      error: `Discord guild member (bot) failed (${res.status}): ${text.slice(0, 160)}`,
    };
  }
  const data = (await res.json()) as { roles?: string[] };
  return { roles: data.roles ?? [], inGuild: true };
}

/**
 * Prefer OAuth `guilds.members.read` membership; fall back to bot token if set.
 */
export async function resolveEditorAccess(
  env: DiscordEnv,
  accessToken: string,
  userId: string,
): Promise<
  | {
      canEdit: boolean;
      inGuild: boolean;
      reason?: string;
    }
  | { error: string }
> {
  if (!hasRoleGateConfig(env)) {
    return {
      canEdit: false,
      inGuild: false,
      reason:
        "DISCORD_GUILD_ID and DISCORD_EDITOR_ROLE_ID are not configured.",
    };
  }

  const guildId = env.DISCORD_GUILD_ID!.trim();
  const roleId = env.DISCORD_EDITOR_ROLE_ID!.trim();

  let member = await memberViaOAuth(accessToken, guildId);
  if ("error" in member && env.DISCORD_BOT_TOKEN?.trim()) {
    member = await memberViaBot(env.DISCORD_BOT_TOKEN.trim(), guildId, userId);
  }
  if ("error" in member) return member;

  if (!member.inGuild) {
    return {
      canEdit: false,
      inGuild: false,
      reason: "Not a member of the configured Discord guild.",
    };
  }

  const canEdit = member.roles.includes(roleId);
  return {
    canEdit,
    inGuild: true,
    reason: canEdit
      ? undefined
      : "Signed in, but missing the editor Discord role.",
  };
}

export function discordAvatarUrl(
  userId: string,
  avatar: string | null,
): string | null {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=64`;
}
