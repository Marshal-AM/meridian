import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexerStore } from "./replay-indexer.js";
import { hashEvents } from "@meridian/ledger-client";

describe("IndexerStore", () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "idx-test-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("rebuild produces identical hash after replaying same events", () => {
    const dbPath = join(dir, "org-a", "indexer.db");
    const store1 = new IndexerStore(dbPath, false);
    const events = [
      { offset: "1", updateId: "u1", recordTime: "t1", payload: { x: 1 } },
      { offset: "2", updateId: "u2", recordTime: "t2", payload: { x: 2 } },
    ];
    for (const e of events) store1.appendEvent(e);
    const hash1 = hashEvents(store1.getAllEvents());
    store1.close();

    const store2 = new IndexerStore(dbPath, true);
    for (const e of events) store2.appendEvent(e);
    const hash2 = hashEvents(store2.getAllEvents());
    store2.close();

    assert.equal(hash1, hash2);
  });

  it("persists and restores checkpoint", () => {
    const dbPath = join(dir, "org-b", "indexer.db");
    const store = new IndexerStore(dbPath, false);
    store.saveCheckpoint({
      lastOffset: "42",
      eventCount: 3,
      lastEventHash: "abc",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const cp = store.getCheckpoint();
    assert.equal(cp?.lastOffset, "42");
    store.close();
  });
});
