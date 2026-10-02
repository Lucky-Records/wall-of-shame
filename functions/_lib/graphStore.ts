export type Role =
  | "Streamer"
  | "Mod"
  | "Twitter"
  | "Fren";

/** Legacy single-category values are discarded during normalization. */
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
  /** Relationship types (multi). */
  kinds: ConnectionKind[];
  /** Optional person-role tags on the edge (multi). */
  roles: Role[];
};

export type GraphData = {
  people: Person[];
  connections: Connection[];
};

export interface GraphStore {
  get(): Promise<GraphData>;
  set(data: GraphData): Promise<void>;
}

const ROLES = new Set<Role>(["Streamer", "Mod", "Twitter", "Fren"]);
const PLATFORMS = new Set(["twitch", "twitter", "x", "unknown"]);
const CONNECTION_KINDS = new Set<ConnectionKind>([
  "Mod",
  "Fren",
  "Streamerkollege",
]);

export const DEFAULT_CONNECTION_KIND: ConnectionKind = "Fren";
export const DEFAULT_ROLE: Role = "Streamer";

export function cloneGraph(data: GraphData): GraphData {
  return {
    people: data.people.map((p) => ({ ...p, roles: [...p.roles] })),
    connections: data.connections.map((c) => ({
      ...c,
      kinds: [...c.kinds],
      roles: [...c.roles],
    })),
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

/** Accept only current roles; removed roles and legacy Bubble are discarded. */
export function coerceRole(value: unknown): Role | null {
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

  // An old person may have had only a removed role. Keep the person but strip
  // that role instead of inventing a replacement badge.
  return out;
}

export function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const base =
    typeof p.id === "string" &&
    typeof p.name === "string" &&
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

export function normalizeKinds(raw: unknown, legacyKind?: unknown): ConnectionKind[] {
  const out: ConnectionKind[] = [];
  const seen = new Set<ConnectionKind>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isConnectionKind(item) && !seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  if (out.length === 0 && isConnectionKind(legacyKind)) {
    out.push(legacyKind);
  }
  return out;
}

export function normalizeEdgeRoles(raw: unknown): Role[] {
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
  return out;
}

/** Strict check after migration (kinds or roles required). */
export function isConnection(value: unknown): value is Connection {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (
    typeof c.id !== "string" ||
    typeof c.source !== "string" ||
    typeof c.target !== "string"
  ) {
    return false;
  }
  const kinds = normalizeKinds(c.kinds, c.kind);
  const roles = normalizeEdgeRoles(c.roles);
  return kinds.length > 0 || roles.length > 0;
}

/** Accept legacy edges with single `kind`; migrate to kinds[] + roles[]. */
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
  let kinds = normalizeKinds(c.kinds, c.kind);
  const roles = normalizeEdgeRoles(c.roles);
  if (kinds.length === 0 && roles.length === 0) {
    kinds = [DEFAULT_CONNECTION_KIND];
  }
  return {
    id: c.id,
    source: c.source,
    target: c.target,
    kinds,
    roles,
  };
}

/** Merge parallel directed edges (same A→B) into one with union of tags. */
export function mergeDirectedConnections(list: Connection[]): Connection[] {
  const map = new Map<string, Connection>();
  for (const c of list) {
    const key = `${c.source}\0${c.target}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        ...c,
        kinds: [...c.kinds],
        roles: [...c.roles],
      });
      continue;
    }
    const kinds = [...prev.kinds];
    for (const k of c.kinds) {
      if (!kinds.includes(k)) kinds.push(k);
    }
    const roles = [...prev.roles];
    for (const r of c.roles) {
      if (!roles.includes(r)) roles.push(r);
    }
    map.set(key, { ...prev, kinds, roles });
  }
  return [...map.values()];
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
  return { people, connections: mergeDirectedConnections(connections) };
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
