import Fastify from "fastify";
import { join } from "node:path";
import type { PartyAllocationRequest } from "@meridian/shared-types";
import { DevNetAuthClient, loadDevNetConfigFromEnv } from "@meridian/devnet-auth";
import { SeaportTopologyClient } from "@meridian/ledger-client";
import {
  PartyProvisionerService,
  ProvisionerAuditStore,
  ProvisionerError,
} from "./service.js";

const PORT = Number(process.env.PROVISIONER_PORT ?? 8091);
const DATA_DIR = process.env.PROVISIONER_DATA_DIR ?? "./data";
const KYB_GATEWAY_URL = process.env.KYB_GATEWAY_URL ?? "http://localhost:8090";

const audit = new ProvisionerAuditStore(join(DATA_DIR, "provisioner-audit.db"));

const kybClient = {
  async validateVerificationId(verificationId: string): Promise<boolean> {
    const res = await fetch(`${KYB_GATEWAY_URL}/v1/kyb/verify/${verificationId}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { valid?: boolean };
    return body.valid === true;
  },
};

const auth = DevNetAuthClient.fromEnv();
let topologyClient: SeaportTopologyClient | null = null;

async function getTopology(): Promise<SeaportTopologyClient> {
  if (!topologyClient) {
    const ledger = await auth.createAuthenticatedLedgerClient();
    topologyClient = SeaportTopologyClient.create(ledger, "seaport-devnet");
  }
  return topologyClient;
}

const topology = {
  async allocateParty(params: { partyHint: string; displayName?: string }) {
    const t = await getTopology();
    return t.allocateParty({
      partyHint: params.partyHint,
      displayName: params.displayName ?? params.partyHint,
    });
  },
};

const provisioner = new PartyProvisionerService(audit, kybClient, topology);

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "party-provisioner",
  environment: "seaport-devnet",
  ledgerApiUrl: loadDevNetConfigFromEnv().ledgerApiUrl,
}));

app.get("/v1/allocations", async () => audit.getAll());

app.post<{
  Body: PartyAllocationRequest & {
    orgId: string;
    displayName?: string;
  };
}>("/v1/parties/allocate", async (req, reply) => {
  try {
    const record = await provisioner.allocate(req.body);
    return record;
  } catch (err) {
    if (err instanceof ProvisionerError) {
      return reply.status(400).send({ error: err.code, message: err.message });
    }
    throw err;
  }
});

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  console.error(err);
  process.exit(1);
});

export { provisioner, audit };
