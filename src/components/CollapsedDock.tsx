import { setCollapsed } from "../hooks/useCollapsed";

export interface DockItem {
  id: string;
  letter: string;
  label: string;
}

interface CollapsedDockProps {
  items: DockItem[];
  className: string;
  ariaLabel: string;
}

/** Collapsed boxes as small letter squares, stacked one below the other. */
export function CollapsedDock({ items, className, ariaLabel }: CollapsedDockProps) {
  if (!items.length) return null;
  return (
    <nav className={`collapsed-dock ${className}`} aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="collapsed-square"
          data-square={item.id}
          title={`${item.label} – aufklappen`}
          aria-label={`${item.label} aufklappen`}
          aria-expanded={false}
          onClick={() => setCollapsed(item.id, false)}
        >
          {item.letter}
        </button>
      ))}
    </nav>
  );
}
