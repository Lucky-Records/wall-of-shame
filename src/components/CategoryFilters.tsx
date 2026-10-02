import type { Role } from "../types";
import { ALL_ROLES, ROLE_COLORS, ROLE_LABELS } from "../types";

interface CategoryFiltersProps {
  visible: Set<Role>;
  onToggle: (role: Role) => void;
}

export function CategoryFilters({ visible, onToggle }: CategoryFiltersProps) {
  return (
    <div className="legend-bar">
      <span className="legend-title">Rollen</span>
      {ALL_ROLES.map((role) => {
        const active = visible.has(role);
        return (
          <button
            key={role}
            type="button"
            className={`legend-chip${active ? " on" : ""}`}
            onClick={() => onToggle(role)}
            aria-pressed={active}
          >
            <span
              className="swatch"
              style={{ background: ROLE_COLORS[role] }}
            />
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}
