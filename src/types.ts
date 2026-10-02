export type Category = "Streamer" | "Mod" | "Bubble";

export interface Person {
  id: string;
  name: string;
  category: Category;
  avatarUrl: string;
  profileUrl: string;
  platform: "twitch" | "twitter" | "x" | "unknown";
}

export interface Connection {
  id: string;
  source: string;
  target: string;
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
  category: Category;
}

export const CATEGORY_COLORS: Record<Category, string> = {
  Streamer: "#a78bfa",
  Mod: "#34d399",
  Bubble: "#38bdf8",
};

export const ALL_CATEGORIES: Category[] = ["Streamer", "Mod", "Bubble"];

/** German UI labels — Bubble is shown as User; data key stays Bubble. */
export const CATEGORY_LABELS: Record<Category, string> = {
  Streamer: "Streamer",
  Mod: "Mod",
  Bubble: "User",
};

export const PERSON_DRAG_MIME = "application/x-wos-person";
