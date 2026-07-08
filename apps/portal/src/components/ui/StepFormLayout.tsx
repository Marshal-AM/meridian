import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface StepFormLayoutProps {
  children: ReactNode;
  /** md ≈ 28rem fields; lg ≈ 32rem for wider grids */
  size?: "md" | "lg";
  className?: string;
  /** Parent already constrains width (e.g. inside Surface) */
  fitParent?: boolean;
}

const widthClass = {
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

export function StepFormLayout({
  children,
  size = "md",
  className,
  fitParent = false,
}: StepFormLayoutProps) {
  return (
    <div
      className={cn(
        fitParent
          ? "w-full min-w-0 max-w-full"
          : cn("mx-auto w-fit min-w-0", widthClass[size]),
        className
      )}
    >
      {children}
    </div>
  );
}
