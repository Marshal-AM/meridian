/** Isolated check: ledger-end, getUpdates offset cursor, and submit. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DevNetPartiesManifest } from "@meridian/shared-types";
import { DevNetAuthClient } from "@meridian/devnet-auth";
import {
  buildCreateReceivableProposalCommand,
  inlineConsent,
} from "@meridian/ledger-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "infra/manifests/parties.devnet.json");

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

  console.log("1. ledger-end...");
  const end1 = await client.getLedgerEnd();
  assert.ok(end1, "ledger-end offset missing");
  console.log(`   offset=${end1}`);

  console.log("2. getUpdates from ledger-end (expect empty transactions)...");
  const snap1 = await client.getUpdates({ party: buyer });
  console.log(`   updates=${snap1.updates.length} endOffset=${snap1.endOffset}`);
  assert.ok(snap1.endOffset, "endOffset must be set");

  console.log("3. submit proposal...");
  const proposalId = `DEBUG-${Date.now()}`;
  const result = await client.submitAndWaitForTransaction({
    actAs: [supplier],
    commands: [
      buildCreateReceivableProposalCommand({
        proposalId,
        supplier,
        buyer,
        lineItems: [{ description: "debug", quantity: "1", unitPrice: "100" }],
        faceValue: "100",
        currency: "USD",
        dueDate: "2026-12-31",
        consentSource: inlineConsent(true),
      }),
    ],
  });
  const events = result.transaction?.events ?? [];
  console.log(`   tx events=${events.length}`);
  console.log(`   sample event keys: ${JSON.stringify(Object.keys((events[0] ?? {}) as object))}`);

  await sleep(2000);

  console.log("4. getUpdates from saved offset (expect new transactions)...");
  const base = auth.getSeaportConfig().ledgerApiUrl.replace(/\/$/, "");
  const token = await auth.getAccessToken();
  const rawRes = await fetch(`${base}/v2/updates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      beginExclusive: snap1.endOffset,
      updateFormat: {
        includeTransactions: {
          transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
          eventFormat: {
            filtersByParty: { [buyer]: { cumulative: [] } },
            verbose: false,
          },
        },
      },
    }),
  });
  const rawBody = await rawRes.json();
  console.log(`   raw API items=${Array.isArray(rawBody) ? rawBody.length : "?"}`);
  console.log(JSON.stringify(rawBody, null, 2).slice(0, 4000));

  const snap2 = await client.getUpdates({ party: buyer, beginExclusive: snap1.endOffset });
  console.log(`   updates=${snap2.updates.length} endOffset=${snap2.endOffset}`);
  assert.ok(Number(snap2.endOffset) >= Number(snap1.endOffset), "offset should advance");

  if (snap2.updates.length === 0) {
    console.error("FAIL: no updates returned for buyer after proposal");
    process.exit(1);
  }

  for (const u of snap2.updates) {
    console.log(`   tx ${u.updateId} offset=${u.offset}`);
    console.log(`   raw update: ${JSON.stringify(u, null, 2).slice(0, 2000)}`);
  }

  console.log("\ndebug-get-updates: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
