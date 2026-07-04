import { useEffect } from "react";
import type {
  BidComparisonRow,
  BidPricingMode,
  BidSummary,
  FinancingRequestSummary,
  RoundState,
} from "@meridian/shared-types";

const API = import.meta.env.VITE_API_URL ?? "/api";

export interface BuyerObligation {
  contractId: string;
  receivableId: string;
  payee: string;
  faceValue: string;
  currency: string;
  dueDate: string;
  state?: string;
}

export interface ReceivableProposal {
  contractId: string;
  proposalId: string;
  supplier: string;
  buyer: string;
  faceValue: string;
  currency: string;
  dueDate: string;
}

export interface SupplierReceivable {
  contractId: string;
  receivableId: string;
  buyer: string;
  lineItems: Array<{ description: string; quantity: string; unitPrice: string }>;
  faceValue: string;
  currency: string;
  dueDate: string;
  state: string;
}

export interface FinancierInvitation {
  contractId: string;
  requestId: string;
  supplier: string;
  deadline: string;
  pricingBandMin: string;
  pricingBandMax: string;
  roundState: RoundState;
  creditProfileStub: string;
}

export type {
  FinancingRequestSummary,
  BidComparisonRow,
  BidSummary,
  BidPricingMode,
  RoundState,
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getParties: () =>
    fetchJson<{
      supplier: string;
      buyer: string;
      financierA: string;
      financierB: string;
    }>("/parties"),

  getBuyerObligations: () =>
    fetchJson<{ obligations: BuyerObligation[] }>("/buyer/obligations"),
  getBuyerRepayable: () =>
    fetchJson<{ obligations: BuyerObligation[] }>("/buyer/repayable-obligations"),
  repayObligation: (
    receivableContractId: string,
    body: { faceValue: string; payeePartyId?: string; settlementRef?: string }
  ) =>
    fetchJson<{ receivableContractId: string; proofContractId?: string }>(
      `/receivables/${encodeURIComponent(receivableContractId)}/repay`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  getSupplierPortfolio: () =>
    fetchJson<{
      receivables: SupplierReceivable[];
      repaymentProofs: Array<{ receivableId: string; amount: string; settlementRef: string }>;
    }>("/supplier/portfolio"),
  getFinancierPositions: () =>
    fetchJson<{ positions: SupplierReceivable[] }>("/financier/positions"),
  getBuyerProposals: () =>
    fetchJson<{ proposals: ReceivableProposal[] }>("/buyer/pending-proposals"),
  getSupplierReceivables: () =>
    fetchJson<{ receivables: SupplierReceivable[] }>("/supplier/receivables"),
  getConsentPolicies: () =>
    fetchJson<{ policies: unknown[] }>("/supplier/consent-policies"),

  getFinancingRounds: () =>
    fetchJson<{ rounds: FinancingRequestSummary[] }>("/financing/rounds"),
  getFinancingBids: (requestContractId: string) =>
    fetchJson<{ bids: BidComparisonRow[] }>(
      `/financing/${encodeURIComponent(requestContractId)}/bids`
    ),
  openFinancingRound: (body: {
    receivableCid: string;
    requestId?: string;
    financiers?: string[];
    deadline: string;
    pricingBandMin: string;
    pricingBandMax: string;
    redstoneFeedId?: number[];
  }) =>
    fetchJson<{ contractId: string }>("/financing/open", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  awardFinancingBid: (
    requestContractId: string,
    winningBidCid: string,
    advanceAmount?: string,
    financierPartyId?: string
  ) =>
    fetchJson<{ receivableContractId: string; settlementAllocationCid?: string }>(
      `/financing/${encodeURIComponent(requestContractId)}/award`,
      {
        method: "POST",
        body: JSON.stringify({ winningBidCid, advanceAmount, financierPartyId }),
      }
    ),
  pauseFinancingRound: (requestContractId: string) =>
    fetchJson<{ contractId: string }>(
      `/financing/${encodeURIComponent(requestContractId)}/pause`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  staticFallbackFinancingRound: (requestContractId: string) =>
    fetchJson<{ contractId: string }>(
      `/financing/${encodeURIComponent(requestContractId)}/static-fallback`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  expireFinancingRound: (requestContractId: string) =>
    fetchJson<{ contractId: string }>(
      `/financing/${encodeURIComponent(requestContractId)}/expire`,
      { method: "POST", body: JSON.stringify({}) }
    ),

  getFinancierInvitations: () =>
    fetchJson<{ invitations: FinancierInvitation[] }>("/financier/invitations"),
  getFinancierMyBids: () =>
    fetchJson<{ bids: BidSummary[] }>("/financier/my-bids"),
  submitFinancingBid: (
    requestContractId: string,
    body: { advanceAmount: string; discountRate: string; useStaticReference?: boolean }
  ) =>
    fetchJson<{ bidContractId: string; oracleFresh: boolean }>(
      `/financing/${encodeURIComponent(requestContractId)}/bid`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  replaceFinancingBid: (
    requestContractId: string,
    body: { advanceAmount: string; discountRate: string; useStaticReference?: boolean }
  ) =>
    fetchJson<{ bidContractId: string; oracleFresh: boolean }>(
      `/financing/${encodeURIComponent(requestContractId)}/replace-bid`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  proposeInvoice: (body: {
    proposalId?: string;
    faceValue: string;
    currency: string;
    dueDate: string;
    consentGranted: boolean;
  }) =>
    fetchJson<{ contractId: string }>("/invoices/propose", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cosignInvoice: (contractId: string) =>
    fetchJson<{ receivableContractId: string }>(
      `/invoices/${encodeURIComponent(contractId)}/cosign`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  createConsentPolicy: (body: { masterAgreementId: string; allowsAssignment: boolean }) =>
    fetchJson<{ contractId: string }>("/consent-policies", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export function useNotifications(orgId: string, onEvent: () => void): void {
  const wsUrl = import.meta.env.VITE_NOTIFICATIONS_WS ?? "ws://127.0.0.1:4020";
  useEffect(() => {
    const ws = new WebSocket(`${wsUrl}/events?orgId=${encodeURIComponent(orgId)}`);
    ws.onmessage = () => onEvent();
    return () => ws.close();
  }, [orgId, onEvent]);
}
