export type Category = "Streamer" | "Mod" | "Bubble";

export type Person = {
  id: string;
  name: string;
  category: Category;
  avatarUrl: string;
  profileUrl: string;
  platform: "twitch" | "twitter" | "x" | "unknown";
};

export type Connection = {
  id: string;
  source: string;
  target: string;
};

export type GraphData = {
  people: Person[];
  connections: Connection[];
};

export interface GraphStore {
  get(): Promise<GraphData>;
  set(data: GraphData): Promise<void>;
}

const CATEGORIES = new Set<Category>(["Streamer", "Mod", "Bubble"]);
const PLATFORMS = new Set(["twitch", "twitter", "x", "unknown"]);

export function cloneGraph(data: GraphData): GraphData {
  return {
    people: data.people.map((p) => ({ ...p })),
    connections: data.connections.map((c) => ({ ...c })),
  };
}

export function createMemoryStore(seed: GraphData): GraphStore {
  let current = cloneGraph(seed);
  return {
    async get() {
      return cloneGraph(current);
    },
    async set(data) {
      current = cloneGraph(data);
    },
  };
}

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && CATEGORIES.has(value as Category);
}

export function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    isCategory(p.category) &&
    typeof p.avatarUrl === "string" &&
    typeof p.profileUrl === "string" &&
    typeof p.platform === "string" &&
    PLATFORMS.has(p.platform)
  );
}

export function isConnection(value: unknown): value is Connection {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.source === "string" &&
    typeof c.target === "string"
  );
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function allocatePersonId(name: string, existing: Person[]): string {
  const base = slugify(name) || `person-${Date.now()}`;
  let id = base;
  let n = 2;
  while (existing.some((p) => p.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}
