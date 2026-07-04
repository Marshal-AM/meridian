import { useCallback, useEffect, useState } from "react";
import {
  api,
  useNotifications,
  type BidSummary,
  type FinancierInvitation,
} from "../api";

export function FinancierPage() {
  const [invitations, setInvitations] = useState<FinancierInvitation[]>([]);
  const [myBids, setMyBids] = useState<BidSummary[]>([]);
  const [error, setError] = useState("");
  const [advanceByRound, setAdvanceByRound] = useState<Record<string, string>>({});
  const [discountByRound, setDiscountByRound] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const [inv, bids] = await Promise.all([
        api.getFinancierInvitations(),
        api.getFinancierMyBids(),
      ]);
      setInvitations(inv.invitations);
      setMyBids(bids.bids);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useNotifications("meridian-financier-a", refresh);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmitBid(
    requestContractId: string,
    requestId: string,
    useStaticReference: boolean
  ) {
    const advanceAmount = advanceByRound[requestContractId] ?? "1000";
    const discountRate = discountByRound[requestContractId] ?? "0.05";
    const hasBid = myBids.some((b) => b.requestId === requestId);
    try {
      const submit = hasBid ? api.replaceFinancingBid : api.submitFinancingBid;
      const result = await submit(requestContractId, {
        advanceAmount,
        discountRate,
        useStaticReference,
      });
      if (!result.oracleFresh) {
        setError("Warning: oracle feed was stale — bid may be rejected on-ledger.");
      } else {
        setError("");
      }
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div>
      <h1>Financier Desk</h1>
      <p>Sealed-bid deal flow — invitations visible only to invited financiers.</p>
      {error && <p className="error">{error}</p>}

      <h2>Invitations ({invitations.length})</h2>
      {invitations.length === 0 && <p>No open invitations.</p>}
      {invitations.map((inv) => (
        <div key={inv.contractId} className="card">
          <strong>{inv.requestId}</strong>{" "}
          <span className="badge">{inv.roundState}</span>
          <p>
            Supplier: {inv.supplier.slice(0, 24)}… · Deadline {inv.deadline}
          </p>
          <p>
            Pricing band {inv.pricingBandMin}–{inv.pricingBandMax}
          </p>
          <p>Credit profile: {inv.creditProfileStub}</p>

          {(inv.roundState === "RoundOpen" || inv.roundState === "StaticReferenceFallback") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitBid(
                  inv.contractId,
                  inv.requestId,
                  inv.roundState === "StaticReferenceFallback"
                );
              }}
            >
              <label>
                Advance amount
                <input
                  value={advanceByRound[inv.contractId] ?? "1000"}
                  onChange={(e) =>
                    setAdvanceByRound((m) => ({ ...m, [inv.contractId]: e.target.value }))
                  }
                />
              </label>
              <label>
                Discount rate (decimal)
                <input
                  value={discountByRound[inv.contractId] ?? "0.05"}
                  onChange={(e) =>
                    setDiscountByRound((m) => ({ ...m, [inv.contractId]: e.target.value }))
                  }
                />
              </label>
              <button type="submit">
                {myBids.some((b) => b.requestId === inv.requestId)
                  ? inv.roundState === "StaticReferenceFallback"
                    ? "Replace Static Reference Bid"
                    : "Replace Oracle-Anchored Bid"
                  : inv.roundState === "StaticReferenceFallback"
                    ? "Submit Static Reference Bid"
                    : "Submit Oracle-Anchored Bid"}
              </button>
            </form>
          )}
        </div>
      ))}

      <h2>My Bids ({myBids.length})</h2>
      {myBids.length === 0 ? (
        <p>No active bids.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Advance</th>
              <th>Discount</th>
              <th>Mode</th>
              <th>Report</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {myBids.map((bid) => (
              <tr key={bid.contractId}>
                <td>{bid.requestId}</td>
                <td>{bid.advanceAmount}</td>
                <td>{bid.discountRate}</td>
                <td>{bid.mode}</td>
                <td>{bid.reportId.slice(0, 16)}…</td>
                <td>{bid.ledgerTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
