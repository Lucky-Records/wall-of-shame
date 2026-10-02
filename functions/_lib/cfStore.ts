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
        // Persist migration: roles[] + connection kinds[]/roles[]
        const rawObj = raw as { people?: unknown[]; connections?: unknown[] };
        const peopleNeedRoles =
          !Array.isArray(rawObj.people) ||
          rawObj.people.some((p) => {
            if (!p || typeof p !== "object") return true;
            const rec = p as Record<string, unknown>;
            return !Array.isArray(rec.roles);
          });
        const edgesNeedKinds =
          !Array.isArray(rawObj.connections) ||
          rawObj.connections.some((c) => {
            if (!c || typeof c !== "object") return true;
            const rec = c as Record<string, unknown>;
            return !Array.isArray(rec.kinds);
          });
        if (peopleNeedRoles || edgesNeedKinds) {
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
