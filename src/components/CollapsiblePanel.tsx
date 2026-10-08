import type { ReactNode } from "react";
import { useId } from "react";
import { useCollapsed } from "../hooks/useCollapsed";

interface CollapsiblePanelProps {
  /** Stable key for the persisted collapsed state. */
  id: string;
  title: ReactNode;
  className?: string;
  /** Extra controls on the header row (hidden while collapsed). */
  headerExtra?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}

/** A framed box whose header toggles the body. Collapsed = header only. */
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
      className={`panel collapsible-panel${collapsed ? " is-collapsed" : ""}${
        className ? ` ${className}` : ""
      }`}
      data-panel={id}
    >
      <div className="panel-head">
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          title={collapsed ? "Aufklappen" : "Einklappen"}
          onClick={toggle}
        >
          <span className="panel-chevron" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <h2>{title}</h2>
        </button>
        {headerExtra && !collapsed ? (
          <div className="panel-head-extra">{headerExtra}</div>
        ) : null}
      </div>
      <div
        id={bodyId}
        className={`panel-body${bodyClassName ? ` ${bodyClassName}` : ""}`}
        hidden={collapsed}
      >
        {children}
      </div>
    </section>
  );
}
