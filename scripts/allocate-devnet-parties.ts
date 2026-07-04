import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import type { DevNetPartiesManifest, DevNetPersonaEntry, OrgRole } from "@meridian/shared-types";
import { DevNetAuthClient, loadDevNetConfigFromEnv } from "@meridian/devnet-auth";
import { SeaportTopologyClient } from "@meridian/ledger-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

loadDotenv({ path: join(ROOT, ".env") });

const PERSONAS: Array<{
  orgId: string;
  partyHint: string;
  role: OrgRole;
  displayName: string;
}> = [
  { orgId: "meridian-supplier", partyHint: "meridian-supplier-1", role: "Supplier", displayName: "Meridian Supplier" },
  { orgId: "meridian-buyer", partyHint: "meridian-buyer-1", role: "Buyer", displayName: "Meridian Buyer" },
  { orgId: "meridian-financier-a", partyHint: "meridian-financier-a", role: "Financier", displayName: "Meridian Financier A" },
  { orgId: "meridian-financier-b", partyHint: "meridian-financier-b", role: "Financier", displayName: "Meridian Financier B" },
  { orgId: "meridian-registry", partyHint: "meridian-registry-1", role: "Registry", displayName: "Meridian Registry" },
  { orgId: "meridian-oracle", partyHint: "meridian-oracle-1", role: "OracleProvider", displayName: "Meridian Oracle" },
  { orgId: "meridian-platform", partyHint: "meridian-platform-operator-1", role: "PlatformOperator", displayName: "Meridian Platform Operator" },
  { orgId: "meridian-regulator", partyHint: "meridian-regulator-1", role: "Regulator", displayName: "Meridian Regulator" },
];

const MANIFEST_PATH = join(ROOT, "infra/manifests/parties.devnet.json");
const KYB_URL = process.env.KYB_GATEWAY_URL ?? "http://localhost:8090";

async function kybVerify(persona: (typeof PERSONAS)[0]): Promise<string> {
  try {
    const res = await fetch(`${KYB_URL}/v1/kyb/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legalEntityId: persona.orgId,
        jurisdiction: "US",
        requestedRoles: [persona.role],
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { verificationId?: string };
      if (body.verificationId) return body.verificationId;
    }
  } catch {
    // KYB stub optional during direct DevNet allocation
  }
  return `devnet-bootstrap-${persona.orgId}`;
}

function printTable(entries: DevNetPersonaEntry[]): void {
  const header = ["Persona", "Party Hint", "Party ID"];
  const rows = entries.map((e) => [e.displayName, e.partyHint, e.partyId || "(pending)"]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length))
  );
  const line = widths.map((w) => "-".repeat(w)).join("-+-");
  const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join(" | ");
  console.log("\n=== Meridian DevNet Party IDs (for allowlisting + CC grants) ===\n");
  console.log(fmt(header));
  console.log(line);
  for (const row of rows) console.log(fmt(row));
  console.log("");
}

async function main(): Promise<void> {
  const devNetConfig = loadDevNetConfigFromEnv();
  const auth = new DevNetAuthClient(devNetConfig);
  const ledgerClient = await auth.createAuthenticatedLedgerClient();
  const topology = SeaportTopologyClient.create(ledgerClient, "seaport-devnet");

  console.log("Authenticating against Seaport DevNet...");
  const ledgerEnd = await topology.getLedgerEnd();
  console.log(`Ledger end offset: ${ledgerEnd || "(empty)"}`);

  const allocated: DevNetPersonaEntry[] = [];

  for (const persona of PERSONAS) {
    process.stdout.write(`Allocating ${persona.partyHint}... `);
    await kybVerify(persona);

    try {
      const { partyId } = await topology.allocateParty({
        partyHint: persona.partyHint,
        displayName: persona.displayName,
      });
      console.log(`OK → ${partyId}`);
      allocated.push({
        orgId: persona.orgId,
        role: persona.role,
        partyHint: persona.partyHint,
        partyId,
        displayName: persona.displayName,
        allocatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${message}`);
      allocated.push({
        orgId: persona.orgId,
        role: persona.role,
        partyHint: persona.partyHint,
        partyId: "",
        displayName: persona.displayName,
      });
    }
  }

  const manifest: DevNetPartiesManifest = {
    environment: "seaport-devnet",
    validatorId: "seaport-devnet",
    ledgerApiUrl: devNetConfig.ledgerApiUrl,
    generatedAt: new Date().toISOString(),
    personas: allocated,
  };

  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote manifest: ${MANIFEST_PATH}`);

  printTable(allocated);

  const failed = allocated.filter((p) => !p.partyId);
  if (failed.length > 0) {
    console.error(
      `${failed.length} persona(s) failed allocation. Submit party hints above for allowlisting, then re-run.`
    );
    process.exit(1);
  }

  for (const entry of allocated) {
    let ok = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        ok = await topology.verifyParty(entry.partyId);
        if (ok) break;
      } catch {
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (!ok) {
      console.warn(`Could not verify ${entry.partyId} via listParties (may still be valid)`);
    }
  }
  console.log("All 8 personas allocated. Re-run verify-devnet.ps1 to confirm ledger resolution.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
