import type { Category } from "../types";
import { ALL_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from "../types";

interface CategoryFiltersProps {
  visible: Set<Category>;
  onToggle: (category: Category) => void;
}

export function CategoryFilters({ visible, onToggle }: CategoryFiltersProps) {
  return (
    <div className="legend-bar">
      <span className="legend-title">Kategorien</span>
      {ALL_CATEGORIES.map((category) => {
        const active = visible.has(category);
        return (
          <button
            key={category}
            type="button"
            className={`legend-chip${active ? " on" : ""}`}
            onClick={() => onToggle(category)}
            aria-pressed={active}
          >
            <span
              className="swatch"
              style={{ background: CATEGORY_COLORS[category] }}
            />
            {CATEGORY_LABELS[category]}
          </button>
        );
      })}
    </div>
  );
}
