import type { Category, Person } from "../types";

export interface ResolveResult {
  ok: true;
  person: Omit<Person, "id" | "category">;
}

export interface ResolveError {
  ok: false;
  error: string;
}

/**
 * Mock profile resolver. Extracts a slug from Twitch / X / Twitter URLs
 * and fabricates name + avatar. Replace with real API calls later.
 */
export function resolveProfileFromUrl(
  rawUrl: string,
): ResolveResult | ResolveError {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a Twitch or X/Twitter profile URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "That does not look like a valid URL." };
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);

  let platform: Person["platform"] = "unknown";
  let slug = "";

  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
    platform = "twitch";
    slug = segments[0] ?? "";
  } else if (
    host === "twitter.com" ||
    host === "x.com" ||
    host.endsWith(".twitter.com") ||
    host.endsWith(".x.com")
  ) {
    platform = host.includes("twitter") ? "twitter" : "x";
    slug = segments[0] ?? "";
    if (slug.startsWith("@")) slug = slug.slice(1);
  } else {
    return {
      ok: false,
      error: "Only Twitch and X/Twitter profile links are supported right now.",
    };
  }

  if (!slug || ["/directory", "/search", "/i", "/home"].includes(`/${slug}`)) {
    return { ok: false, error: "Could not find a profile name in that URL." };
  }

  const name = slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const seed = encodeURIComponent(slug);
  const bg =
    platform === "twitch"
      ? "7c3aed"
      : platform === "twitter" || platform === "x"
        ? "0ea5e9"
        : "64748b";

  return {
    ok: true,
    person: {
      name,
      avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}&backgroundColor=${bg}`,
      profileUrl: parsed.toString(),
      platform,
    },
  };
}

export function defaultCategoryForPlatform(
  platform: Person["platform"],
): Category {
  if (platform === "twitch") return "Streamer";
  return "Bubble";
}
