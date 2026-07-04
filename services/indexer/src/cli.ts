import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { IndexerConfig } from "@meridian/shared-types";
import { DevNetAuthClient } from "@meridian/devnet-auth";
import { ReplayIndexer } from "./replay-indexer.js";
import { startIndexerHttpServer } from "./http-server.js";

function loadConfig(path: string): IndexerConfig {
  const raw = readFileSync(path, "utf-8");
  return parseYaml(raw) as IndexerConfig;
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  const rebuild = process.argv.includes("--rebuild");
  const serve = process.argv.includes("--serve");

  if (!configPath) {
    console.error("Usage: meridian-indexer <config.yaml> [--rebuild] [--serve]");
    process.exit(1);
  }

  const config = loadConfig(configPath);
  config.rebuild = rebuild || config.rebuild;

  const auth = DevNetAuthClient.fromEnv();
  const token = await auth.getAccessToken();

  const indexer = new ReplayIndexer({
    orgId: config.orgId,
    actingParty: config.actingParty,
    role: config.role,
    jsonApiUrl: config.jsonApiUrl,
    dataDir: config.dataDir,
    rebuild: config.rebuild,
    bearerToken: token,
  });

  if (!serve) {
    const checkpoint = config.rebuild ? await indexer.rebuild() : await indexer.runOnce();
    console.log(JSON.stringify({ orgId: config.orgId, checkpoint }, null, 2));
    indexer.close();
    return;
  }

  const port = config.httpPort ?? 4010;
  const pollMs =
    Number(process.env.MERIDIAN_INDEXER_POLL_MS ?? config.pollIntervalMs ?? 5000);

  const tick = async (): Promise<void> => {
    const freshToken = await auth.getAccessToken();
    indexer.setBearerToken(freshToken);
    const checkpoint = await indexer.runOnce();
    console.log(JSON.stringify({ orgId: config.orgId, checkpoint }, null, 2));
  };

  if (config.rebuild) {
    await indexer.rebuild();
    config.rebuild = false;
  }

  startIndexerHttpServer(indexer.getProjectionStore(), {
    port,
    orgId: config.orgId,
    role: config.role,
    actingParty: config.actingParty,
  });

  await tick().catch((err) => console.error(err));

  setInterval(() => {
    tick().catch((err) => console.error(err));
  }, pollMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
