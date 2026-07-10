import type { LedgerRef } from "@meridian/shared-types";

/** Canton Lighthouse explorer base URL (devnet default). */
export const CANTON_EXPLORER_BASE =
  import.meta.env.VITE_CANTON_EXPLORER_URL ?? "https://lighthouse.devnet.cantonloop.com";

export function explorerTransactionUrl(updateId: string): string {
  return `${CANTON_EXPLORER_BASE}/transactions/${encodeURIComponent(updateId)}`;
}

export function explorerContractUrl(contractId: string): string {
  return `${CANTON_EXPLORER_BASE}/contracts/${encodeURIComponent(contractId)}`;
}

export function explorerUrl(ref: LedgerRef): string {
  return ref.kind === "transaction"
    ? explorerTransactionUrl(ref.id)
    : explorerContractUrl(ref.id);
}

export function truncateLedgerId(id: string, head = 6, tail = 6): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}
