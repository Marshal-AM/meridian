import type { ProjectionStore } from "./projection-store.js";
import type { IndexerRole } from "./acs-bootstrap.js";

export function projectionCounts(
  store: ProjectionStore,
  role: IndexerRole,
  actingParty: string
): Record<string, number> {
  switch (role) {
    case "Supplier":
      return {
        receivables: store.getSupplierReceivables().length,
        proposals: store.getPendingProposals().length,
        financingRounds: store.getFinancingRounds().length,
        consentPolicies: store.getConsentPolicies().length,
        repaymentProofs: store.getSupplierPortfolio().repaymentProofs.length,
      };
    case "Buyer":
      return {
        obligations: store.getBuyerObligations().length,
        proposals: store.getPendingProposals().length,
      };
    case "Financier":
      return {
        invitations: store.getFinancierInvitations().length,
        mandates: store.getFinancierMandates(actingParty).length,
        myBids: store.getFinancierMyBids(actingParty).length,
        syndicationOfferings: store.getSyndicationOfferings().length,
      };
    case "PlatformOperator":
      return {
        settlementAudits: store.getSettlementAudits().length,
        regulatorGrants: store.getRegulatorGrants().length,
      };
    case "Regulator":
      return { exposureRows: store.getRegulatorExposureRows().length };
    default:
      return {};
  }
}

export function roleHasEmptyProjections(
  store: ProjectionStore,
  role: IndexerRole,
  actingParty: string
): boolean {
  const counts = projectionCounts(store, role, actingParty);
  return Object.values(counts).every((n) => n === 0);
}
