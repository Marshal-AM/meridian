import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BidSummary } from "@meridian/shared-types";
import { effectiveRateNormalized, rankBids } from "./bid-comparison.js";

describe("bid-comparison", () => {
  const bids: BidSummary[] = [
    {
      contractId: "bid-1",
      requestId: "ROUND-1",
      financier: "fin-a",
      supplier: "supplier",
      advanceAmount: "1000",
      discountRate: "0.06",
      reportId: "redstone-1",
      mode: "OracleAnchored",
      redstoneTimestampMs: Date.now() - 1000,
      ledgerTime: "2026-01-01T00:00:00Z",
    },
    {
      contractId: "bid-2",
      requestId: "ROUND-1",
      financier: "fin-b",
      supplier: "supplier",
      advanceAmount: "1000",
      discountRate: "0.04",
      reportId: "redstone-2",
      mode: "OracleAnchored",
      redstoneTimestampMs: Date.now() - 1000,
      ledgerTime: "2026-01-01T00:00:00Z",
    },
  ];

  it("computes SOFR-normalized effective rate", () => {
    assert.ok(Math.abs(effectiveRateNormalized(0.0366, 0.05) - 0.0866) < 1e-9);
  });

  it("ranks bids by lowest effective rate first", () => {
    const ranked = rankBids(bids, {
      referenceRate: 0.0366,
      maxAgeMs: 300_000,
      nowMs: Date.now(),
    });
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]!.bidContractId, "bid-2");
    assert.equal(ranked[0]!.rank, 1);
    assert.equal(ranked[1]!.rank, 2);
  });
});
