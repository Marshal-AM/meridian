import { readFileSync } from "node:fs";
import {
  extractSignedDataPackagesForFeedId,
  getDataPackagesTimestamp,
  getSignersForDataServiceId,
  requestDataPackages,
  requestRedstonePayload,
  type DataPackagesRequestParams,
  type DataServiceIds,
} from "@redstone-finance/sdk";

export interface OracleRelayConfig {
  dataServiceId: string;
  uniqueSignersCount: number;
  maxTimestampDeviationMs: number;
  maxAgeMs: number;
  referenceRateFeedId: string;
  feeds: string[];
}

export interface FeedSnapshot {
  feedId: string;
  feedIdAscii: number[];
  value: number;
  valueBps: number | null;
  packageTimestampMs: number;
  signerCount: number;
  signers: string[];
  isFresh: boolean;
  ageMs: number;
}

export interface FetchResult {
  fetchedAt: string;
  dataServiceId: string;
  uniqueSignersCount: number;
  authorizedSignersCount: number;
  maxTimestampDeviationMs: number;
  maxAgeMs: number;
  packageTimestampMs: number;
  ageMs: number;
  isFresh: boolean;
  feeds: FeedSnapshot[];
  referenceRate: {
    feedId: string;
    value: number;
    valueBps: number;
    unit: "percent";
  } | null;
  canton: {
    feedIds: string[];
    feedIdsAscii: number[][];
    payloadHex: string;
    payloadByteLength: number;
  };
}

export function loadConfig(path: string): OracleRelayConfig {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as OracleRelayConfig;
  if (!raw.dataServiceId || !raw.feeds?.length) {
    throw new Error(`Invalid oracle relay config: ${path}`);
  }
  return raw;
}

function feedIdToAscii(feedId: string): number[] {
  return [...feedId].map((ch) => ch.charCodeAt(0));
}

function toValueBps(feedId: string, value: number): number | null {
  if (feedId === "SOFR") {
    return Math.round(value * 100);
  }
  if (feedId === "USDC" || feedId === "USDT") {
    return Math.round((value - 1) * 10_000);
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function buildRequestParams(
  config: OracleRelayConfig,
  feeds: string[],
): DataPackagesRequestParams {
  const authorizedSigners = getSignersForDataServiceId(
    config.dataServiceId as DataServiceIds,
  );
  return {
    dataServiceId: config.dataServiceId,
    dataPackagesIds: feeds,
    uniqueSignersCount: config.uniqueSignersCount,
    maxTimestampDeviationMS: config.maxTimestampDeviationMs,
    authorizedSigners,
    ignoreMissingFeed: false,
  };
}

export async function fetchRedstoneData(
  config: OracleRelayConfig,
  feeds: string[],
): Promise<FetchResult> {
  const reqParams = buildRequestParams(config, feeds);
  const authorizedSigners = reqParams.authorizedSigners;

  const packages = await requestDataPackages(reqParams);
  const payloadHex = await requestRedstonePayload(reqParams);
  const packageTimestampMs = getDataPackagesTimestamp(packages, feeds[0]);
  const nowMs = Date.now();
  const ageMs = nowMs - packageTimestampMs;
  const isFresh = ageMs >= 0 && ageMs <= config.maxAgeMs;

  const feedSnapshots: FeedSnapshot[] = feeds.map((feedId) => {
    const signedPackages = extractSignedDataPackagesForFeedId(packages, feedId);
    if (signedPackages.length === 0) {
      throw new Error(`No signed packages returned for feed: ${feedId}`);
    }

    const values = signedPackages.map((pkg) =>
      Number(pkg.dataPackage.dataPoints[0]!.toObj().value),
    );
    const value = median(values);
    const signers = signedPackages.map((pkg) => pkg.recoverSignerAddress());
    const feedTimestampMs = signedPackages[0]!.dataPackage.timestampMilliseconds;
    const feedAgeMs = nowMs - feedTimestampMs;

    return {
      feedId,
      feedIdAscii: feedIdToAscii(feedId),
      value,
      valueBps: toValueBps(feedId, value),
      packageTimestampMs: feedTimestampMs,
      signerCount: signedPackages.length,
      signers,
      isFresh: feedAgeMs >= 0 && feedAgeMs <= config.maxAgeMs,
      ageMs: feedAgeMs,
    };
  });

  const ref = feedSnapshots.find((f) => f.feedId === config.referenceRateFeedId);
  const referenceRate = ref
    ? {
        feedId: ref.feedId,
        value: ref.value,
        valueBps: ref.valueBps ?? Math.round(ref.value * 100),
        unit: "percent" as const,
      }
    : null;

  return {
    fetchedAt: new Date(nowMs).toISOString(),
    dataServiceId: config.dataServiceId,
    uniqueSignersCount: config.uniqueSignersCount,
    authorizedSignersCount: authorizedSigners.length,
    maxTimestampDeviationMs: config.maxTimestampDeviationMs,
    maxAgeMs: config.maxAgeMs,
    packageTimestampMs,
    ageMs,
    isFresh,
    feeds: feedSnapshots,
    referenceRate,
    canton: {
      feedIds: feeds,
      feedIdsAscii: feeds.map(feedIdToAscii),
      payloadHex,
      payloadByteLength: payloadHex.length / 2,
    },
  };
}
