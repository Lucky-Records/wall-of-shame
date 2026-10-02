import {
  cloneGraph,
  createMemoryStore,
  normalizeGraph,
  type GraphStore,
} from "./graphStore.ts";
import { GRAPH_SEED } from "./seedData.ts";

export type KvLike = {
  get(
    key: string,
    options?: "text" | "json" | { type: "json" | "text" },
  ): Promise<string | object | null>;
  put(key: string, value: string): Promise<void>;
};

export type GraphEnv = {
  GRAPH_KV?: KvLike;
  /** Optional Netzy / Discord #liste refresh webhook (POST {}). */
  WALL_OF_SHAME_NOTIFY_URL?: string;
};

const GRAPH_KEY = "graph";

function looksLikeGraph(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  return Array.isArray(g.people) && Array.isArray(g.connections);
}

export function createKvStore(kv: KvLike): GraphStore {
  return {
    async get() {
      const raw = await kv.get(GRAPH_KEY, "json");
      if (looksLikeGraph(raw)) {
        const normalized = normalizeGraph(raw);
        // Persist every normalization, including removal of obsolete role values.
        // This migrates old KV data once while keeping GETs idempotent afterwards.
        if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
          await kv.put(GRAPH_KEY, JSON.stringify(normalized));
        }
        return cloneGraph(normalized);
      }
      const seed = cloneGraph(normalizeGraph(GRAPH_SEED));
      await kv.put(GRAPH_KEY, JSON.stringify(seed));
      return seed;
    },
    async set(data) {
      await kv.put(GRAPH_KEY, JSON.stringify(cloneGraph(normalizeGraph(data))));
    },
  };
}

/** Prefer Cloudflare KV when bound; otherwise in-memory seed (not durable). */
export function getCloudflareGraphStore(env?: GraphEnv): GraphStore {
  if (env?.GRAPH_KV) {
    return createKvStore(env.GRAPH_KV);
  }
  return createMemoryStore(GRAPH_SEED);
}
