# The Wall of Shame

Interactive community network map for Discord — built for **Lucky**.

Nodes are people (with avatar + name). Edges are connections between them.
Browse the graph publicly; editors with the right Discord role will be able to
update it once auth lands.

## Features (MVP scaffold)

- Force-directed graph UI (sigma.js + graphology), Gephi-style
- Categories: **Streamer**, **Mod**, **Bubble** (color legend + filters)
- Add a person by pasting a Twitch or X/Twitter profile URL (mock name/avatar from slug)
- Draw connections between people (click two nodes, or use the sidebar)
- Dark public-facing board UI

## Stack

- Vite + React + TypeScript
- [sigma.js](https://www.sigmajs.org/) + [graphology](https://graphology.github.io/)
- `@sigma/node-image` for circular avatar nodes

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

## Data note

This scaffold ships with local mock people and connections. Profile resolution
is stubbed (URL slug → display name + Dicebear avatar). Real Twitch/X APIs,
Supabase persistence, and Discord role-gated editing come next.

## Branding

Public name: **The Wall of Shame** · Lucky.
