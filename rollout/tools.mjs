#!/usr/bin/env node
/**
 * Helpers for rollout.sh / rollout.ps1 (The Wall of Shame member login).
 * Cross-platform (Windows / macOS / Linux), Node >= 20, no extra packages.
 *
 *   node rollout/tools.mjs whoami                 0 = ok, 2 = not logged in, 3 = account missing
 *   node rollout/tools.mjs ensure-d1              create/reuse D1, patch wrangler.toml, write rollout/d1-id.txt
 *   node rollout/tools.mjs patch-toml <id>        set database_id in wrangler.toml
 *   node rollout/tools.mjs check-toml             sanity-check wrangler.toml bindings
 *   node rollout/tools.mjs check-admin [persistDir]  (with persistDir: local D1, else remote)
 *   node rollout/tools.mjs smoke <baseUrl> [tries]
 *   node rollout/tools.mjs local-smoke <port> <persistDir>
 *
 * Messages are German (for Lucky). Writes everything also to $ROLLOUT_LOG.
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOML = join(ROOT, "wrangler.toml");
const ID_FILE = join(ROOT, "rollout", "d1-id.txt");
const ACCOUNT_ID = "6e42bc3ad4404a8177b2569629e98362";
const KV_ID = "f5589df19cc74053b800376d7f0cad78";
const DB_NAME = "wall-of-shame-db";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(line = "") {
  console.log(line);
  if (process.env.ROLLOUT_LOG) {
    try {
      appendFileSync(process.env.ROLLOUT_LOG, line + "\n");
    } catch {
      /* ignore */
    }
  }
}

function fail(message, code = 1) {
  log("");
  log(`FEHLER: ${message}`);
  process.exit(code);
}

/** Run a shell command (npx works on Windows via cmd.exe), capture output. */
function run(command) {
  const res = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (process.env.ROLLOUT_LOG) {
    try {
      appendFileSync(process.env.ROLLOUT_LOG, `\n$ ${command}\n${out}\n`);
    } catch {
      /* ignore */
    }
  }
  return { status: res.status ?? 1, stdout: res.stdout ?? "", out };
}

function authHint(out) {
  if (/code:\s*10000|Authentication error/i.test(out)) {
    return " (Cloudflare meldet 'Authentication error 10000': diesem Login fehlt die Berechtigung. Mit 'npx wrangler logout' und 'npx wrangler login' neu anmelden und alle Berechtigungen erlauben.)";
  }
  return "";
}

function whoami() {
  const { out } = run("npx wrangler whoami");
  if (/not authenticated|wrangler login/i.test(out) && !/You are logged in/i.test(out)) {
    log("Wrangler ist noch nicht angemeldet.");
    process.exit(2);
  }
  if (!/You are logged in/i.test(out)) {
    log(out.trim());
    fail("'wrangler whoami' lieferte eine unerwartete Antwort (siehe oben).");
  }
  if (!out.includes(ACCOUNT_ID)) {
    log(
      `Angemeldet, aber das Cloudflare-Konto ${ACCOUNT_ID} ist mit diesem Login nicht sichtbar.`,
    );
    process.exit(3);
  }
  const email = out.match(/associated with the email ([^\s.]+@[^\s]+?)\.?\s/i)?.[1];
  log(`Wrangler angemeldet${email ? ` (${email})` : ""}, Konto ${ACCOUNT_ID} ist erreichbar.`);
}

function parseJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function listDatabases() {
  const res = run("npx wrangler d1 list --json");
  const list = parseJsonArray(res.stdout);
  if (res.status !== 0 || !Array.isArray(list)) {
    log(res.out.trim());
    fail(`D1-Datenbanken konnten nicht gelesen werden.${authHint(res.out)}`);
  }
  return list;
}

function findDb(list) {
  const db = list.find((d) => d && d.name === DB_NAME);
  return db ? String(db.uuid ?? db.id ?? "") : null;
}

function readToml() {
  return readFileSync(TOML, "utf8");
}

function checkToml(text = readToml(), { requireRealId = false } = {}) {
  const problems = [];
  if (!/^pages_build_output_dir\s*=\s*"dist"/m.test(text)) problems.push("pages_build_output_dir fehlt");
  if (!/^name\s*=\s*"wall-of-shame"/m.test(text)) problems.push('name = "wall-of-shame" fehlt');
  if (!text.includes(`id = "${KV_ID}"`)) problems.push(`KV-Binding GRAPH_KV (${KV_ID}) fehlt/verändert`);
  if (!/binding\s*=\s*"GRAPH_KV"/.test(text)) problems.push("KV-Binding GRAPH_KV fehlt");
  if (!/\[\[d1_databases\]\][\s\S]*binding\s*=\s*"DB"/.test(text)) problems.push("D1-Binding DB fehlt");
  const id = text.match(/^database_id\s*=\s*"([^"]*)"/m)?.[1] ?? "";
  if (!UUID_RE.test(id)) problems.push(`database_id ist keine gültige ID (${id || "leer"})`);
  if (requireRealId && /^0{8}-/.test(id)) problems.push("database_id ist noch der Platzhalter");
  if (problems.length) fail(`wrangler.toml ist nicht in Ordnung: ${problems.join("; ")}.`);
  return id;
}

function patchToml(id) {
  if (!UUID_RE.test(id)) fail(`Ungültige D1-ID: ${id}`);
  const before = readToml();
  const after = before.replace(
    /^database_id\s*=\s*"[^"]*".*$/m,
    `database_id = "${id}"`,
  );
  if (!/^database_id\s*=/m.test(before)) fail("In wrangler.toml fehlt die Zeile database_id.");
  checkToml(after);
  writeFileSync(TOML, after);
  log(`wrangler.toml: database_id = ${id} (KV-Binding unverändert ${KV_ID}).`);
}

function ensureD1() {
  let id = findDb(listDatabases());
  if (id) {
    log(`D1-Datenbank '${DB_NAME}' existiert bereits: ${id}`);
  } else {
    log(`D1-Datenbank '${DB_NAME}' wird erstellt …`);
    const res = run(`npx wrangler d1 create ${DB_NAME}`);
    if (res.status !== 0) {
      log(res.out.trim());
      fail(`D1-Datenbank konnte nicht erstellt werden.${authHint(res.out)}`);
    }
    id = findDb(listDatabases());
    if (!id) fail("D1-Datenbank wurde angeblich erstellt, ist aber nicht in der Liste.");
    log(`D1-Datenbank erstellt: ${id}`);
  }
  patchToml(id);
  writeFileSync(ID_FILE, id + "\n");
  log(`D1_ID=${id}`);
}

function checkAdmin(persistDir) {
  const where = persistDir ? `--local --persist-to "${persistDir}"` : "--remote";
  const res = run(
    `npx wrangler d1 execute ${DB_NAME} ${where} --yes --json --command "SELECT username, is_admin, disabled FROM members WHERE is_admin = 1"`,
  );
  const parsed = parseJsonArray(res.stdout);
  const rows = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : null;
  if (res.status !== 0 || !Array.isArray(rows)) {
    log(res.out.trim());
    fail(`Admin-Konten konnten nicht gelesen werden.${authHint(res.out)}`);
  }
  log(`Admin-Konten: ${rows.map((r) => `${r.username}${r.disabled ? " (deaktiviert)" : ""}`).join(", ") || "(keine)"}`);
  if (!rows.some((r) => String(r.username).toLowerCase() === "lucky" && !r.disabled)) {
    fail("Der Admin 'Lucky' fehlt oder ist deaktiviert.");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function smokeOnce(base) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });
  const root = await fetch(`${base}/`, { redirect: "manual" });
  const loc = root.headers.get("location") ?? "";
  const target = loc ? new URL(loc, base).pathname : "";
  check(
    "GET /  → Weiterleitung auf /login",
    root.status >= 300 && root.status < 400 && target === "/login",
    `${root.status} ${loc}`,
  );
  const graph = await fetch(`${base}/api/graph`, { redirect: "manual" });
  check("GET /api/graph → 401", graph.status === 401, String(graph.status));
  const login = await fetch(`${base}/login`, { redirect: "manual" });
  const html = await login.text();
  check("GET /login → 200 Login-Seite", login.status === 200 && html.includes('id="root"'), String(login.status));
  const post = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  check(
    "POST /api/auth/login (leer) → 400 (D1 verbunden)",
    post.status === 400,
    post.status === 503 ? "503 – D1-Binding fehlt!" : String(post.status),
  );
  return results;
}

async function smoke(base, tries = 12) {
  base = base.replace(/\/+$/, "");
  log(`Smoke-Test gegen ${base}`);
  let last = [];
  for (let i = 1; i <= tries; i++) {
    try {
      last = await smokeOnce(base);
    } catch (err) {
      last = [{ name: "Verbindung", ok: false, detail: String(err?.message ?? err) }];
    }
    if (last.every((r) => r.ok)) break;
    if (i < tries) {
      log(`  noch nicht bereit (Versuch ${i}/${tries}), warte 10 s …`);
      await sleep(10_000);
    }
  }
  for (const r of last) log(`  ${r.ok ? "OK  " : "FAIL"} ${r.name}  [${r.detail}]`);
  if (!last.every((r) => r.ok)) fail("Smoke-Test fehlgeschlagen (siehe oben).");
  log("Smoke-Test bestanden.");
}

async function localSmoke(port, persistDir) {
  const base = `http://127.0.0.1:${port}`;
  const cmd = `npx wrangler pages dev dist --ip 127.0.0.1 --port ${port} --persist-to "${persistDir}"`;
  log(`Starte lokalen Server: ${cmd}`);
  const child = spawn(cmd, {
    cwd: ROOT,
    shell: true,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const sink = (d) => {
    if (process.env.ROLLOUT_LOG) appendFileSync(process.env.ROLLOUT_LOG, d);
  };
  child.stdout.on("data", sink);
  child.stderr.on("data", sink);
  const stop = () => {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      /* already gone */
    }
  };
  try {
    let ready = false;
    for (let i = 0; i < 90 && !ready; i++) {
      await sleep(1000);
      try {
        const r = await fetch(`${base}/login`, { redirect: "manual" });
        ready = r.status === 200;
      } catch {
        /* not up yet */
      }
    }
    if (!ready) fail("Lokaler Server ist nicht gestartet (siehe Log).");
    await smoke(base, 1);
  } finally {
    stop();
  }
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "whoami":
    whoami();
    break;
  case "ensure-d1":
    ensureD1();
    break;
  case "patch-toml":
    patchToml(args[0] ?? "");
    break;
  case "check-toml":
    log(`wrangler.toml ok, database_id = ${checkToml(readToml(), { requireRealId: args[0] === "--real" })}`);
    break;
  case "check-admin":
    checkAdmin(args[0]);
    break;
  case "smoke":
    await smoke(args[0] ?? "", Number(args[1] ?? 12));
    break;
  case "local-smoke":
    await localSmoke(Number(args[0] ?? 8789), args[1] ?? ".wrangler/rollout-local");
    break;
  default:
    fail(`Unbekannter Befehl: ${cmd ?? "(keiner)"}`);
}
