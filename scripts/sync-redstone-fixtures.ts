import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sample = JSON.parse(
  readFileSync(join(root, "infra/samples/redstone-fetch-latest.json"), "utf-8")
) as { canton: { payloadHex: string }; packageTimestampMs: number };

const hex = sample.canton.payloadHex;
const ts = sample.packageTimestampMs;

const daml = `module Meridian.FinancingFixtures where

import DA.Time
import DA.Date
import Time (millisToTime)

-- | Generated from infra/samples/redstone-fetch-latest.json via scripts/sync-redstone-fixtures.ts
sampleSofrPayloadHex : Text
sampleSofrPayloadHex =
  "${hex}"

sampleRedstoneTimestampMs : Int
sampleRedstoneTimestampMs = ${ts}

sampleOracleLedgerTime : Time
sampleOracleLedgerTime = millisToTime sampleRedstoneTimestampMs

invalidPayloadHex : Text
invalidPayloadHex = "deadbeef"

staleOracleLedgerTime : Time
staleOracleLedgerTime = time (date 2020 Jan 1) 0 0 0
`;

writeFileSync(join(root, "daml/tests/daml/Meridian/FinancingFixtures.daml"), daml);
console.log(`Synced payload (${hex.length} hex chars), ts=${ts}`);
