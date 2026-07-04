import type { LedgerCommand } from "./commands.js";
import {
  buildAllocateAdvanceCommand,
  buildAwardBidCommand,
  type AwardBidArgs,
  type CreateAdvanceAllocationArgs,
} from "./commands.js";

export interface AdvanceSettlementParams {
  rulesContractId: string;
  registryAdmin: string;
  executor: string;
  financier: string;
  supplier: string;
  advanceAmount: string;
  inputHoldingCids: string[];
  requestedAt: string;
  allocateBefore: string;
  settleBefore: string;
}

export function buildAdvanceAllocationCommand(
  params: AdvanceSettlementParams
): LedgerCommand {
  const args: CreateAdvanceAllocationArgs = {
    rulesContractId: params.rulesContractId,
    admin: params.registryAdmin,
    executor: params.executor,
    sender: params.financier,
    receiver: params.supplier,
    amount: params.advanceAmount,
    requestedAt: params.requestedAt,
    allocateBefore: params.allocateBefore,
    settleBefore: params.settleBefore,
    inputHoldingCids: params.inputHoldingCids,
  };
  return buildAllocateAdvanceCommand(args);
}

export function extractAllocationCid(result: {
  transaction?: { events?: unknown[] };
}): string | null {
  // Canton v2 submit-and-wait returns only Created/Archived events (no ExercisedEvent).
  // Find the MusdAllocation created contract, which IS the allocation CID.
  for (const ev of result.transaction?.events ?? []) {
    if (!ev || typeof ev !== "object") continue;
    const obj = ev as Record<string, unknown>;
    const createdRaw = obj.CreatedEvent ?? obj.createdEvent;
    if (!createdRaw || typeof createdRaw !== "object") continue;
    const createdObj = createdRaw as Record<string, unknown>;
    // Handle optional { value: ... } wrapping from Seaport API
    const created =
      (createdObj.value as Record<string, unknown> | undefined) ?? createdObj;
    if (!created?.contractId) continue;
    const templateId = String(created.templateId ?? "");
    // MusdAllocation implements AllocationV1.Allocation — it is NOT a Holding
    if (
      (templateId.includes("Allocation") || templateId.includes("MusdAllocation")) &&
      !templateId.includes("Holding")
    ) {
      return String(created.contractId);
    }
  }
  return null;
}

export function buildAwardWithDvPCommands(
  settlement: AdvanceSettlementParams,
  award: Omit<AwardBidArgs, "settlementAllocationCid" | "expectedAdvance"> & {
    expectedAdvance: string;
  },
  allocationCid: string
): LedgerCommand[] {
  return [
    buildAwardBidCommand({
      ...award,
      settlementAllocationCid: allocationCid,
      expectedAdvance: award.expectedAdvance,
    }),
  ];
}
