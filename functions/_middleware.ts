/**
 * Gate for the whole site: only the login page (+ its static assets) and the
 * login API are public. Everything else requires a valid member session.
 */
import {
  clearSessionCookie,
  getSessionMember,
  readSessionToken,
  touchLastSeen,
  type AuthEnv,
  type SessionMember,
} from "./_lib/auth";
import { jsonResponse, redirectResponse } from "./_lib/http";

type Ctx = {
  request: Request;
  env: AuthEnv;
  next: () => Promise<Response>;
  data: Record<string, unknown>;
  waitUntil: (p: Promise<unknown>) => void;
};

const PUBLIC_EXACT = new Set([
  "/login",
  "/login/",
  "/login.html",
  "/favicon.svg",
  "/robots.txt",
  "/api/auth/login",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  // Hashed build output (JS/CSS chunks). Contains code only, never graph data.
  return pathname.startsWith("/assets/");
}

function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname === "/admin/" ||
    pathname === "/admin.html" ||
    pathname.startsWith("/api/admin/")
  );
}

function isLoginPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/login/" || pathname === "/login.html";
}

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  if (isLoginPage(new URL(raw, "https://x").pathname)) return "/";
  return raw;
}

function withSecurityHeaders(res: Response, isPrivate: boolean): Response {
  const out = new Response(res.body, res);
  out.headers.set("X-Frame-Options", "DENY");
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "same-origin");
  if (isPrivate) out.headers.set("Cache-Control", "private, no-store");
  return out;
}

function sameOriginOk(request: Request, url: URL): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = request.headers.get("Origin");
  if (!origin) return true; // non-browser clients; cookie is SameSite=Lax anyway
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const { pathname } = url;
  const isApi = pathname.startsWith("/api/");

  if (!sameOriginOk(request, url)) {
    return jsonResponse({ ok: false, error: "Ungültige Herkunft." }, { status: 403 });
  }

  const db = env.DB;
  const token = readSessionToken(request);
  let member: SessionMember | null = null;
  if (db && token) {
    member = await getSessionMember(db, token);
  }

  if (isPublic(pathname)) {
    // Already logged in → skip the login form.
    if (member && isLoginPage(pathname)) {
      return redirectResponse(safeNext(url.searchParams.get("next")));
    }
    const res = await ctx.next();
    return withSecurityHeaders(res, isLoginPage(pathname));
  }

  if (!db) {
    return isApi
      ? jsonResponse(
          { ok: false, error: "Datenbank nicht konfiguriert." },
          { status: 503 },
        )
      : new Response("Datenbank nicht konfiguriert.", { status: 503 });
  }

  if (!member) {
    const headers: Record<string, string> = {};
    if (token) headers["Set-Cookie"] = clearSessionCookie();
    if (isApi) {
      return jsonResponse(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401, headers },
      );
    }
    const next = pathname + url.search;
    const target =
      next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    return redirectResponse(target, { headers });
  }

  if (isAdminPath(pathname) && member.is_admin !== 1) {
    return isApi
      ? jsonResponse({ ok: false, error: "Nur für Admins." }, { status: 403 })
      : redirectResponse("/");
  }

  ctx.data.member = member;
  ctx.waitUntil(touchLastSeen(db, member).catch(() => undefined));

  const res = await ctx.next();
  return withSecurityHeaders(res, true);
}
