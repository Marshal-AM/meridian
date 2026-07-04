import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  fetchRedstoneData,
  type FetchResult,
  type FeedSnapshot,
  type OracleRelayConfig,
} from "@meridian/oracle-feeds";

export type OracleFaultMode = "stale" | "outage" | "deviation";

export interface OracleRelayServiceConfig {
  port: number;
  config: OracleRelayConfig;
  pollIntervalMs?: number;
  fault?: OracleFaultMode;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function applyFault(result: FetchResult, fault: OracleFaultMode): FetchResult {
  if (fault === "stale") {
    const staleAgeMs = result.maxAgeMs + 60_000;
    const staleTimestampMs = Date.now() - staleAgeMs;
    return {
      ...result,
      isFresh: false,
      ageMs: staleAgeMs,
      packageTimestampMs: staleTimestampMs,
      fetchedAt: new Date(staleTimestampMs).toISOString(),
      feeds: result.feeds.map((feed) => ({
        ...feed,
        isFresh: false,
        ageMs: staleAgeMs,
        packageTimestampMs: staleTimestampMs,
      })),
    };
  }

  if (fault === "deviation") {
    const feeds = result.feeds.map((feed) => {
      const value =
        feed.feedId === result.referenceRate?.feedId
          ? feed.value + 10
          : feed.value * 2;
      const valueBps =
        feed.valueBps == null ? feed.valueBps : feed.valueBps + 1_000;
      return { ...feed, value, valueBps };
    });
    const referenceRate = result.referenceRate
      ? {
          ...result.referenceRate,
          value: result.referenceRate.value + 10,
          valueBps: result.referenceRate.valueBps + 1_000,
        }
      : null;
    return { ...result, feeds, referenceRate };
  }

  return result;
}

export class OracleRelayService {
  private cache: FetchResult | null = null;
  private lastError: string | null = null;

  constructor(private readonly serviceConfig: OracleRelayServiceConfig) {
    const server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    server.listen(serviceConfig.port, () => {
      console.log(`oracle-relay listening on port ${serviceConfig.port}`);
      if (serviceConfig.fault) {
        console.log(`oracle-relay fault injection: ${serviceConfig.fault}`);
      }
    });
  }

  private get fault(): OracleFaultMode | undefined {
    return this.serviceConfig.fault;
  }

  async refreshCache(): Promise<void> {
    if (this.fault === "outage") {
      this.cache = null;
      this.lastError = "injected outage";
      return;
    }

    try {
      const result = await fetchRedstoneData(
        this.serviceConfig.config,
        this.serviceConfig.config.feeds,
      );
      this.cache = this.fault ? applyFault(result, this.fault) : result;
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error("oracle-relay refresh failed:", this.lastError);
    }
  }

  async startPolling(): Promise<void> {
    const interval = this.serviceConfig.pollIntervalMs ?? 60_000;
    await this.refreshCache();
    setInterval(() => {
      this.refreshCache().catch((err) => console.error(err));
    }, interval);
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (req.method !== "GET") {
      json(res, 405, { error: "method not allowed" });
      return;
    }

    try {
      if (url.pathname === "/health") {
        json(res, 200, {
          ok: true,
          service: "oracle-relay",
          fault: this.fault ?? null,
          cached: this.cache != null,
          isFresh: this.cache?.isFresh ?? false,
          lastError: this.lastError,
        });
        return;
      }

      if (url.pathname === "/feeds/latest") {
        if (!this.cache) {
          json(res, 503, {
            error: this.lastError ?? "oracle data unavailable",
            fault: this.fault ?? null,
          });
          return;
        }
        json(res, 200, this.cache);
        return;
      }

      const feedMatch = url.pathname.match(/^\/feeds\/([^/]+)$/);
      if (feedMatch) {
        if (!this.cache) {
          json(res, 503, {
            error: this.lastError ?? "oracle data unavailable",
            fault: this.fault ?? null,
          });
          return;
        }

        const feedId = decodeURIComponent(feedMatch[1]!);
        const feed = this.cache.feeds.find((item) => item.feedId === feedId);
        if (!feed) {
          json(res, 404, { error: `feed not found: ${feedId}` });
          return;
        }

        json(res, 200, this.feedResponse(feed));
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  }

  private feedResponse(feed: FeedSnapshot): FeedSnapshot & {
    dataServiceId: string;
    fetchedAt: string;
    fault: OracleFaultMode | null;
  } {
    return {
      ...feed,
      dataServiceId: this.cache!.dataServiceId,
      fetchedAt: this.cache!.fetchedAt,
      fault: this.fault ?? null,
    };
  }
}
