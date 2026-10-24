import { useEffect, useState } from "react";
import {
  fetchMe,
  logout,
  memberLabel,
  startHeartbeat,
  type SessionMember,
} from "../lib/session";

/** Logged-in member chip (top-right of the board) + heartbeat. */
export function UserBar() {
  const [me, setMe] = useState<SessionMember | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMe().then((m) => {
      if (alive) setMe(m);
    });
    const stop = startHeartbeat();
    return () => {
      alive = false;
      stop();
    };
  }, []);

  if (!me) return null;
  return (
    <div className="user-bar" aria-label="Angemeldet">
      <span className="user-dot" aria-hidden="true" />
      <span className="user-name" title={`Angemeldet als ${me.username}`}>
        {memberLabel(me)}
      </span>
      {me.isAdmin ? (
        <a className="user-link" href="/admin">
          Admin
        </a>
      ) : null}
      <button
        type="button"
        className="user-logout"
        onClick={() => {
          void logout();
        }}
      >
        Abmelden
      </button>
    </div>
  );
}
