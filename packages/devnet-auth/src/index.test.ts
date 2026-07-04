import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DevNetAuthClient, loadDevNetConfigFromEnv } from "./index.js";

describe("DevNetAuthClient", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("loads config from env with defaults", () => {
    const cfg = loadDevNetConfigFromEnv({
      DEVNET_CLIENT_SECRET: "secret",
    });
    assert.equal(cfg.clientId, "validator-devnet-m2m");
    assert.equal(cfg.scope, "daml_ledger_api");
    assert.ok(cfg.ledgerApiUrl.includes("fivenorth.io"));
  });

  it("caches token until near expiry", async () => {
    let fetchCount = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({ access_token: "tok-abc", expires_in: 28800 }),
        { status: 200 }
      );
    });

    const client = new DevNetAuthClient({
      ledgerApiUrl: "https://ledger.example.com",
      ledgerWsUrl: "wss://ledger.example.com",
      authUrl: "https://auth.example.com/token",
      clientId: "client",
      clientSecret: "secret",
      audience: "client",
      scope: "daml_ledger_api",
    });

    assert.equal(await client.getAccessToken(), "tok-abc");
    assert.equal(await client.getAccessToken(), "tok-abc");
    assert.equal(fetchCount, 1);
  });

  it("refreshes after invalidateCache", async () => {
    let fetchCount = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({ access_token: `tok-${fetchCount}`, expires_in: 28800 }),
        { status: 200 }
      );
    });

    const client = new DevNetAuthClient({
      ledgerApiUrl: "https://ledger.example.com",
      ledgerWsUrl: "wss://ledger.example.com",
      authUrl: "https://auth.example.com/token",
      clientId: "client",
      clientSecret: "secret",
      audience: "client",
      scope: "daml_ledger_api",
    });

    assert.equal(await client.getAccessToken(), "tok-1");
    client.invalidateCache();
    assert.equal(await client.getAccessToken(), "tok-2");
  });
});
