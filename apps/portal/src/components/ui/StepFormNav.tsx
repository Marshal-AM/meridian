import { Button } from "./Button";
import { LoadingSpinner } from "./LoadingSpinner";

interface StepFormNavProps {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  isLastStep?: boolean;
}

export function StepFormNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  backLabel = "Back",
  nextDisabled = false,
  busy = false,
  isLastStep = false,
}: StepFormNavProps) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      {onBack ? (
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {backLabel}
        </Button>
      ) : (
        <span className="hidden sm:block" aria-hidden />
      )}
      {onNext ? (
        <Button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || busy}
          className="w-full gap-2 sm:ml-auto sm:w-auto"
        >
          {busy ? <LoadingSpinner className="size-3.5" /> : null}
          {busy ? "Please wait…" : isLastStep ? nextLabel || "Submit" : nextLabel}
        </Button>
      ) : null}
    </div>
  );
}
