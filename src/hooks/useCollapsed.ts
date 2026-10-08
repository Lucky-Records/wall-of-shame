import { useCallback, useSyncExternalStore } from "react";

/**
 * Collapsed state per framed box, persisted in localStorage.
 * One shared store so App (layout widths) and the boxes stay in sync.
 * Default: every box expanded.
 */
const STORAGE_KEY = "wos-collapsed-panels";

function load(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === true) out[key] = true;
    }
    return out;
  } catch {
    return {};
  }
}

let state: Record<string, boolean> = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCollapsed(id: string, collapsed: boolean) {
  if (!!state[id] === collapsed) return;
  const next = { ...state };
  if (collapsed) next[id] = true;
  else delete next[id];
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode / quota: keep in memory only
  }
  for (const listener of listeners) listener();
}

export function useCollapsed(id: string): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => !!state[id],
    () => false,
  );
  const toggle = useCallback(() => setCollapsed(id, !state[id]), [id]);
  return [collapsed, toggle];
}
