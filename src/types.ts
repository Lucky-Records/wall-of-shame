export type Role =
  | "Streamer"
  | "Mod"
  | "User"
  | "Ex-Mod"
  | "Headmod"
  | "gebannt";

/** @deprecated Use Role — kept as alias for gradual migration. */
export type Category = Role;

/** Relationship between two people (edge label). */
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
  kind: ConnectionKind;
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

export const PERSON_DRAG_MIME = "application/x-wos-person";
