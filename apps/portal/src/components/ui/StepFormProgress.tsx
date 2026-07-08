import { cn } from "../../lib/utils";

interface StepFormProgressProps {
  steps: string[];
  currentStep: number;
}

export function StepFormProgress({ steps, currentStep }: StepFormProgressProps) {
  const currentLabel = steps[currentStep];

  return (
    <div
      className="step-form-progress mb-8 w-full"
      style={{ "--step-count": steps.length } as React.CSSProperties}
    >
      <p className="step-form-progress__caption">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
          Step {currentStep + 1} of {steps.length}
        </span>
        <span className="mx-1.5 text-border" aria-hidden>
          ·
        </span>
        <span className="font-semibold text-foreground">{currentLabel}</span>
      </p>

      <div
        className="step-form-progress__segments"
        role="progressbar"
        aria-valuenow={currentStep + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-label={`${currentLabel}, step ${currentStep + 1} of ${steps.length}`}
      >
        {steps.map((label, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div
              key={label}
              className={cn(
                "step-form-progress__segment-bar",
                done && "step-form-progress__segment-bar--done",
                active && "step-form-progress__segment-bar--active"
              )}
              aria-hidden
            />
          );
        })}
      </div>

      <ol className="step-form-progress__labels">
        {steps.map((label, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <li
              key={label}
              className={cn(
                "step-form-progress__label",
                active && "step-form-progress__label--active",
                done && !active && "step-form-progress__label--done"
              )}
            >
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
