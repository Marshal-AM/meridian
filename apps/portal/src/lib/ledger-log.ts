import type { LedgerRef } from "@meridian/shared-types";

const CONTRACT_FIELD_LABELS: Record<string, string> = {
  contractId: "Contract",
  bidContractId: "Bid",
  receivableContractId: "Receivable",
  proofContractId: "Proof",
  settlementAllocationCid: "Settlement",
  offeringContractId: "Offering",
  participationInterestCid: "Participation",
};

const CONTRACT_ARRAY_FIELDS: Record<string, string> = {
  settlementAllocationCids: "Settlement",
};

/** Extract explorer-linkable refs from a portal-api mutation response. */
export function ledgerRefsFromApiResponse(response: unknown): LedgerRef[] {
  if (response == null || typeof response !== "object") return [];

  const record = response as Record<string, unknown>;
  const refs: LedgerRef[] = [];
  const seen = new Set<string>();

  const push = (kind: LedgerRef["kind"], id: unknown, label?: string) => {
    if (typeof id !== "string" || !id) return;
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ kind, id, label });
  };

  push("transaction", record.transaction, "Update");

  for (const [field, label] of Object.entries(CONTRACT_FIELD_LABELS)) {
    push("contract", record[field], label);
  }

  for (const [field, label] of Object.entries(CONTRACT_ARRAY_FIELDS)) {
    const value = record[field];
    if (!Array.isArray(value)) continue;
    value.forEach((id, index) => {
      push("contract", id, value.length > 1 ? `${label} ${index + 1}` : label);
    });
  }

  return refs;
}
