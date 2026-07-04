import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import type { DevNetPartiesManifest } from "@meridian/shared-types";
import { DevNetAuthClient } from "@meridian/devnet-auth";
import { NotificationService } from "./notification-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const MANIFEST = join(ROOT, "infra/manifests/parties.devnet.json");

loadDotenv({ path: join(ROOT, ".env") });

async function main(): Promise<void> {
  const port = Number(process.env.NOTIFICATIONS_PORT ?? 4020);

  if (!existsSync(MANIFEST)) {
    console.error("parties.devnet.json not found");
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as DevNetPartiesManifest;
  const supplier = manifest.personas.find((p) => p.orgId === "meridian-supplier");
  const buyer = manifest.personas.find((p) => p.orgId === "meridian-buyer");
  const financierA = manifest.personas.find((p) => p.orgId === "meridian-financier-a");
  const financierB = manifest.personas.find((p) => p.orgId === "meridian-financier-b");
  if (!supplier || !buyer || !financierA || !financierB) {
    console.error("supplier/buyer/financier personas missing from manifest");
    process.exit(1);
  }

  const auth = DevNetAuthClient.fromEnv();
  const service = new NotificationService({
    port,
    ledgerWsUrl: auth.getSeaportConfig().ledgerWsUrl,
    parties: [
      { orgId: supplier.orgId, partyId: supplier.partyId },
      { orgId: buyer.orgId, partyId: buyer.partyId },
      { orgId: financierA.orgId, partyId: financierA.partyId },
      { orgId: financierB.orgId, partyId: financierB.partyId },
    ],
  });

  await service.startPolling(auth);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
