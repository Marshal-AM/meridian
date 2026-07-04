/** DevNet smoke checks for verify script and CI. */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import type { DevNetPartiesManifest } from "@meridian/shared-types";
import { DevNetAuthClient, loadDevNetConfigFromEnv } from "@meridian/devnet-auth";
import { SeaportTopologyClient } from "@meridian/ledger-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "infra/manifests/parties.devnet.json");

loadDotenv({ path: join(ROOT, ".env") });

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "all";
  const auth = new DevNetAuthClient(loadDevNetConfigFromEnv());
  const client = await auth.createAuthenticatedLedgerClient();
  const topology = SeaportTopologyClient.create(client);

  switch (cmd) {
    case "auth": {
      const token = await auth.getAccessToken();
      if (!token) process.exit(1);
      console.log("auth ok");
      break;
    }
    case "ledger-end": {
      const offset = await topology.getLedgerEnd();
      console.log(`ledger-end: ${offset}`);
      break;
    }
    case "verify-parties": {
      if (!existsSync(MANIFEST)) {
        console.error("manifest missing");
        process.exit(1);
      }
      const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as DevNetPartiesManifest;
      for (const p of manifest.personas) {
        if (!p.partyId) {
          console.error(`missing partyId: ${p.partyHint}`);
          process.exit(1);
        }
        let ok = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            ok = await topology.verifyParty(p.partyId);
            if (ok) break;
          } catch {
            if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
        if (!ok) {
          console.error(`not on ledger: ${p.partyId}`);
          process.exit(1);
        }
      }
      console.log("all parties verified");
      break;
    }
    case "packages": {
      const pkgs = await topology.listPackages();
      if (pkgs.length === 0) {
        console.error("no packages on ledger");
        process.exit(1);
      }
      console.log(`packages: ${pkgs.length}`);
      break;
    }
    case "all": {
      await auth.getAccessToken();
      await topology.getLedgerEnd();
      console.log("smoke ok");
      break;
    }
    case "phase1-privacy": {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("pnpm", ["exec", "tsx", "scripts/phase1-devnet-integration.ts"], {
        cwd: ROOT,
        stdio: "inherit",
        shell: true,
        env: process.env,
      });
      process.exit(result.status ?? 1);
      break;
    }
    default:
      console.error(`unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
