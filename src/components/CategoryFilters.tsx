import { useCollapsed } from "../hooks/useCollapsed";
import type { Role } from "../types";
import { ALL_ROLES, ROLE_COLORS, ROLE_LABELS } from "../types";

interface CategoryFiltersProps {
  visible: Set<Role>;
  onToggle: (role: Role) => void;
}

export function CategoryFilters({ visible, onToggle }: CategoryFiltersProps) {
  const [collapsed, toggleCollapsed] = useCollapsed("legend");
  return (
    <div className={`legend-bar${collapsed ? " is-collapsed" : ""}`}>
      <button
        type="button"
        className="legend-toggle"
        aria-expanded={!collapsed}
        title={collapsed ? "Rollen-Filter aufklappen" : "Rollen-Filter einklappen"}
        onClick={toggleCollapsed}
      >
        <span className="panel-chevron" aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
        <span className="legend-title">
          Rollen
          {collapsed && visible.size < ALL_ROLES.length
            ? ` (${visible.size}/${ALL_ROLES.length})`
            : ""}
        </span>
      </button>
      {!collapsed && ALL_ROLES.map((role) => {
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
