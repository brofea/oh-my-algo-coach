import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import { EvidenceRecord, AssessmentClaim, EventRecord, SCHEMA_VERSION, ONTOLOGY_VERSION } from "../core/types.js";
import { readJsonl, writeJson, appendJsonl, writeJsonl } from "../store/jsonl.js";
import { requireWorkspace, omacPath } from "../store/workspace.js";
import { listEvents, loadEventAnywhere } from "../store/event_store.js";
import { listEvidence } from "../store/evidence_store.js";
import { listClaims } from "../store/claim_store.js";
import { readWorkspaceConfig, setLearnerId } from "../store/workspace.js";
import { appendEvidence } from "../store/evidence_store.js";
import { appendClaim } from "../store/claim_store.js";
import { rebuildView, listViews } from "../store/view_store.js";

export interface ExportManifest {
  export_package_id: string;
  exported_at: string;
  learner_id: string;
  source_workspace_id: string;
  schema_version: string;
  ontology_version: string;
  target_pack_version: string;
  record_ids: { events: string[]; evidence: string[]; claims: string[] };
  content_summary: string;
}

export function exportPackage(cwd: string, opts: { learnerId: string; scope?: "learner" | "workspace"; outDir?: string }): {
  manifest: ExportManifest;
  path: string;
} {
  const ws = requireWorkspace(cwd);
  if (opts.scope === "workspace" && !opts.outDir) {
    throw new OmacError("validation_error", "exporting entire workspace requires --out <dir>");
  }
  const { working, archived } = listEvents(ws.omac);
  const allEvents = [...working, ...archived].filter((e) => !opts.learnerId || e.learner_id === opts.learnerId);
  const allEvidence = listEvidence(cwd).filter((e) => !opts.learnerId || e.learner_id === opts.learnerId);
  const allClaims = listClaims(cwd, { learnerId: opts.learnerId });

  const pkgId = `exp-${uuid().slice(0, 12)}`;
  const outDir = opts.outDir ?? omacPath(cwd, "export", pkgId);
  mkdirSync(outDir, { recursive: true });
  const manifest: ExportManifest = {
    export_package_id: pkgId,
    exported_at: nowIso(),
    learner_id: opts.learnerId,
    source_workspace_id: readWorkspaceConfig(cwd).workspace_id,
    schema_version: SCHEMA_VERSION,
    ontology_version: ONTOLOGY_VERSION,
    target_pack_version: "1.0.0",
    record_ids: {
      events: allEvents.map((e) => e.id),
      evidence: allEvidence.map((e) => e.evidence_id),
      claims: allClaims.map((c) => c.claim_id),
    },
    content_summary: `${allEvents.length} events, ${allEvidence.length} evidence records, ${allClaims.length} claims`,
  };
  writeJson(join(outDir, "manifest.json"), manifest);
  writeJsonl(join(outDir, "events.jsonl"), allEvents);
  writeJsonl(join(outDir, "evidence.jsonl"), allEvidence);
  writeJsonl(join(outDir, "claims.jsonl"), allClaims);
  return { manifest, path: outDir };
}

export interface ImportPreview {
  manifest: ExportManifest;
  conflicts: {
    same_learner: string[];
    duplicate_records: { kind: string; id: string }[];
    profile_mismatch: string[];
  };
  summary: string;
}

export function previewImport(cwd: string, packagePath: string): ImportPreview {
  const manifestPath = join(packagePath, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new OmacError("invalid_import", "import package missing manifest.json");
  }
  const manifest = readJsonl<ExportManifest>([manifestPath].map((p) => readFileSync(p, "utf8")).join("\n"))[0] ?? JSON.parse(readFileSync(manifestPath, "utf8"));
  const ws = requireWorkspace(cwd);
  const sameLearner = new Set<string>();
  if (readWorkspaceConfig(cwd).learner_id === manifest.learner_id) sameLearner.add(manifest.learner_id);
  const existingEvents = new Set(listEvents(ws.omac).working.concat(listEvents(ws.omac).archived).map((e) => e.id));
  const existingEvidence = new Set(listEvidence(cwd).map((e) => e.evidence_id));
  const existingClaims = new Set(listClaims(cwd).map((c) => c.claim_id));
  const dup = [
    ...(readJsonl<EventRecord>(join(packagePath, "events.jsonl")).filter((e) => existingEvents.has(e.id)).map((e) => ({ kind: "event", id: e.id }))),
    ...(readJsonl<EvidenceRecord>(join(packagePath, "evidence.jsonl")).filter((e) => existingEvidence.has(e.evidence_id)).map((e) => ({ kind: "evidence", id: e.evidence_id }))),
    ...(readJsonl<AssessmentClaim>(join(packagePath, "claims.jsonl")).filter((c) => existingClaims.has(c.claim_id)).map((c) => ({ kind: "claim", id: c.claim_id }))),
  ];
  return {
    manifest,
    conflicts: { same_learner: [...sameLearner], duplicate_records: dup, profile_mismatch: [] },
    summary: manifest.content_summary,
  };
}

export function importPackage(
  cwd: string,
  packagePath: string,
  opts: { strategy: "reject" | "merge" | "new-learner" }
): { imported: { events: number; evidence: number; claims: number; learner_id: string } } {
  const ws = requireWorkspace(cwd);
  const preview = previewImport(cwd, packagePath);
  if (opts.strategy === "reject" && preview.conflicts.duplicate_records.length > 0) {
    throw new OmacError("import_conflict", "duplicate records detected; choose merge or new-learner");
  }
  if (opts.strategy === "new-learner") {
    if (!preview.manifest.learner_id) throw new OmacError("import_conflict", "package has no learner_id");
    const newId = `${preview.manifest.learner_id}-import-${uuid().slice(0, 6)}`;
    if (!readWorkspaceConfig(cwd).learner_id) setLearnerId(cwd, newId);
    // re-map records to the new learner id
    const events = readJsonl<EventRecord>(join(packagePath, "events.jsonl")).map((e) => ({ ...e, learner_id: newId }));
    const evidence = readJsonl<EvidenceRecord>(join(packagePath, "evidence.jsonl")).map((e) => ({ ...e, learner_id: newId }));
    const claims = readJsonl<AssessmentClaim>(join(packagePath, "claims.jsonl")).map((c) => ({ ...c, learner_id: newId }));
    writeImportRecords(cwd, events, evidence, claims);
    return { imported: { events: events.length, evidence: evidence.length, claims: claims.length, learner_id: newId } };
  }
  const events = readJsonl<EventRecord>(join(packagePath, "events.jsonl"));
  const evidence = readJsonl<EvidenceRecord>(join(packagePath, "evidence.jsonl"));
  const claims = readJsonl<AssessmentClaim>(join(packagePath, "claims.jsonl"));
  writeImportRecords(cwd, events, evidence, claims);
  return { imported: { events: events.length, evidence: evidence.length, claims: claims.length, learner_id: preview.manifest.learner_id } };
}

function writeImportRecords(cwd: string, events: EventRecord[], evidence: EvidenceRecord[], claims: AssessmentClaim[]): void {
  const ws = requireWorkspace(cwd);
  for (const e of events) {
    const dir = join(ws.omac, "event", e.id);
    mkdirSync(dir, { recursive: true });
    writeJson(join(dir, "event.json"), e);
  }
  for (const ev of evidence) {
    if (!listEvidence(cwd).some((x) => x.evidence_id === ev.evidence_id)) appendEvidence(cwd, ev);
  }
  for (const c of claims) {
    if (!listClaims(cwd).some((x) => x.claim_id === c.claim_id)) appendClaim(cwd, c);
  }
  void rebuildView(cwd, { learnerId: claims[0]?.learner_id ?? events[0]?.learner_id ?? "" });
}
