import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CashManifest {
  registryAdminPartyId: string;
  registryContractId: string;
  rulesContractId: string;
}

export function loadCashManifest(root: string): CashManifest {
  const path = join(root, "infra/manifests/cash.devnet.json");
  if (!existsSync(path)) {
    throw new Error("cash manifest missing — run: pnpm bootstrap:cash:devnet");
  }
  return JSON.parse(readFileSync(path, "utf-8")) as CashManifest;
}
