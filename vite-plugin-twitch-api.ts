import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  fetchTwitchUserByLogin,
  hasTwitchCredentials,
} from "./functions/_lib/twitch.ts";

type TwitchEnv = {
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
};

function readBodyJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

function getLogin(req: IncomingMessage): string {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  return (url.searchParams.get("login") ?? "").trim().toLowerCase();
}

async function handleTwitchUser(
  req: IncomingMessage,
  res: ServerResponse,
  env: TwitchEnv,
): Promise<void> {
  const login = getLogin(req);
  if (!login || !/^[a-z0-9_]{1,25}$/.test(login)) {
    readBodyJson(res, 400, { ok: false, error: "Invalid Twitch login." });
    return;
  }

  const creds = {
    clientId: env.TWITCH_CLIENT_ID ?? "",
    clientSecret: env.TWITCH_CLIENT_SECRET ?? "",
  };

  if (!hasTwitchCredentials(creds)) {
    readBodyJson(res, 503, {
      ok: false,
      demo: true,
      error:
        "Twitch is not configured. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.",
    });
    return;
  }

  try {
    const result = await fetchTwitchUserByLogin(creds, login);
    if (!result.ok) {
      readBodyJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    readBodyJson(res, 200, {
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
    readBodyJson(res, 502, { ok: false, error: message });
  }
}

function handleTwitchStatus(
  res: ServerResponse,
  env: TwitchEnv,
): void {
  const ready = hasTwitchCredentials({
    clientId: env.TWITCH_CLIENT_ID ?? "",
    clientSecret: env.TWITCH_CLIENT_SECRET ?? "",
  });
  readBodyJson(res, 200, { ready });
}

function attachApi(
  middlewares: {
    use: (
      path: string,
      handler: (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ) => void,
    ) => void;
  },
  env: TwitchEnv,
): void {
  middlewares.use("/api/twitch-status", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    handleTwitchStatus(res, env);
  });

  middlewares.use("/api/twitch-user", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    void handleTwitchUser(req, res, env);
  });
}

/**
 * Local `/api/twitch-*` routes for Vite dev + preview.
 * Production uses Cloudflare Pages Functions under `functions/api/`.
 */
export function twitchApiPlugin(env: TwitchEnv): Plugin {
  return {
    name: "twitch-api-local",
    configureServer(server) {
      attachApi(server.middlewares, env);
    },
    configurePreviewServer(server) {
      attachApi(server.middlewares, env);
    },
  };
}
