/** Mimics phase1-stack-e2e indexer timing without spawning all services. */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "services/indexer/data/stack-debug");

loadDotenv({ path: join(ROOT, ".env") });

const children: ChildProcess[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`timeout ${url}`);
}

async function main(): Promise<void> {
  if (existsSync(DATA)) rmSync(DATA, { recursive: true, force: true });

  const buyerCfg = readFileSync(join(ROOT, "infra/configs/indexer-buyer.yaml"), "utf-8")
    .replace("dataDir: ./data/indexer", `dataDir: ${DATA.replace(/\\/g, "/")}`)
    .replace("pollIntervalMs: 5000", "pollIntervalMs: 2000");
  const cfgPath = join(ROOT, "services/indexer/data/stack-debug-buyer.yaml");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, buyerCfg);

  const child = spawn(
    process.execPath,
    ["dist/cli.js", cfgPath, "--rebuild", "--serve"],
    { cwd: join(ROOT, "services/indexer"), stdio: "inherit", env: process.env }
  );
  children.push(child);

  await waitFor("http://127.0.0.1:4012/health");

  const proposalId = `STACKDBG-${Date.now()}`;
  const res = await fetch("http://127.0.0.1:4000/invoices/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proposalId,
      faceValue: "99",
      currency: "USD",
      dueDate: "2026-12-31",
      consentGranted: true,
    }),
  }).catch(async () => {
    // portal-api may not be running — submit via ledger instead
    const { DevNetAuthClient } = await import("@meridian/devnet-auth");
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "infra/manifests/parties.devnet.json"), "utf-8")
    );
    const supplier = manifest.personas.find((p: { orgId: string }) => p.orgId === "meridian-supplier").partyId;
    const buyer = manifest.personas.find((p: { orgId: string }) => p.orgId === "meridian-buyer").partyId;
    const auth = DevNetAuthClient.fromEnv();
    const client = await auth.createAuthenticatedLedgerClient();
    const { buildCreateReceivableProposalCommand, inlineConsent } = await import("@meridian/ledger-client");
    const result = await client.submitAndWaitForTransaction({
      actAs: [supplier],
      commands: [
        buildCreateReceivableProposalCommand({
          proposalId,
          supplier,
          buyer,
          lineItems: [{ description: "x", quantity: "1", unitPrice: "99" }],
          faceValue: "99",
          currency: "USD",
          dueDate: "2026-12-31",
          consentSource: inlineConsent(true),
        }),
      ],
    });
    for (const ev of result.transaction?.events ?? []) {
      const c = (ev as { CreatedEvent?: { contractId?: string } }).CreatedEvent;
      if (c?.contractId) return { cid: c.contractId, via: "ledger" as const };
    }
    throw new Error("no cid");
  });

  let proposalCid: string;
  if (res instanceof Response) {
    const body = (await res.json()) as { contractId: string };
    proposalCid = body.contractId;
  } else {
    proposalCid = res.cid;
  }
  console.log(`proposed ${proposalId} cid=${proposalCid}`);

  for (let i = 0; i < 30; i++) {
    const listRes = await fetch("http://127.0.0.1:4012/buyer/pending-proposals");
    const listText = await listRes.text();
    if (!listRes.ok) {
      console.log(`poll ${i}: HTTP ${listRes.status} ${listText}`);
      await sleep(2000);
      continue;
    }
    const list = JSON.parse(listText) as { proposals?: Array<{ contractId: string; proposalId: string }> };
    const proposals = list.proposals ?? [];
    console.log(`poll ${i}: count=${proposals.length}`);
    const hit = proposals.find((p) => p.contractId === proposalCid || p.proposalId === proposalId);
    if (hit) {
      console.log("debug-stack-flow: PASS");
      child.kill();
      return;
    }
    await sleep(2000);
  }

  child.kill();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  for (const c of children) c.kill();
  process.exit(1);
});
