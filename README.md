# The Wall of Shame

Interactive community network map for Discord — built for **Lucky**.

Nodes are people (with avatar + name). Edges are connections between them.
Anyone can **view** the graph. **Editing** (add people, change categories, draw
connections) requires Discord sign-in **and** a configured guild role.

## Features

- Force-directed graph UI (sigma.js + graphology), Gephi-style
- Categories: **Streamer**, **Mod**, **Bubble** (color legend + filters)
- Add a person by pasting a Twitch or X/Twitter profile URL
- Real profile ingest:
  - **Twitch** → Helix `GET /users?login=` via Client Credentials (`/api/twitch-user`)
  - **X/Twitter** → public FxTwitter profile API + [unavatar.io](https://unavatar.io) avatar fallback (no paid X API key)
- Draw connections between people (click two nodes, or use the sidebar)
- **Discord OAuth** (`identify` + `guilds` + `guilds.members.read`) with server-side role check
- Public read of `/api/graph`; mutating routes require an editor session
- Dark public-facing board UI
- Demo-mode banner when Twitch credentials are missing/mismatched

## Stack

- Vite + React + TypeScript
- [sigma.js](https://www.sigmajs.org/) + [graphology](https://graphology.github.io/)
- `@sigma/node-image` for circular avatar nodes
- Cloudflare Pages Functions (`functions/api/*`) for OAuth, sessions, Twitch, and graph APIs
- Local Vite middleware (`vite-plugin-api.ts`) mirrors those routes in `npm run dev` / `preview`
- Graph MVP store: local `data/graph.json` (dev) / in-memory seed on Cloudflare (KV TODO)

## Environment

Copy `.env.example` to `.env` (never commit `.env`):

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `TWITCH_CLIENT_ID` | Twitch application Client ID |
| `TWITCH_CLIENT_SECRET` | Twitch application Client Secret (server only) |
| `DISCORD_CLIENT_ID` | Discord application Client ID |
| `DISCORD_CLIENT_SECRET` | Discord application Client Secret (server only) |
| `DISCORD_BOT_TOKEN` | Optional bot token fallback for guild member lookup |
| `DISCORD_GUILD_ID` | Discord server (guild) snowflake to check membership in |
| `DISCORD_EDITOR_ROLE_ID` | Role snowflake required to edit |
| `SESSION_SECRET` | HMAC secret for signed session cookies |
| `APP_ORIGIN` | Public origin used to build OAuth `redirect_uri` (e.g. `http://localhost:5173`) |

### Discord Developer Portal setup

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **OAuth2 → General** → copy **Client ID** and reset/copy **Client Secret**.
3. **OAuth2 → Redirects** → add:
   - Local: `http://localhost:5173/api/auth/callback`
   - Production: `https://YOUR_DOMAIN/api/auth/callback`
4. Scopes used by this app: `identify`, `guilds`, `guilds.members.read`.
5. Put Client ID / Secret / `SESSION_SECRET` in `.env` (or Cloudflare Pages secrets).
6. Set **guild** + **editor role** IDs (see below).

#### Guild ID + Role ID

1. In Discord: **User Settings → Advanced → Developer Mode** (on).
2. Right-click the server icon → **Copy Server ID** → `DISCORD_GUILD_ID`.
3. Server Settings → Roles → right-click the editor role → **Copy Role ID** → `DISCORD_EDITOR_ROLE_ID`.

Members with that role (in that guild) can edit after signing in. Everyone else stays view-only.

Optional: set `DISCORD_BOT_TOKEN` and invite the bot to the guild if you prefer bot-based member lookups when the OAuth membership endpoint is unavailable.

### Twitch setup

1. Open [Twitch Developer Console](https://dev.twitch.tv/console/apps) → register an application.
2. Copy the **Client ID** and create a **Client Secret** from the **same** app.
3. Put both in `.env` / Pages secrets.
4. Helix uses Client Credentials; the secret must never ship in the browser bundle.

Without matching Twitch vars, Twitch ingest runs in **demo mode** (slug → Dicebear avatar). X/Twitter ingest still works without keys.

> Note: Twitch Helix still needs a matching `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` pair (deferred if credentials mismatch).

### X / Twitter notes

Official X API access is heavily gated / paid. This app does **not** require X API keys. It uses:

1. `https://api.fxtwitter.com/{username}` for display name + avatar
2. Fallback avatar `https://unavatar.io/x/{username}` if FxTwitter is unreachable

## Run locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

`npm run preview` also mounts the local API plugin so `/api/*` works after build when `.env` is present.

### OAuth redirect URL to configure

| Environment | Redirect URL |
| --- | --- |
| Local Vite | `http://localhost:5173/api/auth/callback` |
| Production | `https://YOUR_DOMAIN/api/auth/callback` |

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Pages Functions are picked up from `functions/`
- Set all env vars above as project Variables / Secrets
- Set `APP_ORIGIN` to your public `https://…` origin

## Data / persistence

- **Local:** mutations write to `data/graph.json` (gitignored). First run seeds from `data/graph.seed.json`.
- **Cloudflare Pages (MVP):** in-memory store seeded from `data/graph.seed.json` per isolate — **not durable** across deploys/isolates.
- **TODO:** bind Cloudflare KV (or Supabase) for a shared durable graph store.

## API sketch

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/graph` | Public |
| `POST` | `/api/graph/people` | Editor session |
| `PATCH` | `/api/graph/people/:id` | Editor session (category) |
| `POST` | `/api/graph/connections` | Editor session |
| `GET` | `/api/me` | Public (returns session) |
| `GET` | `/api/auth/discord` | Starts OAuth |
| `GET` | `/api/auth/callback` | OAuth callback |
| `POST` | `/api/auth/logout` | Clears session |
| `GET` | `/api/twitch-user` | Public resolver (uses server secrets) |
| `GET` | `/api/twitch-status` | Public |

## Branding

Public name: **The Wall of Shame** · Lucky.
