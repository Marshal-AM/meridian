import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashEvents,
  emptyCheckpoint,
  buildCreateReceivableProposalCommand,
  buildSubmitRequest,
  TEMPLATE_IDS,
} from "./index.js";

describe("ledger-client utilities", () => {
  it("produces deterministic event log hash", () => {
    const events = [
      { offset: "1", updateId: "a", recordTime: "t1", payload: {} },
      { offset: "2", updateId: "b", recordTime: "t2", payload: {} },
    ];
    assert.equal(hashEvents(events), hashEvents(events));
    assert.notEqual(hashEvents(events), hashEvents([]));
  });

  it("empty checkpoint has zero offset", () => {
    const cp = emptyCheckpoint();
    assert.equal(cp.lastOffset, "");
    assert.equal(cp.eventCount, 0);
  });

  it("builds receivable proposal create command", () => {
    const cmd = buildCreateReceivableProposalCommand({
      proposalId: "INV-1",
      supplier: "supplier::abc",
      buyer: "buyer::abc",
      lineItems: [{ description: "Item", quantity: "1", unitPrice: "100" }],
      faceValue: "100",
      currency: "USD",
      dueDate: "2026-12-31",
      consentSource: { tag: "InlineConsent", value: true },
    });
    assert.ok("CreateCommand" in cmd);
    assert.equal(cmd.CreateCommand.templateId, TEMPLATE_IDS.receivableProposal);
    assert.equal(cmd.CreateCommand.createArguments.proposalId, "INV-1");
  });

  it("builds submit request with actAs", () => {
    const req = buildSubmitRequest({
      actAs: ["party::1"],
      commands: [],
    }) as { commands: { actAs: string[]; commandId: string } };
    assert.deepEqual(req.commands.actAs, ["party::1"]);
    assert.ok(typeof req.commands.commandId === "string");
  });
});
