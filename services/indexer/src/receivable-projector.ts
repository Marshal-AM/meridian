import type {
  BuyerReceivableView,
  ConsentPolicySummary,
  ReceivableProposalSummary,
  ReceivableState,
  SupplierReceivableView,
} from "@meridian/shared-types";
import { TEMPLATE_IDS } from "@meridian/ledger-client";

export function isReceivableTemplate(templateId: string): boolean {
  return (
    templateId.includes("Receivable:Receivable") &&
    !templateId.includes("ReceivableProposal")
  );
}

export function isReceivableProposalTemplate(templateId: string): boolean {
  return templateId.includes("ReceivableProposal");
}

export function isConsentPolicyTemplate(templateId: string): boolean {
  return templateId.includes("AssignmentConsentPolicy");
}

export interface ParsedCreatedEvent {
  contractId: string;
  templateId: string;
  payload: Record<string, unknown>;
}

/** Seaport JSON API may wrap event payloads in `{ value: ... }`. */
function unwrapEventPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const inner = (obj.value as Record<string, unknown> | undefined) ?? obj;
  return inner;
}

export function extractCreatedEvents(events: unknown[]): ParsedCreatedEvent[] {
  const created: ParsedCreatedEvent[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const obj = ev as Record<string, unknown>;
    const createdRaw =
      obj.CreatedEvent ?? obj.createdEvent;
    const createdEvent = unwrapEventPayload(createdRaw);
    if (!createdEvent) continue;
    const contractId = String(createdEvent.contractId ?? "");
    const templateId = String(createdEvent.templateId ?? "");
    const payload =
      (createdEvent.createArgument as Record<string, unknown> | undefined) ??
      (createdEvent.createArguments as Record<string, unknown> | undefined) ??
      {};
    if (contractId && templateId) {
      created.push({ contractId, templateId, payload });
    }
  }
  return created;
}

export function extractArchivedContractIds(events: unknown[]): string[] {
  const ids: string[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const obj = ev as Record<string, unknown>;
    const archivedRaw =
      obj.ArchivedEvent ?? obj.archivedEvent;
    const archived = unwrapEventPayload(archivedRaw);
    if (archived?.contractId) {
      ids.push(String(archived.contractId));
    }
  }
  return ids;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "tag" in v) {
    return String((v as { tag: unknown }).tag);
  }
  return String(v);
}

function parseLineItems(raw: unknown): SupplierReceivableView["lineItems"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    return {
      description: str(o.description),
      quantity: str(o.quantity),
      unitPrice: str(o.unitPrice),
    };
  });
}

export function projectBuyerView(
  contractId: string,
  payload: Record<string, unknown>
): BuyerReceivableView {
  const payeeOfRecord = payload.payeeOfRecord as Record<string, unknown> | undefined;
  return {
    contractId,
    receivableId: str(payload.receivableId ?? payload.proposalId),
    payee: str(payeeOfRecord?.payee ?? payload.supplier),
    faceValue: str(payload.faceValue),
    currency: str(payload.currency),
    dueDate: str(payload.dueDate),
    state: str(payload.state) as ReceivableState,
  };
}

export function projectSupplierView(
  contractId: string,
  payload: Record<string, unknown>
): SupplierReceivableView {
  const payeeOfRecord = payload.payeeOfRecord as Record<string, unknown> | undefined;
  return {
    contractId,
    receivableId: str(payload.receivableId ?? payload.proposalId),
    buyer: str(payload.buyer),
    lineItems: parseLineItems(payload.lineItems),
    faceValue: str(payload.faceValue),
    currency: str(payload.currency),
    dueDate: str(payload.dueDate),
    state: str(payload.state) as ReceivableState,
    assignmentConsentGranted: Boolean(payload.assignmentConsentGranted),
    payeeOfRecord: {
      payee: str(payeeOfRecord?.payee ?? payload.supplier),
      payeeRole: str(payeeOfRecord?.payeeRole ?? "Supplier"),
    },
  };
}

export function projectProposal(
  contractId: string,
  payload: Record<string, unknown>
): ReceivableProposalSummary {
  return {
    contractId,
    proposalId: str(payload.proposalId),
    supplier: str(payload.supplier),
    buyer: str(payload.buyer),
    faceValue: str(payload.faceValue),
    currency: str(payload.currency),
    dueDate: str(payload.dueDate),
  };
}

export function projectConsentPolicy(
  contractId: string,
  payload: Record<string, unknown>
): ConsentPolicySummary {
  return {
    contractId,
    buyer: str(payload.buyer),
    supplier: str(payload.supplier),
    masterAgreementId: str(payload.masterAgreementId),
    grantedAt: str(payload.grantedAt),
    allowsAssignment: Boolean(payload.allowsAssignment),
  };
}

export function templateMatches(templateId: string, expected: string): boolean {
  return templateId === expected || templateId.endsWith(expected.replace(/^#/, ""));
}

export function projectRepaymentProof(
  contractId: string,
  payload: Record<string, unknown>
): {
  contractId: string;
  receivableId: string;
  payer: string;
  payee: string;
  amount: string;
  currency: string;
  paidAt: string;
  settlementRef: string;
} {
  return {
    contractId,
    receivableId: str(payload.receivableId),
    payer: str(payload.payer),
    payee: str(payload.payee),
    amount: str(payload.amount),
    currency: str(payload.currency),
    paidAt: str(payload.paidAt),
    settlementRef: str(payload.settlementRef),
  };
}

export function isRepaymentProofTemplate(templateId: string): boolean {
  return templateId.includes("RepaymentProof");
}
