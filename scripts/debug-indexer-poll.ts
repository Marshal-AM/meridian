/** Isolated check: indexer runOnce picks up a new proposal for buyer party. */
import { readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import type { DevNetPartiesManifest, IndexerConfig } from "@meridian/shared-types";
import { DevNetAuthClient } from "@meridian/devnet-auth";
import {
  buildCreateReceivableProposalCommand,
  inlineConsent,
} from "@meridian/ledger-client";
import { ReplayIndexer } from "../services/indexer/dist/replay-indexer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "infra/manifests/parties.devnet.json");
const BUYER_CONFIG = join(ROOT, "infra/configs/indexer-buyer.yaml");
const DEBUG_DATA = join(ROOT, "services/indexer/data/debug-buyer");

loadDotenv({ path: join(ROOT, ".env") });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as DevNetPartiesManifest;
  const supplier = manifest.personas.find((p) => p.orgId === "meridian-supplier")!.partyId;
  const buyer = manifest.personas.find((p) => p.orgId === "meridian-buyer")!.partyId;

  const auth = DevNetAuthClient.fromEnv();
  const client = await auth.createAuthenticatedLedgerClient();
  const token = await auth.getAccessToken();

  const baseConfig = parseYaml(readFileSync(BUYER_CONFIG, "utf-8")) as IndexerConfig;
  const dbDir = join(DEBUG_DATA, baseConfig.orgId);
  const dbPath = join(dbDir, "indexer.db");
  if (existsSync(dbPath)) rmSync(dbDir, { recursive: true, force: true });

  const indexer = new ReplayIndexer({
    orgId: baseConfig.orgId,
    actingParty: baseConfig.actingParty,
    role: "Buyer",
    jsonApiUrl: baseConfig.jsonApiUrl,
    dataDir: DEBUG_DATA,
    rebuild: false,
    bearerToken: token,
  });

  console.log("1. initial indexer sync (bootstrap + cursor)...");
  const cp1 = await indexer.runOnce();
  console.log(`   checkpoint lastOffset=${cp1.lastOffset} events=${cp1.eventCount}`);

  console.log("2. submit proposal on ledger...");
  const proposalId = `IDX-${Date.now()}`;
  await client.submitAndWaitForTransaction({
    actAs: [supplier],
    commands: [
      buildCreateReceivableProposalCommand({
        proposalId,
        supplier,
        buyer,
        lineItems: [{ description: "indexer debug", quantity: "1", unitPrice: "500" }],
        faceValue: "500",
        currency: "USD",
        dueDate: "2026-12-31",
        consentSource: inlineConsent(true),
      }),
    ],
  });

  await sleep(3000);

  console.log("3. second indexer sync...");
  indexer.setBearerToken(await auth.getAccessToken());
  const cp2 = await indexer.runOnce();
  console.log(`   checkpoint lastOffset=${cp2.lastOffset} events=${cp2.eventCount}`);

  const proposals = indexer.getProjectionStore().getPendingProposals();
  console.log(`   pending proposals=${proposals.length}`);
  const hit = proposals.find((p) => p.proposalId === proposalId);
  if (!hit) {
    console.error("FAIL: proposal not projected");
    console.error(JSON.stringify(proposals.slice(-3), null, 2));
    process.exit(1);
  }

  console.log(`   found proposal ${hit.proposalId} cid=${hit.contractId}`);
  console.log("\ndebug-indexer-poll: PASS");
  indexer.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
