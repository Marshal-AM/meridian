import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  projectBuyerView,
  projectSupplierView,
  extractCreatedEvents,
} from "./receivable-projector.js";

describe("receivable-projector", () => {
  const payload = {
    receivableId: "INV-001",
    supplier: "supplier::abc",
    buyer: "buyer::abc",
    lineItems: [{ description: "Widget", quantity: "10", unitPrice: "100" }],
    faceValue: "1000",
    currency: "USD",
    dueDate: "2026-12-31",
    state: "Issued",
    assignmentConsentGranted: true,
    payeeOfRecord: { payee: "supplier::abc", payeeRole: "Supplier" },
  };

  it("projects buyer view without line items", () => {
    const view = projectBuyerView("cid-1", payload);
    assert.equal(view.receivableId, "INV-001");
    assert.equal(view.faceValue, "1000");
    assert.equal(view.payee, "supplier::abc");
    assert.ok(!("lineItems" in view));
  });

  it("projects supplier view with line items", () => {
    const view = projectSupplierView("cid-1", payload);
    assert.equal(view.lineItems.length, 1);
    assert.equal(view.buyer, "buyer::abc");
    assert.equal(view.state, "Issued");
  });

  it("extracts created events from wrapped Seaport payload", () => {
    const events = [
      {
        CreatedEvent: {
          value: {
            contractId: "cid-3",
            templateId: "#pkg:Meridian.Receivable.Receivable:Receivable",
            createArgument: { receivableId: "INV-2" },
          },
        },
      },
    ];
    const created = extractCreatedEvents(events);
    assert.equal(created.length, 1);
    assert.equal(created[0]!.contractId, "cid-3");
  });
});
