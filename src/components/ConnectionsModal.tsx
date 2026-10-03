import { useEffect } from "react";
import type { Connection, Person } from "../types";
import { connectionTagSegments } from "../types";

interface ConnectionsModalProps {
  person: Person;
  people: Person[];
  connections: Connection[];
  onClose: () => void;
}

type Row = {
  id: string;
  otherName: string;
  sourceName: string;
  targetName: string;
  outgoing: boolean;
  tags: { text: string; color: string }[];
};

function nameOf(people: Person[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? id;
}

export function ConnectionsModal({
  person,
  people,
  connections,
  onClose,
}: ConnectionsModalProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: Row[] = connections
    .filter((c) => c.source === person.id || c.target === person.id)
    .map((c) => {
      const sourceName = nameOf(people, c.source);
      const targetName = nameOf(people, c.target);
      const outgoing = c.source === person.id;
      const otherId = outgoing ? c.target : c.source;
      const seen = new Set<string>();
      const tags = connectionTagSegments(
        Array.isArray(c.kinds) ? c.kinds : [],
        Array.isArray(c.roles) ? c.roles : [],
      ).filter((tag) => {
        if (seen.has(tag.text)) return false;
        seen.add(tag.text);
        return true;
      });
      return {
        id: c.id,
        otherName: nameOf(people, otherId),
        sourceName,
        targetName,
        outgoing,
        tags,
      };
    })
    .sort((a, b) => {
      const byName = a.otherName.localeCompare(b.otherName, "de");
      if (byName !== 0) return byName;
      if (a.outgoing !== b.outgoing) return a.outgoing ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  return (
    <div
      className="conn-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="conn-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conn-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="conn-modal-header">
          <div>
            <p className="eyebrow">Profil</p>
            <h2 id="conn-modal-title">Verbindungen von {person.name}</h2>
          </div>
          <button
            type="button"
            className="conn-modal-close"
            onClick={onClose}
            aria-label="Schliessen"
          >
            ×
          </button>
        </header>

        {rows.length === 0 ? (
          <p className="conn-modal-empty">Keine Verbindungen.</p>
        ) : (
          <ul className="conn-modal-list">
            {rows.map((row) => (
              <li key={row.id} className="conn-modal-row">
                <div className="conn-modal-who">
                  <span className="conn-modal-arrow" aria-hidden="true">
                    {row.outgoing ? "→" : "←"}
                  </span>
                  <strong>{row.otherName}</strong>
                </div>
                <p className="conn-modal-dir">
                  von {row.sourceName} nach {row.targetName}
                </p>
                <div className="conn-modal-tags">
                  {row.tags.length === 0 ? (
                    <span className="conn-modal-tag is-empty">ohne Tags</span>
                  ) : (
                    row.tags.map((tag) => (
                      <span
                        key={tag.text}
                        className="conn-modal-tag"
                        style={{ color: tag.color, borderColor: tag.color }}
                      >
                        {tag.text}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
