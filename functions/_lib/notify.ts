/** Optional post-mutation ping for Netzy / Discord #liste screenshot robots. */

export type NotifyEnv = {
  WALL_OF_SHAME_NOTIFY_URL?: string;
};

/**
 * Best-effort POST of `{}` to WALL_OF_SHAME_NOTIFY_URL after a graph write.
 * Never throws; missing URL is a no-op.
 *
 * Set the Cloudflare Pages secret `WALL_OF_SHAME_NOTIFY_URL` to the Netzy
 * routine webhook that captures the board and refreshes Discord #liste.
 */
export async function notifyGraphMutation(env?: NotifyEnv): Promise<void> {
  const url = env?.WALL_OF_SHAME_NOTIFY_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    // swallow — mutation already succeeded
  }
}
