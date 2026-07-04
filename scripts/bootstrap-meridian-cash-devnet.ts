/**
 * DevNet bootstrap for MUSD cash leg — mint holdings and record factory CIDs.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { DevNetAuthClient, loadDevNetConfigFromEnv } from "@meridian/devnet-auth";
import {
  buildCreateCashRegistryCommand,
  buildCreateAllocationFactoryCommand,
  buildMintHoldingCommand,
  buildSubmitRequest,
  CASH,
  extractCreatedContractId,
} from "@meridian/ledger-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST_OUT = join(ROOT, "infra/manifests/cash.devnet.json");
const PARTIES = join(ROOT, "infra/manifests/parties.devnet.json");

loadDotenv({ path: join(ROOT, ".env") });

interface Persona {
  orgId: string;
  partyId?: string;
}

interface CashManifest {
  environment: string;
  registryAdminOrgId: string;
  registryAdminPartyId: string;
  registryContractId: string;
  rulesContractId: string;
  minted: Array<{ orgId: string; partyId: string; amount: string }>;
  generatedAt: string;
}

function partyFor(orgId: string): string {
  const manifest = JSON.parse(readFileSync(PARTIES, "utf-8")) as {
    personas: Persona[];
  };
  const p = manifest.personas.find((x) => x.orgId === orgId);
  if (!p?.partyId) throw new Error(`party not found for ${orgId}`);
  return p.partyId;
}

async function main(): Promise<void> {
  const registryParty = partyFor("meridian-registry");
  const supplier = partyFor("meridian-supplier");
  const buyer = partyFor("meridian-buyer");
  const financierA = partyFor("meridian-financier-a");
  const financierB = partyFor("meridian-financier-b");

  const auth = new DevNetAuthClient(loadDevNetConfigFromEnv());
  const client = await auth.createAuthenticatedLedgerClient();
  const userId = await client.getAuthenticatedUserId();

  const existing = existsSync(MANIFEST_OUT)
    ? (JSON.parse(readFileSync(MANIFEST_OUT, "utf-8")) as CashManifest)
    : null;

  let registryCid = existing?.registryContractId;
  let rulesCid = existing?.rulesContractId;

  if (!registryCid) {
    const createReg = await client.submitAndWaitForTransaction({
      actAs: [registryParty],
      userId,
      commands: [buildCreateCashRegistryCommand({ admin: registryParty })],
    });
    registryCid = extractCreatedContractId(createReg, "CashRegistry");
    if (!registryCid) throw new Error("CashRegistry not created");
  }

  if (!rulesCid) {
    const createRules = await client.submitAndWaitForTransaction({
      actAs: [registryParty],
      userId,
      commands: [buildCreateAllocationFactoryCommand(registryCid)],
    });
    rulesCid =
      extractCreatedContractId(createRules, "MusdRules") ??
      extractCreatedContractId(createRules);
    if (!rulesCid) throw new Error("MusdRules not created");
  }

  const mintTargets: Array<{ orgId: string; partyId: string; amount: string }> =
    [
      { orgId: "meridian-supplier", partyId: supplier, amount: "10000.0" },
      { orgId: "meridian-buyer", partyId: buyer, amount: "50000.0" },
      { orgId: "meridian-financier-a", partyId: financierA, amount: "100000.0" },
      { orgId: "meridian-financier-b", partyId: financierB, amount: "100000.0" },
    ];

  const minted: CashManifest["minted"] = existing?.minted ?? [];

  for (const target of mintTargets) {
    if (minted.some((m) => m.orgId === target.orgId)) continue;
    await client.submitAndWaitForTransaction({
      actAs: [registryParty],
      userId,
      commands: [
        buildMintHoldingCommand({
          registryContractId: registryCid,
          owner: target.partyId,
          amount: target.amount,
        }),
      ],
    });
    minted.push(target);
    console.log(`Minted ${target.amount} MUSD for ${target.orgId}`);
  }

  const out: CashManifest = {
    environment: "seaport-devnet",
    registryAdminOrgId: "meridian-registry",
    registryAdminPartyId: registryParty,
    registryContractId: registryCid,
    rulesContractId: rulesCid,
    minted,
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(dirname(MANIFEST_OUT), { recursive: true });
  writeFileSync(MANIFEST_OUT, JSON.stringify(out, null, 2));
  console.log(`Cash manifest written: ${MANIFEST_OUT}`);
  console.log(`Registry: ${registryCid}`);
  console.log(`Rules (allocation factory): ${rulesCid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
