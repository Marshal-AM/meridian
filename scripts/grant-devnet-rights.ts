/** Grant CanActAs/CanReadAs for all manifest parties to the M2M user. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import type { DevNetPartiesManifest } from "@meridian/shared-types";
import { DevNetAuthClient } from "@meridian/devnet-auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "infra/manifests/parties.devnet.json");

loadDotenv({ path: join(ROOT, ".env") });

async function main(): Promise<void> {
  const auth = DevNetAuthClient.fromEnv();
  const token = await auth.getAccessToken();
  const base = auth.getSeaportConfig().ledgerApiUrl.replace(/\/$/, "");

  const userRes = await fetch(`${base}/v2/authenticated-user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    throw new Error(`authenticated-user failed: ${await userRes.text()}`);
  }
  const userBody = (await userRes.json()) as {
    user?: { id?: string; userId?: string };
  };
  const userId = userBody.user?.id ?? userBody.user?.userId ?? "validator-devnet-m2m";
  console.log(`Authenticated user: ${userId}`);

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as DevNetPartiesManifest;
  const rights = manifest.personas.flatMap((p) => [
    { kind: { CanActAs: { value: { party: p.partyId } } } },
    { kind: { CanReadAs: { value: { party: p.partyId } } } },
  ]);

  const grantRes = await fetch(`${base}/v2/users/${encodeURIComponent(userId)}/rights`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, rights }),
  });

  const body = await grantRes.text();
  if (!grantRes.ok) {
    throw new Error(`grant rights failed (${grantRes.status}): ${body}`);
  }
  console.log("Granted rights:", body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
