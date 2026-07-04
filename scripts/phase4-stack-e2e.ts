/**
 * Full Phase 4 stack smoke: Phase 3 flow + syndication round + waterfall repayment.
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
  shareAmount,
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
const PARTICIPANT_SHARE_BPS = 4000;
const FACE_VALUE = "3200";

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
      // still starting
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

function stopChildren(): void {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

async function startStack(): Promise<void> {
  console.log("Starting Phase 4 stack services...");
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
    FINANCIER_INDEXER_B_URL: FINANCIER_INDEXER_B,
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

interface SupplierReceivable {
  contractId: string;
  receivableId: string;
  state: string;
  payeeOfRecord: { payee: string };
}

async function main(): Promise<void> {
  const oracle = loadOracleSnapshot();
  assert.ok(oracle.isFresh, "oracle snapshot must be fresh");

  const supplier = partyId("meridian-supplier");
  const buyer = partyId("meridian-buyer");
  const financierA = partyId("meridian-financier-a");
  const financierB = partyId("meridian-financier-b");

  const { execSync } = await import("node:child_process");
  execSync("pnpm exec tsx scripts/grant-devnet-rights.ts", {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  await startStack();

  try {
    const auth = DevNetAuthClient.fromEnv();
    const client = await auth.createAuthenticatedLedgerClient();
    const ledgerTime = millisToLedgerTime(oracle.packageTimestampMs);
    const requestId = `STACK-P4-${Date.now()}`;

    console.log("1. Issue + fund receivable (ledger)...");
    const proposeRes = await fetch(`${PORTAL_API}/invoices/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId: `P4-STACK-${Date.now()}`,
        faceValue: FACE_VALUE,
        currency: "USD",
        dueDate: "2026-12-31",
        consentGranted: true,
        lineItems: [{ description: "Phase 4 stack", quantity: "1", unitPrice: FACE_VALUE }],
      }),
    });
    assert.equal(proposeRes.status, 201);
    const { contractId: proposalCid } = (await proposeRes.json()) as { contractId: string };

    const cosignRes = await fetch(`${PORTAL_API}/invoices/${encodeURIComponent(proposalCid)}/cosign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(cosignRes.status, 200);
    const cosignBody = (await cosignRes.json()) as { receivableContractId: string };
    const receivableCid = cosignBody.receivableContractId;

    const postResult = await client.submitAndWaitForTransaction({
      actAs: [supplier],
      commands: [buildPostForBidCommand(receivableCid)],
    });
    const postedCid = extractCreatedContractId(postResult);
    assert.ok(postedCid);

    const factoryResult = await client.submitAndWaitForTransaction({
      actAs: [supplier],
      commands: [buildCreateFinancingFactoryCommand({ supplier })],
    });
    const factoryCid = extractCreatedContractId(factoryResult);
    assert.ok(factoryCid);

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
    const requestCid = extractCreatedContractId(roundResult, "FinancingRequest");
    assert.ok(requestCid);

    await client.submitAndWaitForTransaction({
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

    const bids = await client.getActiveContractsByTemplate(financierA, TEMPLATE_IDS.bid);
    const bidCid = bids.find(
      (b) => String((b.payload as Record<string, unknown>).requestId) === requestId
    )?.contractId;
    assert.ok(bidCid);

    const updatedRequests = await client.getActiveContractsByTemplate(
      supplier,
      TEMPLATE_IDS.financingRequest
    );
    const updatedRequestCid = updatedRequests.find(
      (r) => String((r.payload as Record<string, unknown>).requestId) === requestId
    )?.contractId;
    assert.ok(updatedRequestCid);

    const cash = loadCashManifest(ROOT);
    const { fundedReceivableCid } = await awardWithDvP(client, cash, {
      supplier,
      financier: financierA,
      requestCid: updatedRequestCid,
      bidCid,
      advanceAmount: "2400",
    });
    console.log(`   funded ${fundedReceivableCid.slice(0, 24)}… ✓`);

    console.log("2. Syndication round via portal-api...");
    const openRes = await fetch(`${PORTAL_API}/syndication/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receivableCid: fundedReceivableCid,
        participants: [financierB],
      }),
    });
    const openText = await openRes.text();
    assert.equal(openRes.status, 201, openText);
    const { contractId: offeringCid } = JSON.parse(openText) as { contractId: string };

    const bidRes = await fetch(
      `${PORTAL_API}/syndication/${encodeURIComponent(offeringCid)}/bid`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareBps: PARTICIPANT_SHARE_BPS,
          discountRate: "0.05",
        }),
      }
    );
    const bidText = await bidRes.text();
    assert.equal(bidRes.status, 201, bidText);
    const bidBody = JSON.parse(bidText) as {
      bidContractId: string;
      offeringContractId?: string;
    };
    const { bidContractId } = bidBody;
    const offeringForAward = bidBody.offeringContractId ?? offeringCid;

    const awardRes = await fetch(
      `${PORTAL_API}/syndication/${encodeURIComponent(offeringForAward)}/award`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningBidCid: bidContractId }),
      }
    );
    const awardText = await awardRes.text();
    assert.equal(awardRes.status, 200, awardText);
    const awardBody = JSON.parse(awardText) as { receivableContractId: string };
    const syndicatedCid = awardBody.receivableContractId;
    assert.ok(syndicatedCid);

    console.log("3. Indexer projections...");
    const receivables = await pollUntil(
      "supplier receivables syndicated",
      async () => {
        const res = await fetch(`${PORTAL_API}/supplier/receivables`);
        return ((await res.json()) as { receivables: SupplierReceivable[] }).receivables ?? [];
      },
      (rows) => rows.some((r) => r.contractId === syndicatedCid)
    );
    const supplierView = receivables.find((r) => r.contractId === syndicatedCid);
    assert.ok(supplierView, "supplier must see the syndicated receivable");
    assert.equal(supplierView.state, "Funded", "supplier portfolio must mask PartiallySyndicated");
    const businessReceivableId = supplierView.receivableId;

    const capTable = await pollUntil(
      "lead cap table",
      async () => {
        const res = await fetch(
          `${PORTAL_API}/financier/syndication/cap-table/${encodeURIComponent(businessReceivableId)}`
        );
        if (!res.ok) return null;
        return (await res.json()) as { capTable: Array<{ shareBps: number }> };
      },
      (v) => v != null && (v.capTable?.length ?? 0) > 0
    );
    assert.equal(capTable.capTable[0]?.shareBps, PARTICIPANT_SHARE_BPS);

    const interests = await pollUntil(
      "participant interests",
      async () => {
        const res = await fetch(`${PORTAL_API}/financier/syndication/my-interests?tab=participant`);
        return ((await res.json()) as { interests: Array<{ shareBps: number }> }).interests ?? [];
      },
      (rows) => rows.length > 0
    );
    assert.ok(interests.some((i) => i.shareBps === PARTICIPANT_SHARE_BPS));
    console.log("   cap table + interests ✓");

    console.log("4. Waterfall repayment via portal-api...");
    const participantBalBefore = await musdBalance(client, financierB, cash.registryAdminPartyId);
    const repayRes = await fetch(
      `${PORTAL_API}/receivables/${encodeURIComponent(syndicatedCid)}/repay`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faceValue: FACE_VALUE,
          payeePartyId: financierA,
          settlementRef: `p4-stack-repay-${Date.now()}`,
        }),
      }
    );
    assert.equal(repayRes.status, 200, await repayRes.text());

    const expectedParticipant = shareAmount(Number(FACE_VALUE), PARTICIPANT_SHARE_BPS);
    const participantBalAfter = await musdBalance(client, financierB, cash.registryAdminPartyId);
    assert.ok(
      Math.abs(participantBalAfter - participantBalBefore - expectedParticipant) < 0.01,
      "participant waterfall credit"
    );
    console.log(`   participant +${expectedParticipant} MUSD ✓`);

    console.log("5. Supplier portfolio + financier positions post-repayment...");
    await pollUntil(
      "supplier repaid",
      async () => {
        const res = await fetch(`${PORTAL_API}/supplier/portfolio`);
        return (await res.json()) as {
          receivables: SupplierReceivable[];
          repaymentProofs: unknown[];
        };
      },
      (body) =>
        (body.repaymentProofs?.length ?? 0) > 0 &&
        (body.receivables ?? []).some(
          (r) => r.receivableId === businessReceivableId && r.state === "Repaid"
        )
    );

    const positions = await pollUntil(
      "financier repaid",
      async () => {
        const res = await fetch(`${PORTAL_API}/financier/positions`);
        return ((await res.json()) as { positions: SupplierReceivable[] }).positions ?? [];
      },
      (rows) =>
        rows.some((p) => p.receivableId === businessReceivableId && p.state === "Repaid")
    );
    assert.ok(positions.length > 0);
    console.log("   portfolio + positions ✓");

    console.log("\nPhase 4 stack E2E: ALL PASSED");
  } finally {
    stopChildren();
  }
}

main().catch((err) => {
  console.error("\nPhase 4 stack E2E FAILED:", err);
  stopChildren();
  process.exit(1);
});
