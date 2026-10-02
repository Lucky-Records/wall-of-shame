export type Category = "Streamer" | "Mod" | "Bubble";

export type ConnectionKind = "Mod" | "Fren" | "Streamerkollege";

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
  kind: ConnectionKind;
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
const CONNECTION_KINDS = new Set<ConnectionKind>([
  "Mod",
  "Fren",
  "Streamerkollege",
]);

export const DEFAULT_CONNECTION_KIND: ConnectionKind = "Fren";

export function cloneGraph(data: GraphData): GraphData {
  return {
    people: data.people.map((p) => ({ ...p })),
    connections: data.connections.map((c) => ({ ...c })),
  };
}

export function createMemoryStore(seed: GraphData): GraphStore {
  let current = cloneGraph(normalizeGraph(seed));
  return {
    async get() {
      return cloneGraph(current);
    },
    async set(data) {
      current = cloneGraph(normalizeGraph(data));
    },
  };
}

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && CATEGORIES.has(value as Category);
}

export function isConnectionKind(value: unknown): value is ConnectionKind {
  return (
    typeof value === "string" && CONNECTION_KINDS.has(value as ConnectionKind)
  );
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

/** Strict check after migration (kind required). */
export function isConnection(value: unknown): value is Connection {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.source === "string" &&
    typeof c.target === "string" &&
    isConnectionKind(c.kind)
  );
}

/** Accept legacy edges without kind; fill default Fren. */
export function normalizeConnection(value: unknown): Connection | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (
    typeof c.id !== "string" ||
    typeof c.source !== "string" ||
    typeof c.target !== "string"
  ) {
    return null;
  }
  return {
    id: c.id,
    source: c.source,
    target: c.target,
    kind: isConnectionKind(c.kind) ? c.kind : DEFAULT_CONNECTION_KIND,
  };
}

export function normalizeGraph(raw: unknown): GraphData {
  if (!raw || typeof raw !== "object") {
    return { people: [], connections: [] };
  }
  const g = raw as Record<string, unknown>;
  const people = Array.isArray(g.people)
    ? g.people.filter(isPerson).map((p) => ({ ...p }))
    : [];
  const connections: Connection[] = [];
  if (Array.isArray(g.connections)) {
    for (const item of g.connections) {
      const conn = normalizeConnection(item);
      if (conn) connections.push(conn);
    }
  }
  return { people, connections };
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
