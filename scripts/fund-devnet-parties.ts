/**
 * Fund all Meridian DevNet personas with Canton Coin via Amulet Tap.
 * Requires @canton-network/wallet-sdk and internal (validator-hosted) parties.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { SDK, type TokenProviderConfig } from "@canton-network/wallet-sdk";
import type { DevNetPartiesManifest } from "@meridian/shared-types";
import { getAccessToken } from "@meridian/devnet-auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(ROOT, "infra/manifests/parties.devnet.json");

loadDotenv({ path: join(ROOT, ".env") });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

/** Wallet SDK static token — refreshed once per script run via devnet-auth. */
async function buildAuthConfig(): Promise<TokenProviderConfig> {
  const token = await getAccessToken();
  return { method: "static", token };
}

async function discoverValidatorUrl(): Promise<string> {
  const configured = process.env.DEVNET_VALIDATOR_URL;
  const candidates = [
    configured,
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
    "https://validator.devnet.sandbox.fivenorth.io/api/validator",
    "https://ledger-api.validator.devnet.sandbox.fivenorth.io/api/validator",
  ].filter(Boolean) as string[];

  const { getAccessToken } = await import("@meridian/devnet-auth");
  const token = await getAccessToken();

  for (const base of candidates) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/version`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        console.log(`Validator API: ${base}`);
        return base;
      }
    } catch {
      // try next
    }
  }

  if (configured) return configured;
  throw new Error(
    "Could not reach validator API. Set DEVNET_VALIDATOR_URL in .env (ask 5North for Seaport wallet/validator URL)."
  );
}

function printTable(
  rows: Array<{ persona: string; partyHint: string; partyId: string; status: string; balance?: string }>
): void {
  const header = ["Persona", "Party Hint", "Tap Status", "Balance (CC)"];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => [r.persona, r.partyHint, r.status, r.balance ?? ""][i]!.length))
  );
  const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join(" | ");
  console.log("\n=== DevNet CC Tap Results ===\n");
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("-+-"));
  for (const r of rows) {
    console.log(fmt([r.persona, r.partyHint, r.status, r.balance ?? ""]));
  }
  console.log("");
}

async function main(): Promise<void> {
  const auth = await buildAuthConfig();
  const ledgerClientUrl = requireEnv("DEVNET_LEDGER_API_URL");
  const tapAmount = process.env.DEVNET_TAP_AMOUNT ?? "10000";

  const validatorUrl = await discoverValidatorUrl();
  const scanApiUrl =
    process.env.DEVNET_SCAN_API_URL ?? `${validatorUrl.replace(/\/$/, "")}/v0/scan-proxy`;
  const registryUrl =
    process.env.DEVNET_REGISTRY_URL ?? scanApiUrl;

  console.log(`Ledger API: ${ledgerClientUrl}`);
  console.log(`Scan proxy: ${scanApiUrl}`);
  console.log(`Tap amount: ${tapAmount} CC per persona`);

  const sdk = await SDK.create({
    auth,
    ledgerClientUrl,
    amulet: {
      auth,
      validatorUrl,
      scanApiUrl,
      registryUrl: new URL(registryUrl),
    },
  });

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as DevNetPartiesManifest;
  const results: Array<{
    persona: string;
    partyHint: string;
    partyId: string;
    status: string;
    balance?: string;
  }> = [];

  let failed = 0;

  for (const persona of manifest.personas) {
    if (!persona.partyId) {
      results.push({
        persona: persona.displayName,
        partyHint: persona.partyHint,
        partyId: "",
        status: "SKIP (no partyId)",
      });
      failed++;
      continue;
    }

    process.stdout.write(`Tapping ${persona.partyHint}... `);
    try {
      await sdk.amulet.tap(persona.partyId, tapAmount);

      let balance = "unknown";
      try {
        const utxos = await sdk.token.utxos.list({ partyId: persona.partyId });
        const amuletTotal = utxos
          .filter((u) => u.interfaceViewValue.instrumentId.id === "Amulet")
          .reduce((sum, u) => sum + Number(u.interfaceViewValue.amount), 0);
        balance = amuletTotal.toFixed(2);
      } catch {
        // balance query optional
      }

      console.log(`OK (balance ~${balance} CC)`);
      results.push({
        persona: persona.displayName,
        partyHint: persona.partyHint,
        partyId: persona.partyId,
        status: "OK",
        balance,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg.slice(0, 120)}`);
      results.push({
        persona: persona.displayName,
        partyHint: persona.partyHint,
        partyId: persona.partyId,
        status: `FAIL: ${msg.slice(0, 80)}`,
      });
      failed++;
    }
  }

  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  printTable(results);

  if (failed > 0) {
    console.error(
      `${failed} tap(s) failed. If error mentions permissions or DevNet_Tap, ask 5North:` +
        " \"Is Amulet Tap enabled on Seaport for our allowlisted parties?\""
    );
    process.exit(1);
  }

  console.log(`All ${manifest.personas.length} personas funded with ${tapAmount} CC each.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
