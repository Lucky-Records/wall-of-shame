import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  handleAuthCallbackGet,
  handleAuthDiscordGet,
  handleAuthLogoutPost,
  handleMeGet,
} from "./functions/_lib/authHandlers.ts";
import type { DiscordEnv } from "./functions/_lib/discord.ts";
import {
  handleConnectionsPost,
  handleGraphGet,
  handlePeoplePost,
  handlePersonDelete,
  handlePersonPatch,
} from "./functions/_lib/graphHandlers.ts";
import {
  cloneGraph,
  createMemoryStore,
  type GraphData,
  type GraphStore,
} from "./functions/_lib/graphStore.ts";
import {
  hasHelixCredentials,
  resolveTwitchUser,
} from "./functions/_lib/twitch.ts";
import { jsonResponse } from "./functions/_lib/http.ts";

type ApiEnv = DiscordEnv & {
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
};

const rootDir = dirname(fileURLToPath(import.meta.url));
const seedPath = join(rootDir, "data", "graph.seed.json");
const localGraphPath = join(rootDir, "data", "graph.json");

function loadSeed(): GraphData {
  return JSON.parse(readFileSync(seedPath, "utf8")) as GraphData;
}

function createFileBackedStore(): GraphStore {
  mkdirSync(dirname(localGraphPath), { recursive: true });
  if (!existsSync(localGraphPath)) {
    writeFileSync(localGraphPath, JSON.stringify(loadSeed(), null, 2));
  }

  const memory = createMemoryStore(
    JSON.parse(readFileSync(localGraphPath, "utf8")) as GraphData,
  );

  return {
    async get() {
      return memory.get();
    },
    async set(data) {
      await memory.set(data);
      writeFileSync(localGraphPath, JSON.stringify(cloneGraph(data), null, 2));
    },
  };
}

function nodeRequestToFetch(req: IncomingMessage, body?: Buffer): Request {
  const host = req.headers.host ?? "localhost";
  const raw =
    (req as IncomingMessage & { originalUrl?: string }).originalUrl ??
    req.url ??
    "/";
  const url = new URL(raw, `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  const init: RequestInit = { method, headers };
  if (body && method !== "GET" && method !== "HEAD") {
    init.body = new Uint8Array(body);
  }
  return new Request(url, init);
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function writeFetchResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  const setCookies: string[] = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookies.push(value);
      return;
    }
    res.setHeader(key, value);
  });
  if (setCookies.length === 1) {
    res.setHeader("Set-Cookie", setCookies[0]!);
  } else if (setCookies.length > 1) {
    res.setHeader("Set-Cookie", setCookies);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

async function handleTwitchUser(
  request: Request,
  env: ApiEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const login = (url.searchParams.get("login") ?? "").trim().toLowerCase();
  if (!login || !/^[a-z0-9_]{1,25}$/.test(login)) {
    return jsonResponse(
      { ok: false, error: "Ungültiger Twitch-Login." },
      { status: 400 },
    );
  }
  try {
    const result = await resolveTwitchUser(login, {
      clientId: env.TWITCH_CLIENT_ID ?? "",
      clientSecret: env.TWITCH_CLIENT_SECRET ?? "",
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

function handleTwitchStatus(env: ApiEnv): Response {
  const helix = hasHelixCredentials({
    clientId: env.TWITCH_CLIENT_ID ?? "",
    clientSecret: env.TWITCH_CLIENT_SECRET ?? "",
  });
  return jsonResponse({ ready: true, helix });
}

type ConnectMiddleware = {
  use: (
    handler: (
      req: IncomingMessage,
      res: ServerResponse,
      next: () => void,
    ) => void,
  ) => void;
};

function fullPath(req: IncomingMessage): string {
  const raw =
    (req as IncomingMessage & { originalUrl?: string }).originalUrl ??
    req.url ??
    "/";
  try {
    return new URL(raw, "http://localhost").pathname;
  } catch {
    return raw.split("?")[0] ?? "/";
  }
}

function attachApi(
  middlewares: ConnectMiddleware,
  env: ApiEnv,
  store: GraphStore,
): void {
  middlewares.use((req, res, next) => {
    const pathname = fullPath(req);
    if (!pathname.startsWith("/api/")) {
      next();
      return;
    }

    const method = (req.method ?? "GET").toUpperCase();

    void (async () => {
      const needsBody = method !== "GET" && method !== "HEAD";
      const body = needsBody ? await readRequestBody(req) : undefined;
      const request = nodeRequestToFetch(req, body);

      let response: Response | null = null;

      if (
        pathname === "/api/twitch-status" &&
        (method === "GET" || method === "HEAD")
      ) {
        response = handleTwitchStatus(env);
      } else if (
        pathname === "/api/twitch-user" &&
        (method === "GET" || method === "HEAD")
      ) {
        response = await handleTwitchUser(request, env);
      } else if (
        pathname === "/api/me" &&
        (method === "GET" || method === "HEAD")
      ) {
        response = await handleMeGet(request, env);
      } else if (
        pathname === "/api/auth/discord" &&
        (method === "GET" || method === "HEAD")
      ) {
        response = await handleAuthDiscordGet(request, env);
      } else if (
        pathname === "/api/auth/callback" &&
        (method === "GET" || method === "HEAD")
      ) {
        response = await handleAuthCallbackGet(request, env);
      } else if (pathname === "/api/auth/logout" && method === "POST") {
        response = await handleAuthLogoutPost(request, env);
      } else if (
        pathname === "/api/graph" &&
        (method === "GET" || method === "HEAD")
      ) {
        response = await handleGraphGet(store);
      } else if (pathname === "/api/graph/people" && method === "POST") {
        response = await handlePeoplePost(request, store);
      } else if (pathname === "/api/graph/connections" && method === "POST") {
        response = await handleConnectionsPost(request, store);
      } else if (method === "PATCH" || method === "DELETE") {
        const match = pathname.match(/^\/api\/graph\/people\/([^/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]!);
          response =
            method === "PATCH"
              ? await handlePersonPatch(request, store, id)
              : await handlePersonDelete(request, store, id);
        }
      }

      if (!response) {
        next();
        return;
      }
      await writeFetchResponse(res, response);
    })().catch((err) => {
      const message = err instanceof Error ? err.message : "Internal error";
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: message }));
    });
  });
}

/**
 * Local `/api/*` routes for Vite dev + preview.
 * Production uses Cloudflare Pages Functions under `functions/`.
 * Graph mutations persist to `data/graph.json` (gitignored).
 */
export function apiPlugin(env: ApiEnv): Plugin {
  const store = createFileBackedStore();
  return {
    name: "wall-of-shame-api-local",
    configureServer(server) {
      attachApi(server.middlewares, env, store);
    },
    configurePreviewServer(server) {
      attachApi(server.middlewares, env, store);
    },
  };
}
