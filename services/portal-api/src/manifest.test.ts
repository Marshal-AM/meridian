import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractCreatedContractId } from "./manifest.js";

describe("portal-api manifest helpers", () => {
  it("extracts contract id from submit result", () => {
    const id = extractCreatedContractId({
      transaction: {
        events: [{ CreatedEvent: { contractId: "abc123" } }],
      },
    });
    assert.equal(id, "abc123");
  });
});
