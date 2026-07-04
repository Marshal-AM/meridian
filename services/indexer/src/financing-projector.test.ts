import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseActiveBids,
  projectBid,
  projectFinancingRequest,
} from "./financing-projector.js";

describe("financing-projector", () => {
  it("projects financing request with active bid map", () => {
    const round = projectFinancingRequest("req-cid", {
      requestId: "ROUND-1",
      receivableCid: "recv-cid",
      supplier: "supplier::abc",
      invitedFinanciers: ["fin-a::abc", "fin-b::abc"],
      deadline: "2026-12-31T00:00:00Z",
      pricingBandMin: "0.01",
      pricingBandMax: "0.15",
      redstoneFeedId: [83, 79, 70, 82],
      roundState: "RoundOpen",
      activeBids: {
        map: [
          ["fin-a::abc", "bid-a"],
          ["fin-b::abc", "bid-b"],
        ],
      },
      bidHistory: [],
    });

    assert.equal(round.requestId, "ROUND-1");
    assert.equal(round.activeBidCount, 2);
    assert.equal(round.roundState, "RoundOpen");
  });

  it("projects bid summary", () => {
    const bid = projectBid("bid-cid", {
      requestId: "ROUND-1",
      financier: "fin-a::abc",
      supplier: "supplier::abc",
      advanceAmount: "1500.0",
      discountRate: "0.05",
      reportId: "redstone-123",
      mode: "OracleAnchored",
      redstoneTimestampMs: 1_700_000_000_000,
      ledgerTime: "2026-01-01T00:00:00Z",
    });

    assert.equal(bid.contractId, "bid-cid");
    assert.equal(bid.mode, "OracleAnchored");
    assert.equal(bid.discountRate, "0.05");
  });

  it("parses active bids from array encoding", () => {
    const map = parseActiveBids([
      ["party-a", "cid-a"],
      ["party-b", "cid-b"],
    ]);
    assert.equal(map.size, 2);
    assert.equal(map.get("party-a"), "cid-a");
  });
});
