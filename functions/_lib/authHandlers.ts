import {
  buildAuthorizeUrl,
  discordAvatarUrl,
  exchangeCode,
  fetchDiscordIdentity,
  hasDiscordOAuthConfig,
  hasRoleGateConfig,
  resolveEditorAccess,
  type DiscordEnv,
} from "./discord.ts";
import { jsonResponse, parseCookies, redirectResponse } from "./http.ts";
import {
  clearOauthStateCookieHeader,
  clearSessionCookieHeader,
  createSessionToken,
  getSessionFromRequest,
  isSecureRequest,
  OAUTH_STATE_COOKIE,
  oauthStateCookieHeader,
  randomState,
  sessionCookieHeader,
} from "./session.ts";

function homeRedirect(request: Request, env: DiscordEnv, query = ""): string {
  const origin = env.APP_ORIGIN?.trim()
    ? env.APP_ORIGIN.replace(/\/$/, "")
    : new URL(request.url).origin;
  return `${origin}/${query}`;
}

export async function handleAuthDiscordGet(
  request: Request,
  env: DiscordEnv,
): Promise<Response> {
  if (!hasDiscordOAuthConfig(env)) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Discord OAuth is not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and SESSION_SECRET.",
      },
      { status: 503 },
    );
  }

  const state = randomState();
  const secure = isSecureRequest(request);
  const location = buildAuthorizeUrl(request, env, state);
  return redirectResponse(location, {
    headers: {
      "Set-Cookie": oauthStateCookieHeader(state, 600, secure),
    },
  });
}

export async function handleAuthCallbackGet(
  request: Request,
  env: DiscordEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const secure = isSecureRequest(request);
  const clearState = clearOauthStateCookieHeader(secure);

  if (!hasDiscordOAuthConfig(env)) {
    return redirectResponse(homeRedirect(request, env, "?auth=error&reason=config"), {
      headers: { "Set-Cookie": clearState },
    });
  }

  const error = url.searchParams.get("error");
  if (error) {
    return redirectResponse(
      homeRedirect(
        request,
        env,
        `?auth=error&reason=${encodeURIComponent(error)}`,
      ),
      { headers: { "Set-Cookie": clearState } },
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("Cookie"));
  const expectedState = cookies[OAUTH_STATE_COOKIE];

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectResponse(
      homeRedirect(request, env, "?auth=error&reason=state"),
      { headers: { "Set-Cookie": clearState } },
    );
  }

  const tokenResult = await exchangeCode(request, env, code);
  if ("error" in tokenResult) {
    return redirectResponse(
      homeRedirect(request, env, "?auth=error&reason=token"),
      { headers: { "Set-Cookie": clearState } },
    );
  }

  const identity = await fetchDiscordIdentity(tokenResult.access_token);
  if ("error" in identity) {
    return redirectResponse(
      homeRedirect(request, env, "?auth=error&reason=identity"),
      { headers: { "Set-Cookie": clearState } },
    );
  }

  const access = await resolveEditorAccess(
    env,
    tokenResult.access_token,
    identity.id,
  );
  if ("error" in access) {
    return redirectResponse(
      homeRedirect(request, env, "?auth=error&reason=guild"),
      { headers: { "Set-Cookie": clearState } },
    );
  }

  const sessionToken = await createSessionToken(
    {
      id: identity.id,
      username: identity.username,
      globalName: identity.global_name,
      avatar: identity.avatar,
      canEdit: access.canEdit,
    },
    env.SESSION_SECRET!.trim(),
  );

  const headers = new Headers({
    Location: homeRedirect(
      request,
      env,
      access.canEdit ? "?auth=ok" : "?auth=ok&edit=0",
    ),
  });
  headers.append("Set-Cookie", clearState);
  headers.append(
    "Set-Cookie",
    sessionCookieHeader(sessionToken, 60 * 60 * 24 * 7, secure),
  );

  return new Response(null, { status: 302, headers });
}

export async function handleAuthLogoutPost(
  request: Request,
  _env: DiscordEnv,
): Promise<Response> {
  const secure = isSecureRequest(request);
  return jsonResponse(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookieHeader(secure),
      },
    },
  );
}

export async function handleMeGet(
  request: Request,
  env: DiscordEnv,
): Promise<Response> {
  // Public edit mode: anyone can mutate the board; Discord login is optional/legacy.
  const configured = hasDiscordOAuthConfig(env);
  const roleGateReady = hasRoleGateConfig(env);
  const session = await getSessionFromRequest(request, env.SESSION_SECRET);

  if (!session) {
    return jsonResponse({
      ok: true,
      authenticated: false,
      canEdit: true,
      publicEdit: true,
      discordConfigured: configured,
      roleGateConfigured: roleGateReady,
      user: null,
    });
  }

  return jsonResponse({
    ok: true,
    authenticated: true,
    canEdit: true,
    publicEdit: true,
    discordConfigured: configured,
    roleGateConfigured: roleGateReady,
    user: {
      id: session.id,
      username: session.username,
      globalName: session.globalName,
      avatarUrl: discordAvatarUrl(session.id, session.avatar),
    },
  });
}
