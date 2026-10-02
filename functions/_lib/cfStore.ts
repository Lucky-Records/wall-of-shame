import {
  createMemoryStore,
  type GraphStore,
} from "./graphStore.ts";
import { GRAPH_SEED } from "./seedData.ts";

/**
 * MVP durable store TODO: bind a Cloudflare KV namespace (e.g. GRAPH_KV)
 * and read/write `graph.json` there. Until then each isolate keeps an
 * in-memory copy seeded from GRAPH_SEED (mutations are not shared across
 * isolates / deploys).
 */
let store: GraphStore | null = null;

export function getCloudflareGraphStore(): GraphStore {
  if (!store) {
    store = createMemoryStore(GRAPH_SEED);
  }
  return store;
}
