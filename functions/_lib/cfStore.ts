import {
  cloneGraph,
  createMemoryStore,
  isConnection,
  isPerson,
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

function isGraphData(value: unknown): value is GraphData {
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  if (!Array.isArray(g.people) || !Array.isArray(g.connections)) return false;
  return (
    g.people.every((p) => isPerson(p)) &&
    g.connections.every((c) => isConnection(c))
  );
}

export function createKvStore(kv: KvLike): GraphStore {
  return {
    async get() {
      const raw = await kv.get(GRAPH_KEY, "json");
      if (isGraphData(raw)) {
        return cloneGraph(raw);
      }
      const seed = cloneGraph(GRAPH_SEED);
      await kv.put(GRAPH_KEY, JSON.stringify(seed));
      return seed;
    },
    async set(data) {
      await kv.put(GRAPH_KEY, JSON.stringify(cloneGraph(data)));
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
