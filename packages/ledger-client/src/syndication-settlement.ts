import type { JsonLedgerClient } from "./index.js";
import {
  buildAllocateAdvanceCommand,
  type CreateAdvanceAllocationArgs,
} from "./commands.js";
import { extractAllocationCid } from "./cash-settlement.js";
import { CASH } from "./commands.js";

export interface CapTableEntryLike {
  participant: string;
  shareBps: number;
  entryRef?: string;
}

/** Pro-rata share of face value (basis points). */
export function shareAmount(faceValue: number, shareBps: number): number {
  return (faceValue * shareBps) / 10000;
}

/** Compute waterfall: participants get pro-rata; lead gets remainder. */
export function computeWaterfall(
  faceValue: number,
  capTable: CapTableEntryLike[],
  lead: string
): Array<{ party: string; amount: number }> {
  const participantParts = capTable.map((e) => ({
    party: e.participant,
    amount: shareAmount(faceValue, e.shareBps),
  }));
  const distributed = participantParts.reduce((s, p) => s + p.amount, 0);
  const leadAmount = faceValue - distributed;
  return [...participantParts, { party: lead, amount: leadAmount }];
}

function unlockedMusdHoldingCids(
  rows: Awaited<ReturnType<JsonLedgerClient["getActiveContractsByTemplate"]>>,
  registryAdmin: string
): string[] {
  return rows
    .filter((h) => {
      const p = h.payload as {
        holding?: { instrumentId?: { id?: string; admin?: string }; lock?: unknown };
      };
      return (
        p.holding?.instrumentId?.id === "MUSD" &&
        p.holding?.instrumentId?.admin === registryAdmin &&
        !p.holding?.lock
      );
    })
    .map((h) => h.contractId);
}

/** Create sequential MUSD allocations for a waterfall distribution. */
export async function buildWaterfallAllocations(
  client: JsonLedgerClient,
  params: {
    rulesContractId: string;
    registryAdmin: string;
    executor: string;
    buyer: string;
    recipients: Array<{ party: string; amount: number }>;
    requestedAt: string;
    allocateBefore: string;
    settleBefore: string;
  }
): Promise<string[]> {
  const holdingRows = await client.getActiveContractsByTemplate(
    params.buyer,
    CASH.musdHolding
  );
  let holdingCids = unlockedMusdHoldingCids(holdingRows, params.registryAdmin);
  if (holdingCids.length === 0) throw new Error("buyer has no MUSD holdings");

  const allocationCids: string[] = [];
  for (const { party, amount } of params.recipients) {
    if (amount <= 0) continue;
    const allocArgs: CreateAdvanceAllocationArgs = {
      rulesContractId: params.rulesContractId,
      admin: params.registryAdmin,
      executor: params.executor,
      sender: params.buyer,
      receiver: party,
      amount: String(amount),
      requestedAt: params.requestedAt,
      allocateBefore: params.allocateBefore,
      settleBefore: params.settleBefore,
      inputHoldingCids: holdingCids,
    };
    const result = await client.submitAndWaitForTransaction({
      actAs: [params.buyer, params.registryAdmin],
      commands: [buildAllocateAdvanceCommand(allocArgs)],
    });
    const allocCid = extractAllocationCid(result);
    if (!allocCid) throw new Error("waterfall allocation failed");
    allocationCids.push(allocCid);

    const refreshed = await client.getActiveContractsByTemplate(
      params.buyer,
      CASH.musdHolding
    );
    holdingCids = unlockedMusdHoldingCids(refreshed, params.registryAdmin);
    if (holdingCids.length === 0 && params.recipients.indexOf({ party, amount }) < params.recipients.length - 1) {
      throw new Error("buyer has no remaining MUSD for waterfall");
    }
  }
  return allocationCids;
}
