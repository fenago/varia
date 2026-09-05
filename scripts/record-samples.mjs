#!/usr/bin/env node
/**
 * Record sample assessments through the real pipeline and write fixtures.
 *
 *   npm run record -- [sampleId ...] [--strategy structured-cot] [--generator claude-opus-5]
 *                     [--judge claude-sonnet-5] [--samples 5] [--n 30] [--dry-run]
 *
 * With no ids, every sample in src/shared/samples.ts is recorded. A real key is
 * read from ANTHROPIC_API_KEY for this script only; the app never reads env.
 * --dry-run uses the demo provider (no API calls) and labels the fixture as
 * "demo-provider", i.e. NOT real output.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "..", "src", "lib", "record", "cli.ts");
const r = spawnSync(process.execPath, [path.join(here, "..", "node_modules", "tsx", "dist", "cli.mjs"), entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
