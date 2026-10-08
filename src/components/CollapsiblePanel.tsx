import type { ReactNode } from "react";
import { useId } from "react";
import { useCollapsed } from "../hooks/useCollapsed";

interface CollapsiblePanelProps {
  /** Stable key for the persisted collapsed state. */
  id: string;
  title: ReactNode;
  className?: string;
  /** Extra controls on the header row. */
  headerExtra?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * A framed box with a ▾ header toggle. Collapsed, the box is hidden here and
 * shows up as a letter square in the dock (see CollapsedDock). It stays
 * mounted so form state survives.
 */
export function CollapsiblePanel({
  id,
  title,
  className,
  headerExtra,
  bodyClassName,
  children,
}: CollapsiblePanelProps) {
  const [collapsed, toggle] = useCollapsed(id);
  const bodyId = useId();
  return (
    <section
      className={`panel collapsible-panel${className ? ` ${className}` : ""}`}
      data-panel={id}
      hidden={collapsed}
    >
      <div className="panel-head">
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          title="Einklappen"
          onClick={toggle}
        >
          <span className="panel-chevron" aria-hidden="true">
            ▾
          </span>
          <h2>{title}</h2>
        </button>
        {headerExtra ? (
          <div className="panel-head-extra">{headerExtra}</div>
        ) : null}
      </div>
      <div
        id={bodyId}
        className={`panel-body${bodyClassName ? ` ${bodyClassName}` : ""}`}
      >
        {children}
      </div>
    </section>
  );
}
