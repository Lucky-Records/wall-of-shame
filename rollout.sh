#!/usr/bin/env bash
# The Wall of Shame – Rollout Member-Login (D1 + Pages) für macOS/Linux/Git-Bash.
#
#   bash rollout.sh           echter Rollout (Cloudflare, Produktion)
#   bash rollout.sh --local   Probelauf nur lokal (lokale D1 + wrangler pages dev)
#
# Bricht bei jedem Fehler mit einer deutschen Meldung ab. Log: rollout-<Zeit>.log
set -Eeuo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"
MODE="remote"
case "${1:-}" in
  --local) MODE="local" ;;
  "") ;;
  *) echo "Unbekannte Option: $1 (erlaubt: --local)"; exit 1 ;;
esac

ACCOUNT_ID="6e42bc3ad4404a8177b2569629e98362"
DB_NAME="wall-of-shame-db"
PROJECT="wall-of-shame"
PROD_URL="https://wall-of-shame-889.pages.dev"
LOCAL_FAKE_ID="11111111-2222-4333-8444-555555555555"
LOCAL_PERSIST=".wrangler/rollout-local"
LOG="$ROOT/rollout-$(date +%Y%m%d-%H%M%S).log"
export ROLLOUT_LOG="$LOG"
export WRANGLER_SEND_METRICS=false

exec > >(tee -a "$LOG") 2>&1

fail() {
  echo
  echo "FEHLER: $*"
  echo "Abgebrochen. Details stehen im Log: $LOG"
  exit 1
}
trap 'fail "Unerwarteter Abbruch in Zeile $LINENO (Befehl: $BASH_COMMAND)."' ERR
step() { echo; echo "==> $*"; }

echo "The Wall of Shame – Rollout Member-Login ($MODE) – $(date)"
echo "Ordner: $ROOT"

# 1) Node.js >= 20
step "Node.js prüfen"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js ist nicht installiert. Bitte Node.js 20 LTS oder neuer installieren: https://nodejs.org/de/download – danach das Terminal neu öffnen und das Skript erneut starten."
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js $(node -v) ist zu alt. Benötigt wird Version 20 oder neuer: https://nodejs.org/de/download"
fi
command -v npm >/dev/null 2>&1 || fail "npm wurde nicht gefunden (gehört zu Node.js): https://nodejs.org/de/download"
echo "Node.js $(node -v), npm $(npm -v)"

[ -f rollout/seed-admin.sql ] || fail "rollout/seed-admin.sql fehlt – das Bundle ist unvollständig."
node rollout/tools.mjs check-toml >/dev/null || fail "wrangler.toml ist ungültig."

# 2) Abhängigkeiten
step "Abhängigkeiten installieren (npm ci)"
npm ci --no-audit --no-fund || fail "npm ci ist fehlgeschlagen (Internetverbindung? Siehe Log)."

if [ "$MODE" = "local" ]; then
  # ---------- Probelauf: alles lokal, nichts bei Cloudflare ----------
  cp wrangler.toml wrangler.toml.rollout-backup
  restore_toml() { [ -f wrangler.toml.rollout-backup ] && mv -f wrangler.toml.rollout-backup wrangler.toml; }
  trap restore_toml EXIT
  rm -rf "$LOCAL_PERSIST"

  step "wrangler.toml testweise mit Dummy-ID patchen"
  node rollout/tools.mjs patch-toml "$LOCAL_FAKE_ID" || fail "wrangler.toml konnte nicht gepatcht werden."

  step "Migrationen lokal anwenden"
  npx wrangler d1 migrations apply "$DB_NAME" --local --persist-to "$LOCAL_PERSIST" \
    || fail "Lokale Migration fehlgeschlagen."

  step "Admin lokal anlegen (nur Passwort-Hash)"
  npx wrangler d1 execute "$DB_NAME" --local --persist-to "$LOCAL_PERSIST" --yes --file rollout/seed-admin.sql \
    || fail "Lokales Anlegen des Admins fehlgeschlagen."
  node rollout/tools.mjs check-admin "$LOCAL_PERSIST" || fail "Lokale Kontrolle fehlgeschlagen."

  step "Build"
  npm run build || fail "Build fehlgeschlagen."

  step "Lokaler Smoke-Test (wrangler pages dev)"
  node rollout/tools.mjs local-smoke 8789 "$LOCAL_PERSIST" || fail "Lokaler Smoke-Test fehlgeschlagen."

  echo
  echo "Probelauf erfolgreich. Es wurde nichts bei Cloudflare verändert."
  echo "Log: $LOG"
  exit 0
fi

# ---------- Echter Rollout ----------
# OAuth-Login verwenden, nicht eventuell gesetzte API-Tokens
if [ -n "${CLOUDFLARE_API_TOKEN:-}${CLOUDFLARE_API_KEY:-}" ]; then
  echo "Hinweis: CLOUDFLARE_API_TOKEN/KEY ist gesetzt – wird für diesen Lauf ignoriert (Browser-Login wird verwendet)."
fi
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

# 3) Login
step "Cloudflare-Login prüfen"
RC=0
node rollout/tools.mjs whoami || RC=$?
if [ "$RC" -eq 2 ]; then
  echo "Browser öffnet sich gleich – bitte bei Cloudflare anmelden und auf 'Allow' klicken."
  npx wrangler login || fail "wrangler login ist fehlgeschlagen oder wurde abgebrochen."
  RC=0
  node rollout/tools.mjs whoami || RC=$?
fi
case "$RC" in
  0) ;;
  2) fail "Nach dem Login ist Wrangler immer noch nicht angemeldet." ;;
  3) fail "Mit diesem Cloudflare-Login ist das Konto $ACCOUNT_ID nicht erreichbar. Mit 'npx wrangler logout' abmelden und mit dem richtigen Konto neu anmelden." ;;
  *) fail "Login-Prüfung fehlgeschlagen." ;;
esac

# 4) D1 anlegen / wiederverwenden
step "D1-Datenbank '$DB_NAME' anlegen oder wiederverwenden"
node rollout/tools.mjs ensure-d1 || fail "D1-Datenbank konnte nicht eingerichtet werden."
D1_ID="$(tr -d '[:space:]' < rollout/d1-id.txt)"
node rollout/tools.mjs check-toml --real || fail "wrangler.toml ist nach dem Patchen ungültig."

# 5) Migrationen
step "Migrationen auf Cloudflare anwenden"
npx wrangler d1 migrations apply "$DB_NAME" --remote || fail "Migrationen fehlgeschlagen."

# 6) Admin
step "Admin 'Lucky' anlegen (nur Passwort-Hash, bestehendes Passwort bleibt)"
npx wrangler d1 execute "$DB_NAME" --remote --yes --file rollout/seed-admin.sql \
  || fail "Admin konnte nicht angelegt werden."
node rollout/tools.mjs check-admin || fail "Kontrolle der Admin-Konten fehlgeschlagen."

# 7) Build + Deploy
step "Build"
npm run build || fail "Build fehlgeschlagen."

step "Deploy auf Cloudflare Pages (Produktion, Branch main)"
npx wrangler pages deploy dist --project-name="$PROJECT" --branch=main \
  --commit-message=member-login-rollout --commit-dirty=true \
  || fail "Deploy fehlgeschlagen."

# 8) Smoke-Test
step "Smoke-Test Live-Seite"
node rollout/tools.mjs smoke "$PROD_URL" 12 || fail "Smoke-Test der Live-Seite fehlgeschlagen."

echo
echo "============================================================"
echo " Rollout erfolgreich."
echo " Seite:  $PROD_URL  (Login: $PROD_URL/login, Admin: $PROD_URL/admin)"
echo " D1-Datenbank: $DB_NAME"
echo " D1_DATABASE_ID=$D1_ID"
echo " Log: $LOG"
echo "============================================================"
