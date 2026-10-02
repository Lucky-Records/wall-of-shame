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

export const CATEGORY_COLORS: Record<Category, string> = {
  Streamer: "#a78bfa",
  Mod: "#34d399",
  Bubble: "#38bdf8",
};

export const ALL_CATEGORIES: Category[] = ["Streamer", "Mod", "Bubble"];
