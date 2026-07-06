import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

export interface ChoiceCardProps {
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function ChoiceCard({
  selected,
  onSelectedChange,
  title,
  description,
  disabled = false,
  className,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onSelectedChange(!selected)}
      className={cn("choice-field", selected && "choice-field--selected", className)}
    >
      <span
        className={cn(
          "choice-field__indicator",
          selected && "choice-field__indicator--selected"
        )}
        aria-hidden
      >
        {selected ? <Check className="size-2.5 stroke-[3]" /> : null}
      </span>
      <span className="choice-field__content">
        <span className="choice-field__title">{title}</span>
        {description ? (
          <span className="choice-field__description">{description}</span>
        ) : null}
      </span>
    </button>
  );
}

export function ChoiceCardGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("choice-field-group", className)}>{children}</div>;
}
