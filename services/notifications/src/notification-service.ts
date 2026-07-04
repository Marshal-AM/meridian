import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { DevNetAuthClient } from "@meridian/devnet-auth";
import { unwrapOffsetCheckpoint, unwrapTransaction } from "@meridian/ledger-client";
import type { MeridianNotificationEvent } from "@meridian/shared-types";
import { parseNotificationEvents } from "./event-parser.js";

export interface NotificationServiceConfig {
  port: number;
  ledgerWsUrl: string;
  parties: Array<{ orgId: string; partyId: string }>;
  pollIntervalMs?: number;
}

type ClientSubscription = { orgId: string; ws: WebSocket };

export class NotificationService {
  private wss: WebSocketServer;
  private clients: ClientSubscription[] = [];
  private lastOffsets = new Map<string, string>();

  constructor(private config: NotificationServiceConfig) {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "meridian-notifications" }));
    });
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const orgId = url.searchParams.get("orgId") ?? "";
      this.clients.push({ orgId, ws });
      ws.on("close", () => {
        this.clients = this.clients.filter((c) => c.ws !== ws);
      });
    });
    server.listen(config.port, () => {
      console.log(`notifications ws listening on port ${config.port}`);
    });
  }

  private broadcast(orgId: string, event: MeridianNotificationEvent): void {
    const payload = JSON.stringify({ orgId, event, at: new Date().toISOString() });
    for (const client of this.clients) {
      if (client.orgId === orgId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  async pollParty(auth: DevNetAuthClient, orgId: string, partyId: string): Promise<void> {
    const token = await auth.getAccessToken();
    let beginExclusive = this.lastOffsets.get(orgId);
    const ledgerHttp = auth.getSeaportConfig().ledgerApiUrl.replace(/\/$/, "");

    if (!beginExclusive) {
      const endRes = await fetch(`${ledgerHttp}/v2/state/ledger-end`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!endRes.ok) {
        throw new Error(`ledger-end failed: ${await endRes.text()}`);
      }
      const endBody = (await endRes.json()) as { offset?: string };
      beginExclusive = endBody.offset ?? "0";
    }

    const res = await fetch(`${ledgerHttp}/v2/updates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        beginExclusive,
        updateFormat: {
          includeTransactions: {
            transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
            eventFormat: {
              filtersByParty: {
                [partyId]: { cumulative: [] },
              },
              verbose: false,
            },
          },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`updates poll failed: ${await res.text()}`);
    }

    const body = (await res.json()) as Array<{
      update?: {
        OffsetCheckpoint?: { offset: string };
        Transaction?: { events: unknown[] };
      };
    }>;

    let endOffset = beginExclusive;
    for (const item of body) {
      const wrapper = item.update?.OffsetCheckpoint;
      const cpOffset =
        wrapper && typeof wrapper === "object"
          ? unwrapOffsetCheckpoint(wrapper)
          : null;
      if (cpOffset) {
        endOffset = cpOffset;
        this.lastOffsets.set(orgId, cpOffset);
      }
      const tx = unwrapTransaction(item.update?.Transaction);
      if (tx) {
        if (tx.offset) {
          endOffset = tx.offset;
          this.lastOffsets.set(orgId, tx.offset);
        }
        const events = parseNotificationEvents(tx.events);
        for (const event of events) {
          this.broadcast(orgId, event);
        }
      }
    }
    if (endOffset === beginExclusive) {
      const endRes = await fetch(`${ledgerHttp}/v2/state/ledger-end`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (endRes.ok) {
        const endBody = (await endRes.json()) as { offset?: string };
        if (endBody.offset) {
          this.lastOffsets.set(orgId, endBody.offset);
        }
      }
    }
  }

  async startPolling(auth: DevNetAuthClient): Promise<void> {
    const interval = this.config.pollIntervalMs ?? 5000;
    const tick = async (): Promise<void> => {
      for (const { orgId, partyId } of this.config.parties) {
        try {
          await this.pollParty(auth, orgId, partyId);
        } catch (err) {
          console.error(`poll error org=${orgId}:`, err);
        }
      }
    };
    await tick();
    setInterval(() => {
      tick().catch((err) => console.error(err));
    }, interval);
  }
}
