import { useCallback, useEffect, useState } from "react";
import {
  api,
  useNotifications,
  type CapTableEntry,
  type ParticipationInterestSummary,
  type SyndicationOfferingSummary,
} from "../api";

type Tab = "lead" | "participant";

export function FinancierSyndicationPage() {
  const [tab, setTab] = useState<Tab>("lead");
  const [error, setError] = useState("");
  const [positions, setPositions] = useState<
    Array<{ contractId: string; receivableId: string; faceValue: string; state: string }>
  >([]);
  const [offerings, setOfferings] = useState<SyndicationOfferingSummary[]>([]);
  const [invitations, setInvitations] = useState<SyndicationOfferingSummary[]>([]);
  const [interests, setInterests] = useState<ParticipationInterestSummary[]>([]);
  const [capTables, setCapTables] = useState<Record<string, CapTableEntry[]>>({});
  const [selectedReceivable, setSelectedReceivable] = useState("");
  const [shareBps, setShareBps] = useState("4000");
  const [discountRate, setDiscountRate] = useState("0.05");
  const [offeringBids, setOfferingBids] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const [pos, off, inv, int] = await Promise.all([
        api.getFinancierPositions().catch(() => ({ positions: [] })),
        tab === "lead"
          ? api.getSyndicationOfferings().catch(() => ({ offerings: [] }))
          : Promise.resolve({ offerings: [] }),
        tab === "participant"
          ? api.getSyndicationInvitations().catch(() => ({ invitations: [] }))
          : Promise.resolve({ invitations: [] }),
        api.getSyndicationInterests(tab).catch(() => ({ interests: [] })),
      ]);
      setPositions(
        (pos.positions ?? [])
          .filter((p) => p.state === "Funded" || p.state === "PartiallySyndicated")
          .map((p) => ({
            contractId: p.contractId,
            receivableId: p.receivableId,
            faceValue: p.faceValue,
            state: p.state,
          }))
      );
      setOfferings(off.offerings ?? []);
      setInvitations(inv.invitations ?? []);
      setInterests(int.interests ?? []);

      if (tab === "lead") {
        const tables: Record<string, CapTableEntry[]> = {};
        for (const o of off.offerings ?? []) {
          if (o.roundState !== "Awarded") continue;
          try {
            const cap = await api.getSyndicationCapTable(o.receivableId);
            tables[o.receivableId] = cap.capTable;
          } catch {
            // cap table may not be projected yet
          }
        }
        setCapTables(tables);
      }
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [tab]);

  useNotifications(tab === "lead" ? "meridian-financier-a" : "meridian-financier-b", refresh);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleOpenOffering() {
    if (!selectedReceivable) {
      setError("Select a funded position");
      return;
    }
    const position = positions.find((p) => p.contractId === selectedReceivable);
    if (!position) return;
    try {
      await api.openSyndicationOffering({
        receivableCid: position.contractId,
        offeringId: `SYN-UI-${Date.now()}`,
      });
      setError("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleSubmitBid(offeringContractId: string, useStatic: boolean) {
    try {
      await api.submitSyndicationBid(offeringContractId, {
        shareBps: Number(shareBps),
        discountRate,
        useStaticReference: useStatic,
      });
      setError("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleAward(offeringContractId: string) {
    const bidCid = offeringBids[offeringContractId];
    if (!bidCid) {
      setError("Enter winning bid contract id");
      return;
    }
    try {
      await api.awardSyndicationBid(offeringContractId, { winningBidCid: bidCid });
      setError("");
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function loadBids(offeringContractId: string) {
    try {
      const { bids } = await api.getSyndicationBids(offeringContractId);
      if (bids.length > 0) {
        setOfferingBids((prev) => ({
          ...prev,
          [offeringContractId]: bids[0]!.contractId,
        }));
      }
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div>
      <h1>Syndication Desk</h1>
      <p>Secondary market — sealed interest bids; supplier and buyer never see syndication data.</p>
      {error && <p className="error">{error}</p>}

      <div className="tabs">
        <button
          type="button"
          className={tab === "lead" ? "active" : ""}
          onClick={() => setTab("lead")}
        >
          Lead financier
        </button>
        <button
          type="button"
          className={tab === "participant" ? "active" : ""}
          onClick={() => setTab("participant")}
        >
          Participant
        </button>
      </div>

      {tab === "lead" && (
        <>
          <h2>Eligible funded positions</h2>
          {positions.length === 0 && <p>No funded positions eligible for syndication.</p>}
          <select
            value={selectedReceivable}
            onChange={(e) => setSelectedReceivable(e.target.value)}
          >
            <option value="">Select position…</option>
            {positions.map((p) => (
              <option key={p.contractId} value={p.contractId}>
                {p.receivableId} — {p.faceValue} ({p.state})
              </option>
            ))}
          </select>
          <button type="button" onClick={handleOpenOffering}>
            Open syndication offering
          </button>

          <h2>Active offerings ({offerings.length})</h2>
          {offerings.map((o) => (
            <div key={o.contractId} className="card">
              <strong>{o.offeringId}</strong>{" "}
              <span className="badge">{o.roundState}</span>
              <p>Receivable {o.receivableId} · face {o.faceValue}</p>
              <p>
                Band {o.pricingBandMin}–{o.pricingBandMax} · deadline {o.deadline}
              </p>
              {o.roundState === "RoundOpen" && (
                <>
                  <button type="button" onClick={() => loadBids(o.contractId)}>
                    Load bids
                  </button>
                  <input
                    placeholder="Winning bid CID"
                    value={offeringBids[o.contractId] ?? ""}
                    onChange={(e) =>
                      setOfferingBids((prev) => ({
                        ...prev,
                        [o.contractId]: e.target.value,
                      }))
                    }
                  />
                  <button type="button" onClick={() => handleAward(o.contractId)}>
                    Award bid
                  </button>
                </>
              )}
              {capTables[o.receivableId] && (
                <div>
                  <h3>Cap table</h3>
                  <ul>
                    {capTables[o.receivableId]!.map((e) => (
                      <li key={e.entryRef ?? e.participant}>
                        {e.participant.slice(0, 20)}… — {e.shareBps} bps
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === "participant" && (
        <>
          <h2>Invitations ({invitations.length})</h2>
          {invitations.map((inv) => (
            <div key={inv.contractId} className="card">
              <strong>{inv.offeringId}</strong>{" "}
              <span className="badge">{inv.roundState}</span>
              <p>Lead {inv.leadFinancier.slice(0, 24)}…</p>
              <p>Face {inv.faceValue} · deadline {inv.deadline}</p>
              {(inv.roundState === "RoundOpen" ||
                inv.roundState === "StaticReferenceFallback") && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmitBid(
                      inv.contractId,
                      inv.roundState === "StaticReferenceFallback"
                    );
                  }}
                >
                  <label>
                    Share (bps)
                    <input
                      value={shareBps}
                      onChange={(e) => setShareBps(e.target.value)}
                    />
                  </label>
                  <label>
                    Discount rate
                    <input
                      value={discountRate}
                      onChange={(e) => setDiscountRate(e.target.value)}
                    />
                  </label>
                  <button type="submit">Submit sealed interest</button>
                </form>
              )}
            </div>
          ))}

          <h2>My participation interests ({interests.length})</h2>
          {interests.map((i) => (
            <div key={i.contractId} className="card">
              <strong>{i.receivableId}</strong>
              <p>
                {i.shareBps} bps · {i.legalNature} ({i.instrumentClass})
              </p>
              <p>Face {i.faceValue} {i.currency}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
