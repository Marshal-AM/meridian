import type {
  ParticipationInterestSummary,
  RoundState,
  SyndicationBidSummary,
  SyndicationOfferingSummary,
} from "@meridian/shared-types";

export function isSyndicationOfferingTemplate(templateId: string): boolean {
  return templateId.includes("SyndicationOffering:SyndicationOffering");
}

export function isSyndicationBidTemplate(templateId: string): boolean {
  return templateId.includes("SyndicationBid:SyndicationBid");
}

export function isParticipationInterestTemplate(templateId: string): boolean {
  return templateId.includes("ParticipationInterest:ParticipationInterest");
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function parsePartyList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => str(p));
}

function parseActiveBids(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (raw == null) return out;
  let entries: unknown[] | undefined;
  if (Array.isArray(raw)) entries = raw;
  else if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    entries = (obj.map as unknown[] | undefined) ?? (obj.entries as unknown[] | undefined);
  }
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const key = str(e.key ?? e._1);
    const val = str(e.value ?? e._2);
    if (key && val) out.set(key, val);
  }
  return out;
}

function parseRoundState(raw: unknown): RoundState {
  const state = str(raw);
  switch (state) {
    case "RoundOpen":
    case "Paused":
    case "StaticReferenceFallback":
    case "Awarded":
    case "Expired":
      return state;
    default:
      return "RoundOpen";
  }
}

export function projectSyndicationOffering(
  contractId: string,
  payload: Record<string, unknown>
): SyndicationOfferingSummary {
  const activeBids = parseActiveBids(payload.activeBids);
  return {
    contractId,
    offeringId: str(payload.offeringId),
    receivableCid: str(payload.receivableCid),
    receivableId: str(payload.receivableId),
    leadFinancier: str(payload.leadFinancier),
    invitedParticipants: parsePartyList(payload.invitedParticipants),
    deadline: str(payload.deadline),
    pricingBandMin: str(payload.pricingBandMin),
    pricingBandMax: str(payload.pricingBandMax),
    roundState: parseRoundState(payload.roundState),
    activeBidCount: activeBids.size,
    faceValue: str(payload.faceValue),
    currency: str(payload.currency),
  };
}

export function projectSyndicationBid(
  contractId: string,
  payload: Record<string, unknown>
): SyndicationBidSummary {
  return {
    contractId,
    offeringId: str(payload.offeringId),
    participant: str(payload.participant),
    leadFinancier: str(payload.leadFinancier),
    shareBps: Number(payload.shareBps ?? 0),
    discountRate: str(payload.discountRate),
    reportId: str(payload.reportId),
    mode: str(payload.mode) === "StaticReference" ? "StaticReference" : "OracleAnchored",
  };
}

export function projectParticipationInterest(
  contractId: string,
  payload: Record<string, unknown>
): ParticipationInterestSummary {
  return {
    contractId,
    receivableId: str(payload.receivableId),
    leadFinancier: str(payload.leadFinancier),
    participant: str(payload.participant),
    shareBps: Number(payload.shareBps ?? 0),
    faceValue: str(payload.faceValue),
    currency: str(payload.currency),
    legalNature: str(payload.legalNature),
    instrumentClass: str(payload.instrumentClass),
    entryRef: str(payload.entryRef),
  };
}

export function parseCapTable(raw: unknown): Array<{
  participant: string;
  shareBps: number;
  entryRef: string;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      participant: str(e.participant),
      shareBps: Number(e.shareBps ?? 0),
      entryRef: str(e.entryRef),
    };
  });
}
