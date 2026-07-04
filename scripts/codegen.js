#!/usr/bin/env node
/**
 * Generate TypeScript bindings from Meridian DAR packages.
 * Requires dpm and a successful daml build first.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DARS = [
  {
    path: join(root, "daml/packages/meridian-core/.daml/dist/com-meridian-core-0.2.0.dar"),
    fallback: join(root, "daml/packages/meridian-core/.daml/dist/com-meridian-core-0.1.0.dar"),
    out: join(root, "packages/generated/core"),
  },
  {
    path: join(
      root,
      "daml/packages/meridian-receivable/.daml/dist/com-meridian-receivable-0.1.0.dar"
    ),
    out: join(root, "packages/generated/receivable"),
  },
];

for (const dar of DARS) {
  const darPath = existsSync(dar.path) ? dar.path : dar.fallback;
  if (!darPath || !existsSync(darPath)) {
    console.warn(`Skipping codegen — DAR not found: ${dar.path}`);
    continue;
  }
  mkdirSync(dar.out, { recursive: true });
  console.log(`Generating JS bindings from ${darPath} -> ${dar.out}`);
  execSync(`dpm codegen-js "${darPath}" -o "${dar.out}"`, {
    stdio: "inherit",
    cwd: root,
  });
}
