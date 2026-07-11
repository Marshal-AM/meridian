import { useCallback, useEffect, useState } from "react";
import { Award, Clock, Pause, RefreshCw, Timer } from "lucide-react";
import {
  api,
  useNotifications,
  type BidComparisonRow,
  type FinancingRequestSummary,
  type SupplierReceivable,
} from "../api";
import { usePageTab } from "../hooks/usePageTab";
import { useFollowUpRefresh } from "../hooks/useFollowUpRefresh";
import { usePageFeedback } from "../hooks/usePageFeedback";
import { useActivityLog } from "../hooks/useActivityLog";
import { EmptyState, GuidancePanel, PageHeader } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { PageFeedback } from "../components/ui/PageFeedback";
import { Card, Surface } from "../components/ui/Surface";
import { CustomSelect } from "../components/ui/CustomSelect";
import { DataTable } from "../components/ui/DataTable";
import { Checkbox, Field, FieldGroup, FieldLabel } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { PageTabBar } from "../components/ui/PageTabBar";
import { ActivityLogPanel } from "../components/ui/ActivityLogPanel";
import { truncateParty } from "../lib/utils";

function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

export function SupplierFinancingPage() {
  const [tab, setTab] = usePageTab(["setup", "rounds"] as const, "setup");
  const [receivables, setReceivables] = useState<SupplierReceivable[]>([]);
  const [rounds, setRounds] = useState<FinancingRequestSummary[]>([]);
  const [bidMap, setBidMap] = useState<Record<string, BidComparisonRow[]>>({});
  const [parties, setParties] = useState<{ financierA: string; financierB: string } | null>(null);
  const { success, setSuccess, error, setError } = usePageFeedback();
  const [selectedReceivable, setSelectedReceivable] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [pricingMin, setPricingMin] = useState("0.01");
  const [pricingMax, setPricingMax] = useState("0.15");
  const [inviteA, setInviteA] = useState(true);
  const [inviteB, setInviteB] = useState(true);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [openingRound, setOpeningRound] = useState(false);
  const [awardingKey, setAwardingKey] = useState<string | null>(null);
  const [roundActionKey, setRoundActionKey] = useState<string | null>(null);
  const { entries: logEntries, info, warn, error: logError, clear: clearLog, logLedger } =
    useActivityLog("supplier-financing");

  const refresh = useCallback(async () => {
    try {
      const [r, roundsRes, p] = await Promise.all([
        api.getSupplierReceivables(),
        api.getFinancingRounds(),
        api.getParties(),
      ]);
      setReceivables(r.receivables);
      setRounds(roundsRes.rounds);
      setParties({ financierA: p.financierA, financierB: p.financierB });
      setError("");

      const openRounds = roundsRes.rounds.filter(
        (round) => round.roundState === "RoundOpen" || round.activeBidCount > 0
      );
      const bidEntries = await Promise.all(
        openRounds.map(async (round) => {
          try {
            const res = await api.getFinancingBids(round.contractId);
            return [round.contractId, res.bids] as const;
          } catch {
            return [round.contractId, []] as const;
          }
        })
      );
      setBidMap(Object.fromEntries(bidEntries));
    } catch (e) {
      const message = String(e);
      setError(message);
      logError("Failed to refresh financing data", { error: message });
    }
  }, [logError]);

  const followUpRefresh = useFollowUpRefresh(refresh);

  const onLedgerNotify = useCallback(() => {
    info("Ledger notification received — refreshing financing rounds");
  }, [info]);

  useNotifications("meridian-supplier", refresh, { onNotify: onLedgerNotify });
  useEffect(() => {
    refresh();
  }, [refresh]);

  const issued = receivables.filter((r) => r.state === "Issued");
  const posted = receivables.filter((r) => r.state === "PostedForBid");

  async function handlePostForBid(contractId: string, receivableId: string) {
    setPostingId(contractId);
    setError("");
    info("Posting receivable for financing", { receivableId, contractId });
    try {
      const result = await api.postReceivableForBid(contractId);
      logLedger("info", "Receivable posted for bid", result, { receivableId });
      setSuccess(`${receivableId} posted for bid`);
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Post for bid failed", { receivableId, error: message });
    } finally {
      setPostingId(null);
    }
  }

  async function handleOpenRound(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReceivable || !parties) return;
    const financiers: string[] = [];
    if (inviteA) financiers.push(parties.financierA);
    if (inviteB) financiers.push(parties.financierB);
    if (financiers.length === 0) {
      setError("Select at least one financier");
      return;
    }
    setOpeningRound(true);
    setError("");
    info("Opening financing round", {
      receivableCid: selectedReceivable,
      financiers: financiers.length,
      deadline,
      pricingMin,
      pricingMax,
    });
    try {
      const result = await api.openFinancingRound({
        receivableCid: selectedReceivable,
        financiers,
        deadline: new Date(deadline).toISOString(),
        pricingBandMin: pricingMin,
        pricingBandMax: pricingMax,
      });
      logLedger("info", "Financing round opened on-ledger", result, {
        receivableCid: selectedReceivable,
      });
      setSuccess("Financing round opened — syncing bids…");
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Open financing round failed", { error: message });
    } finally {
      setOpeningRound(false);
    }
  }

  async function handleAward(
    requestId: string,
    bidContractId: string,
    advanceAmount: string,
    financierPartyId: string
  ) {
    const awardKey = `${requestId}:${bidContractId}`;
    setAwardingKey(awardKey);
    setError("");
    info("Awarding financing bid", { requestId, bidContractId, advanceAmount });
    try {
      const result = await api.awardFinancingBid(requestId, bidContractId, advanceAmount, financierPartyId);
      logLedger("info", "Bid awarded with atomic DvP settlement", result, {
        requestId,
        advanceAmount,
      });
      setSuccess(
        `Award confirmed with atomic DvP — MUSD advance (${advanceAmount}) settled to supplier.`
      );
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Award failed", { requestId, error: message });
    } finally {
      setAwardingKey(null);
    }
  }

  async function handlePause(requestId: string) {
    setRoundActionKey(`pause:${requestId}`);
    setError("");
    info("Pausing financing round", { requestId });
    try {
      const result = await api.pauseFinancingRound(requestId);
      logLedger("warn", "Financing round paused", result, { requestId });
      setSuccess("Financing round paused");
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Pause round failed", { requestId, error: message });
    } finally {
      setRoundActionKey(null);
    }
  }

  async function handleStaticFallback(requestId: string) {
    setRoundActionKey(`static:${requestId}`);
    setError("");
    info("Switching round to static reference fallback", { requestId });
    try {
      const result = await api.staticFallbackFinancingRound(requestId);
      logLedger("info", "Round moved to static reference fallback", result, { requestId });
      setSuccess("Round switched to static reference fallback");
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Static fallback failed", { requestId, error: message });
    } finally {
      setRoundActionKey(null);
    }
  }

  async function handleExpire(requestId: string) {
    setRoundActionKey(`expire:${requestId}`);
    setError("");
    info("Expiring financing round", { requestId });
    try {
      const result = await api.expireFinancingRound(requestId);
      logLedger("warn", "Financing round expired", result, { requestId });
      setSuccess("Financing round expired");
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Expire round failed", { requestId, error: message });
    } finally {
      setRoundActionKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Financing"
        description="Configure sealed-bid rounds, compare oracle-anchored bids, and award atomically."
      />

      <PageFeedback success={success} error={error} />

      <PageTabBar
        tabs={[
          { id: "setup", label: "Open Round", count: posted.length || undefined },
          { id: "rounds", label: "Financing Rounds", count: rounds.length },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />

      {tab === "setup" && (
        <>
      {issued.length > 0 && (
        <div id="ready-to-post">
          <h2 className="mb-2 font-heading text-lg font-semibold text-foreground">
            Ready to Post ({issued.length})
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            After buyer co-sign, post receivables for bid before opening a financing round.
          </p>
          <div className="grid gap-4">
            {issued.map((r) => (
              <Card key={r.contractId}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="font-heading">{r.receivableId}</strong>
                      <Badge>{r.state}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.faceValue} {r.currency} · due {r.dueDate}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handlePostForBid(r.contractId, r.receivableId)}
                    disabled={postingId === r.contractId}
                  >
                    {postingId === r.contractId ? (
                      <LoadingSpinner className="size-3.5" />
                    ) : null}
                    {postingId === r.contractId ? "Posting…" : "Post for bid"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Surface title="Open Financing Round" emphasis>
        {posted.length === 0 ? (
          <GuidancePanel
            title={
              issued.length > 0
                ? "Post receivables before opening a round"
                : "No receivables ready for financing"
            }
            description={
              issued.length > 0
                ? "You have issued receivables that still need to be posted for bid. Financing rounds can only be opened on receivables in PostedForBid state."
                : "Financing rounds require a receivable that has been issued by the buyer and posted for bid. Start on the Supplier Portal by proposing an invoice."
            }
            steps={[
              "Propose an invoice to the buyer on the Supplier Portal",
              "Wait for the buyer to co-sign and issue the receivable",
              "Post the receivable for bid once it reaches Issued state",
              "Return here to configure pricing bands and open a sealed-bid round",
            ]}
            primaryAction={{
              label: issued.length > 0 ? "Go to Supplier Portal" : "Issue your first invoice",
              to: "/supplier/portal",
            }}
            secondaryAction={
              issued.length > 0
                ? {
                    label: "View receivables to post",
                    onClick: () =>
                      document
                        .getElementById("ready-to-post")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  }
                : undefined
            }
          />
        ) : (
          <form onSubmit={handleOpenRound}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="receivable">Receivable (PostedForBid)</FieldLabel>
                <CustomSelect
                  id="receivable"
                  value={selectedReceivable}
                  onChange={setSelectedReceivable}
                  placeholder="Select receivable…"
                  options={posted.map((r) => ({
                    value: r.contractId,
                    label: `${r.receivableId} — ${r.faceValue} ${r.currency}`,
                    description: `Due ${r.dueDate}`,
                  }))}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="deadline">Deadline</FieldLabel>
                  <Input
                    id="deadline"
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pricingMin">Pricing band min (decimal rate)</FieldLabel>
                  <Input
                    id="pricingMin"
                    value={pricingMin}
                    onChange={(e) => setPricingMin(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pricingMax">Pricing band max (decimal rate)</FieldLabel>
                  <Input
                    id="pricingMax"
                    value={pricingMax}
                    onChange={(e) => setPricingMax(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox checked={inviteA} onChange={(e) => setInviteA(e.target.checked)} />
                  Invite Financier A
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox checked={inviteB} onChange={(e) => setInviteB(e.target.checked)} />
                  Invite Financier B
                </label>
              </div>
              <Button type="submit" disabled={openingRound} className="gap-2">
                {openingRound ? (
                  <LoadingSpinner className="size-4" />
                ) : (
                  <Clock className="size-4" />
                )}
                {openingRound ? "Opening round…" : "Open Round"}
              </Button>
            </FieldGroup>
          </form>
        )}
      </Surface>
        </>
      )}

      {tab === "rounds" && (
      <div>
        <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">
          Financing Rounds ({rounds.length})
        </h2>
        {rounds.length === 0 ? (
          <EmptyState>No financing rounds yet.</EmptyState>
        ) : (
          <div className="space-y-4">
            {rounds.map((round) => (
              <Card key={round.contractId} className="gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-heading text-base">{round.requestId}</strong>
                      <Badge variant="secondary">{round.roundState}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Deadline: {round.deadline} · Band {round.pricingBandMin}–
                      {round.pricingBandMax} · {round.activeBidCount} active bid(s)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Receivable: {truncateParty(round.receivableCid, 28)}
                    </p>
                  </div>
                </div>

                {(round.roundState === "RoundOpen" ||
                  round.roundState === "StaticReferenceFallback" ||
                  round.roundState === "Paused") && (
                  <div className="flex flex-wrap gap-2">
                    {round.roundState === "RoundOpen" && (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-1.5"
                          disabled={roundActionKey === `pause:${round.contractId}`}
                          onClick={() => handlePause(round.contractId)}
                        >
                          {roundActionKey === `pause:${round.contractId}` ? (
                            <LoadingSpinner className="size-3.5" />
                          ) : (
                            <Pause className="size-3.5" />
                          )}
                          {roundActionKey === `pause:${round.contractId}` ? "Pausing…" : "Pause Round"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-1.5"
                          disabled={roundActionKey === `static:${round.contractId}`}
                          onClick={() => handleStaticFallback(round.contractId)}
                        >
                          {roundActionKey === `static:${round.contractId}` ? (
                            <LoadingSpinner className="size-3.5" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                          {roundActionKey === `static:${round.contractId}`
                            ? "Switching…"
                            : "Enter Static Reference Fallback"}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={roundActionKey === `expire:${round.contractId}`}
                      onClick={() => handleExpire(round.contractId)}
                    >
                      {roundActionKey === `expire:${round.contractId}` ? (
                        <LoadingSpinner className="size-3.5" />
                      ) : (
                        <Timer className="size-3.5" />
                      )}
                      {roundActionKey === `expire:${round.contractId}`
                        ? "Expiring…"
                        : "Expire Round (post-deadline)"}
                    </Button>
                  </div>
                )}

                <div>
                  <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">
                    Bid Comparison
                  </h3>
                  {(bidMap[round.contractId] ?? []).length === 0 ? (
                    <EmptyState>No bids yet.</EmptyState>
                  ) : (
                    <DataTable
                      data={bidMap[round.contractId] ?? []}
                      rowKey={(bid) => bid.bidContractId}
                      emptyMessage="No bids yet."
                      detailTitle={(bid) => `Rank ${bid.rank} · ${truncateParty(bid.financier, 24)}`}
                      detailFields={(bid) => [
                        { label: "Financier", value: bid.financier, mono: true },
                        { label: "Advance", value: bid.advanceAmount },
                        { label: "Discount", value: bid.discountRate },
                        { label: "Effective rate", value: bid.effectiveRate },
                        { label: "Mode", value: bid.mode },
                        { label: "Oracle", value: bid.oracleFresh ? "Fresh" : "Stale" },
                        { label: "Bid contract", value: bid.bidContractId, mono: true },
                      ]}
                      columns={[
                        { id: "rank", header: "Rank", cell: (bid) => bid.rank },
                        {
                          id: "financier",
                          header: "Financier",
                          cell: (bid) => truncateParty(bid.financier, 18),
                        },
                        { id: "advance", header: "Advance", cell: (bid) => bid.advanceAmount },
                        { id: "discount", header: "Discount", cell: (bid) => bid.discountRate },
                        {
                          id: "effective",
                          header: "Effective rate",
                          cell: (bid) => bid.effectiveRate,
                        },
                        {
                          id: "mode",
                          header: "Mode",
                          cell: (bid) => <Badge variant="outline">{bid.mode}</Badge>,
                        },
                        {
                          id: "oracle",
                          header: "Oracle",
                          cell: (bid) => (
                            <Badge variant={bid.oracleFresh ? "success" : "destructive"}>
                              {bid.oracleFresh ? "fresh" : "stale"}
                            </Badge>
                          ),
                        },
                        {
                          id: "action",
                          header: "",
                          isAction: true,
                          align: "right",
                          cell: (bid) =>
                            round.roundState === "RoundOpen" ||
                            round.roundState === "StaticReferenceFallback" ? (
                              <Button
                                type="button"
                                size="sm"
                                className="gap-1.5"
                                disabled={
                                  awardingKey === `${round.contractId}:${bid.bidContractId}`
                                }
                                onClick={() =>
                                  handleAward(
                                    round.contractId,
                                    bid.bidContractId,
                                    bid.advanceAmount,
                                    bid.financier
                                  )
                                }
                              >
                                {awardingKey === `${round.contractId}:${bid.bidContractId}` ? (
                                  <LoadingSpinner className="size-3.5" />
                                ) : (
                                  <Award className="size-3.5" />
                                )}
                                {awardingKey === `${round.contractId}:${bid.bidContractId}`
                                  ? "Awarding…"
                                  : "Award (DvP)"}
                              </Button>
                            ) : null,
                        },
                      ]}
                    />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      )}

      <ActivityLogPanel
        entries={logEntries}
        title="Financing activity log"
        emptyMessage="Round lifecycle actions and awards appear here."
        onClear={clearLog}
        maxHeight="14rem"
      />
    </div>
  );
}
