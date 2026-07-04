import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { DevNetAuthClient } from "@meridian/devnet-auth";
import type { FetchResult } from "@meridian/shared-types";
import {
  buildCreateReceivableProposalCommand,
  buildCoSignAndIssueCommand,
  buildCreateConsentPolicyCommand,
  buildCreateFinancingFactoryCommand,
  buildOpenFinancingRoundCommand,
  buildSubmitBidCommand,
  buildAwardBidCommand,
  buildPauseRoundCommand,
  buildEnterStaticFallbackCommand,
  buildReplaceBidCommand,
  buildExpireRoundCommand,
  oracleAnchoredMode,
  staticReferenceMode,
  inlineConsent,
  TEMPLATE_IDS,
  INTERFACE_IDS,
} from "@meridian/ledger-client";
import {
  defaultManifestPath,
  extractCreatedContractId,
  loadPortalParties,
  proxyGet,
} from "./manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");

loadDotenv({ path: join(ROOT, ".env") });

const PORT = Number(process.env.PORTAL_API_PORT ?? 4000);
const SUPPLIER_INDEXER = process.env.SUPPLIER_INDEXER_URL ?? "http://127.0.0.1:4011";
const FINANCIER_INDEXER = process.env.FINANCIER_INDEXER_URL ?? "http://127.0.0.1:4013";
const ORACLE_RELAY = process.env.ORACLE_RELAY_URL ?? "http://127.0.0.1:4021";

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function financingRequestId(pathname: string, suffix?: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  // /financing/:id or /financing/:id/award|pause|static-fallback|bid|replace-bid|expire
  if (parts[0] !== "financing" || !parts[1]) return null;
  const id = decodeURIComponent(parts[1]);
  if (suffix) {
    if (parts[2] !== suffix) return null;
  } else if (parts.length > 2) {
    return null;
  }
  return id;
}

async function fetchOracleFeed(): Promise<FetchResult> {
  const res = await fetch(`${ORACLE_RELAY}/feeds/latest`);
  if (!res.ok) {
    throw new Error(`oracle relay ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as FetchResult;
}

async function findOrCreateFinancingFactory(
  client: Awaited<ReturnType<DevNetAuthClient["createAuthenticatedLedgerClient"]>>,
  supplierPartyId: string
): Promise<string> {
  const factories = await client.getActiveContractsByTemplate(
    supplierPartyId,
    TEMPLATE_IDS.financingRoundFactory
  );
  if (factories.length > 0) {
    return factories[0]!.contractId;
  }
  const cmd = buildCreateFinancingFactoryCommand({ supplier: supplierPartyId });
  const result = await client.submitAndWaitForTransaction({
    actAs: [supplierPartyId],
    commands: [cmd],
  });
  const factoryId = extractCreatedContractId(result);
  if (!factoryId) throw new Error("factory creation did not return contract id");
  return factoryId;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  auth: DevNetAuthClient,
  parties: ReturnType<typeof loadPortalParties>
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/buyer/obligations") {
      const data = await proxyGet(`${process.env.BUYER_INDEXER_URL ?? "http://127.0.0.1:4012"}/buyer/obligations`);
      json(res, 200, data);
      return;
    }

    if (req.method === "GET" && url.pathname === "/buyer/pending-proposals") {
      const data = await proxyGet(`${process.env.BUYER_INDEXER_URL ?? "http://127.0.0.1:4012"}/buyer/pending-proposals`);
      json(res, 200, data);
      return;
    }

    if (req.method === "GET" && url.pathname === "/supplier/receivables") {
      const data = await proxyGet(`${SUPPLIER_INDEXER}/supplier/receivables`);
      json(res, 200, data);
      return;
    }

    if (req.method === "GET" && url.pathname === "/supplier/consent-policies") {
      const data = await proxyGet(`${SUPPLIER_INDEXER}/supplier/consent-policies`);
      json(res, 200, data);
      return;
    }

    if (req.method === "GET" && url.pathname === "/financing/rounds") {
      const data = await proxyGet(`${SUPPLIER_INDEXER}/supplier/financing-rounds`);
      json(res, 200, data);
      return;
    }

    const bidsRequestId = financingRequestId(url.pathname, "bids");
    if (req.method === "GET" && bidsRequestId) {
      const data = await proxyGet(
        `${SUPPLIER_INDEXER}/supplier/bid-comparison/${encodeURIComponent(bidsRequestId)}`
      );
      json(res, 200, data);
      return;
    }

    if (req.method === "GET" && url.pathname === "/financier/invitations") {
      const data = await proxyGet(`${FINANCIER_INDEXER}/financier/invitations`);
      json(res, 200, data);
      return;
    }

    if (req.method === "GET" && url.pathname === "/financier/my-bids") {
      const data = await proxyGet(`${FINANCIER_INDEXER}/financier/my-bids`);
      json(res, 200, data);
      return;
    }

    if (req.method === "GET" && url.pathname === "/parties") {
      json(res, 200, {
        supplier: parties.supplier.partyId,
        buyer: parties.buyer.partyId,
        financierA: parties.financierA.partyId,
        financierB: parties.financierB.partyId,
      });
      return;
    }

    const client = await auth.createAuthenticatedLedgerClient();

    if (req.method === "POST" && url.pathname === "/invoices/propose") {
      const body = (await readBody(req)) as {
        proposalId?: string;
        lineItems?: Array<{ description: string; quantity: string; unitPrice: string }>;
        faceValue?: string;
        currency?: string;
        dueDate?: string;
        consentGranted?: boolean;
      };

      const cmd = buildCreateReceivableProposalCommand({
        proposalId: body.proposalId ?? `INV-${Date.now()}`,
        supplier: parties.supplier.partyId,
        buyer: parties.buyer.partyId,
        lineItems: body.lineItems ?? [
          { description: "Services", quantity: "1", unitPrice: body.faceValue ?? "1000" },
        ],
        faceValue: body.faceValue ?? "1000",
        currency: body.currency ?? "USD",
        dueDate: body.dueDate ?? "2026-12-31",
        consentSource: inlineConsent(body.consentGranted ?? true),
      });

      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.supplier.partyId],
        commands: [cmd],
      });

      json(res, 201, {
        contractId: extractCreatedContractId(result),
        transaction: result.transaction?.updateId,
      });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/invoices/") && url.pathname.endsWith("/cosign")) {
      const contractId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const cmd = buildCoSignAndIssueCommand(contractId);
      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.buyer.partyId],
        commands: [cmd],
      });

      json(res, 200, {
        receivableContractId: extractCreatedContractId(result, "Receivable:Receivable"),
        transaction: result.transaction?.updateId,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/consent-policies") {
      const body = (await readBody(req)) as {
        masterAgreementId?: string;
        allowsAssignment?: boolean;
      };

      const cmd = buildCreateConsentPolicyCommand({
        buyer: parties.buyer.partyId,
        supplier: parties.supplier.partyId,
        masterAgreementId: body.masterAgreementId ?? `MA-${Date.now()}`,
        grantedAt: new Date().toISOString(),
        allowsAssignment: body.allowsAssignment ?? true,
      });

      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.buyer.partyId],
        commands: [cmd],
      });

      json(res, 201, {
        contractId: extractCreatedContractId(result),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/financing/open") {
      const body = (await readBody(req)) as {
        receivableCid?: string;
        requestId?: string;
        financiers?: string[];
        deadline?: string;
        pricingBandMin?: string;
        pricingBandMax?: string;
        redstoneFeedId?: number[];
      };

      if (!body.receivableCid) {
        json(res, 400, { error: "receivableCid required" });
        return;
      }

      const factoryId = await findOrCreateFinancingFactory(client, parties.supplier.partyId);
      const defaultFinanciers = [
        parties.financierA.partyId,
        parties.financierB.partyId,
      ];
      const feedId =
        body.redstoneFeedId ?? "SOFR".split("").map((ch) => ch.charCodeAt(0));

      const cmd = buildOpenFinancingRoundCommand({
        factoryContractId: factoryId,
        receivableCid: body.receivableCid,
        requestId: body.requestId ?? `ROUND-${Date.now()}`,
        financiers: body.financiers ?? defaultFinanciers,
        deadline: body.deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        pricingBandMin: body.pricingBandMin ?? "0.01",
        pricingBandMax: body.pricingBandMax ?? "0.15",
        redstoneFeedId: feedId,
      });

      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.supplier.partyId],
        commands: [cmd],
      });

      json(res, 201, {
        contractId: extractCreatedContractId(result),
        transaction: result.transaction?.updateId,
      });
      return;
    }

    const awardId = financingRequestId(url.pathname, "award");
    if (req.method === "POST" && awardId) {
      const body = (await readBody(req)) as { winningBidCid?: string };
      if (!body.winningBidCid) {
        json(res, 400, { error: "winningBidCid required" });
        return;
      }

      const cmd = buildAwardBidCommand({
        requestContractId: awardId,
        winningBidCid: body.winningBidCid,
      });
      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.supplier.partyId],
        commands: [cmd],
      });

      json(res, 200, {
        receivableContractId: extractCreatedContractId(result),
        transaction: result.transaction?.updateId,
      });
      return;
    }

    const pauseId = financingRequestId(url.pathname, "pause");
    if (req.method === "POST" && pauseId) {
      const cmd = buildPauseRoundCommand(pauseId);
      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.supplier.partyId],
        commands: [cmd],
      });

      json(res, 200, {
        contractId: extractCreatedContractId(result),
        transaction: result.transaction?.updateId,
      });
      return;
    }

    const fallbackId = financingRequestId(url.pathname, "static-fallback");
    if (req.method === "POST" && fallbackId) {
      const cmd = buildEnterStaticFallbackCommand(fallbackId);
      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.supplier.partyId],
        commands: [cmd],
      });

      json(res, 200, {
        contractId: extractCreatedContractId(result),
        transaction: result.transaction?.updateId,
      });
      return;
    }

    const expireId = financingRequestId(url.pathname, "expire");
    if (req.method === "POST" && expireId) {
      const cmd = buildExpireRoundCommand({ requestContractId: expireId });
      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.supplier.partyId],
        commands: [cmd],
      });

      json(res, 200, {
        contractId: extractCreatedContractId(result),
        transaction: result.transaction?.updateId,
      });
      return;
    }

    const bidRequestId = financingRequestId(url.pathname, "bid");
    if (req.method === "POST" && bidRequestId) {
      const body = (await readBody(req)) as {
        advanceAmount?: string;
        discountRate?: string;
        useStaticReference?: boolean;
      };

      if (!body.advanceAmount || !body.discountRate) {
        json(res, 400, { error: "advanceAmount and discountRate required" });
        return;
      }

      const oracle = await fetchOracleFeed();
      const mode = body.useStaticReference ? staticReferenceMode() : oracleAnchoredMode();
      const ledgerTime = new Date(oracle.packageTimestampMs).toISOString();

      const cmd = buildSubmitBidCommand({
        requestContractId: bidRequestId,
        financier: parties.financierA.partyId,
        advanceAmount: body.advanceAmount,
        discountRate: body.discountRate,
        redstonePayload: oracle.canton.payloadHex,
        redstoneTimestampMs: oracle.packageTimestampMs,
        mode,
        ledgerTime,
      });

      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.financierA.partyId],
        commands: [cmd],
      });

      json(res, 201, {
        bidContractId: extractCreatedContractId(result),
        oracleFresh: oracle.isFresh,
        transaction: result.transaction?.updateId,
      });
      return;
    }

    const replaceBidId = financingRequestId(url.pathname, "replace-bid");
    if (req.method === "POST" && replaceBidId) {
      const body = (await readBody(req)) as {
        advanceAmount?: string;
        discountRate?: string;
        useStaticReference?: boolean;
      };

      if (!body.advanceAmount || !body.discountRate) {
        json(res, 400, { error: "advanceAmount and discountRate required" });
        return;
      }

      const oracle = await fetchOracleFeed();
      const mode = body.useStaticReference ? staticReferenceMode() : oracleAnchoredMode();
      const ledgerTime = new Date(oracle.packageTimestampMs).toISOString();

      const cmd = buildReplaceBidCommand({
        requestContractId: replaceBidId,
        financier: parties.financierA.partyId,
        advanceAmount: body.advanceAmount,
        discountRate: body.discountRate,
        redstonePayload: oracle.canton.payloadHex,
        redstoneTimestampMs: oracle.packageTimestampMs,
        mode,
        ledgerTime,
      });

      const result = await client.submitAndWaitForTransaction({
        actAs: [parties.financierA.partyId],
        commands: [cmd],
      });

      json(res, 200, {
        bidContractId: extractCreatedContractId(result),
        oracleFresh: oracle.isFresh,
        transaction: result.transaction?.updateId,
      });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
}

async function main(): Promise<void> {
  const manifestPath = process.env.PARTIES_MANIFEST ?? defaultManifestPath(ROOT);
  const parties = loadPortalParties(manifestPath);
  const auth = DevNetAuthClient.fromEnv();

  const server = createServer((req, res) => {
    handleRequest(req, res, auth, parties).catch((err) => json(res, 500, { error: String(err) }));
  });

  server.listen(PORT, () => {
    console.log(`portal-api listening on http://127.0.0.1:${PORT}`);
    console.log(`templates: ${TEMPLATE_IDS.receivableProposal}`);
    console.log(`interfaces: ${INTERFACE_IDS.buyerView}`);
    console.log(`supplier indexer: ${SUPPLIER_INDEXER}`);
    console.log(`financier indexer: ${FINANCIER_INDEXER}`);
    console.log(`oracle relay: ${ORACLE_RELAY}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
