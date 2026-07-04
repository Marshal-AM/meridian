/**
 * Fetch live RedStone oracle data for Meridian Phase 2 pricing bands.
 *
 * Produces signed data packages, Canton-ready hex payload, and freshness metrics
 * without touching the ledger. Run this before implementing the oracle relay / Daml layer.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchRedstoneData,
  loadConfig,
  type FetchResult,
} from "@meridian/oracle-feeds";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEFAULT_CONFIG = join(ROOT, "infra/configs/oracle-relay.json");

function usage(): never {
  console.error(`Usage: pnpm redstone:fetch [--config path] [--save] [--feeds SOFR,USDC]

Options:
  --config <path>   Oracle relay config JSON (default: infra/configs/oracle-relay.json)
  --feeds <ids>     Comma-separated feed IDs (overrides config feeds)
  --save            Write JSON snapshot to infra/samples/redstone-fetch-latest.json
  --help            Show this message`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  configPath: string;
  save: boolean;
  feedsOverride?: string[];
} {
  let configPath = DEFAULT_CONFIG;
  let save = false;
  let feedsOverride: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--save") {
      save = true;
      continue;
    }
    if (arg === "--config") {
      const next = argv[++i];
      if (!next) usage();
      configPath = next;
      continue;
    }
    if (arg === "--feeds") {
      const next = argv[++i];
      if (!next) usage();
      feedsOverride = next.split(",").map((f) => f.trim()).filter(Boolean);
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    usage();
  }

  return { configPath, save, feedsOverride };
}

function printSummary(result: FetchResult): void {
  console.log("RedStone fetch OK");
  console.log(`  service:     ${result.dataServiceId}`);
  console.log(`  timestamp:   ${result.packageTimestampMs} (${result.fetchedAt})`);
  console.log(`  age:         ${result.ageMs}ms (max ${result.maxAgeMs}ms)`);
  console.log(`  fresh:       ${result.isFresh}`);
  console.log(`  signers:     ${result.uniqueSignersCount} required / ${result.authorizedSignersCount} authorized`);
  console.log("");
  console.log("Feeds:");
  for (const feed of result.feeds) {
    const bps = feed.valueBps == null ? "" : ` (${feed.valueBps} bps vs peg/ref)`;
    console.log(
      `  ${feed.feedId.padEnd(6)} ${feed.value}${bps} | ${feed.signerCount} signers | age ${feed.ageMs}ms | ascii [${feed.feedIdAscii.join(", ")}]`,
    );
  }
  if (result.referenceRate) {
    console.log("");
    console.log(
      `Reference rate (${result.referenceRate.feedId}): ${result.referenceRate.value}% (${result.referenceRate.valueBps} bps)`,
    );
  }
  console.log("");
  console.log(
    `Canton payload: ${result.canton.payloadByteLength} bytes, hex prefix ${result.canton.payloadHex.slice(0, 64)}...`,
  );
}

async function main(): Promise<void> {
  const { configPath, save, feedsOverride } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  const feeds = feedsOverride ?? config.feeds;

  console.log(`Fetching RedStone feeds: ${feeds.join(", ")}`);
  const result = await fetchRedstoneData(config, feeds);

  if (!result.isFresh) {
    console.error(
      `Stale package: age ${result.ageMs}ms exceeds maxAgeMs ${result.maxAgeMs}`,
    );
    printSummary(result);
    process.exit(2);
  }

  printSummary(result);

  const json = JSON.stringify(result, null, 2);
  if (save) {
    const outDir = join(ROOT, "infra/samples");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "redstone-fetch-latest.json");
    writeFileSync(outPath, `${json}\n`, "utf-8");
    console.log(`\nSaved snapshot: ${outPath}`);
  } else {
    console.log("\nFull JSON (--save to write infra/samples/redstone-fetch-latest.json):");
    console.log(json);
  }
}

main().catch((err) => {
  console.error("RedStone fetch failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
