import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { PartyAllocationRecord, PartyAllocationRequest } from "@meridian/shared-types";

export class ProvisionerAuditStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS allocation_audit (
        org_id TEXT PRIMARY KEY,
        party_hint TEXT NOT NULL,
        party_id TEXT NOT NULL,
        role TEXT NOT NULL,
        verification_id TEXT NOT NULL,
        topology_tx_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        synchronizer_ids TEXT NOT NULL,
        allocated_at TEXT NOT NULL
      );
    `);
  }

  insert(record: PartyAllocationRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO allocation_audit
         (org_id, party_hint, party_id, role, verification_id, topology_tx_id, participant_id, synchronizer_ids, allocated_at)
         VALUES (@orgId, @partyHint, @partyId, @role, @verificationId, @topologyTxId, @participantId, @synchronizerIds, @allocatedAt)`
      )
      .run({
        ...record,
        synchronizerIds: JSON.stringify(record.synchronizerIds),
      });
  }

  getAll(): PartyAllocationRecord[] {
    const rows = this.db.prepare(`SELECT * FROM allocation_audit`).all() as Array<
      Record<string, string>
    >;
    return rows.map((r) => ({
      orgId: r.org_id,
      partyHint: r.party_hint,
      partyId: r.party_id,
      role: r.role as PartyAllocationRecord["role"],
      verificationId: r.verification_id,
      topologyTxId: r.topology_tx_id,
      participantId: r.participant_id,
      synchronizerIds: JSON.parse(r.synchronizer_ids) as string[],
      allocatedAt: r.allocated_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

export interface KybClient {
  validateVerificationId(verificationId: string): Promise<boolean>;
}

export interface TopologyClient {
  allocateParty(params: {
    partyHint: string;
    displayName?: string;
  }): Promise<{ partyId: string; topologyTxId: string }>;
}

export class PartyProvisionerService {
  constructor(
    private audit: ProvisionerAuditStore,
    private kyb: KybClient,
    private topology: TopologyClient
  ) {}

  async allocate(
    request: PartyAllocationRequest & {
      orgId: string;
      displayName?: string;
    }
  ): Promise<PartyAllocationRecord> {
    if (!request.verificationId) {
      throw new ProvisionerError("MISSING_VERIFICATION", "verificationId is required");
    }

    const valid = await this.kyb.validateVerificationId(request.verificationId);
    if (!valid) {
      throw new ProvisionerError(
        "KYB_NOT_APPROVED",
        `KYB verification ${request.verificationId} is not approved`
      );
    }

    const { partyId, topologyTxId } = await this.topology.allocateParty({
      partyHint: request.partyHint,
      displayName: request.displayName ?? request.partyHint,
    });

    const record: PartyAllocationRecord = {
      orgId: request.orgId,
      partyHint: request.partyHint,
      partyId,
      role: request.role,
      verificationId: request.verificationId,
      topologyTxId,
      participantId: request.participantId ?? "seaport-devnet",
      synchronizerIds: request.synchronizerIds ?? [],
      allocatedAt: new Date().toISOString(),
    };

    this.audit.insert(record);
    return record;
  }
}

export class ProvisionerError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ProvisionerError";
  }
}
