#!/usr/bin/env node
/**
 * Prints an idempotent SQL upsert for the bootstrap admin, using the same
 * PBKDF2-SHA256 format as functions/_lib/auth.ts. Reads the credentials from
 * the environment (never from the repo) and never prints the password itself.
 *
 *   set -a; . /path/to/wall-of-shame-admin.env; set +a
 *   node scripts/seed-admin.mjs > /tmp/seed-admin.sql
 *   npx wrangler d1 execute wall-of-shame-db --remote --file /tmp/seed-admin.sql
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

const user = process.env.WALL_OF_SHAME_ADMIN_USER;
const password = process.env.WALL_OF_SHAME_ADMIN_PASSWORD;
if (!user || !password) {
  console.error("WALL_OF_SHAME_ADMIN_USER / WALL_OF_SHAME_ADMIN_PASSWORD missing");
  process.exit(1);
}
if (!/^[A-Za-z0-9_.-]{2,32}$/.test(user)) {
  console.error("Invalid username");
  process.exit(1);
}
const iterations = 100000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const stored = `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
const now = Date.now();
process.stdout.write(
  `INSERT INTO members (username, password_hash, is_admin, disabled, created_at)
VALUES ('${user}', '${stored}', 1, 0, ${now})
ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, is_admin = 1, disabled = 0;
`,
);
