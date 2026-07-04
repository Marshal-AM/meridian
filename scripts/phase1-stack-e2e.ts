/**
 * Full Phase 1 stack smoke: portal-api + supplier/buyer indexers + notifications.
 * Spawns services, exercises the same HTTP flow the portal UI uses, and asserts
 * interface-view privacy through the indexer projections.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

loadDotenv({ path: join(ROOT, ".env") });

const PORTAL_API = process.env.PORTAL_API_URL ?? "http://127.0.0.1:4000";
const SUPPLIER_INDEXER = process.env.SUPPLIER_INDEXER_URL ?? "http://127.0.0.1:4011";
const BUYER_INDEXER = process.env.BUYER_INDEXER_URL ?? "http://127.0.0.1:4012";
const NOTIFICATIONS = process.env.NOTIFICATIONS_URL ?? "http://127.0.0.1:4020";

const children: ChildProcess[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnService(name: string, cwd: string, args: string[], extraEnv?: Record<string, string>): ChildProcess {
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
  console.log("Starting Phase 1 stack services...");

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
  spawnService("notifications", join(ROOT, "services/notifications"), ["dist/cli.js"]);
  spawnService("portal-api", join(ROOT, "services/portal-api"), ["dist/index.js"]);

  await Promise.all([
    waitForHealth(`${SUPPLIER_INDEXER}/health`),
    waitForHealth(`${BUYER_INDEXER}/health`),
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
}

interface SupplierReceivable {
  contractId: string;
  receivableId: string;
  buyer: string;
  lineItems: Array<{ description: string }>;
  faceValue: string;
}

async function main(): Promise<void> {
  if (!process.env.DEVNET_CLIENT_SECRET) {
    console.error("DEVNET_CLIENT_SECRET required");
    process.exit(1);
  }

  process.on("SIGINT", () => {
    stopChildren();
    process.exit(130);
  });

  try {
    console.log("1. Granting DevNet party rights...");
    await grantDevNetRights();

    await startStack();

    const proposalId = `STACK-${Date.now()}`;
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
        lineItems: [{ description: "Stack E2E item", quantity: "1", unitPrice: "3200" }],
      }),
    });
    const proposeText = await proposeRes.text();
    assert.equal(proposeRes.status, 201, proposeText);
    const proposeBody = JSON.parse(proposeText) as { contractId: string };
    const proposalCid = proposeBody.contractId;
    assert.ok(proposalCid, "proposal contract id missing");
    console.log(`   proposal cid: ${proposalCid}`);

    console.log("3. Waiting for buyer indexer to see pending proposal...");
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
    const { receivableContractId } = JSON.parse(cosignText) as {
      receivableContractId: string;
    };
    assert.ok(receivableContractId, "receivable contract id missing");
    console.log(`   receivable cid: ${receivableContractId}`);

    console.log("5. Verifying buyer obligations (IBuyerView — no line items)...");
    const obligations = await pollUntil(
      "buyer obligations",
      async () => {
        const res = await fetch(`${PORTAL_API}/buyer/obligations`);
        const body = (await res.json()) as { obligations: BuyerObligation[] };
        return body.obligations ?? [];
      },
      (rows) => rows.some((o) => o.contractId === receivableContractId)
    );
    const buyerView = obligations.find((o) => o.contractId === receivableContractId)!;
    assert.ok(buyerView.faceValue, "buyer sees face value");
    assert.ok(buyerView.dueDate, "buyer sees due date");
    assert.ok(buyerView.payee, "buyer sees payee");
    assert.equal(
      buyerView.lineItems,
      undefined,
      "buyer view must not expose line items"
    );
    console.log("   buyer IBuyerView limited fields only ✓");

    console.log("6. Verifying supplier receivables (ISupplierView — with line items)...");
    const receivables = await pollUntil(
      "supplier receivables",
      async () => {
        const res = await fetch(`${PORTAL_API}/supplier/receivables`);
        const body = (await res.json()) as { receivables: SupplierReceivable[] };
        return body.receivables ?? [];
      },
      (rows) => rows.some((r) => r.contractId === receivableContractId)
    );
    const supplierView = receivables.find((r) => r.contractId === receivableContractId)!;
    assert.ok(Array.isArray(supplierView.lineItems) && supplierView.lineItems.length > 0);
    assert.equal(supplierView.lineItems[0]?.description, "Stack E2E item");
    assert.ok(supplierView.buyer, "supplier sees buyer identity");
    console.log("   supplier ISupplierView with line items + buyer ✓");

    console.log("\nPhase 1 stack E2E: ALL PASSED");
  } finally {
    stopChildren();
  }
}

main().catch((err) => {
  console.error("\nPhase 1 stack E2E FAILED:", err);
  stopChildren();
  process.exit(1);
});
