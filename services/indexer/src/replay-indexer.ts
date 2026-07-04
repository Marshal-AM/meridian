import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { RawLedgerEvent, IndexerCheckpoint } from "@meridian/shared-types";
import { JsonLedgerClient, hashEvents } from "@meridian/ledger-client";
import { ProjectionStore } from "./projection-store.js";
import {
  extractArchivedContractIds,
  extractCreatedEvents,
  isConsentPolicyTemplate,
  isReceivableProposalTemplate,
  isReceivableTemplate,
  projectBuyerView,
  projectConsentPolicy,
  projectProposal,
  projectSupplierView,
  projectRepaymentProof,
  isRepaymentProofTemplate,
} from "./receivable-projector.js";
import {
  isBidTemplate,
  isFinancingRequestTemplate,
  projectBid,
  projectFinancingRequest,
} from "./financing-projector.js";

/** Per-org isolated append-only event store — no cross-org shared DB. */
export class IndexerStore {
  private db: Database.Database;
  readonly projections: ProjectionStore;

  constructor(dbPath: string, rebuild: boolean) {
    if (rebuild && existsSync(dbPath)) {
      rmSync(dbPath, { force: true });
    }
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS raw_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offset TEXT NOT NULL,
        update_id TEXT NOT NULL,
        record_time TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkpoint (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_offset TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        last_event_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.projections = new ProjectionStore(this.db);
  }

  appendEvent(event: RawLedgerEvent): void {
    this.db
      .prepare(
        `INSERT INTO raw_events (offset, update_id, record_time, payload)
         VALUES (?, ?, ?, ?)`
      )
      .run(event.offset, event.updateId, event.recordTime, JSON.stringify(event.payload));
  }

  getAllEvents(): RawLedgerEvent[] {
    const rows = this.db
      .prepare(`SELECT offset, update_id, record_time, payload FROM raw_events ORDER BY id`)
      .all() as Array<{
      offset: string;
      update_id: string;
      record_time: string;
      payload: string;
    }>;
    return rows.map((r) => ({
      offset: r.offset,
      updateId: r.update_id,
      recordTime: r.record_time,
      payload: JSON.parse(r.payload),
    }));
  }

  saveCheckpoint(checkpoint: IndexerCheckpoint): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO checkpoint (id, last_offset, event_count, last_event_hash, updated_at)
         VALUES (1, ?, ?, ?, ?)`
      )
      .run(
        checkpoint.lastOffset,
        checkpoint.eventCount,
        checkpoint.lastEventHash,
        checkpoint.updatedAt
      );
  }

  getCheckpoint(): IndexerCheckpoint | null {
    const row = this.db
      .prepare(`SELECT last_offset, event_count, last_event_hash, updated_at FROM checkpoint WHERE id = 1`)
      .get() as
      | { last_offset: string; event_count: number; last_event_hash: string; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      lastOffset: row.last_offset,
      eventCount: row.event_count,
      lastEventHash: row.last_event_hash,
      updatedAt: row.updated_at,
    };
  }

  close(): void {
    this.db.close();
  }
}

export class ReplayIndexer {
  private store: IndexerStore;
  private client: JsonLedgerClient;

  constructor(
    private config: {
      orgId: string;
      actingParty: string;
      role: "Supplier" | "Buyer" | "Financier";
      jsonApiUrl: string;
      dataDir: string;
      rebuild: boolean;
      bearerToken?: string;
    }
  ) {
    const dbPath = `${config.dataDir}/${config.orgId}/indexer.db`;
    this.store = new IndexerStore(dbPath, config.rebuild);
    this.client = new JsonLedgerClient({
      baseUrl: config.jsonApiUrl,
      bearerToken: config.bearerToken,
      actingParty: config.actingParty,
    });
  }

  async runOnce(): Promise<IndexerCheckpoint> {
    const existing = this.store.getCheckpoint();
    const beginExclusive =
      existing?.lastOffset && existing.lastOffset !== ""
        ? existing.lastOffset
        : undefined;

    // Bootstrap ACS on first run
    if (!existing) {
      const contracts = await this.client.getActiveContracts(this.config.actingParty);
      for (const c of contracts) {
        this.store.appendEvent({
          offset: "0",
          updateId: `acs-${c.contractId}`,
          recordTime: new Date().toISOString(),
          payload: { type: "ACS_BOOTSTRAP", contract: c },
        });
        this.projectContractCreate(c.templateId, c.contractId, c.payload as Record<string, unknown>, "0");
      }
    }

    const { updates, endOffset } = await this.client.getUpdates({
      party: this.config.actingParty,
      beginExclusive,
    });

    for (const u of updates) {
      this.store.appendEvent({
        offset: u.offset,
        updateId: u.updateId,
        recordTime: u.recordTime,
        payload: u.events,
      });
      this.processTransactionEvents(u.events, u.offset);
    }

    await this.reconcileActiveContracts();

    const allEvents = this.store.getAllEvents();
    const checkpoint: IndexerCheckpoint = {
      lastOffset: String(endOffset),
      eventCount: allEvents.length,
      lastEventHash: hashEvents(allEvents),
      updatedAt: new Date().toISOString(),
    };
    this.store.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  /** Backfill projections from ACS when the update stream skips visible contracts. */
  private async reconcileActiveContracts(): Promise<void> {
    const contracts = await this.client.getActiveContracts(this.config.actingParty);
    for (const c of contracts) {
      this.projectContractCreate(
        c.templateId,
        c.contractId,
        c.payload as Record<string, unknown>,
        "acs-reconcile"
      );
    }
  }

  async rebuild(): Promise<IndexerCheckpoint> {
    this.store.close();
    this.store = new IndexerStore(
      `${this.config.dataDir}/${this.config.orgId}/indexer.db`,
      true
    );
    return this.runOnce();
  }

  setBearerToken(token: string): void {
    this.client = new JsonLedgerClient({
      baseUrl: this.config.jsonApiUrl,
      bearerToken: token,
      actingParty: this.config.actingParty,
    });
  }

  getEventLogHash(): string {
    return hashEvents(this.store.getAllEvents());
  }

  getProjectionStore(): ProjectionStore {
    return this.store.projections;
  }

  private processTransactionEvents(events: unknown[], offset: string): void {
    for (const created of extractCreatedEvents(events)) {
      this.projectContractCreate(
        created.templateId,
        created.contractId,
        created.payload,
        offset
      );
    }
    const archived = extractArchivedContractIds(events);
    this.store.projections.archiveProjections(archived);
    this.store.projections.archiveProposals(archived);
    this.store.projections.archiveFinancingRequests(archived);
    this.store.projections.archiveBids(archived);
  }

  private projectContractCreate(
    templateId: string,
    contractId: string,
    payload: Record<string, unknown>,
    offset: string
  ): void {
    const party = this.config.actingParty;

    if (isReceivableTemplate(templateId)) {
      if (this.config.role === "Buyer") {
        const view = projectBuyerView(contractId, payload);
        this.store.projections.upsertProjection({
          contractId,
          interfaceName: "IBuyerView",
          party,
          viewJson: view,
          offset,
          archived: false,
        });
      }
      if (this.config.role === "Supplier" || this.config.role === "Financier") {
        const view = projectSupplierView(contractId, payload);
        this.store.projections.upsertProjection({
          contractId,
          interfaceName: "ISupplierView",
          party,
          viewJson: view,
          offset,
          archived: false,
        });
      }
    }

    if (isReceivableProposalTemplate(templateId)) {
      const proposal = projectProposal(contractId, payload);
      this.store.projections.upsertProposal(proposal, offset);
    }

    if (isConsentPolicyTemplate(templateId)) {
      const policy = projectConsentPolicy(contractId, payload);
      this.store.projections.upsertConsentPolicy(policy, offset);
    }

    if (isFinancingRequestTemplate(templateId)) {
      const request = projectFinancingRequest(contractId, payload);
      this.store.projections.upsertFinancingRequest(request, offset);
    }

    if (isBidTemplate(templateId)) {
      const bid = projectBid(contractId, payload);
      this.store.projections.upsertBid(bid, offset);
    }

    if (isRepaymentProofTemplate(templateId) && this.config.role === "Supplier") {
      const proof = projectRepaymentProof(contractId, payload);
      this.store.projections.upsertRepaymentProof(proof, offset);
    }
  }

  close(): void {
    this.store.close();
  }
}
