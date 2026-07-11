import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Gavel, Users } from "lucide-react";
import {
  api,
  useNotifications,
  type CapTableEntry,
  type ParticipationInterestSummary,
  type SyndicationOfferingSummary,
} from "../api";
import { usePageTab } from "../hooks/usePageTab";
import { usePageFeedback } from "../hooks/usePageFeedback";
import { useActivityLog } from "../hooks/useActivityLog";
import { useFollowUpRefresh } from "../hooks/useFollowUpRefresh";
import { EmptyState, PageHeader } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { PageFeedback } from "../components/ui/PageFeedback";
import { Dialog } from "../components/ui/Dialog";
import { Surface } from "../components/ui/Surface";
import { Field, FieldGroup, FieldLabel } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { CustomSelect } from "../components/ui/CustomSelect";
import { DataTable } from "../components/ui/DataTable";
import { PageTabBar } from "../components/ui/PageTabBar";
import { ActivityLogPanel } from "../components/ui/ActivityLogPanel";
import { formatIdTimestamp, sortByIdTimeDesc, truncateParty } from "../lib/utils";

export function FinancierSyndicationPage() {
  const [tab, setTab] = usePageTab(["lead", "participant"] as const, "lead");
  const [participantView, setParticipantView] = useState<"invitations" | "interests">(
    "invitations"
  );
  const { success, setSuccess, error, setError } = usePageFeedback();
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
  const [openingOffering, setOpeningOffering] = useState(false);
  const [submittingBidId, setSubmittingBidId] = useState<string | null>(null);
  const [awardingId, setAwardingId] = useState<string | null>(null);
  const [loadingBidsId, setLoadingBidsId] = useState<string | null>(null);
  const [bidDialogOffering, setBidDialogOffering] = useState<SyndicationOfferingSummary | null>(
    null
  );
  const { entries: logEntries, info, error: logError, clear: clearLog, logLedger } =
    useActivityLog("financier-syndication");

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
      const message = String(e);
      setError(message);
      logError("Failed to refresh syndication data", { error: message });
    }
  }, [tab, logError]);

  const followUpRefresh = useFollowUpRefresh(refresh);

  const onLedgerNotify = useCallback(() => {
    info("Ledger notification received — refreshing syndication desk");
    void followUpRefresh();
  }, [info, followUpRefresh]);

  useNotifications(
    tab === "lead" ? "meridian-financier-a" : "meridian-financier-b",
    refresh,
    { onNotify: onLedgerNotify }
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sortedOfferings = useMemo(
    () => sortByIdTimeDesc(offerings, (o) => o.offeringId),
    [offerings]
  );
  const sortedInvitations = useMemo(
    () => sortByIdTimeDesc(invitations, (o) => o.offeringId),
    [invitations]
  );
  const sortedInterests = useMemo(
    () => sortByIdTimeDesc(interests, (i) => i.entryRef || i.receivableId),
    [interests]
  );

  async function handleOpenOffering() {
    if (!selectedReceivable) {
      setError("Select a funded position");
      return;
    }
    const position = positions.find((p) => p.contractId === selectedReceivable);
    if (!position) return;
    const offeringId = `SYN-UI-${Date.now()}`;
    setOpeningOffering(true);
    setError("");
    info("Opening syndication offering", {
      offeringId,
      receivableId: position.receivableId,
      receivableCid: position.contractId,
    });
    try {
      const result = await api.openSyndicationOffering({
        receivableCid: position.contractId,
        offeringId,
      });
      logLedger("info", "Syndication offering opened on-ledger", result, {
        offeringId,
        receivableId: position.receivableId,
      });
      setSuccess(`Offering ${offeringId} opened — syncing from ledger…`);
      setSelectedReceivable("");
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Open syndication offering failed", { error: message });
    } finally {
      setOpeningOffering(false);
    }
  }

  async function handleSubmitBid(offering: SyndicationOfferingSummary, useStatic: boolean) {
    setSubmittingBidId(offering.contractId);
    setError("");
    info("Submitting syndication interest bid", {
      offeringId: offering.offeringId,
      shareBps,
      discountRate,
      useStaticReference: useStatic,
    });
    try {
      const result = await api.submitSyndicationBid(offering.contractId, {
        shareBps: Number(shareBps),
        discountRate,
        useStaticReference: useStatic,
      });
      logLedger("info", "Syndication interest submitted on-ledger", result, {
        offeringId: offering.offeringId,
        shareBps,
      });
      setSuccess(`Sealed interest submitted for ${offering.offeringId} — syncing…`);
      setBidDialogOffering(null);
      setParticipantView("interests");
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Syndication bid failed", { offeringId: offering.offeringId, error: message });
    } finally {
      setSubmittingBidId(null);
    }
  }

  async function handleAward(offering: SyndicationOfferingSummary) {
    const bidCid = offeringBids[offering.contractId];
    if (!bidCid) {
      setError("Enter winning bid contract id");
      return;
    }
    setAwardingId(offering.contractId);
    setError("");
    info("Awarding syndication bid", { offeringId: offering.offeringId, winningBidCid: bidCid });
    try {
      const result = await api.awardSyndicationBid(offering.contractId, { winningBidCid: bidCid });
      logLedger("info", "Syndication bid awarded on-ledger", result, {
        offeringId: offering.offeringId,
        winningBidCid: bidCid,
      });
      setSuccess(`Bid awarded for ${offering.offeringId} — syncing…`);
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Syndication award failed", { offeringId: offering.offeringId, error: message });
    } finally {
      setAwardingId(null);
    }
  }

  async function loadBids(offering: SyndicationOfferingSummary) {
    setLoadingBidsId(offering.contractId);
    info("Loading syndication bids", {
      offeringId: offering.offeringId,
      offeringContractId: offering.contractId,
    });
    try {
      const { bids } = await api.getSyndicationBids(offering.contractId);
      if (bids.length > 0) {
        setOfferingBids((prev) => ({
          ...prev,
          [offering.contractId]: bids[0]!.contractId,
        }));
        setSuccess(`Loaded ${bids.length} bid(s) for ${offering.offeringId}`);
        info("Syndication bids loaded", {
          offeringId: offering.offeringId,
          count: bids.length,
          topBidCid: bids[0]!.contractId,
        });
      } else {
        setSuccess(`No bids yet for ${offering.offeringId}`);
        info("No syndication bids found for offering", { offeringId: offering.offeringId });
      }
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Load syndication bids failed", { offeringId: offering.offeringId, error: message });
    } finally {
      setLoadingBidsId(null);
    }
  }

  const canBid = (o: SyndicationOfferingSummary) =>
    o.roundState === "RoundOpen" || o.roundState === "StaticReferenceFallback";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Syndication Desk"
        description="Secondary market — sealed interest bids; supplier and buyer never see syndication data."
      />

      <PageFeedback success={success} error={error} />

      <PageTabBar
        tabs={[
          { id: "lead", label: "Lead Financier", count: offerings.length },
          { id: "participant", label: "Participant", count: invitations.length },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />

      {tab === "lead" && (
        <>
          <Surface title="Open Syndication Offering" emphasis>
            <div className="space-y-4">
              {positions.length === 0 ? (
                <EmptyState>No funded positions eligible for syndication.</EmptyState>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="position">Eligible funded positions</FieldLabel>
                    <CustomSelect
                      id="position"
                      value={selectedReceivable}
                      onChange={setSelectedReceivable}
                      placeholder="Select position…"
                      options={positions.map((p) => ({
                        value: p.contractId,
                        label: `${p.receivableId} — ${p.faceValue}`,
                        description: p.state,
                      }))}
                    />
                  </Field>
                  <Button
                    type="button"
                    onClick={() => void handleOpenOffering()}
                    disabled={openingOffering || !selectedReceivable}
                  >
                    {openingOffering ? (
                      <LoadingSpinner className="size-4" />
                    ) : (
                      <Users className="size-4" />
                    )}
                    {openingOffering ? "Opening…" : "Open syndication offering"}
                  </Button>
                </>
              )}
            </div>
          </Surface>

          <div>
            <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">
              Active Offerings ({sortedOfferings.length})
            </h2>
            {sortedOfferings.length === 0 ? (
              <EmptyState>No active syndication offerings.</EmptyState>
            ) : (
              <DataTable
                data={sortedOfferings}
                rowKey={(o) => o.contractId}
                emptyMessage="No active syndication offerings."
                detailTitle={(o) => o.offeringId}
                detailDescription={(o) =>
                  `${o.receivableId} · ${o.faceValue} ${o.currency} · ${o.roundState}`
                }
                detailFields={(o) => [
                  { label: "Receivable", value: o.receivableId },
                  { label: "Face value", value: `${o.faceValue} ${o.currency}` },
                  { label: "Pricing band", value: `${o.pricingBandMin}–${o.pricingBandMax}` },
                  { label: "Deadline", value: o.deadline },
                  { label: "State", value: o.roundState },
                  { label: "Active bids", value: String(o.activeBidCount) },
                  { label: "Opened", value: formatIdTimestamp(o.offeringId) },
                  { label: "Contract ID", value: o.contractId, mono: true },
                  ...(capTables[o.receivableId]
                    ? [
                        {
                          label: "Cap table",
                          value: capTables[o.receivableId]!
                            .map(
                              (e) =>
                                `${truncateParty(e.participant, 16)} — ${e.shareBps} bps`
                            )
                            .join(", "),
                        },
                      ]
                    : []),
                ]}
                columns={[
                  {
                    id: "offering",
                    header: "Offering",
                    cell: (o) => <span className="font-medium">{o.offeringId}</span>,
                  },
                  {
                    id: "receivable",
                    header: "Receivable",
                    cell: (o) => o.receivableId,
                  },
                  {
                    id: "face",
                    header: "Face",
                    cell: (o) => `${o.faceValue} ${o.currency}`,
                  },
                  {
                    id: "state",
                    header: "State",
                    cell: (o) => <Badge>{o.roundState}</Badge>,
                  },
                  {
                    id: "deadline",
                    header: "Deadline",
                    cell: (o) => o.deadline,
                  },
                  {
                    id: "created",
                    header: "Opened",
                    cell: (o) => (
                      <span className="text-muted-foreground">
                        {formatIdTimestamp(o.offeringId)}
                      </span>
                    ),
                  },
                  {
                    id: "actions",
                    header: "Actions",
                    isAction: true,
                    align: "right",
                    cell: (o) =>
                      o.roundState === "RoundOpen" ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={loadingBidsId === o.contractId}
                            onClick={() => void loadBids(o)}
                          >
                            {loadingBidsId === o.contractId ? (
                              <LoadingSpinner className="size-3.5" />
                            ) : null}
                            Load bids
                          </Button>
                          <Input
                            className="h-8 max-w-[140px] text-xs"
                            placeholder="Winning bid CID"
                            value={offeringBids[o.contractId] ?? ""}
                            onChange={(e) =>
                              setOfferingBids((prev) => ({
                                ...prev,
                                [o.contractId]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={awardingId === o.contractId}
                            onClick={() => void handleAward(o)}
                          >
                            {awardingId === o.contractId ? (
                              <LoadingSpinner className="size-3.5" />
                            ) : (
                              <Award className="size-3.5" />
                            )}
                            Award
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      ),
                  },
                ]}
              />
            )}
          </div>
        </>
      )}

      {tab === "participant" && (
        <div className="space-y-6">
          <PageTabBar
            tabs={[
              { id: "invitations", label: "Invitations", count: sortedInvitations.length },
              { id: "interests", label: "My Interests", count: sortedInterests.length },
            ]}
            activeTab={participantView}
            onTabChange={(id) => setParticipantView(id as "invitations" | "interests")}
          />

          {participantView === "invitations" && (
            <>
              {sortedInvitations.length === 0 ? (
                <EmptyState>No syndication invitations.</EmptyState>
              ) : (
                <DataTable
                  data={sortedInvitations}
                  rowKey={(o) => o.contractId}
                  emptyMessage="No syndication invitations."
                  detailTitle={(o) => o.offeringId}
                  detailDescription={(o) =>
                    `Lead ${truncateParty(o.leadFinancier, 24)} · ${o.faceValue} ${o.currency}`
                  }
                  detailFields={(o) => [
                    { label: "Lead financier", value: truncateParty(o.leadFinancier, 40), mono: true },
                    { label: "Face value", value: `${o.faceValue} ${o.currency}` },
                    { label: "Deadline", value: o.deadline },
                    { label: "State", value: o.roundState },
                    { label: "Invited", value: formatIdTimestamp(o.offeringId) },
                    { label: "Contract ID", value: o.contractId, mono: true },
                  ]}
                  columns={[
                    {
                      id: "offering",
                      header: "Offering",
                      cell: (o) => <span className="font-medium">{o.offeringId}</span>,
                    },
                    {
                      id: "lead",
                      header: "Lead",
                      cell: (o) => truncateParty(o.leadFinancier, 20),
                    },
                    {
                      id: "face",
                      header: "Face",
                      cell: (o) => `${o.faceValue} ${o.currency}`,
                    },
                    {
                      id: "state",
                      header: "State",
                      cell: (o) => <Badge>{o.roundState}</Badge>,
                    },
                    {
                      id: "deadline",
                      header: "Deadline",
                      cell: (o) => o.deadline,
                    },
                    {
                      id: "created",
                      header: "Invited",
                      cell: (o) => (
                        <span className="text-muted-foreground">
                          {formatIdTimestamp(o.offeringId)}
                        </span>
                      ),
                    },
                    {
                      id: "action",
                      header: "Action",
                      isAction: true,
                      align: "right",
                      cell: (o) =>
                        canBid(o) ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setBidDialogOffering(o)}
                          >
                            <Gavel className="size-3.5" />
                            Submit interest
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        ),
                    },
                  ]}
                />
              )}
            </>
          )}

          {participantView === "interests" && (
            <>
              {sortedInterests.length === 0 ? (
                <EmptyState>No participation interests yet.</EmptyState>
              ) : (
                <DataTable
                  data={sortedInterests}
                  rowKey={(i) => i.contractId}
                  emptyMessage="No participation interests yet."
                  detailTitle={(i) => i.receivableId}
                  detailFields={(i) => [
                    { label: "Share", value: `${i.shareBps} bps` },
                    { label: "Legal nature", value: i.legalNature },
                    { label: "Instrument", value: i.instrumentClass },
                    { label: "Face value", value: `${i.faceValue} ${i.currency}` },
                    { label: "Lead", value: truncateParty(i.leadFinancier, 40), mono: true },
                    { label: "Entry ref", value: i.entryRef, mono: true },
                    { label: "Contract ID", value: i.contractId, mono: true },
                  ]}
                  columns={[
                    {
                      id: "receivable",
                      header: "Receivable",
                      cell: (i) => <span className="font-medium">{i.receivableId}</span>,
                    },
                    {
                      id: "share",
                      header: "Share",
                      cell: (i) => `${i.shareBps} bps`,
                    },
                    {
                      id: "instrument",
                      header: "Instrument",
                      cell: (i) => `${i.legalNature} (${i.instrumentClass})`,
                    },
                    {
                      id: "face",
                      header: "Face",
                      cell: (i) => `${i.faceValue} ${i.currency}`,
                    },
                    {
                      id: "lead",
                      header: "Lead",
                      cell: (i) => truncateParty(i.leadFinancier, 20),
                    },
                  ]}
                />
              )}
            </>
          )}
        </div>
      )}

      <Dialog
        open={bidDialogOffering != null}
        onOpenChange={(open) => !open && setBidDialogOffering(null)}
        title={bidDialogOffering ? `Submit interest — ${bidDialogOffering.offeringId}` : ""}
        description={
          bidDialogOffering
            ? `Sealed bid on receivable ${bidDialogOffering.receivableId}`
            : undefined
        }
        className="max-w-md"
      >
        {bidDialogOffering && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmitBid(
                bidDialogOffering,
                bidDialogOffering.roundState === "StaticReferenceFallback"
              );
            }}
          >
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Share (bps)</FieldLabel>
                  <Input value={shareBps} onChange={(e) => setShareBps(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Discount rate</FieldLabel>
                  <Input value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} />
                </Field>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={submittingBidId === bidDialogOffering.contractId}
              >
                {submittingBidId === bidDialogOffering.contractId ? (
                  <LoadingSpinner className="size-4" />
                ) : (
                  <Gavel className="size-4" />
                )}
                {submittingBidId === bidDialogOffering.contractId
                  ? "Submitting…"
                  : "Submit sealed interest"}
              </Button>
            </FieldGroup>
          </form>
        )}
      </Dialog>

      <ActivityLogPanel
        entries={logEntries}
        title="Syndication activity log"
        emptyMessage="Offering, bid, and award actions appear here."
        onClear={clearLog}
        maxHeight="14rem"
      />
    </div>
  );
}
