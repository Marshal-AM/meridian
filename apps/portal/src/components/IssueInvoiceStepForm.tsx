import { useState } from "react";
import { Send } from "lucide-react";
import { Alert } from "./ui/Alert";
import { Checkbox, Field, FieldDescription, FieldLabel } from "./ui/Field";
import { Input } from "./ui/Input";
import { DetailList, DetailRow } from "./ui/DetailList";
import { StepFormLayout } from "./ui/StepFormLayout";
import { StepFormNav } from "./ui/StepFormNav";
import { StepFormProgress } from "./ui/StepFormProgress";
import { Card } from "./ui/Surface";

const STEPS = ["Amount", "Terms", "Consent", "Review"] as const;

interface IssueInvoiceStepFormProps {
  faceValue: string;
  onFaceValueChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  consentGranted: boolean;
  onConsentGrantedChange: (value: boolean) => void;
  proposing: boolean;
  onSubmit: () => Promise<void>;
}

export function IssueInvoiceStepForm({
  faceValue,
  onFaceValueChange,
  currency,
  onCurrencyChange,
  dueDate,
  onDueDateChange,
  consentGranted,
  onConsentGrantedChange,
  proposing,
  onSubmit,
}: IssueInvoiceStepFormProps) {
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState("");

  function validateStep(current: number): boolean {
    setStepError("");
    if (current === 0) {
      const amount = Number(faceValue);
      if (!faceValue.trim() || !Number.isFinite(amount) || amount <= 0) {
        setStepError("Enter a valid face value greater than zero.");
        return false;
      }
      if (!currency.trim()) {
        setStepError("Currency is required.");
        return false;
      }
    }
    if (current === 1) {
      if (!dueDate) {
        setStepError("Due date is required.");
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    void onSubmit();
  }

  function handleBack() {
    setStepError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <StepFormLayout fitParent className="space-y-5">
      <StepFormProgress steps={[...STEPS]} currentStep={step} />

      {stepError && <Alert variant="destructive">{stepError}</Alert>}

      {step === 0 && (
        <div className="step-form-panel space-y-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,6rem)]">
            <Field>
              <FieldLabel htmlFor="faceValue">Face value</FieldLabel>
              <Input
                id="faceValue"
                value={faceValue}
                onChange={(e) => onFaceValueChange(e.target.value)}
                inputMode="decimal"
                placeholder="5000"
              />
              <FieldDescription>Total invoice amount proposed to the buyer.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                placeholder="USD"
              />
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="step-form-panel space-y-5">
          <Field>
            <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
            />
            <FieldDescription>
              Maturity date recorded on the receivable proposal sent for buyer co-signature.
            </FieldDescription>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="step-form-panel space-y-5">
          <Field>
            <FieldLabel>Assignment consent</FieldLabel>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={consentGranted}
                onChange={(e) => onConsentGrantedChange(e.target.checked)}
              />
              <span>
                Grant assignment consent inline on this proposal
                <FieldDescription className="mt-1">
                  One-time consent for this invoice only. For recurring trade, register a standing
                  policy under Assignment Consent.
                </FieldDescription>
              </span>
            </label>
          </Field>
        </div>
      )}

      {step === 3 && (
        <Card className="step-form-panel gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Review before proposing
          </p>
          <DetailList>
            <DetailRow term="Face value" value={`${faceValue} ${currency}`} />
            <DetailRow term="Due date" value={dueDate} />
            <DetailRow
              term="Assignment consent"
              value={consentGranted ? "Granted inline" : "Not granted"}
            />
          </DetailList>
        </Card>
      )}

      <StepFormNav
        onBack={step > 0 ? handleBack : undefined}
        onNext={handleNext}
        nextLabel={step < STEPS.length - 1 ? "Continue" : "Propose Invoice to Buyer"}
        isLastStep={step === STEPS.length - 1}
        busy={proposing}
      />
      {step === STEPS.length - 1 && proposing ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Send className="size-3.5" />
          Submitting proposal on-ledger…
        </p>
      ) : null}
    </StepFormLayout>
  );
}
