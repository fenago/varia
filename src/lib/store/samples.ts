/**
 * One-click sample assessments. Fetches the sample's real files from
 * /samples/<id>/, runs them through the same ingest path an upload uses,
 * ensures the employer partner, challenge and skills exist in the workspace,
 * then extracts a blueprint: with Claude when a key is present, otherwise from
 * a recorded live extraction, otherwise with the deterministic local parser.
 */
import type { BlueprintDraft, EmployerChallenge, EmployerPartner, LlmProvider, Roster, SampleAssessment, Workspace } from "@shared/types";
import { sampleById } from "@shared/samples";
import { parseFiles, type ParsedFiles } from "@lib/ingest";
import { localExtract } from "@lib/ingest/localExtract";
import { guardDraft } from "@lib/llm/extractGuard";
import { getFixture } from "@lib/store/fixtures";

export interface SampleLoadActions {
  addPartner: (p: { organisation: string; sector: string; contactName?: string; contactRole?: string; contactEmail?: string }) => EmployerPartner;
  addChallenge: (c: Omit<EmployerChallenge, "id" | "contributedAt" | "status" | "blueprintIds" | "organisation"> & { organisation?: string }) => EmployerChallenge;
  addSkill: (tag: { key?: string; label: string; source: "employer" | "taxonomy" | "instructor"; externalRef?: string }) => { key: string };
  setRoster: (roster: Roster) => void;
  setCourse?: (patch: { code: string; title: string }) => void;
}

export interface SampleLoadResult {
  sample: SampleAssessment;
  draft: BlueprintDraft;
  roster: Roster;
  partner: EmployerPartner;
  challenge: EmployerChallenge;
  parsed: ParsedFiles;
  /** How the blueprint was produced */
  extractedBy: "claude" | "recorded" | "local parser";
  extractionModel: string | null;
  /** What the extraction guard repaired from the source text (live path only) */
  repairs: string[];
}

export type SamplePhase = "fetching" | "reading" | "extracting" | "repairing" | "done";

export interface SampleLoadOptions {
  provider: LlmProvider;
  ws: Workspace;
  actions: SampleLoadActions;
  courseId?: string;
  /** Progress callback. `detail` carries counts/model names for the UI ("4 files", "claude-opus-5"). */
  onPhase?: (phase: SamplePhase, message: string, detail?: { count?: number; model?: string | null; repairs?: number }) => void;
  signal?: AbortSignal;
  /** Only when the instructor explicitly asks: extract with the key instead of the recorded blueprint. */
  forReal?: boolean;
}

async function fetchSampleFiles(sample: SampleAssessment, signal?: AbortSignal): Promise<File[]> {
  const files: File[] = [];
  for (const f of sample.files) {
    const res = await fetch(`/samples/${sample.id}/${f.path}`, { signal });
    if (!res.ok) throw new Error(`Could not load ${f.name} for the ${sample.organisation} sample (${res.status}).`);
    const text = await res.text();
    files.push(new File([text], f.name, { type: f.name.endsWith(".csv") ? "text/csv" : "text/markdown" }));
  }
  return files;
}

function ensurePartner(sample: SampleAssessment, ws: Workspace, actions: SampleLoadActions): EmployerPartner {
  const existing = ws.employerPartners.find((p) => p.organisation.toLowerCase() === sample.partner.organisation.toLowerCase());
  return existing ?? actions.addPartner(sample.partner);
}

function ensureSkills(sample: SampleAssessment, ws: Workspace, actions: SampleLoadActions): void {
  const have = new Set((ws.skills ?? []).map((s) => s.key));
  for (const s of sample.skills) {
    if (!have.has(s.key)) actions.addSkill({ key: s.key, label: s.label, source: s.source, externalRef: s.externalRef });
  }
}

function ensureChallenge(sample: SampleAssessment, ws: Workspace, partner: EmployerPartner, actions: SampleLoadActions): EmployerChallenge {
  const existing = (ws.challenges ?? []).find((c) => c.partnerId === partner.id && c.title.toLowerCase() === sample.challenge.title.toLowerCase());
  if (existing) return existing;
  return actions.addChallenge({
    partnerId: partner.id,
    organisation: partner.organisation,
    title: sample.challenge.title,
    brief: sample.challenge.brief,
    domain: sample.challenge.domain,
    stakeholderRole: sample.challenge.stakeholderRole,
    deliverable: sample.challenge.deliverable,
    skillKeys: sample.challenge.skillKeys,
    contributedBy: sample.challenge.contributedBy,
  });
}

export async function loadSample(id: string, opts: SampleLoadOptions): Promise<SampleLoadResult> {
  const sample = sampleById(id);
  if (!sample) throw new Error(`Unknown sample "${id}".`);
  const { provider, ws, actions, onPhase, signal } = opts;
  const courseId = opts.courseId ?? ws.course.id;

  onPhase?.("fetching", `Fetching the ${sample.organisation} files…`);
  const files = await fetchSampleFiles(sample, signal);

  onPhase?.("reading", `Reading ${files.length} files…`, { count: files.length });
  const parsed = await parseFiles(files, courseId);
  if (!parsed.roster) throw new Error("The sample roster did not parse.");
  const fixture = getFixture(sample.id);
  // The recorded run carries its own roster (the ids the recorded versions were assigned to).
  const roster: Roster = fixture?.roster ?? parsed.roster;
  actions.setRoster(roster);
  actions.setCourse?.({ code: sample.course.code, title: sample.course.title });

  ensureSkills(sample, ws, actions);
  const partner = ensurePartner(sample, ws, actions);
  const challenge = ensureChallenge(sample, ws, partner, actions);

  let draft: BlueprintDraft;
  let extractedBy: SampleLoadResult["extractedBy"];
  let extractionModel: string | null = null;
  let repairs: string[] = [];

  if (fixture && !opts.forReal) {
    // Recorded walkthrough: the blueprint Claude extracted when the run was recorded. Nothing is spent.
    onPhase?.("extracting", "Loading the recorded blueprint…", { model: fixture.extraction.model });
    const { id: _id, courseId: _c, createdAt: _a, updatedAt: _u, ...recorded } = fixture.blueprint;
    draft = { ...recorded, source: { ...recorded.source, files: parsed.sources.map(({ text: _t, ...rest }) => rest), readSeconds: parsed.readSeconds } };
    extractedBy = "recorded";
    extractionModel = fixture.extraction.model;
  } else if (provider.mode === "live") {
    onPhase?.("extracting", "Extracting the blueprint with Claude…", { model: (provider as unknown as { generatorModel?: string }).generatorModel ?? null });
    const out = await provider.extractBlueprint({ files: parsed.sources, rawText: parsed.rawText, course: ws.course, signal });
    draft = {
      ...out,
      source: { ...out.source, files: parsed.sources.map(({ text: _t, ...rest }) => rest), readSeconds: parsed.readSeconds },
    };
    extractedBy = "claude";
    extractionModel = null; // the provider does not expose the model id here; the page reads settings
    const guarded = guardDraft(draft, parsed.sources, sample);
    draft = guarded.draft;
    repairs = guarded.repairs;
    if (repairs.length) onPhase?.("repairing", `Repairing ${repairs.length} field${repairs.length === 1 ? "" : "s"} from the files…`, { repairs: repairs.length });
  } else if (sample.preExtracted) {
    onPhase?.("extracting", "Loading the recorded extraction…");
    draft = { ...sample.preExtracted.blueprint, source: { ...sample.preExtracted.blueprint.source, files: parsed.sources.map(({ text: _t, ...rest }) => rest), readSeconds: parsed.readSeconds } };
    extractedBy = "recorded";
    extractionModel = sample.preExtracted.model;
  } else {
    onPhase?.("extracting", "Reading the rubric and model answer directly…");
    draft = localExtract(parsed.sources, sample);
    draft.source.readSeconds = parsed.readSeconds;
    extractedBy = "local parser";
  }

  // Tag rubric criteria with the sample's skills when the extraction did not.
  const skillKeys = sample.skills.map((s) => s.key);
  draft.rubric = draft.rubric.map((c, i) => (c.skillKeys?.length ? c : { ...c, skillKeys: skillKeys.filter((_, k) => k % Math.max(1, draft.rubric.length) === i) }));
  draft.code = draft.code ?? sample.course.code;
  draft.sampleId = sample.id;
  draft.recordedRunAvailable = !!fixture;

  return { sample, draft, roster, partner, challenge, parsed, extractedBy, extractionModel, repairs };
}
