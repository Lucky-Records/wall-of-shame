import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  USERNAME_RE,
  hashPassword,
  publicMember,
  type AuthEnv,
  type D1Like,
  type Member,
  type SessionMember,
} from "./auth.ts";
import { jsonResponse, readJsonBody } from "./http.ts";

export type AdminCtx = {
  request: Request;
  env: AuthEnv;
  data: { member?: SessionMember };
  params?: Record<string, string | string[]>;
};

const MEMBER_SELECT =
  "SELECT id, username, display_name, is_admin, disabled, created_at, last_login_at, last_seen_at FROM members";

export function requireAdmin(
  ctx: AdminCtx,
): { db: D1Like; me: SessionMember } | Response {
  const me = ctx.data.member;
  if (!me) {
    return jsonResponse({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }
  if (me.is_admin !== 1) {
    return jsonResponse({ ok: false, error: "Nur für Admins." }, { status: 403 });
  }
  if (!ctx.env.DB) {
    return jsonResponse(
      { ok: false, error: "Datenbank nicht konfiguriert." },
      { status: 503 },
    );
  }
  return { db: ctx.env.DB, me };
}

function bad(error: string, status = 400): Response {
  return jsonResponse({ ok: false, error }, { status });
}

function checkPassword(pw: unknown): string | null {
  if (typeof pw !== "string") return "Passwort fehlt.";
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`;
  }
  if (pw.length > MAX_PASSWORD_LENGTH) return "Passwort ist zu lang.";
  return null;
}

export async function listMembers(db: D1Like): Promise<Response> {
  const { results } = await db
    .prepare(`${MEMBER_SELECT} ORDER BY username COLLATE NOCASE`)
    .all<Member>();
  const now = Date.now();
  return jsonResponse({
    ok: true,
    now,
    members: results.map((m) => publicMember(m, now)),
  });
}

export async function createMember(
  db: D1Like,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody<{
    username?: unknown;
    password?: unknown;
    displayName?: unknown;
    isAdmin?: unknown;
  }>(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!USERNAME_RE.test(username)) {
    return bad(
      "Benutzername: 2–32 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.",
    );
  }
  const pwError = checkPassword(body?.password);
  if (pwError) return bad(pwError);
  const displayName =
    typeof body?.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim().slice(0, 64)
      : null;
  const exists = await db
    .prepare("SELECT id FROM members WHERE username = ?1 COLLATE NOCASE")
    .bind(username)
    .first<{ id: number }>();
  if (exists) return bad("Benutzername ist bereits vergeben.", 409);

  const hash = await hashPassword(body!.password as string);
  const res = await db
    .prepare(
      "INSERT INTO members (username, password_hash, display_name, is_admin, disabled, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)",
    )
    .bind(username, hash, displayName, body?.isAdmin === true ? 1 : 0, Date.now())
    .run();
  const id = res.meta?.last_row_id;
  const row = await db
    .prepare(`${MEMBER_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Member>();
  return jsonResponse(
    { ok: true, member: row ? publicMember(row) : null },
    { status: 201 },
  );
}

function parseId(ctx: AdminCtx): number | null {
  const raw = ctx.params?.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function adminCount(db: D1Like): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM members WHERE is_admin = 1 AND disabled = 0")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function updateMember(
  ctx: AdminCtx,
  db: D1Like,
  me: SessionMember,
): Promise<Response> {
  const id = parseId(ctx);
  if (!id) return bad("Ungültige ID.");
  const target = await db
    .prepare(`${MEMBER_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Member>();
  if (!target) return bad("Member nicht gefunden.", 404);

  const body = await readJsonBody<{
    password?: unknown;
    disabled?: unknown;
    isAdmin?: unknown;
    displayName?: unknown;
  }>(ctx.request);
  if (!body) return bad("Ungültige Anfrage.");

  const statements = [];
  let revokeSessions = false;

  if (body.password !== undefined) {
    const pwError = checkPassword(body.password);
    if (pwError) return bad(pwError);
    statements.push(
      db
        .prepare("UPDATE members SET password_hash = ?1 WHERE id = ?2")
        .bind(await hashPassword(body.password as string), id),
    );
    revokeSessions = true;
  }
  if (typeof body.disabled === "boolean") {
    if (body.disabled && id === me.id) {
      return bad("Du kannst dich nicht selbst deaktivieren.");
    }
    if (body.disabled && target.is_admin === 1 && (await adminCount(db)) <= 1) {
      return bad("Der letzte aktive Admin kann nicht deaktiviert werden.");
    }
    statements.push(
      db
        .prepare("UPDATE members SET disabled = ?1 WHERE id = ?2")
        .bind(body.disabled ? 1 : 0, id),
    );
    if (body.disabled) revokeSessions = true;
  }
  if (typeof body.isAdmin === "boolean") {
    if (!body.isAdmin && id === me.id) {
      return bad("Du kannst dir die Admin-Rechte nicht selbst entziehen.");
    }
    statements.push(
      db
        .prepare("UPDATE members SET is_admin = ?1 WHERE id = ?2")
        .bind(body.isAdmin ? 1 : 0, id),
    );
  }
  if (body.displayName !== undefined) {
    const dn =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim().slice(0, 64)
        : null;
    statements.push(
      db.prepare("UPDATE members SET display_name = ?1 WHERE id = ?2").bind(dn, id),
    );
  }
  if (!statements.length) return bad("Keine Änderung angegeben.");
  if (revokeSessions) {
    statements.push(
      db.prepare("DELETE FROM sessions WHERE member_id = ?1").bind(id),
    );
  }
  await db.batch(statements);
  const row = await db
    .prepare(`${MEMBER_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Member>();
  return jsonResponse({ ok: true, member: row ? publicMember(row) : null });
}

export async function deleteMember(
  ctx: AdminCtx,
  db: D1Like,
  me: SessionMember,
): Promise<Response> {
  const id = parseId(ctx);
  if (!id) return bad("Ungültige ID.");
  if (id === me.id) return bad("Du kannst dich nicht selbst löschen.");
  const target = await db
    .prepare(`${MEMBER_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Member>();
  if (!target) return bad("Member nicht gefunden.", 404);
  if (target.is_admin === 1 && (await adminCount(db)) <= 1) {
    return bad("Der letzte aktive Admin kann nicht gelöscht werden.");
  }
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE member_id = ?1").bind(id),
    db.prepare("UPDATE login_events SET member_id = NULL WHERE member_id = ?1").bind(id),
    db.prepare("DELETE FROM members WHERE id = ?1").bind(id),
  ]);
  return jsonResponse({ ok: true });
}

export async function listLogins(db: D1Like, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit")) || 200),
  );
  const { results } = await db
    .prepare(
      `SELECT e.id, e.member_id, e.username, e.at, e.ip, e.user_agent, e.success,
              m.display_name
         FROM login_events e LEFT JOIN members m ON m.id = e.member_id
        ORDER BY e.at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<{
      id: number;
      member_id: number | null;
      username: string;
      at: number;
      ip: string | null;
      user_agent: string | null;
      success: number;
      display_name: string | null;
    }>();
  return jsonResponse({
    ok: true,
    events: results.map((e) => ({
      id: e.id,
      memberId: e.member_id,
      username: e.username,
      displayName: e.display_name,
      at: e.at,
      ip: e.ip,
      userAgent: e.user_agent,
      success: e.success === 1,
    })),
  });
}
