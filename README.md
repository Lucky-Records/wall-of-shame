# The Wall of Shame

Interactive community network map for Discord — built for **Lucky**.

Nodes are people (with avatar + name). Edges are connections between them.
The board is **publicly editable**: anyone can add people, change categories,
draw connections, and delete people. No Discord login required.

## Features

- Force-directed graph UI (sigma.js + graphology), Gephi-style
- Roles (multi-select): **Streamer**, **Mod**, **User**, **Ex-Mod**, **Headmod**, **gebannt** — badges on the board
- Directed connections with arrows (A → B); parallel strands stay visible
- Add a person by pasting a Twitch or X/Twitter profile URL
- Real profile ingest:
  - **Twitch** → public resolve by default (ivr.fi / Twitch GQL / unavatar) via `/api/twitch-user` — **no Client Secret required**
  - Optional Helix enhancement only when **both** `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are set
  - **X/Twitter** → public FxTwitter profile API + [unavatar.io](https://unavatar.io) avatar fallback (no paid X API key)
- Draw connections between people (click two nodes, or use the sidebar)
- Delete people (and their edges) from the list or selection panel
- Public read **and** write of graph APIs
- Durable graph storage on Cloudflare via Workers KV (`GRAPH_KV`)
- Dark public-facing board UI (German)

## Stack

- Vite + React + TypeScript
- [sigma.js](https://www.sigmajs.org/) + [graphology](https://graphology.github.io/)
- `@sigma/node-image` for circular avatar nodes
- Cloudflare Pages Functions (`functions/api/*`) for Twitch + graph APIs
- Local Vite middleware (`vite-plugin-api.ts`) mirrors those routes in `npm run dev` / `preview`
- Graph store: local `data/graph.json` (dev) / Cloudflare KV key `graph` in production

## Environment

Copy `.env.example` to `.env` (never commit `.env`):

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `TWITCH_CLIENT_ID` | Optional — only used with Helix when Secret is also set |
| `TWITCH_CLIENT_SECRET` | Optional Helix Client Secret (server only). **Not required** for public boards |
| `APP_ORIGIN` | Optional public origin (local/prod) |
| `WALL_OF_SHAME_NOTIFY_URL` | Optional Netzy webhook — `POST {}` after every graph mutation so #liste can refresh |

Discord OAuth variables are optional/legacy and unused for edit gating.

### Twitch setup

Twitch profile resolve works **without any Twitch app credentials**. Paste a
`https://www.twitch.tv/{login}` link; the server looks up display name + avatar
from free public sources.

Helix Client Credentials are an **optional** upgrade if you already have a
matching Client ID + Secret pair from [dev.twitch.tv/console](https://dev.twitch.tv/console/apps).
If only the Client ID is set (or the pair is mismatched), Helix is skipped and
the public fallback is used.

## Cloudflare KV

Production mutations persist in KV namespace binding `GRAPH_KV` (see `wrangler.toml`).
Redeploy after changing bindings so Pages Functions pick them up.


## Discord #liste refresh (Netzy)

After each successful graph write (add/delete person, change roles, add/delete
connection), Pages Functions optionally `POST {}` to `WALL_OF_SHAME_NOTIFY_URL`.

1. Point that URL at the Netzy routine that screenshots the public board and
   updates Discord channel `#liste` (delete previous webhook message, post new image).
2. Set it as a **Cloudflare Pages secret** on the `wall-of-shame` project:
   `WALL_OF_SHAME_NOTIFY_URL=<netzy-webhook-url>`
3. If unset, mutations still work — notify is a no-op.

## Scripts

```bash
npm run dev      # local UI + API (file-backed graph)
npm run build    # typecheck + Vite build
npm run deploy   # build + wrangler pages deploy
```

## Branding

Public UI, domain, commits, and repo branding use **Lucky** only.
