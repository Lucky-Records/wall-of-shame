import {
  LOCKOUT_MAX_PER_IP,
  LOCKOUT_MAX_PER_USER,
  LOCKOUT_WINDOW_MS,
  MAX_PASSWORD_LENGTH,
  SESSION_TTL_MS,
  clientIp,
  createSession,
  dummyVerify,
  publicMember,
  sessionCookie,
  userAgent,
  verifyPassword,
  type AuthEnv,
  type Member,
} from "../../_lib/auth";
import { jsonResponse, readJsonBody } from "../../_lib/http";

type Body = { username?: unknown; password?: unknown };

export async function onRequestPost(context: {
  request: Request;
  env: AuthEnv;
}): Promise<Response> {
  const { request, env } = context;
  const db = env.DB;
  if (!db) {
    return jsonResponse(
      { ok: false, error: "Datenbank nicht konfiguriert." },
      { status: 503 },
    );
  }
  const body = await readJsonBody<Body>(request);
  const username =
    typeof body?.username === "string" ? body.username.trim().slice(0, 64) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password || password.length > MAX_PASSWORD_LENGTH) {
    return jsonResponse(
      { ok: false, error: "Benutzername und Passwort angeben." },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const ua = userAgent(request);
  const now = Date.now();
  const since = now - LOCKOUT_WINDOW_MS;

  const [userFails, ipFails] = await Promise.all([
    // Per username *and* IP, so a stranger cannot lock the real member out
    // from elsewhere; the per-IP cap below limits spraying across usernames.
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM login_events WHERE username = ?1 COLLATE NOCASE AND ip IS ?2 AND success = 0 AND at > ?3",
      )
      .bind(username, ip, since)
      .first<{ n: number }>(),
    ip
      ? db
          .prepare(
            "SELECT COUNT(*) AS n FROM login_events WHERE ip = ?1 AND success = 0 AND at > ?2",
          )
          .bind(ip, since)
          .first<{ n: number }>()
      : Promise.resolve({ n: 0 }),
  ]);

  const logEvent = (memberId: number | null, success: boolean) =>
    db
      .prepare(
        "INSERT INTO login_events (member_id, username, at, ip, user_agent, success) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .bind(memberId, username, Date.now(), ip, ua, success ? 1 : 0)
      .run();

  if (
    (userFails?.n ?? 0) >= LOCKOUT_MAX_PER_USER ||
    (ipFails?.n ?? 0) >= LOCKOUT_MAX_PER_IP
  ) {
    await logEvent(null, false);
    return jsonResponse(
      {
        ok: false,
        error: "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.",
      },
      { status: 429 },
    );
  }

  const row = await db
    .prepare(
      "SELECT id, username, display_name, is_admin, disabled, created_at, last_login_at, last_seen_at, password_hash FROM members WHERE username = ?1 COLLATE NOCASE",
    )
    .bind(username)
    .first<Member & { password_hash: string }>();

  let ok = false;
  if (row) {
    ok = await verifyPassword(password, row.password_hash);
  } else {
    await dummyVerify(password);
  }
  if (!row || !ok || row.disabled === 1) {
    await logEvent(row?.id ?? null, false);
    return jsonResponse(
      {
        ok: false,
        error:
          row && ok && row.disabled === 1
            ? "Dieses Konto ist deaktiviert."
            : "Benutzername oder Passwort falsch.",
      },
      { status: 401 },
    );
  }

  const token = await createSession(db, row.id, request);
  await logEvent(row.id, true);
  const member: Member = {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    is_admin: row.is_admin,
    disabled: row.disabled,
    created_at: row.created_at,
    last_login_at: now,
    last_seen_at: now,
  };
  return jsonResponse(
    { ok: true, member: publicMember(member) },
    {
      headers: {
        "Set-Cookie": sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
      },
    },
  );
}
