import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { loadConfig } from "@meridian/oracle-feeds";
import {
  OracleRelayService,
  type OracleFaultMode,
} from "./oracle-relay-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const DEFAULT_CONFIG = join(ROOT, "infra/configs/oracle-relay.json");

loadDotenv({ path: join(ROOT, ".env") });

function parseFault(raw: string | undefined): OracleFaultMode | undefined {
  if (!raw) return undefined;
  if (raw === "stale" || raw === "outage" || raw === "deviation") {
    return raw;
  }
  console.error(`Invalid ORACLE_FAULT: ${raw} (expected stale|outage|deviation)`);
  process.exit(1);
}

async function main(): Promise<void> {
  const port = Number(process.env.ORACLE_RELAY_PORT ?? 4021);
  const configPath = process.env.ORACLE_RELAY_CONFIG ?? DEFAULT_CONFIG;
  const pollIntervalMs = Number(process.env.ORACLE_RELAY_POLL_MS ?? 60_000);
  const fault = parseFault(process.env.ORACLE_FAULT);

  if (!existsSync(configPath)) {
    console.error(`oracle relay config not found: ${configPath}`);
    process.exit(1);
  }

  const config = loadConfig(configPath);
  const service = new OracleRelayService({
    port,
    config,
    pollIntervalMs,
    fault,
  });

  await service.startPolling();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
