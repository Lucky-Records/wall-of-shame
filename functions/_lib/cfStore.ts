import {
  cloneGraph,
  createMemoryStore,
  normalizeGraph,
  type GraphData,
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
        // Persist migration so unlabeled edges get kind once
        const rawObj = raw as GraphData;
        const needsWrite =
          !Array.isArray(rawObj.connections) ||
          rawObj.connections.some(
            (c) => !c || typeof c !== "object" || !("kind" in c),
          );
        if (needsWrite) {
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
