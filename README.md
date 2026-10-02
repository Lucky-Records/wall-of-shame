# The Wall of Shame

Interactive community network map for Discord — built for **Lucky**.

Nodes are people (with avatar + name). Edges are connections between them.
Browse the graph publicly; editors with the right Discord role will be able to
update it once auth lands.

## Features

- Force-directed graph UI (sigma.js + graphology), Gephi-style
- Categories: **Streamer**, **Mod**, **Bubble** (color legend + filters)
- Add a person by pasting a Twitch or X/Twitter profile URL
- Real profile ingest:
  - **Twitch** → Helix `GET /users?login=` via Client Credentials (`/api/twitch-user`)
  - **X/Twitter** → public FxTwitter profile API + [unavatar.io](https://unavatar.io) avatar fallback (no paid X API key)
- Draw connections between people (click two nodes, or use the sidebar)
- Dark public-facing board UI
- Demo-mode banner when Twitch credentials are missing (Twitch links use a slug stub)

## Stack

- Vite + React + TypeScript
- [sigma.js](https://www.sigmajs.org/) + [graphology](https://graphology.github.io/)
- `@sigma/node-image` for circular avatar nodes
- Cloudflare Pages Functions (`functions/api/*`) for Twitch secrets in production
- Local Vite middleware (`vite-plugin-twitch-api.ts`) mirrors those routes in `npm run dev`

## Environment

Copy `.env.example` to `.env` (never commit `.env`):

```bash
cp .env.example .env
```

| Variable | Where | Purpose |
| --- | --- | --- |
| `TWITCH_CLIENT_ID` | `.env` / Pages secrets | Twitch application Client ID |
| `TWITCH_CLIENT_SECRET` | `.env` / Pages secrets | Twitch application Client Secret (server only) |

### Twitch setup

1. Open [Twitch Developer Console](https://dev.twitch.tv/console/apps) → register an application.
2. Copy the **Client ID** and create a **Client Secret**.
3. Put both in `.env` for local dev, or in Cloudflare Pages → **Settings** → **Variables and Secrets** (encrypt the secret).
4. Helix requires an app access token (Client Credentials). The secret must never ship in the browser bundle — only the `/api/twitch-*` routes use it.

Without these vars, Twitch ingest runs in **demo mode** (slug → Dicebear avatar) and the UI shows a banner. X/Twitter ingest still works without keys.

### X / Twitter notes

Official X API access is heavily gated / paid. This app does **not** require X API keys. It uses:

1. `https://api.fxtwitter.com/{username}` for display name + avatar (CORS-friendly public helper)
2. Fallback avatar `https://unavatar.io/x/{username}` if FxTwitter is unreachable

Reliability of third-party helpers can change; treat them as best-effort.

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

`npm run preview` also mounts the local Twitch API plugin so `/api/twitch-user` works after build when `.env` is present.

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Pages Functions are picked up from `functions/`
- Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` as project secrets before expecting live Twitch lookups

## Data note

People and connections still live in local React state (mock seed data). Supabase persistence and Discord role-gated editing come next.

## Branding

Public name: **The Wall of Shame** · Lucky.
