import type { Category, Person } from "../types";

export interface ResolveResult {
  ok: true;
  person: Omit<Person, "id" | "category">;
  /** True when a soft stub was used (legacy; public Twitch resolve should not set this). */
  demo?: boolean;
}

export interface ResolveError {
  ok: false;
  error: string;
}

const TWITCH_RESERVED = new Set([
  "directory",
  "downloads",
  "jobs",
  "p",
  "products",
  "search",
  "settings",
  "subs",
  "turbo",
  "wallet",
  "inventory",
  "messages",
  "subscriptions",
  "popout",
  "embed",
  "login",
  "signup",
  "logout",
]);

const X_RESERVED = new Set([
  "i",
  "home",
  "explore",
  "search",
  "settings",
  "intent",
  "share",
  "compose",
  "messages",
  "notifications",
  "login",
  "signup",
  "tos",
  "privacy",
  "hashtag",
]);

type ParsedProfile =
  | {
      platform: "twitch";
      slug: string;
      profileUrl: string;
    }
  | {
      platform: "x" | "twitter";
      slug: string;
      profileUrl: string;
    };

function parseProfileUrl(rawUrl: string): ParsedProfile | ResolveError {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "Twitch- oder X/Twitter-Profil-URL einfügen." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "Das sieht nicht nach einer gültigen URL aus." };
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
    const slug = (segments[0] ?? "").toLowerCase();
    if (!slug || TWITCH_RESERVED.has(slug)) {
      return { ok: false, error: "In dieser URL steckt kein Twitch-Login." };
    }
    if (!/^[a-z0-9_]{1,25}$/.test(slug)) {
      return { ok: false, error: "Dieser Twitch-Login sieht ungültig aus." };
    }
    return {
      platform: "twitch",
      slug,
      profileUrl: `https://www.twitch.tv/${slug}`,
    };
  }

  if (
    host === "twitter.com" ||
    host === "x.com" ||
    host.endsWith(".twitter.com") ||
    host.endsWith(".x.com")
  ) {
    let slug = segments[0] ?? "";
    if (slug.startsWith("@")) slug = slug.slice(1);
    slug = slug.toLowerCase();
    if (!slug || X_RESERVED.has(slug)) {
      return {
        ok: false,
        error: "In dieser URL steckt kein X/Twitter-Username.",
      };
    }
    if (!/^[a-z0-9_]{1,15}$/.test(slug)) {
      return { ok: false, error: "Dieser X/Twitter-Username sieht ungültig aus." };
    }
    const platform = host.includes("twitter") ? "twitter" : "x";
    return {
      platform,
      slug,
      profileUrl:
        platform === "twitter"
          ? `https://twitter.com/${slug}`
          : `https://x.com/${slug}`,
    };
  }

  return {
    ok: false,
    error: "Aktuell werden nur Twitch- und X/Twitter-Profil-Links unterstützt.",
  };
}

function mockFromSlug(
  platform: Person["platform"],
  slug: string,
  profileUrl: string,
): ResolveResult {
  const name = slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const seed = encodeURIComponent(slug);
  const bg =
    platform === "twitch"
      ? "7c3aed"
      : platform === "twitter" || platform === "x"
        ? "0ea5e9"
        : "64748b";

  return {
    ok: true,
    demo: true,
    person: {
      name,
      avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}&backgroundColor=${bg}`,
      profileUrl,
      platform,
    },
  };
}

async function resolveTwitch(
  slug: string,
  profileUrl: string,
): Promise<ResolveResult | ResolveError> {
  let res: Response;
  try {
    res = await fetch(`/api/twitch-user?login=${encodeURIComponent(slug)}`);
  } catch {
    return {
      ok: false,
      error:
        "Twitch-Resolver nicht erreichbar. Vite-API starten (npm run dev) oder Pages Functions deployen.",
    };
  }

  let data: {
    ok?: boolean;
    demo?: boolean;
    error?: string;
    user?: {
      login: string;
      display_name: string;
      profile_image_url: string;
    };
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, error: "Twitch-Resolver hat eine ungültige Antwort geliefert." };
  }

  if (data.demo) {
    return mockFromSlug("twitch", slug, profileUrl);
  }

  if (!res.ok || !data.ok || !data.user) {
    return {
      ok: false,
      error: data.error ?? `Twitch-Abfrage fehlgeschlagen (${res.status}).`,
    };
  }

  return {
    ok: true,
    person: {
      name: data.user.display_name || data.user.login,
      avatarUrl: data.user.profile_image_url,
      profileUrl,
      platform: "twitch",
    },
  };
}

function upgradeXAvatar(url: string): string {
  return url
    .replace("_normal.", "_400x400.")
    .replace("_bigger.", "_400x400.")
    .replace("_mini.", "_400x400.");
}

async function resolveX(
  platform: "x" | "twitter",
  slug: string,
  profileUrl: string,
): Promise<ResolveResult | ResolveError> {
  try {
    const res = await fetch(
      `https://api.fxtwitter.com/${encodeURIComponent(slug)}`,
      { headers: { Accept: "application/json" } },
    );

    if (res.status === 429) {
      return {
        ok: false,
        error: "X/Twitter Rate-Limit. Gleich nochmal versuchen.",
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        error: `Kein X/Twitter-Profil für „${slug}“ gefunden.`,
      };
    }

    if (res.ok) {
      const data = (await res.json()) as {
        code?: number;
        message?: string;
        user?: {
          name?: string;
          screen_name?: string;
          avatar_url?: string;
        };
      };

      if (data.code === 200 && data.user) {
        const avatar =
          data.user.avatar_url && data.user.avatar_url.length > 0
            ? upgradeXAvatar(data.user.avatar_url)
            : `https://unavatar.io/x/${encodeURIComponent(slug)}`;
        return {
          ok: true,
          person: {
            name: data.user.name || data.user.screen_name || slug,
            avatarUrl: avatar,
            profileUrl,
            platform,
          },
        };
      }

      if (data.code === 404 || /not found/i.test(data.message ?? "")) {
        return {
          ok: false,
          error: `Kein X/Twitter-Profil für „${slug}“ gefunden.`,
        };
      }
    }
  } catch {
    // Fall through to public avatar + handle fallback.
  }

  // Unauthenticated public fallback: stable avatar URL + handle as name.
  // Official X API is gated; we avoid requiring paid keys.
  return {
    ok: true,
    person: {
      name: slug,
      avatarUrl: `https://unavatar.io/x/${encodeURIComponent(slug)}`,
      profileUrl,
      platform,
    },
  };
}

/**
 * Resolve display name + avatar from a Twitch or X/Twitter profile URL.
 * Twitch via `/api/twitch-user`: public sources by default (no secret);
 * optional Helix Client Credentials only when both ID + Secret are set.
 * X uses public FxTwitter + unavatar fallback (no paid API key).
 */
export async function resolveProfileFromUrl(
  rawUrl: string,
): Promise<ResolveResult | ResolveError> {
  const parsed = parseProfileUrl(rawUrl);
  // ResolveError carries `ok`; ParsedProfile does not.
  if ("ok" in parsed) return parsed;

  if (parsed.platform === "twitch") {
    return resolveTwitch(parsed.slug, parsed.profileUrl);
  }
  return resolveX(parsed.platform, parsed.slug, parsed.profileUrl);
}

export async function fetchTwitchReady(): Promise<boolean> {
  try {
    const res = await fetch("/api/twitch-status");
    if (!res.ok) return false;
    const data = (await res.json()) as { ready?: boolean };
    return Boolean(data.ready);
  } catch {
    return false;
  }
}

export function defaultCategoryForPlatform(
  platform: Person["platform"],
): Category {
  if (platform === "twitch") return "Streamer";
  return "Bubble";
}
