import Fastify from "fastify";
import type { KybVerifyRequest } from "@meridian/shared-types";
import { createDefaultService } from "./service.js";

const PORT = Number(process.env.KYB_GATEWAY_PORT ?? 8090);
const DATA_DIR = process.env.KYB_DATA_DIR ?? "./data";

const service = createDefaultService(DATA_DIR);

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", service: "kyb-gateway" }));

app.post<{ Body: KybVerifyRequest }>("/v1/kyb/verify", async (req) => {
  const result = service.verify(req.body);
  return result;
});

app.get<{ Params: { verificationId: string } }>(
  "/v1/kyb/verify/:verificationId",
  async (req) => {
    const valid = service.validateVerificationId(req.params.verificationId);
    if (!valid) {
      return { status: "NOT_FOUND", valid: false };
    }
    return { status: "APPROVED", valid: true };
  }
);

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  console.error(err);
  process.exit(1);
});
