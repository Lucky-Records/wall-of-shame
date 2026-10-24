/**
 * Member auth for The Wall of Shame (Cloudflare D1 + WebCrypto).
 *
 * - Passwords: PBKDF2-SHA256, 100 000 iterations (Workers maximum), 16-byte
 *   random salt, stored as `pbkdf2$<iter>$<saltB64>$<hashB64>`.
 * - Sessions: random 32-byte token in an HttpOnly cookie; only its SHA-256
 *   hash is stored in D1.
 */

export type D1Result<T> = { results: T[] };
export type D1Prepared = {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
};
export type D1Like = {
  prepare(sql: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<unknown[]>;
};

export type AuthEnv = { DB?: D1Like };

export type Member = {
  id: number;
  username: string;
  display_name: string | null;
  is_admin: number;
  disabled: number;
  created_at: number;
  last_login_at: number | null;
  last_seen_at: number | null;
};

export type SessionMember = Member & { token_hash: string; expires_at: number };

export const SESSION_COOKIE = "wos_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SEEN_THROTTLE_MS = 60 * 1000;
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MAX_PER_USER = 5;
export const LOCKOUT_MAX_PER_IP = 20;

const PBKDF2_ITERATIONS = 100_000;
const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) {
    return false;
  }
  const salt = fromB64(parts[2]!);
  const expected = fromB64(parts[3]!);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** Burn comparable CPU time for unknown usernames (no user enumeration by timing). */
export async function dummyVerify(password: string): Promise<void> {
  await pbkdf2(password, new Uint8Array(16), PBKDF2_ITERATIONS);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return toHex(new Uint8Array(digest));
}

export function randomToken(bytes = 32): string {
  return toB64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    null
  );
}

export function userAgent(request: Request): string | null {
  const ua = request.headers.get("User-Agent");
  return ua ? ua.slice(0, 300) : null;
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      const value = part.slice(idx + 1).trim();
      return value || null;
    }
  }
  return null;
}

const MEMBER_COLUMNS =
  "m.id, m.username, m.display_name, m.is_admin, m.disabled, m.created_at, m.last_login_at, m.last_seen_at";

export async function getSessionMember(
  db: D1Like,
  token: string,
): Promise<SessionMember | null> {
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT ${MEMBER_COLUMNS}, s.token_hash, s.expires_at
         FROM sessions s JOIN members m ON m.id = s.member_id
        WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND m.disabled = 0`,
    )
    .bind(tokenHash, Date.now())
    .first<SessionMember>();
  return row ?? null;
}

export async function createSession(
  db: D1Like,
  memberId: number,
  request: Request,
): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO sessions (token_hash, member_id, created_at, expires_at, ip, user_agent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(
        await sha256Hex(token),
        memberId,
        now,
        now + SESSION_TTL_MS,
        clientIp(request),
        userAgent(request),
      ),
    db
      .prepare("UPDATE members SET last_login_at = ?1, last_seen_at = ?1 WHERE id = ?2")
      .bind(now, memberId),
    // Opportunistic cleanup of expired sessions.
    db.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(now),
  ]);
  return token;
}

export async function touchLastSeen(
  db: D1Like,
  member: Member,
): Promise<void> {
  const now = Date.now();
  if (member.last_seen_at && now - member.last_seen_at < SEEN_THROTTLE_MS) {
    return;
  }
  await db
    .prepare(
      "UPDATE members SET last_seen_at = ?1 WHERE id = ?2 AND (last_seen_at IS NULL OR last_seen_at < ?3)",
    )
    .bind(now, member.id, now - SEEN_THROTTLE_MS)
    .run();
}

export function publicMember(m: Member, now = Date.now()) {
  return {
    id: m.id,
    username: m.username,
    displayName: m.display_name,
    isAdmin: m.is_admin === 1,
    disabled: m.disabled === 1,
    createdAt: m.created_at,
    lastLoginAt: m.last_login_at,
    lastSeenAt: m.last_seen_at,
    online:
      m.disabled !== 1 &&
      !!m.last_seen_at &&
      now - m.last_seen_at <= ONLINE_WINDOW_MS,
  };
}

export const USERNAME_RE = /^[A-Za-z0-9_.-]{2,32}$/;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
