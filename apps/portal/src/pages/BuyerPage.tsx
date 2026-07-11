import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard } from "lucide-react";
import { api, useNotifications, type BuyerObligation, type ReceivableProposal } from "../api";
import { usePageTab } from "../hooks/usePageTab";
import { useFollowUpRefresh } from "../hooks/useFollowUpRefresh";
import { usePageFeedback } from "../hooks/usePageFeedback";
import { useActivityLog } from "../hooks/useActivityLog";
import { EmptyState, PageHeader } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { PageFeedback } from "../components/ui/PageFeedback";
import { ActivityLogPanel } from "../components/ui/ActivityLogPanel";
import { DataTable } from "../components/ui/DataTable";
import { PageTabBar } from "../components/ui/PageTabBar";
import {
  formatIdTimestamp,
  formatProposalCreatedAt,
  proposalSortTime,
  sortByIdTimeDesc,
  truncateParty,
} from "../lib/utils";

export function BuyerPage() {
  const [tab, setTab] = usePageTab(["cosign", "obligations"] as const, "cosign");
  const [obligations, setObligations] = useState<BuyerObligation[]>([]);
  const [proposals, setProposals] = useState<ReceivableProposal[]>([]);
  const [cosigningId, setCosigningId] = useState<string | null>(null);
  const [repayingId, setRepayingId] = useState<string | null>(null);
  const { success, setSuccess, error, setError } = usePageFeedback();
  const { entries: logEntries, info, error: logError, debug, clear: clearLog, logLedger } =
    useActivityLog("buyer-portal");

  const refresh = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([
        api.getBuyerRepayable().catch(() => api.getBuyerObligations()),
        api.getBuyerProposals(),
      ]);
      setObligations(o.obligations);
      setProposals(p.proposals);
      setError("");
      debug("Buyer data refreshed", {
        obligations: o.obligations.length,
        proposals: p.proposals.length,
      });
    } catch (e) {
      const message = String(e);
      setError(message);
      logError("Failed to refresh buyer data", { error: message });
    }
  }, [debug, logError]);

  const followUpRefresh = useFollowUpRefresh(refresh);

  const onLedgerNotify = useCallback(() => {
    info("Ledger notification received — refreshing buyer view");
  }, [info]);

  useNotifications("meridian-buyer", refresh, { onNotify: onLedgerNotify });
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function cosign(contractId: string, proposalId: string) {
    setCosigningId(contractId);
    setError("");
    info("Co-signing invoice proposal", { proposalId, contractId });
    try {
      const result = await api.cosignInvoice(contractId);
      logLedger("info", "Invoice co-signed and issued on-ledger", result, { proposalId });
      setSuccess(`Invoice co-signed and issued for proposal ${proposalId}`);
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Co-sign failed", { proposalId, error: message });
    } finally {
      setCosigningId(null);
    }
  }

  async function repay(o: BuyerObligation) {
    const settlementRef = `portal-${o.receivableId}-${Date.now()}`;
    setRepayingId(o.contractId);
    setError("");
    info("Submitting repayment", {
      receivableId: o.receivableId,
      faceValue: o.faceValue,
      settlementRef,
    });
    try {
      const result = await api.repayObligation(o.contractId, {
        faceValue: o.faceValue,
        payeePartyId: o.payee,
        settlementRef,
      });
      logLedger("info", "Repayment submitted on-ledger", result, {
        receivableId: o.receivableId,
        settlementRef,
      });
      setSuccess(`Repayment submitted for ${o.receivableId} (${o.faceValue} ${o.currency})`);
      await followUpRefresh();
    } catch (err) {
      const message = String(err);
      setError(message);
      logError("Repayment failed", { receivableId: o.receivableId, error: message });
    } finally {
      setRepayingId(null);
    }
  }

  function canRepay(o: BuyerObligation) {
    return (
      o.state === "Funded" ||
      o.state === "PartiallySyndicated" ||
      o.state === "Overdue" ||
      !o.state
    );
  }

  const sortedProposals = useMemo(
    () => [...proposals].sort((a, b) => proposalSortTime(b) - proposalSortTime(a)),
    [proposals]
  );

  const sortedObligations = useMemo(
    () => sortByIdTimeDesc(obligations, (o) => o.receivableId),
    [obligations]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buyer Portal"
        description="IBuyerView only — payee, amount, due date. No line items or supplier economics."
      />

      <PageFeedback success={success} error={error} />

      <PageTabBar
        tabs={[
          { id: "cosign", label: "Pending Co-Signature", count: proposals.length },
          { id: "obligations", label: "Obligations", count: obligations.length },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />

      {tab === "cosign" && (
        <div>
          {sortedProposals.length === 0 ? (
            <EmptyState>No proposals awaiting co-signature.</EmptyState>
          ) : (
            <DataTable
              data={sortedProposals}
              rowKey={(p) => p.contractId}
              emptyMessage="No proposals awaiting co-signature."
              detailTitle={(p) => p.proposalId}
              detailDescription={(p) => `${p.faceValue} ${p.currency} · due ${p.dueDate}`}
              detailFields={(p) => [
                { label: "Proposal", value: p.proposalId },
                { label: "Supplier", value: truncateParty(p.supplier, 40), mono: true },
                { label: "Amount", value: `${p.faceValue} ${p.currency}` },
                { label: "Due date", value: p.dueDate },
                { label: "Created", value: formatProposalCreatedAt(p) },
                { label: "Contract ID", value: p.contractId, mono: true },
              ]}
              columns={[
                {
                  id: "proposal",
                  header: "Proposal",
                  cell: (p) => <span className="font-medium">{p.proposalId}</span>,
                },
                {
                  id: "amount",
                  header: "Amount",
                  cell: (p) => `${p.faceValue} ${p.currency}`,
                },
                {
                  id: "due",
                  header: "Due date",
                  cell: (p) => p.dueDate,
                },
                {
                  id: "created",
                  header: "Created",
                  cell: (p) => (
                    <span className="text-muted-foreground">{formatProposalCreatedAt(p)}</span>
                  ),
                },
                {
                  id: "action",
                  header: "Action",
                  isAction: true,
                  align: "right",
                  cell: (p) => (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={cosigningId === p.contractId}
                      onClick={() => cosign(p.contractId, p.proposalId)}
                    >
                      {cosigningId === p.contractId ? (
                        <LoadingSpinner className="size-3.5" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      {cosigningId === p.contractId ? "Issuing…" : "Co-Sign & Issue"}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </div>
      )}

      {tab === "obligations" && (
        <div>
          {sortedObligations.length === 0 ? (
            <EmptyState>No outstanding obligations.</EmptyState>
          ) : (
            <DataTable
              data={sortedObligations}
              rowKey={(o) => o.contractId}
              emptyMessage="No outstanding obligations."
              detailTitle={(o) => o.receivableId}
              detailDescription={(o) => `${o.faceValue} ${o.currency} · due ${o.dueDate}`}
              detailFields={(o) => [
                { label: "Invoice", value: o.receivableId },
                { label: "Payee", value: truncateParty(o.payee, 40), mono: true },
                { label: "Amount", value: `${o.faceValue} ${o.currency}` },
                { label: "Due date", value: o.dueDate },
                { label: "Issued", value: formatIdTimestamp(o.receivableId) },
                { label: "State", value: o.state ?? "—" },
                { label: "Contract ID", value: o.contractId, mono: true },
              ]}
              columns={[
                {
                  id: "invoice",
                  header: "Invoice",
                  cell: (o) => <span className="font-medium">{o.receivableId}</span>,
                },
                {
                  id: "payee",
                  header: "Payee",
                  cell: (o) => truncateParty(o.payee, 20),
                },
                {
                  id: "amount",
                  header: "Amount",
                  cell: (o) => `${o.faceValue} ${o.currency}`,
                },
                {
                  id: "due",
                  header: "Due date",
                  cell: (o) => o.dueDate,
                },
                {
                  id: "issued",
                  header: "Issued",
                  cell: (o) => (
                    <span className="text-muted-foreground">
                      {formatIdTimestamp(o.receivableId)}
                    </span>
                  ),
                },
                {
                  id: "state",
                  header: "State",
                  cell: (o) => o.state ?? "—",
                },
                {
                  id: "action",
                  header: "Action",
                  isAction: true,
                  align: "right",
                  cell: (o) =>
                    canRepay(o) ? (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={repayingId === o.contractId}
                        onClick={() => repay(o)}
                      >
                        {repayingId === o.contractId ? (
                          <LoadingSpinner className="size-3.5" />
                        ) : (
                          <CreditCard className="size-3.5" />
                        )}
                        {repayingId === o.contractId ? "Repaying…" : "Repay"}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    ),
                },
              ]}
            />
          )}
        </div>
      )}

      <ActivityLogPanel
        entries={logEntries}
        title="Buyer activity log"
        emptyMessage="Co-sign and repayment actions will appear here."
        onClear={clearLog}
        maxHeight="14rem"
      />
    </div>
  );
}
