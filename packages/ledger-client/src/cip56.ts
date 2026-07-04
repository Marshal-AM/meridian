/** CIP-56 Splice interface identifiers (package-name form). */
export const CIP56_INTERFACES = {
  holding: "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding",
  transferFactory:
    "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory",
  allocationFactory:
    "#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory",
  allocation: "#splice-api-token-allocation-v1:Splice.Api.Token.AllocationV1:Allocation",
} as const;

import { CASH_PACKAGE, RECEIVABLE_PACKAGE } from "./commands.js";

export const CASH_TEMPLATES = {
  cashRegistry: `#${CASH_PACKAGE}:Meridian.Cash.Registry:CashRegistry`,
  musdRules: `#${CASH_PACKAGE}:Meridian.Cash.Registry:MusdRules`,
  musdHolding: `#${CASH_PACKAGE}:Meridian.Cash.Holding:MusdHolding`,
  repaymentProof: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.RepaymentProof:RepaymentProof`,
} as const;

export const MUSD_INSTRUMENT_ID = "MUSD";

export interface HoldingView {
  owner: string;
  amount: string;
  instrumentId: { id: string; admin: string };
  lock?: unknown;
}

export function isMusdHolding(
  view: HoldingView,
  registryAdmin: string
): boolean {
  return (
    view.instrumentId?.id === MUSD_INSTRUMENT_ID &&
    view.instrumentId?.admin === registryAdmin
  );
}

export function sumMusdHoldings(
  holdings: HoldingView[],
  registryAdmin: string
): number {
  return holdings
    .filter((h) => isMusdHolding(h, registryAdmin) && !h.lock)
    .reduce((sum, h) => sum + Number(h.amount), 0);
}
