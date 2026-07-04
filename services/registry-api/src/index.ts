import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { DevNetAuthClient, loadDevNetConfigFromEnv } from "@meridian/devnet-auth";
import {
  CIP56_INTERFACES,
  CASH_TEMPLATES,
  MUSD_INSTRUMENT_ID,
  TEMPLATE_IDS,
  sumMusdHoldings,
  type HoldingView,
} from "@meridian/ledger-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const CASH_MANIFEST = join(ROOT, "infra/manifests/cash.devnet.json");

loadDotenv({ path: join(ROOT, ".env") });

const PORT = Number(process.env.REGISTRY_API_PORT ?? 4022);

interface CashManifest {
  registryAdminPartyId: string;
  registryContractId: string;
  rulesContractId: string;
}

function loadCashManifest(): CashManifest {
  if (!existsSync(CASH_MANIFEST)) {
    throw new Error("cash manifest missing — run: pnpm bootstrap:cash:devnet");
  }
  return JSON.parse(readFileSync(CASH_MANIFEST, "utf-8")) as CashManifest;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

async function main(): Promise<void> {
  const cash = loadCashManifest();
  const auth = new DevNetAuthClient(loadDevNetConfigFromEnv());
  const client = await auth.createAuthenticatedLedgerClient();

  createServer(async (req, res) => {
    const url = req.url?.split("?")[0] ?? "/";

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.method === "GET" && url === "/health") {
        json(res, 200, { ok: true, port: PORT });
        return;
      }

      if (req.method === "GET" && url === "/registry/token-metadata/MUSD") {
        json(res, 200, {
          instrumentId: { id: MUSD_INSTRUMENT_ID, admin: cash.registryAdminPartyId },
          symbol: MUSD_INSTRUMENT_ID,
          name: "Meridian USD (test)",
          registryContractId: cash.registryContractId,
        });
        return;
      }

      if (req.method === "GET" && url === "/registry/token-metadata/PARTICIPATION") {
        json(res, 200, {
          instrumentClass: "participation-interest",
          legalNature: "pass-through-proceeds",
          symbol: "PARTICIPATION",
          name: "Participation Interest (pass-through proceeds)",
          description:
            "Economic participation in receivable proceeds — not ownership of the receivable.",
        });
        return;
      }

      if (req.method === "GET" && url.startsWith("/registry/participation-interests/")) {
        const party = decodeURIComponent(url.replace("/registry/participation-interests/", ""));
        const rows = await client.getActiveContractsByTemplate(
          party,
          TEMPLATE_IDS.participationInterest
        );
        const interests = rows.map((row) => {
          const p = row.payload as Record<string, unknown>;
          return {
            contractId: row.contractId,
            receivableId: String(p.receivableId ?? ""),
            leadFinancier: String(p.leadFinancier ?? ""),
            participant: String(p.participant ?? ""),
            shareBps: Number(p.shareBps ?? 0),
            faceValue: String(p.faceValue ?? ""),
            currency: String(p.currency ?? ""),
            legalNature: String(p.legalNature ?? "pass-through-proceeds"),
            instrumentClass: String(p.instrumentClass ?? "participation-interest"),
            entryRef: String(p.entryRef ?? ""),
          };
        });
        json(res, 200, { party, interests });
        return;
      }

      if (req.method === "GET" && url === "/registry/transfer-factory") {
        json(res, 200, {
          admin: cash.registryAdminPartyId,
          factoryContractId: cash.rulesContractId,
          interfaceId: CIP56_INTERFACES.transferFactory,
          templateId: CASH_TEMPLATES.musdRules,
        });
        return;
      }

      if (req.method === "GET" && url === "/registry/allocation-factory") {
        json(res, 200, {
          admin: cash.registryAdminPartyId,
          factoryContractId: cash.rulesContractId,
          interfaceId: CIP56_INTERFACES.allocationFactory,
          templateId: CASH_TEMPLATES.musdRules,
        });
        return;
      }

      if (req.method === "GET" && url.startsWith("/registry/holdings/")) {
        const party = decodeURIComponent(url.replace("/registry/holdings/", ""));
        const rows = await client.getActiveContractsByInterface(
          party,
          CIP56_INTERFACES.holding
        );
        const holdings: HoldingView[] = [];
        for (const row of rows) {
          for (const iv of row.interfaceViews) {
            if (iv.interfaceId.includes("HoldingV1")) {
              holdings.push(iv.viewValue as HoldingView);
            }
          }
        }
        const balance = sumMusdHoldings(holdings, cash.registryAdminPartyId);
        json(res, 200, { party, balance, holdings });
        return;
      }

      if (req.method === "GET" && url === "/registry/merge-holdings-stub") {
        json(res, 200, {
          status: "phase8-groundwork",
          interfaceId: null,
          message: "MergeHoldings not yet implemented",
        });
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }).listen(PORT, () => {
    console.log(`registry-api listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
