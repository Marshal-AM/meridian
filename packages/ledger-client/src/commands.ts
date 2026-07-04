import { randomUUID } from "node:crypto";

/** Package-name template reference (works after DAR upload). */
export const RECEIVABLE_PACKAGE = "com-meridian-receivable-v2";

/** Financing templates within com-meridian-receivable-v2. */
export const FINANCING = {
  financingRequest: `#${RECEIVABLE_PACKAGE}:Meridian.Financing.FinancingRequest:FinancingRequest`,
  bid: `#${RECEIVABLE_PACKAGE}:Meridian.Financing.Bid:Bid`,
  financingRoundFactory: `#${RECEIVABLE_PACKAGE}:Meridian.Financing.FinancingRoundFactory:FinancingRoundFactory`,
} as const;

export const TEMPLATE_IDS = {
  receivableProposal: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.ReceivableProposal:ReceivableProposal`,
  receivable: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.Receivable:Receivable`,
  assignmentConsentPolicy: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.AssignmentConsentPolicy:AssignmentConsentPolicy`,
  financingRequest: FINANCING.financingRequest,
  bid: FINANCING.bid,
  financingRoundFactory: FINANCING.financingRoundFactory,
} as const;

export const INTERFACE_IDS = {
  buyerView: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.Interfaces:IBuyerView`,
  supplierView: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.Interfaces:ISupplierView`,
  financierView: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.Interfaces:IFinancierView`,
  regulatorView: `#${RECEIVABLE_PACKAGE}:Meridian.Receivable.Interfaces:IRegulatorView`,
} as const;

export interface LineItemArg {
  description: string;
  quantity: string;
  unitPrice: string;
}

export type ConsentSourceArg =
  | { tag: "InlineConsent"; value: boolean }
  | { tag: "FromPolicy"; value: string };

export interface CreateReceivableProposalArgs {
  proposalId: string;
  supplier: string;
  buyer: string;
  lineItems: LineItemArg[];
  faceValue: string;
  currency: string;
  dueDate: string;
  consentSource: ConsentSourceArg;
}

export interface CreateConsentPolicyArgs {
  buyer: string;
  supplier: string;
  masterAgreementId: string;
  grantedAt: string;
  allowsAssignment: boolean;
}

export type BidPricingModeArg = "OracleAnchored" | "StaticReference";

export interface CreateFinancingFactoryArgs {
  supplier: string;
}

export interface OpenFinancingRoundArgs {
  factoryContractId: string;
  receivableCid: string;
  requestId: string;
  financiers: string[];
  deadline: string;
  pricingBandMin: string;
  pricingBandMax: string;
  redstoneFeedId: number[];
}

export interface SubmitBidArgs {
  requestContractId: string;
  financier: string;
  advanceAmount: string;
  discountRate: string;
  redstonePayload: string;
  redstoneTimestampMs: number;
  mode: BidPricingModeArg;
  ledgerTime: string;
}

export interface AwardBidArgs {
  requestContractId: string;
  winningBidCid: string;
}

export interface ReplaceBidArgs extends SubmitBidArgs {}

export interface ExpireRoundArgs {
  requestContractId: string;
}

export type LedgerCommand =
  | {
      CreateCommand: {
        templateId: string;
        createArguments: Record<string, unknown>;
      };
    }
  | {
      ExerciseCommand: {
        templateId: string;
        contractId: string;
        choice: string;
        choiceArgument: Record<string, unknown>;
      };
    };

export interface SubmitCommandsRequest {
  actAs: string[];
  readAs?: string[];
  commands: LedgerCommand[];
  commandId?: string;
  userId?: string;
}

export function inlineConsent(granted: boolean): ConsentSourceArg {
  return { tag: "InlineConsent", value: granted };
}

export function fromPolicy(contractId: string): ConsentSourceArg {
  return { tag: "FromPolicy", value: contractId };
}

export function oracleAnchoredMode(): BidPricingModeArg {
  return "OracleAnchored";
}

export function staticReferenceMode(): BidPricingModeArg {
  return "StaticReference";
}

export function buildCreateReceivableProposalCommand(
  args: CreateReceivableProposalArgs
): LedgerCommand {
  return {
    CreateCommand: {
      templateId: TEMPLATE_IDS.receivableProposal,
      createArguments: {
        proposalId: args.proposalId,
        supplier: args.supplier,
        buyer: args.buyer,
        lineItems: args.lineItems,
        faceValue: args.faceValue,
        currency: args.currency,
        dueDate: args.dueDate,
        consentSource: args.consentSource,
      },
    },
  };
}

export function buildCoSignAndIssueCommand(
  contractId: string
): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.receivableProposal,
      contractId,
      choice: "CoSignAndIssue",
      choiceArgument: {},
    },
  };
}

export function buildPostForBidCommand(receivableContractId: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.receivable,
      contractId: receivableContractId,
      choice: "PostForBid",
      choiceArgument: {},
    },
  };
}

export function buildCreateConsentPolicyCommand(
  args: CreateConsentPolicyArgs
): LedgerCommand {
  return {
    CreateCommand: {
      templateId: TEMPLATE_IDS.assignmentConsentPolicy,
      createArguments: {
        buyer: args.buyer,
        supplier: args.supplier,
        masterAgreementId: args.masterAgreementId,
        grantedAt: args.grantedAt,
        allowsAssignment: args.allowsAssignment,
      },
    },
  };
}

export function buildCreateFinancingFactoryCommand(
  args: CreateFinancingFactoryArgs
): LedgerCommand {
  return {
    CreateCommand: {
      templateId: TEMPLATE_IDS.financingRoundFactory,
      createArguments: {
        supplier: args.supplier,
      },
    },
  };
}

export function buildOpenFinancingRoundCommand(
  args: OpenFinancingRoundArgs
): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.financingRoundFactory,
      contractId: args.factoryContractId,
      choice: "OpenRound",
      choiceArgument: {
        receivableCid: args.receivableCid,
        requestId: args.requestId,
        financiers: args.financiers,
        deadline: args.deadline,
        pricingBandMin: args.pricingBandMin,
        pricingBandMax: args.pricingBandMax,
        redstoneFeedId: args.redstoneFeedId.map(String),
      },
    },
  };
}

export function buildSubmitBidCommand(args: SubmitBidArgs): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.financingRequest,
      contractId: args.requestContractId,
      choice: "SubmitBid",
      choiceArgument: {
        financier: args.financier,
        advanceAmount: args.advanceAmount,
        discountRate: args.discountRate,
        redstonePayload: args.redstonePayload,
        redstoneTimestampMs: String(args.redstoneTimestampMs),
        mode: args.mode,
        ledgerTime: args.ledgerTime,
      },
    },
  };
}

export function buildAwardBidCommand(args: AwardBidArgs): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.financingRequest,
      contractId: args.requestContractId,
      choice: "AwardBid",
      choiceArgument: {
        winningBidCid: args.winningBidCid,
      },
    },
  };
}

export function buildPauseRoundCommand(requestContractId: string): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.financingRequest,
      contractId: requestContractId,
      choice: "PauseRound",
      choiceArgument: {},
    },
  };
}

export function buildEnterStaticFallbackCommand(
  requestContractId: string
): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.financingRequest,
      contractId: requestContractId,
      choice: "EnterStaticReferenceFallback",
      choiceArgument: {},
    },
  };
}

export function buildReplaceBidCommand(args: ReplaceBidArgs): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.financingRequest,
      contractId: args.requestContractId,
      choice: "ReplaceBid",
      choiceArgument: {
        financier: args.financier,
        advanceAmount: args.advanceAmount,
        discountRate: args.discountRate,
        redstonePayload: args.redstonePayload,
        redstoneTimestampMs: String(args.redstoneTimestampMs),
        mode: args.mode,
        ledgerTime: args.ledgerTime,
      },
    },
  };
}

export function buildExpireRoundCommand(args: ExpireRoundArgs): LedgerCommand {
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.financingRequest,
      contractId: args.requestContractId,
      choice: "ExpireRound",
      choiceArgument: {},
    },
  };
}

export function buildSubmitRequest(
  params: SubmitCommandsRequest
): Record<string, unknown> {
  return {
    commands: {
      actAs: params.actAs,
      readAs: params.readAs ?? params.actAs,
      userId: params.userId ?? "meridian-portal",
      commandId: params.commandId ?? randomUUID(),
      commands: params.commands,
    },
  };
}
