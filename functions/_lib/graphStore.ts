export type Role =
  | "Streamer"
  | "Mod"
  | "User"
  | "Ex-Mod"
  | "Headmod"
  | "gebannt";

/** Legacy single-category values (Bubble → User). */
export type Category = Role | "Bubble";

export type ConnectionKind = "Mod" | "Fren" | "Streamerkollege";

export type Person = {
  id: string;
  name: string;
  roles: Role[];
  avatarUrl: string;
  profileUrl: string;
  platform: "twitch" | "twitter" | "x" | "unknown";
  /** Graph layout position (persisted). */
  x?: number;
  y?: number;
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

const ROLES = new Set<Role>([
  "Streamer",
  "Mod",
  "User",
  "Ex-Mod",
  "Headmod",
  "gebannt",
]);
const PLATFORMS = new Set(["twitch", "twitter", "x", "unknown"]);
const CONNECTION_KINDS = new Set<ConnectionKind>([
  "Mod",
  "Fren",
  "Streamerkollege",
]);

export const DEFAULT_CONNECTION_KIND: ConnectionKind = "Fren";
export const DEFAULT_ROLE: Role = "User";

export function cloneGraph(data: GraphData): GraphData {
  return {
    people: data.people.map((p) => ({ ...p, roles: [...p.roles] })),
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

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.has(value as Role);
}

/** Accept Role or legacy Bubble (maps to User). */
export function coerceRole(value: unknown): Role | null {
  if (value === "Bubble") return "User";
  if (isRole(value)) return value;
  return null;
}

/** @deprecated Prefer isRole / coerceRole */
export function isCategory(value: unknown): value is Role {
  return coerceRole(value) !== null;
}

export function isConnectionKind(value: unknown): value is ConnectionKind {
  return (
    typeof value === "string" && CONNECTION_KINDS.has(value as ConnectionKind)
  );
}

export function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Normalize roles array; migrate legacy `category` / Bubble. */
export function normalizeRoles(raw: unknown, legacyCategory?: unknown): Role[] {
  const out: Role[] = [];
  const seen = new Set<Role>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const role = coerceRole(item);
      if (role && !seen.has(role)) {
        seen.add(role);
        out.push(role);
      }
    }
  }

  if (out.length === 0) {
    const fromCat = coerceRole(legacyCategory);
    if (fromCat) out.push(fromCat);
  }

  if (out.length === 0) out.push(DEFAULT_ROLE);
  return out;
}

export function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const roles = normalizeRoles(p.roles, p.category);
  const base =
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    roles.length > 0 &&
    typeof p.avatarUrl === "string" &&
    typeof p.profileUrl === "string" &&
    typeof p.platform === "string" &&
    PLATFORMS.has(p.platform);
  if (!base) return false;
  if (p.x !== undefined && !isFiniteCoord(p.x)) return false;
  if (p.y !== undefined && !isFiniteCoord(p.y)) return false;
  return true;
}

/** Copy optional layout coords onto a person object. */
export function withCoords(person: Person, x?: unknown, y?: unknown): Person {
  const next: Person = { ...person, roles: [...person.roles] };
  if (isFiniteCoord(x) && isFiniteCoord(y)) {
    next.x = x;
    next.y = y;
  }
  return next;
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

export function normalizePerson(value: unknown): Person | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    typeof p.avatarUrl !== "string" ||
    typeof p.profileUrl !== "string" ||
    typeof p.platform !== "string" ||
    !PLATFORMS.has(p.platform)
  ) {
    return null;
  }
  const roles = normalizeRoles(p.roles, p.category);
  const copy: Person = {
    id: p.id,
    name: p.name,
    roles,
    avatarUrl: p.avatarUrl,
    profileUrl: p.profileUrl,
    platform: p.platform as Person["platform"],
  };
  if (isFiniteCoord(p.x) && isFiniteCoord(p.y)) {
    copy.x = p.x;
    copy.y = p.y;
  }
  return copy;
}

export function normalizeGraph(raw: unknown): GraphData {
  if (!raw || typeof raw !== "object") {
    return { people: [], connections: [] };
  }
  const g = raw as Record<string, unknown>;
  const people: Person[] = [];
  if (Array.isArray(g.people)) {
    for (const item of g.people) {
      const person = normalizePerson(item);
      if (person) people.push(person);
    }
  }
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
