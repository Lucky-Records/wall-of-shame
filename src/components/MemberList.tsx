import { useEffect, useMemo, useRef, useState } from "react";
import { useCollapsed } from "../hooks/useCollapsed";
import type { Person, Role } from "../types";
import { personMatchesRoles, primaryRole, ROLE_COLORS } from "../types";

interface MemberListProps {
  people: Person[];
  visibleRoles: Set<Role>;
  focusPersonId: string | null;
  onToggleFocus: (personId: string) => void;
}

function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function MemberAvatar({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.avatarUrl]);
  const ring = ROLE_COLORS[primaryRole(person.roles)];
  if (!person.avatarUrl || failed) {
    return (
      <span
        className="member-avatar member-avatar-fallback"
        style={{ borderColor: ring }}
        aria-hidden="true"
      >
        {initialsOf(person.name)}
      </span>
    );
  }
  return (
    <img
      className="member-avatar"
      src={person.avatarUrl}
      alt=""
      width={36}
      height={36}
      loading="lazy"
      draggable={false}
      style={{ borderColor: ring }}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Every member with avatar + name. Double-clicking the avatar (or the row)
 * runs the same "only this person's lines" filter as double-clicking the node
 * in the graph; the state lives in App so list and graph stay in sync.
 */
export function MemberList({
  people,
  visibleRoles,
  focusPersonId,
  onToggleFocus,
}: MemberListProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const [collapsed, toggleCollapsed] = useCollapsed("members");

  const sorted = useMemo(
    () =>
      [...people].sort((a, b) =>
        a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
      ),
    [people],
  );

  // Keep the active member in view when the focus comes from the graph.
  useEffect(() => {
    if (collapsed || !focusPersonId || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-member-id="${CSS.escape(focusPersonId)}"]`,
    );
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusPersonId, collapsed]);

  return (
    <nav
      className={`member-column${collapsed ? " is-collapsed" : ""}`}
      aria-label="Member"
    >
      <header className="member-column-header">
        <button
          type="button"
          className="panel-toggle member-toggle"
          aria-expanded={!collapsed}
          aria-controls="member-list"
          title={collapsed ? "Member-Liste aufklappen" : "Member-Liste einklappen"}
          onClick={toggleCollapsed}
        >
          <span className="panel-chevron" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <h2>Member ({sorted.length})</h2>
        </button>
        {collapsed ? null : (
          <p className="member-column-hint">
            Doppelklick aufs Bild zeigt nur dessen Verbindungen
          </p>
        )}
      </header>
      <ul
        className="member-list"
        id="member-list"
        ref={listRef}
        hidden={collapsed}
      >
        {sorted.map((person) => {
          const active = focusPersonId === person.id;
          const hidden = !personMatchesRoles(person, visibleRoles);
          return (
            <li key={person.id}>
              <button
                type="button"
                data-member-id={person.id}
                className={`member-row${active ? " active" : ""}${
                  hidden ? " is-hidden" : ""
                }`}
                aria-pressed={active}
                title={
                  active
                    ? `Doppelklick: wieder alle Verbindungen zeigen`
                    : `Doppelklick: nur Verbindungen von ${person.name} zeigen`
                }
                onDoubleClick={(event) => {
                  event.preventDefault();
                  onToggleFocus(person.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onToggleFocus(person.id);
                  }
                }}
              >
                <MemberAvatar person={person} />
                <span className="member-name">{person.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
