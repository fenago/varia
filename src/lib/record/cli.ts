/**
 * CLI entry for scripts/record-samples.mjs (run under tsx). Reads sample files
 * from public/samples, records each sample with the real provider (or the demo
 * provider under --dry-run), and writes src/lib/store/fixtures/<id>.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_IDS, sampleById } from "@shared/samples";
import { DEFAULT_GENERATOR, DEFAULT_JUDGE, modelSpec } from "@shared/models";
import type { LlmProvider, Strategy } from "@shared/types";
import { recordSample } from "./recordSample";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const fixturesDir = path.join(root, "src", "lib", "store", "fixtures");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const dryRun = flag("dry-run");
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--") && !process.argv[process.argv.indexOf(a) - 1]?.startsWith("--"));
  const targets = ids.length ? ids : [...SAMPLE_IDS];
  for (const id of targets) if (!sampleById(id)) throw new Error(`Unknown sample "${id}". Known: ${SAMPLE_IDS.join(", ")}`);

  const strategy = (arg("strategy", "structured-cot") as Strategy) ?? "structured-cot";
  const generator = arg("generator", DEFAULT_GENERATOR)!;
  const judge = arg("judge", DEFAULT_JUDGE)!;
  const judgeSamples = Number(arg("samples", "5"));
  const nCap = arg("n") ? Number(arg("n")) : undefined;
  if (!modelSpec(generator)) throw new Error(`Unknown generator model "${generator}".`);
  if (!modelSpec(judge)) throw new Error(`Unknown judge model "${judge}".`);

  let provider: LlmProvider;
  if (dryRun) {
    const { createDemoProvider } = await import("@lib/store/demoProvider");
    provider = createDemoProvider();
    console.log("Dry run: demo provider, no API calls. Fixtures will be labelled recordedWith=demo-provider.");
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Export it for this script only, or pass --dry-run.");
    const { createLiveProvider } = await import("@lib/llm/live");
    provider = createLiveProvider({ apiKey, rememberKey: false, generatorModel: generator, judgeModel: judge, judgeSamples, keyVerifiedAt: null });
    await provider.verifyKey();
    console.log(`Key verified. Generator ${generator}, judge ${judge} × ${judgeSamples}, strategy ${strategy}.`);
  }

  await mkdir(fixturesDir, { recursive: true });
  for (const id of targets) {
    const started = Date.now();
    console.log(`\n== ${id} ==`);
    const fixture = await recordSample({
      sampleId: id,
      provider,
      readFile: (p) => readFile(path.join(root, "public", "samples", id, p), "utf8"),
      generatorModel: generator,
      judgeModel: judge,
      judgeSamples,
      strategy,
      n: nCap,
      onProgress: (m) => console.log(`  ${m}`),
    });
    const out = path.join(fixturesDir, `${id}.json`);
    await writeFile(out, JSON.stringify(fixture, null, 2) + "\n", "utf8");
    const r = fixture.run;
    console.log(
      `  → ${path.relative(root, out)} · ${r.status} · ${r.variants.filter((v) => v.text && !v.error).length}/${r.n} versions · J ${r.report?.joint.toFixed(3) ?? "—"}` +
        `${r.usage ? ` · $${r.usage.costUsd.toFixed(2)} (${r.usage.calls} calls)` : ""} · ${((Date.now() - started) / 1000).toFixed(0)}s` +
        (fixture.extraction.repairs.length ? `\n  repairs: ${fixture.extraction.repairs.join("; ")}` : "") +
        (fixture.extraction.unresolved.length ? `\n  unresolved: ${fixture.extraction.unresolved.join("; ")}` : ""),
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
