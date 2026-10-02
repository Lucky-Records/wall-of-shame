export type Role =
  | "Streamer"
  | "Mod"
  | "User"
  | "Ex-Mod"
  | "Headmod"
  | "gebannt";

/** @deprecated Use Role — kept as alias for gradual migration. */
export type Category = Role;

/** Relationship between two people (edge tag). */
export type ConnectionKind = "Mod" | "Fren" | "Streamerkollege";

export interface Person {
  id: string;
  name: string;
  /** One or more roles (multi-select). */
  roles: Role[];
  avatarUrl: string;
  profileUrl: string;
  platform: "twitch" | "twitter" | "x" | "unknown";
  /** Persisted graph layout position. */
  x?: number;
  y?: number;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  /** Relationship types — multi-select (Mod / Fren / Streamerkollege). */
  kinds: ConnectionKind[];
  /** Optional person-role tags on the edge — multi-select. */
  roles: Role[];
}

export interface GraphPosition {
  x: number;
  y: number;
}

/** Draft used when dragging a resolved profile onto the graph. */
export interface PersonDraft {
  name: string;
  avatarUrl: string;
  profileUrl: string;
  platform: Person["platform"];
  roles: Role[];
}

export const ALL_ROLES: Role[] = [
  "Streamer",
  "Mod",
  "User",
  "Ex-Mod",
  "Headmod",
  "gebannt",
];

/** @deprecated Use ALL_ROLES */
export const ALL_CATEGORIES = ALL_ROLES;

export const ROLE_COLORS: Record<Role, string> = {
  Streamer: "#a78bfa",
  Mod: "#34d399",
  User: "#38bdf8",
  "Ex-Mod": "#fb923c",
  Headmod: "#fbbf24",
  gebannt: "#fb7185",
};

/** @deprecated Use ROLE_COLORS */
export const CATEGORY_COLORS = ROLE_COLORS;

export const ROLE_LABELS: Record<Role, string> = {
  Streamer: "Streamer",
  Mod: "Mod",
  User: "User",
  "Ex-Mod": "Ex-Mod",
  Headmod: "Headmod",
  gebannt: "gebannt",
};

/** @deprecated Use ROLE_LABELS */
export const CATEGORY_LABELS = ROLE_LABELS;

/** Prefer this color when a person has multiple roles. */
const ROLE_PRIORITY: Role[] = [
  "gebannt",
  "Headmod",
  "Mod",
  "Ex-Mod",
  "Streamer",
  "User",
];

export function primaryRole(roles: Role[]): Role {
  if (!roles.length) return "User";
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return roles[0]!;
}

export function formatRoles(roles: Role[]): string {
  if (!roles.length) return ROLE_LABELS.User;
  return roles.map((r) => ROLE_LABELS[r]).join(" · ");
}

export function personMatchesRoles(
  person: Person,
  visible: Set<Role>,
): boolean {
  if (!person.roles.length) return visible.has("User");
  return person.roles.some((r) => visible.has(r));
}

export const ALL_CONNECTION_KINDS: ConnectionKind[] = [
  "Mod",
  "Fren",
  "Streamerkollege",
];

export const DEFAULT_CONNECTION_KIND: ConnectionKind = "Fren";

export const CONNECTION_KIND_LABELS: Record<ConnectionKind, string> = {
  Mod: "Mod",
  Fren: "Fren",
  Streamerkollege: "Streamerkollege",
};

export const CONNECTION_KIND_COLORS: Record<ConnectionKind, string> = {
  Mod: "#34d399",
  Fren: "#fbbf24",
  Streamerkollege: "#a78bfa",
};

export type ConnectionTagSegment = {
  text: string;
  color: string;
};

/** Kind + role tags with badge colors for graph edge labels. */
export function connectionTagSegments(
  kinds: ConnectionKind[],
  roles: Role[],
): ConnectionTagSegment[] {
  return [
    ...kinds.map((k) => ({
      text: CONNECTION_KIND_LABELS[k],
      color: CONNECTION_KIND_COLORS[k],
    })),
    ...roles.map((r) => ({
      text: ROLE_LABELS[r],
      color: ROLE_COLORS[r],
    })),
  ];
}

export function formatConnectionTags(
  kinds: ConnectionKind[],
  roles: Role[],
): string {
  const parts = connectionTagSegments(kinds, roles).map((s) => s.text);
  return parts.length ? parts.join(" · ") : "—";
}

export function connectionEdgeColor(
  kinds: ConnectionKind[],
  roles: Role[],
): string {
  if (kinds.length) return CONNECTION_KIND_COLORS[kinds[0]!];
  if (roles.length) return ROLE_COLORS[primaryRole(roles)];
  return "#94a3b8";
}

export function toggleInList<T>(list: T[], item: T, minOne = false): T[] {
  if (list.includes(item)) {
    if (minOne && list.length === 1) return list;
    return list.filter((x) => x !== item);
  }
  return [...list, item];
}

export const PERSON_DRAG_MIME = "application/x-wos-person";
