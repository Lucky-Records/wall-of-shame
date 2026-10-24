# Rollout Member-Login (D1) – Laptop

Dieses Paket enthält alles, um das Member-Login (Cloudflare D1) mit **einem Befehl**
live zu schalten. Es wird über den Browser-Login von Wrangler gearbeitet – auf dem
Laptop muss kein API-Token eingerichtet werden.

## Voraussetzungen

- Node.js **20 oder neuer** (LTS): https://nodejs.org/de/download
- Internetverbindung, Browser für den Cloudflare-Login
- Cloudflare-Login mit Zugriff auf das Konto `6e42bc3ad4404a8177b2569629e98362`

## Start

Ordner entpacken, im Ordner ein Terminal öffnen und:

**Windows (PowerShell):**

```powershell
cd $HOME\Downloads\wos-laptop-rollout
powershell -NoProfile -ExecutionPolicy Bypass -File .\rollout.ps1
```

**macOS / Linux / Git-Bash:**

```bash
cd ~/Downloads/wos-laptop-rollout
bash rollout.sh
```

Probelauf ohne Cloudflare (lokale Datenbank + lokaler Server):
`.\rollout.ps1 -Local` bzw. `bash rollout.sh --local`.

## Was das Skript macht

1. Prüft Node.js ≥ 20 (sonst Abbruch mit Download-Link).
2. `npm ci` (exakte Versionen aus `package-lock.json`).
3. `wrangler whoami` – nur wenn nicht angemeldet: `wrangler login` (Browser).
   Prüft, dass das Konto `6e42…2362` sichtbar ist, und setzt `CLOUDFLARE_ACCOUNT_ID`.
   Eventuell gesetzte `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_API_KEY` werden für den Lauf ignoriert.
4. Legt die D1-Datenbank `wall-of-shame-db` an – existiert sie schon, wird sie wiederverwendet.
   Die ID wird in `wrangler.toml` (`database_id`) eingetragen und in `rollout/d1-id.txt` gespeichert.
5. `wrangler d1 migrations apply wall-of-shame-db --remote` (bereits angewendete Migrationen werden übersprungen).
6. Legt den Admin **Lucky** aus `rollout/seed-admin.sql` an. Die Datei enthält **nur den
   PBKDF2-Hash**, kein Klartext-Passwort. Existiert Lucky schon, bleibt das bestehende
   Passwort unverändert (nur Admin-Recht + aktiv werden sichergestellt). Danach Kontrolle per SELECT.
7. `npm run build` und `wrangler pages deploy dist --project-name=wall-of-shame --branch=main` (Produktion).
8. Smoke-Test der Live-Seite: `/` → Weiterleitung auf `/login`, `/api/graph` → 401,
   `/login` → 200, `POST /api/auth/login` → 400 (beweist, dass D1 gebunden ist; 503 = Bindung fehlt).
9. Gibt am Ende `D1_DATABASE_ID=…` aus. Log-Datei: `rollout-<Datum-Zeit>.log` im Ordner.

Bei jedem Fehler bricht das Skript mit einer deutschen Meldung ab. Es kann gefahrlos
mehrfach gestartet werden (alle Schritte sind idempotent). KV-Graphdaten werden nicht angefasst.

## Nach dem Rollout

- Die ausgegebene `D1_DATABASE_ID` muss in `wrangler.toml` auf `main` committet werden
  (sonst würde ein späterer Deploy mit der Platzhalter-ID die D1-Bindung kaputt machen).
- Login: https://wall-of-shame-889.pages.dev/login – Admin-Seite: `/admin`.

## Hinweis: spätere Deploys von der Box (nur Pages-Token)

- Wrangler 3 schickt die Bindungen aus `wrangler.toml` (KV + D1) beim `pages deploy`
  als Metadaten im Worker-Bundle an die Pages-API. Der Client macht dabei **keinen**
  eigenen D1-API-Aufruf; ein reiner Pages-Token kann den Upload also ausführen.
- Ob die Pages-API serverseitig eine D1-Berechtigung für die gebundene Datenbank verlangt,
  ist **nicht getestet** (dafür wäre ein Live-Deploy nötig). Falls ein Deploy von der Box
  mit „Authentication error“ scheitert: dem Box-Token **Account → D1 → Edit** (mind. Read)
  hinzufügen oder vom Laptop deployen.
- Migrationen (`wrangler d1 migrations apply --remote`) und `d1 execute --remote` brauchen
  in jedem Fall **D1 → Edit**.
- `wrangler.toml` ist für Pages die Quelle der Wahrheit: die echte D1-ID muss deshalb
  im Repo stehen, sonst überschreibt jeder Deploy die Bindung.
