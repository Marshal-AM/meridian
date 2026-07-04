/**
 * Full Phase 3 stack smoke: Phase 2 flow + MUSD DvP award, buyer repayment, portfolio/proof.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import assert from "node:assert/strict";
import { DevNetAuthClient } from "@meridian/devnet-auth";
import {
  buildCreateFinancingFactoryCommand,
  buildOpenFinancingRoundCommand,
  buildPostForBidCommand,
  buildSubmitBidCommand,
  extractCreatedContractId,
  oracleAnchoredMode,
  TEMPLATE_IDS,
} from "@meridian/ledger-client";
import { awardWithDvP, loadCashManifest, musdBalance } from "./cash-devnet-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ORACLE_SNAPSHOT = join(ROOT, "infra/samples/redstone-fetch-latest.json");

loadDotenv({ path: join(ROOT, ".env") });

const PORTAL_API = process.env.PORTAL_API_URL ?? "http://127.0.0.1:4000";
const SUPPLIER_INDEXER = process.env.SUPPLIER_INDEXER_URL ?? "http://127.0.0.1:4011";
const BUYER_INDEXER = process.env.BUYER_INDEXER_URL ?? "http://127.0.0.1:4012";
const FINANCIER_INDEXER_A = process.env.FINANCIER_INDEXER_URL ?? "http://127.0.0.1:4013";
const FINANCIER_INDEXER_B = process.env.FINANCIER_INDEXER_B_URL ?? "http://127.0.0.1:4014";
const NOTIFICATIONS = process.env.NOTIFICATIONS_URL ?? "http://127.0.0.1:4020";
const ORACLE_RELAY = process.env.ORACLE_RELAY_URL ?? "http://127.0.0.1:4021";
const REGISTRY_API = process.env.REGISTRY_API_URL ?? "http://127.0.0.1:4022";
const MANIFEST = join(ROOT, "infra/manifests/parties.devnet.json");

const SOFR_FEED_ID_ASCII = [83, 79, 70, 82];
const PRICING_BAND_MIN = "0.01";
const PRICING_BAND_MAX = "0.15";

const children: ChildProcess[] = [];

interface OracleSnapshot {
  payloadHex: string;
  packageTimestampMs: number;
  isFresh: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function millisToLedgerTime(ms: number): string {
  return new Date(ms).toISOString();
}

function addDaysLedgerTime(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function loadOracleSnapshot(): OracleSnapshot {
  if (!existsSync(ORACLE_SNAPSHOT)) {
    throw new Error("oracle snapshot missing — run: pnpm redstone:fetch");
  }
  const raw = JSON.parse(readFileSync(ORACLE_SNAPSHOT, "utf-8")) as {
    canton?: { payloadHex?: string };
    packageTimestampMs?: number;
    isFresh?: boolean;
  };
  const payloadHex = raw.canton?.payloadHex;
  const packageTimestampMs = raw.packageTimestampMs;
  if (!payloadHex || packageTimestampMs == null) {
    throw new Error("invalid oracle snapshot — run: pnpm redstone:fetch");
  }
  return {
    payloadHex,
    packageTimestampMs,
    isFresh: raw.isFresh ?? false,
  };
}

function oraclePreflight(): OracleSnapshot {
  console.log("0. Oracle preflight...");
  const oracle = loadOracleSnapshot();
  assert.ok(oracle.isFresh, "oracle snapshot must be fresh — run: pnpm redstone:fetch");
  console.log(
    `   payload ${oracle.payloadHex.length} hex chars, ts=${oracle.packageTimestampMs} ✓`
  );
  return oracle;
}

function partyId(orgId: string): string {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as {
    personas: Array<{ orgId: string; partyId?: string }>;
  };
  const entry = manifest.personas.find((p) => p.orgId === orgId);
  if (!entry?.partyId) throw new Error(`party missing: ${orgId}`);
  return entry.partyId;
}

function spawnService(
  name: string,
  cwd: string,
  args: string[],
  extraEnv?: Record<string, string>
): ChildProcess {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
  });
  children.push(child);
  return child;
}

async function waitForHealth(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // service still starting
    }
    await sleep(1000);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function pollUntil<T>(
  label: string,
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 120_000,
  intervalMs = 2000
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (predicate(value)) return value;
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function grantDevNetRights(): Promise<void> {
  const { execSync } = await import("node:child_process");
  execSync("pnpm exec tsx scripts/grant-devnet-rights.ts", {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
}

function stopChildren(): void {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

async function startStack(): Promise<void> {
  console.log("Starting Phase 3 stack services...");

  spawnService("registry-api", join(ROOT, "services/registry-api"), ["dist/index.js"], {
    REGISTRY_API_PORT: "4022",
  });

  spawnService(
    "indexer-supplier",
    join(ROOT, "services/indexer"),
    ["dist/cli.js", "../../infra/configs/indexer-supplier.yaml", "--rebuild", "--serve"],
    { MERIDIAN_INDEXER_POLL_MS: "2000" }
  );
  spawnService(
    "indexer-buyer",
    join(ROOT, "services/indexer"),
    ["dist/cli.js", "../../infra/configs/indexer-buyer.yaml", "--rebuild", "--serve"],
    { MERIDIAN_INDEXER_POLL_MS: "2000" }
  );
  spawnService(
    "indexer-financier-a",
    join(ROOT, "services/indexer"),
    ["dist/cli.js", "../../infra/configs/indexer-financier-a.yaml", "--rebuild", "--serve"],
    { MERIDIAN_INDEXER_POLL_MS: "2000" }
  );
  spawnService(
    "indexer-financier-b",
    join(ROOT, "services/indexer"),
    ["dist/cli.js", "../../infra/configs/indexer-financier-b.yaml", "--rebuild", "--serve"],
    { MERIDIAN_INDEXER_POLL_MS: "2000" }
  );
  spawnService("oracle-relay", join(ROOT, "services/oracle-relay"), ["dist/cli.js"], {
    ORACLE_RELAY_PORT: "4021",
  });
  spawnService("notifications", join(ROOT, "services/notifications"), ["dist/cli.js"], {
    NOTIFICATIONS_PORT: "4020",
  });
  spawnService("portal-api", join(ROOT, "services/portal-api"), ["dist/index.js"], {
    ORACLE_RELAY_URL: ORACLE_RELAY,
    FINANCIER_INDEXER_URL: FINANCIER_INDEXER_A,
  });

  await Promise.all([
    waitForHealth(`${SUPPLIER_INDEXER}/health`),
    waitForHealth(`${BUYER_INDEXER}/health`),
    waitForHealth(`${FINANCIER_INDEXER_A}/health`),
    waitForHealth(`${FINANCIER_INDEXER_B}/health`),
    waitForHealth(`${ORACLE_RELAY}/health`),
    waitForHealth(`${REGISTRY_API}/health`),
    waitForHealth(`${NOTIFICATIONS}/`),
    waitForHealth(`${PORTAL_API}/health`),
  ]);
  console.log("All services healthy.");
}

interface BuyerObligation {
  contractId: string;
  receivableId: string;
  payee: string;
  faceValue: string;
  dueDate: string;
  lineItems?: unknown;
  discountRate?: unknown;
  advanceAmount?: unknown;
}

interface SupplierReceivable {
  contractId: string;
  receivableId: string;
  buyer: string;
  lineItems: Array<{ description: string }>;
  faceValue: string;
  state: string;
  payeeOfRecord: { payee: string; payeeRole: string };
}

async function main(): Promise<void> {
  if (!process.env.DEVNET_CLIENT_SECRET) {
    console.error("DEVNET_CLIENT_SECRET required");
    process.exit(1);
  }

  if (!existsSync(MANIFEST)) {
    console.error("manifest missing");
    process.exit(1);
  }

  const oracle = oraclePreflight();
  const supplier = partyId("meridian-supplier");
  const buyer = partyId("meridian-buyer");
  const financierA = partyId("meridian-financier-a");

  process.on("SIGINT", () => {
    stopChildren();
    process.exit(130);
  });

  try {
    console.log("1. Granting DevNet party rights...");
    await grantDevNetRights();

    await startStack();

    const proposalId = `P2-STACK-${Date.now()}`;
    console.log(`2. Proposing invoice ${proposalId} via portal-api...`);
    const proposeRes = await fetch(`${PORTAL_API}/invoices/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId,
        faceValue: "3200",
        currency: "USD",
        dueDate: "2026-12-31",
        consentGranted: true,
        lineItems: [{ description: "Phase 2 stack item", quantity: "1", unitPrice: "3200" }],
      }),
    });
    const proposeText = await proposeRes.text();
    assert.equal(proposeRes.status, 201, proposeText);
    const proposalCid = (JSON.parse(proposeText) as { contractId: string }).contractId;
    assert.ok(proposalCid, "proposal contract id missing");
    console.log(`   proposal cid: ${proposalCid}`);

    console.log("3. Waiting for buyer pending proposal...");
    await pollUntil(
      "buyer pending proposal",
      async () => {
        const res = await fetch(`${PORTAL_API}/buyer/pending-proposals`);
        const body = (await res.json()) as { proposals: Array<{ contractId: string }> };
        return body.proposals ?? [];
      },
      (proposals) => proposals.some((p) => p.contractId === proposalCid)
    );
    console.log("   buyer pending proposal visible ✓");

    console.log("4. Buyer co-signing via portal-api...");
    const cosignRes = await fetch(
      `${PORTAL_API}/invoices/${encodeURIComponent(proposalCid)}/cosign`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    );
    const cosignText = await cosignRes.text();
    assert.equal(cosignRes.status, 200, cosignText);
    const receivableContractId = (JSON.parse(cosignText) as { receivableContractId: string })
      .receivableContractId;
    assert.ok(receivableContractId, "receivable contract id missing");
    console.log(`   receivable cid: ${receivableContractId}`);

    console.log("5. Verifying Phase 1 indexer projections...");
    await pollUntil(
      "buyer obligations",
      async () => {
        const res = await fetch(`${PORTAL_API}/buyer/obligations`);
        const body = (await res.json()) as { obligations: BuyerObligation[] };
        return body.obligations ?? [];
      },
      (rows) => rows.some((o) => o.contractId === receivableContractId)
    );
    await pollUntil(
      "supplier receivables",
      async () => {
        const res = await fetch(`${PORTAL_API}/supplier/receivables`);
        const body = (await res.json()) as { receivables: SupplierReceivable[] };
        return body.receivables ?? [];
      },
      (rows) => rows.some((r) => r.contractId === receivableContractId)
    );
    console.log("   Phase 1 projections indexed ✓");

    console.log("6. Opening oracle-anchored financing round on-ledger...");
    const auth = DevNetAuthClient.fromEnv();
    const client = await auth.createAuthenticatedLedgerClient();
    const ledgerTime = millisToLedgerTime(oracle.packageTimestampMs);
    const requestId = `STACK-ROUND-${Date.now()}`;

    const postResult = await client.submitAndWaitForTransaction({
      actAs: [supplier],
      commands: [buildPostForBidCommand(receivableContractId)],
    });
    const postedCid = extractCreatedContractId(postResult);
    assert.ok(postedCid, "posted receivable contract id missing");

    const factoryResult = await client.submitAndWaitForTransaction({
      actAs: [supplier],
      commands: [buildCreateFinancingFactoryCommand({ supplier })],
    });
    const factoryCid = extractCreatedContractId(factoryResult);
    assert.ok(factoryCid, "financing factory contract id missing");

    const roundResult = await client.submitAndWaitForTransaction({
      actAs: [supplier],
      commands: [
        buildOpenFinancingRoundCommand({
          factoryContractId: factoryCid,
          receivableCid: postedCid,
          requestId,
          financiers: [financierA],
          deadline: addDaysLedgerTime(ledgerTime, 7),
          pricingBandMin: PRICING_BAND_MIN,
          pricingBandMax: PRICING_BAND_MAX,
          redstoneFeedId: SOFR_FEED_ID_ASCII,
        }),
      ],
    });
    const requestCid = extractCreatedContractId(
      roundResult,
      "FinancingRequest:FinancingRequest"
    );
    assert.ok(requestCid, "financing request contract id missing");
    console.log(`   financing request cid: ${requestCid}`);

    console.log("7. Financier A submitting oracle-anchored bid...");
    const bidResult = await client.submitAndWaitForTransaction({
      actAs: [financierA],
      commands: [
        buildSubmitBidCommand({
          requestContractId: requestCid,
          financier: financierA,
          advanceAmount: "2400",
          discountRate: "0.05",
          redstonePayload: oracle.payloadHex,
          redstoneTimestampMs: oracle.packageTimestampMs,
          mode: oracleAnchoredMode(),
          ledgerTime,
        }),
      ],
    });
    let bidCid = extractCreatedContractId(bidResult, "Bid:Bid");
    if (!bidCid) {
      const bids = await client.getActiveContractsByTemplate(financierA, TEMPLATE_IDS.bid);
      bidCid =
        bids.find((b) => {
          const payload = b.payload as Record<string, unknown>;
          return String(payload.requestId) === requestId;
        })?.contractId ?? null;
    }
    assert.ok(bidCid, `bid contract id missing for request ${requestId}`);
    const updatedRequests = await client.getActiveContractsByTemplate(
      supplier,
      TEMPLATE_IDS.financingRequest
    );
    const updatedRequestCid = updatedRequests.find((r) => {
      const payload = r.payload as Record<string, unknown>;
      return String(payload.requestId) === requestId;
    })?.contractId;
    assert.ok(updatedRequestCid, "updated financing request missing");
    console.log(`   bid cid: ${bidCid}`);

    console.log("8. Supplier awarding bid with DvP...");
    const cash = loadCashManifest(ROOT);
    const { fundedReceivableCid } = await awardWithDvP(client, cash, {
      supplier,
      financier: financierA,
      requestCid: updatedRequestCid,
      bidCid,
      advanceAmount: "2400",
    });
    console.log(`   funded receivable cid: ${fundedReceivableCid}`);

    console.log("9. Verifying buyer obligations post-fund (no pricing)...");
    const obligations = await pollUntil(
      "funded buyer obligations",
      async () => {
        const res = await fetch(`${PORTAL_API}/buyer/obligations`);
        const body = (await res.json()) as { obligations: BuyerObligation[] };
        return body.obligations ?? [];
      },
      (rows) => rows.some((o) => o.contractId === fundedReceivableCid)
    );
    const buyerView = obligations.find((o) => o.contractId === fundedReceivableCid)!;
    assert.equal(buyerView.payee, financierA, "buyer payee must be winning financier");
    assert.equal(buyerView.lineItems, undefined, "buyer view must not expose line items");
    assert.equal(buyerView.discountRate, undefined, "buyer view must not expose discount rate");
    assert.equal(buyerView.advanceAmount, undefined, "buyer view must not expose advance amount");
    console.log("   buyer IBuyerView limited fields only ✓");

    console.log("10. Verifying supplier receivable post-fund...");
    const receivables = await pollUntil(
      "funded supplier receivables",
      async () => {
        const res = await fetch(`${PORTAL_API}/supplier/receivables`);
        const body = (await res.json()) as { receivables: SupplierReceivable[] };
        return body.receivables ?? [];
      },
      (rows) =>
        rows.some(
          (r) => r.contractId === fundedReceivableCid && r.state === "Funded"
        )
    );
    const supplierView = receivables.find((r) => r.contractId === fundedReceivableCid)!;
    assert.equal(supplierView.state, "Funded");
    assert.equal(supplierView.payeeOfRecord.payee, financierA);
    assert.ok(Array.isArray(supplierView.lineItems) && supplierView.lineItems.length > 0);
    console.log("   supplier ISupplierView funded state + financier payee ✓");
    const fundedReceivableBusinessId = supplierView.receivableId;

    console.log("11. Verifying supplier MUSD balance increased after DvP...");
    const supplierMusd = await musdBalance(client, supplier, cash.registryAdminPartyId);
    assert.ok(supplierMusd >= 2400, "supplier should hold MUSD advance after DvP");
    console.log(`   supplier MUSD balance=${supplierMusd} ✓`);

    console.log("12. Buyer repayment via portal-api...");
    const repayRes = await fetch(`${PORTAL_API}/receivables/${encodeURIComponent(fundedReceivableCid)}/repay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faceValue: "3200",
        payeePartyId: financierA,
        settlementRef: `stack-repay-${Date.now()}`,
      }),
    });
    assert.equal(repayRes.status, 200, await repayRes.text());
    console.log("   repayment submitted ✓");

    console.log("13. Supplier portfolio includes repayment proof...");
    const portfolio = await pollUntil(
      "supplier portfolio proof",
      async () => {
        const res = await fetch(`${PORTAL_API}/supplier/portfolio`);
        return (await res.json()) as {
          receivables: SupplierReceivable[];
          repaymentProofs: Array<{ receivableId: string }>;
        };
      },
      (body) =>
        (body.repaymentProofs ?? []).some((p) => p.receivableId) &&
        (body.receivables ?? []).some(
          // receivableId (business key) matches; contractId changes after RepayWithProof
          (r) => r.receivableId === fundedReceivableBusinessId && r.state === "Repaid"
        )
    );
    assert.ok(portfolio.repaymentProofs.length > 0, "repayment proof on portfolio");
    console.log("   supplier portfolio + proof ✓");

    console.log("14. Financier positions show Repaid...");
    const positions = await pollUntil(
      "financier position repaid",
      async () => {
        const res = await fetch(`${PORTAL_API}/financier/positions`);
        const body = (await res.json()) as { positions: SupplierReceivable[] };
        return body.positions ?? [];
      },
      // receivableId (business key) — contractId changes after RepayWithProof
      (rows) =>
        rows.some(
          (p) => p.receivableId === fundedReceivableBusinessId && p.state === "Repaid"
        )
    );
    assert.ok(
      positions.some(
        (p) => p.receivableId === fundedReceivableBusinessId && p.state === "Repaid"
      ),
      "financier position repaid"
    );
    console.log("   financier positions ✓");

    console.log("\nPhase 3 stack E2E: ALL PASSED");
  } finally {
    stopChildren();
  }
}

main().catch((err) => {
  console.error("\nPhase 3 stack E2E FAILED:", err);
  stopChildren();
  process.exit(1);
});
