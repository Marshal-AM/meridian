import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KybAuditStore, KybGatewayService } from "./service.js";

describe("KybGatewayService", () => {
  let dir: string;
  let service: KybGatewayService;
  let store: KybAuditStore;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "kyb-test-"));
    store = new KybAuditStore(join(dir, "audit.db"));
    service = new KybGatewayService(store);
  });

  after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("approves all requests in Phase 0 stub mode", () => {
    const res = service.verify({
      legalEntityId: "acme-corp",
      jurisdiction: "US",
      requestedRoles: ["Supplier"],
    });
    assert.equal(res.status, "APPROVED");
    assert.ok(res.verificationId);
    assert.ok(service.validateVerificationId(res.verificationId));
  });

  it("rejects unknown verification IDs", () => {
    assert.equal(service.validateVerificationId("nonexistent"), false);
  });
});
