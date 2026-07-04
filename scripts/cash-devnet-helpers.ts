import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { JsonLedgerClient } from "@meridian/ledger-client";
import {
  buildAdvanceAllocationCommand,
  buildAwardBidCommand,
  buildMarkOverdueCommand,
  buildRepayWithProofCommand,
  CASH,
  CIP56_INTERFACES,
  extractAllocationCid,
  extractCreatedContractId,
  REPAYMENT_PROOF,
} from "@meridian/ledger-client";

export interface CashManifest {
  registryAdminPartyId: string;
  rulesContractId: string;
}

export function loadCashManifest(root: string): CashManifest {
  const path = join(root, "infra/manifests/cash.devnet.json");
  if (!existsSync(path)) {
    throw new Error(`cash manifest missing at ${path} — run: pnpm bootstrap:cash:devnet`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as CashManifest;
}

export async function awardWithDvP(
  client: JsonLedgerClient,
  cash: CashManifest,
  params: {
    supplier: string;
    financier: string;
    requestCid: string;
    bidCid: string;
    advanceAmount: string;
  }
): Promise<{ fundedReceivableCid: string; allocationCid: string }> {
  const now = new Date().toISOString();
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString();
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString();

  const holdings = await client.getActiveContractsByInterface(
    params.financier,
    CIP56_INTERFACES.holding
  );
  const holdingCid = holdings.find((h) => h.templateId.includes("MusdHolding"))?.contractId;
  if (!holdingCid) throw new Error("financier has no MUSD holding");

  const allocResult = await client.submitAndWaitForTransaction({
    actAs: [params.financier, cash.registryAdminPartyId],
    commands: [
      buildAdvanceAllocationCommand({
        rulesContractId: cash.rulesContractId,
        registryAdmin: cash.registryAdminPartyId,
        executor: params.supplier,
        financier: params.financier,
        supplier: params.supplier,
        advanceAmount: params.advanceAmount,
        inputHoldingCids: [holdingCid],
        requestedAt: now,
        allocateBefore: weekLater,
        settleBefore: twoWeeks,
      }),
    ],
  });
  // Debug: dump the raw allocation result to understand the event structure
  // console.log("DEBUG allocResult:", JSON.stringify(allocResult, null, 2).slice(0, 3000));
  const allocationCid = extractAllocationCid(allocResult);
  if (!allocationCid) throw new Error("allocation cid missing");

  const awardResult = await client.submitAndWaitForTransaction({
    actAs: [params.supplier, params.financier],
    commands: [
      buildAwardBidCommand({
        requestContractId: params.requestCid,
        winningBidCid: params.bidCid,
        settlementAllocationCid: allocationCid,
        expectedAdvance: params.advanceAmount,
        settlementFinancier: params.financier,
      }),
    ],
  });
  const fundedReceivableCid = extractCreatedContractId(awardResult, "Receivable");
  if (!fundedReceivableCid) throw new Error("funded receivable cid missing");
  return { fundedReceivableCid, allocationCid };
}

export async function repayWithProof(
  client: JsonLedgerClient,
  cash: CashManifest,
  params: {
    buyer: string;
    supplier: string;
    payee: string;
    receivableCid: string;
    faceValue: string;
    settlementRef: string;
  }
): Promise<{ repaidReceivableCid: string; proofCid: string }> {
  const now = new Date().toISOString();
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString();
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString();

  const holdings = await client.getActiveContractsByInterface(
    params.buyer,
    CIP56_INTERFACES.holding
  );
  const holdingCid = holdings.find((h) => h.templateId.includes("MusdHolding"))?.contractId;
  if (!holdingCid) throw new Error("buyer has no MUSD holding");

  const allocResult = await client.submitAndWaitForTransaction({
    actAs: [params.buyer, cash.registryAdminPartyId],
    commands: [
      buildAdvanceAllocationCommand({
        rulesContractId: cash.rulesContractId,
        registryAdmin: cash.registryAdminPartyId,
        executor: params.supplier,
        financier: params.buyer,
        supplier: params.payee,
        advanceAmount: params.faceValue,
        inputHoldingCids: [holdingCid],
        requestedAt: now,
        allocateBefore: weekLater,
        settleBefore: twoWeeks,
      }),
    ],
  });
  const allocationCid = extractAllocationCid(allocResult);
  if (!allocationCid) throw new Error("repayment allocation cid missing");

  const repayResult = await client.submitAndWaitForTransaction({
    actAs: [params.buyer, params.payee, params.supplier],
    commands: [
      buildRepayWithProofCommand({
        receivableContractId: params.receivableCid,
        settlementAllocationCid: allocationCid,
        expectedAmount: params.faceValue,
        settlementRef: params.settlementRef,
      }),
    ],
  });
  const repaidReceivableCid = extractCreatedContractId(repayResult, "Receivable:Receivable");
  const proofCid = extractCreatedContractId(repayResult, "RepaymentProof");
  if (!repaidReceivableCid || !proofCid) {
    throw new Error("repayment result missing contract ids");
  }
  return { repaidReceivableCid, proofCid };
}

export async function markOverdue(
  client: JsonLedgerClient,
  params: { supplier: string; receivableCid: string }
): Promise<string> {
  const result = await client.submitAndWaitForTransaction({
    actAs: [params.supplier],
    commands: [buildMarkOverdueCommand({ receivableContractId: params.receivableCid })],
  });
  const cid = extractCreatedContractId(result);
  if (!cid) throw new Error("overdue receivable cid missing");
  return cid;
}

export async function fetchRepaymentProofs(
  client: JsonLedgerClient,
  supplier: string,
  receivableId: string
): Promise<Array<{ contractId: string; receivableId: string }>> {
  const rows = await client.getActiveContractsByTemplate(supplier, REPAYMENT_PROOF);
  return rows
    .filter((r) => String((r.payload as Record<string, unknown>).receivableId) === receivableId)
    .map((r) => ({
      contractId: r.contractId,
      receivableId: String((r.payload as Record<string, unknown>).receivableId),
    }));
}

export async function musdBalance(
  client: JsonLedgerClient,
  party: string,
  registryAdmin: string
): Promise<number> {
  // Primary: query by MusdHolding template directly (always works after package upload)
  const rows = await client.getActiveContractsByTemplate(party, CASH.musdHolding);
  let total = 0;
  for (const row of rows) {
    const p = row.payload as {
      holding?: {
        owner?: string;
        amount?: string;
        instrumentId?: { id?: string; admin?: string };
        lock?: unknown;
      };
    };
    const h = p.holding;
    if (
      h?.instrumentId?.id === "MUSD" &&
      h?.instrumentId?.admin === registryAdmin &&
      !h?.lock
    ) {
      total += Number(h?.amount ?? 0);
    }
  }
  // Fallback: interface-based query (requires package vetting to be complete)
  if (total === 0) {
    const irows = await client.getActiveContractsByInterface(party, CIP56_INTERFACES.holding);
    for (const row of irows) {
      for (const iv of row.interfaceViews) {
        const view = iv.viewValue as {
          amount?: string;
          instrumentId?: { id?: string; admin?: string };
          lock?: unknown;
        } | null;
        if (
          view?.instrumentId?.id === "MUSD" &&
          view?.instrumentId?.admin === registryAdmin &&
          !view?.lock
        ) {
          total += Number(view?.amount ?? 0);
        }
      }
    }
  }
  return total;
}
