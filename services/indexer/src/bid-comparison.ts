import type { BidComparisonRow, BidSummary } from "@meridian/shared-types";

/** SOFR feed id as ASCII bytes (matches on-ledger sofrFeedIdAscii). */
export const SOFR_FEED_ID_ASCII = [83, 79, 70, 82];

export interface BidComparisonOptions {
  /** SOFR reference rate as decimal (e.g. 0.0366 for 3.66%). */
  referenceRate: number;
  /** Max oracle report age for freshness flag. */
  maxAgeMs: number;
  nowMs?: number;
}

/** effectiveRateNormalized on-ledger: referenceRate + discountRate. */
export function effectiveRateNormalized(referenceRate: number, discountRate: number): number {
  return referenceRate + discountRate;
}

function parseDecimal(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatRate(rate: number): string {
  return rate.toFixed(6);
}

export function isOracleFresh(
  redstoneTimestampMs: number,
  maxAgeMs: number,
  nowMs: number
): boolean {
  if (!redstoneTimestampMs) return false;
  const ageMs = nowMs - redstoneTimestampMs;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

/** Rank supplier-visible bids by SOFR-normalized effective rate (lowest first). */
export function rankBids(
  bids: BidSummary[],
  options: BidComparisonOptions
): BidComparisonRow[] {
  const nowMs = options.nowMs ?? Date.now();
  const ranked = bids
    .map((bid) => {
      const discountRate = parseDecimal(bid.discountRate);
      const effectiveRate = effectiveRateNormalized(options.referenceRate, discountRate);
      return {
        bidContractId: bid.contractId,
        financier: bid.financier,
        advanceAmount: bid.advanceAmount,
        discountRate: bid.discountRate,
        effectiveRate: formatRate(effectiveRate),
        reportId: bid.reportId,
        mode: bid.mode,
        oracleFresh:
          bid.mode === "StaticReference" ||
          isOracleFresh(bid.redstoneTimestampMs, options.maxAgeMs, nowMs),
        rank: 0,
        _sortRate: effectiveRate,
      };
    })
    .sort((a, b) => a._sortRate - b._sortRate || a.bidContractId.localeCompare(b.bidContractId));

  return ranked.map((row, index) => {
    const { _sortRate: _, ...rest } = row;
    return { ...rest, rank: index + 1 };
  });
}
