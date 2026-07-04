import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { KybVerifyRequest, KybVerifyResponse } from "@meridian/shared-types";

export interface AuditRecord {
  id: string;
  legalEntityId: string;
  jurisdiction: string;
  requestedRoles: string;
  status: string;
  verificationId: string;
  verifiedAt: string | null;
  reason: string | null;
  createdAt: string;
}

export class KybAuditStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kyb_audit (
        id TEXT PRIMARY KEY,
        legal_entity_id TEXT NOT NULL,
        jurisdiction TEXT NOT NULL,
        requested_roles TEXT NOT NULL,
        status TEXT NOT NULL,
        verification_id TEXT NOT NULL UNIQUE,
        verified_at TEXT,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_verification_id ON kyb_audit(verification_id);
    `);
  }

  insert(record: AuditRecord): void {
    this.db
      .prepare(
        `INSERT INTO kyb_audit
         (id, legal_entity_id, jurisdiction, requested_roles, status, verification_id, verified_at, reason, created_at)
         VALUES (@id, @legalEntityId, @jurisdiction, @requestedRoles, @status, @verificationId, @verifiedAt, @reason, @createdAt)`
      )
      .run(record);
  }

  getByVerificationId(verificationId: string): AuditRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM kyb_audit WHERE verification_id = ?`)
      .get(verificationId) as Record<string, string | null> | undefined;
    if (!row) return undefined;
    return {
      id: row.id!,
      legalEntityId: row.legal_entity_id!,
      jurisdiction: row.jurisdiction!,
      requestedRoles: row.requested_roles!,
      status: row.status!,
      verificationId: row.verification_id!,
      verifiedAt: row.verified_at,
      reason: row.reason,
      createdAt: row.created_at!,
    };
  }

  close(): void {
    this.db.close();
  }
}

/** Phase 0 stub: always APPROVED with structured audit. Phase 7 swaps implementation. */
export class KybGatewayService {
  constructor(private store: KybAuditStore) {}

  verify(request: KybVerifyRequest): KybVerifyResponse {
    const verificationId = randomUUID();
    const now = new Date().toISOString();

    const response: KybVerifyResponse = {
      status: "APPROVED",
      verificationId,
      verifiedAt: now,
    };

    this.store.insert({
      id: randomUUID(),
      legalEntityId: request.legalEntityId,
      jurisdiction: request.jurisdiction,
      requestedRoles: JSON.stringify(request.requestedRoles),
      status: response.status,
      verificationId,
      verifiedAt: now,
      reason: null,
      createdAt: now,
    });

    return response;
  }

  validateVerificationId(verificationId: string): boolean {
    const record = this.store.getByVerificationId(verificationId);
    return record?.status === "APPROVED";
  }
}

export function createDefaultService(dataDir: string): KybGatewayService {
  const dbPath = join(dataDir, "kyb-audit.db");
  return new KybGatewayService(new KybAuditStore(dbPath));
}
