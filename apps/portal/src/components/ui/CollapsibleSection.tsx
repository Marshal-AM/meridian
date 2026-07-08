import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export interface CollapsibleSectionProps {
  title: string;
  count?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Highlight section header — use for primary/active groups. */
  emphasis?: boolean;
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  open,
  onOpenChange,
  children,
  emphasis = false,
  className,
}: CollapsibleSectionProps) {
  const panelId = `collapsible-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section
      className={cn(
        "collapsible-section",
        emphasis && "collapsible-section--emphasis",
        className
      )}
    >
      <button
        type="button"
        id={`${panelId}-trigger`}
        className="collapsible-section__trigger"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="collapsible-section__heading">
          <span className="collapsible-section__title">{title}</span>
          {count != null ? (
            <span className="collapsible-section__count">{count}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "collapsible-section__chevron size-4 shrink-0",
            open && "collapsible-section__chevron--open"
          )}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={`${panelId}-trigger`}
        className={cn(
          "collapsible-section__panel",
          !open && "collapsible-section__panel--closed"
        )}
      >
        <div className="collapsible-section__content">{children}</div>
      </div>
    </section>
  );
}
