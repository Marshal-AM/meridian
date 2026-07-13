import {
  CASH_TEMPLATES,
  JsonLedgerClient,
  LedgerClientError,
  TEMPLATE_IDS,
  type ActiveContract,
} from "@meridian/ledger-client";

export type IndexerRole =
  | "Supplier"
  | "Buyer"
  | "Financier"
  | "Regulator"
  | "PlatformOperator";

export interface AcsBootstrapResult {
  contracts: ActiveContract[];
  /** Full unfiltered ACS call failed (typically >200 contracts on DevNet). */
  fullAcsFailed: boolean;
  mode: "full" | "scoped" | "none";
}

function templatesForRole(role: IndexerRole): string[] {
  const receivableCore = [
    TEMPLATE_IDS.receivable,
    TEMPLATE_IDS.receivableProposal,
    TEMPLATE_IDS.assignmentConsentPolicy,
    CASH_TEMPLATES.repaymentProof,
  ];
  const financingCore = [
    TEMPLATE_IDS.financingRequest,
    TEMPLATE_IDS.bid,
    TEMPLATE_IDS.financingRoundFactory,
    TEMPLATE_IDS.biddingMandate,
  ];
  const syndicationCore = [
    TEMPLATE_IDS.syndicationOffering,
    TEMPLATE_IDS.syndicationBid,
    TEMPLATE_IDS.participationInterest,
    TEMPLATE_IDS.syndicationFactory,
  ];

  switch (role) {
    case "Supplier":
      return [...receivableCore, ...financingCore, ...syndicationCore];
    case "Buyer":
      return receivableCore;
    case "Financier":
      return [...receivableCore, ...financingCore, ...syndicationCore];
    case "PlatformOperator":
      return [
        TEMPLATE_IDS.settlementAuditRecord,
        TEMPLATE_IDS.regulatorJurisdictionGrant,
        ...financingCore,
        ...syndicationCore,
      ];
    case "Regulator":
      return [TEMPLATE_IDS.receivable, ...financingCore];
    default:
      return receivableCore;
  }
}

async function fetchScopedActiveContracts(
  client: JsonLedgerClient,
  party: string,
  orgId: string,
  role: IndexerRole
): Promise<ActiveContract[]> {
  const seen = new Set<string>();
  const contracts: ActiveContract[] = [];

  for (const templateId of templatesForRole(role)) {
    try {
      const rows = await client.getActiveContractsByTemplate(party, templateId);
      for (const row of rows) {
        if (seen.has(row.contractId)) continue;
        seen.add(row.contractId);
        contracts.push(row);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[${orgId}] scoped ACS template fetch failed (${templateId.slice(-48)}): ${message}`
      );
    }
  }

  return contracts;
}

/**
 * Bootstrap active contracts for an indexer persona.
 * Falls back to per-template ACS when DevNet rejects the unfiltered party query (>200 contracts).
 */
export async function fetchActiveContractsForIndexer(
  client: JsonLedgerClient,
  party: string,
  orgId: string,
  role: IndexerRole
): Promise<AcsBootstrapResult> {
  try {
    const contracts = await client.getActiveContracts(party);
    return { contracts, fullAcsFailed: false, mode: contracts.length > 0 ? "full" : "none" };
  } catch (err) {
    if (!(err instanceof LedgerClientError) || err.code !== "GET_ACS_FAILED") {
      throw err;
    }
    console.warn(
      `[${orgId}] ACS fetch skipped for ${orgId}: party exceeds ledger API list limit — using scoped template queries`
    );
  }

  const contracts = await fetchScopedActiveContracts(client, party, orgId, role);
  return {
    contracts,
    fullAcsFailed: true,
    mode: contracts.length > 0 ? "scoped" : "none",
  };
}
