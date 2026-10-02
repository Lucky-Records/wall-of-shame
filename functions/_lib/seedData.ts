import type { GraphData } from "./graphStore.ts";

/** Canonical MVP seed — keep in sync with data/graph.seed.json */
export const GRAPH_SEED: GraphData = {
  "people": [
    {
      "id": "lucky",
      "name": "Lucky",
      "roles": [
        "Streamer"
      ],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=Lucky&backgroundColor=7c3aed",
      "profileUrl": "https://twitch.tv/lucky",
      "platform": "twitch"
    },
    {
      "id": "neonfox",
      "name": "NeonFox",
      "roles": [
        "Streamer"
      ],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=NeonFox&backgroundColor=c026d3",
      "profileUrl": "https://twitch.tv/neonfox",
      "platform": "twitch"
    },
    {
      "id": "pixelpulse",
      "name": "PixelPulse",
      "roles": [
        "Mod"
      ],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=PixelPulse&backgroundColor=059669",
      "profileUrl": "https://twitch.tv/pixelpulse",
      "platform": "twitch"
    },
    {
      "id": "orbitmod",
      "name": "OrbitMod",
      "roles": [
        "Mod"
      ],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=OrbitMod&backgroundColor=10b981",
      "profileUrl": "https://x.com/orbitmod",
      "platform": "x"
    },
    {
      "id": "bubbleskip",
      "name": "BubbleSkip",
      "roles": [],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=BubbleSkip&backgroundColor=0284c7",
      "profileUrl": "https://twitter.com/bubbleskip",
      "platform": "twitter"
    },
    {
      "id": "glownote",
      "name": "GlowNote",
      "roles": [],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=GlowNote&backgroundColor=0ea5e9",
      "profileUrl": "https://x.com/glownote",
      "platform": "x"
    },
    {
      "id": "raidwave",
      "name": "RaidWave",
      "roles": [
        "Streamer"
      ],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=RaidWave&backgroundColor=8b5cf6",
      "profileUrl": "https://twitch.tv/raidwave",
      "platform": "twitch"
    },
    {
      "id": "chathaven",
      "name": "ChatHaven",
      "roles": [],
      "avatarUrl": "https://api.dicebear.com/9.x/thumbs/svg?seed=ChatHaven&backgroundColor=38bdf8",
      "profileUrl": "https://twitch.tv/chathaven",
      "platform": "twitch"
    }
  ],
  "connections": [
    {
      "id": "c1",
      "source": "lucky",
      "target": "pixelpulse",
      "kinds": [
        "Mod"
      ],
      "roles": []
    },
    {
      "id": "c2",
      "source": "lucky",
      "target": "orbitmod",
      "kinds": [
        "Mod"
      ],
      "roles": []
    },
    {
      "id": "c3",
      "source": "lucky",
      "target": "neonfox",
      "kinds": [
        "Streamerkollege"
      ],
      "roles": []
    },
    {
      "id": "c4",
      "source": "neonfox",
      "target": "raidwave",
      "kinds": [
        "Streamerkollege"
      ],
      "roles": []
    },
    {
      "id": "c5",
      "source": "pixelpulse",
      "target": "bubbleskip",
      "kinds": [
        "Fren"
      ],
      "roles": []
    },
    {
      "id": "c6",
      "source": "orbitmod",
      "target": "glownote",
      "kinds": [
        "Fren"
      ],
      "roles": []
    },
    {
      "id": "c7",
      "source": "bubbleskip",
      "target": "chathaven",
      "kinds": [
        "Fren"
      ],
      "roles": []
    },
    {
      "id": "c8",
      "source": "raidwave",
      "target": "chathaven",
      "kinds": [
        "Fren"
      ],
      "roles": []
    },
    {
      "id": "c9",
      "source": "glownote",
      "target": "lucky",
      "kinds": [
        "Fren"
      ],
      "roles": []
    }
  ]
} as GraphData;
