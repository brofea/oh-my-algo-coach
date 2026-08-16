import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import {
  EvidenceRecord,
  AssessmentClaim,
  EventRecord,
  SCHEMA_VERSION,
  ONTOLOGY_VERSION,
  ArtifactRecord,
  LearnerView,
  IndependenceBoundary,
  TransferProbe,
} from "../core/types.js";
import { readJsonl, writeJson, appendJsonl, writeJsonl, readJson, archivedEventDir } from "../store/jsonl.js";
import { requireWorkspace, omacPath } from "../store/workspace.js";
import { listEvents, loadEventAnywhere, getBoundaries, getTransferProbes, eventLog } from "../store/event_store.js";
import { listEvidence, evidenceFile } from "../store/evidence_store.js";
import { listClaims, claimsFile } from "../store/claim_store.js";
import { readWorkspaceConfig, setLearnerId } from "../store/workspace.js";
import { appendEvidence } from "../store/evidence_store.js";
import { appendClaim } from "../store/claim_store.js";
import { rebuildView, listViews, viewsFile } from "../store/view_store.js";
import { listArtifacts, artifactsFile } from "../store/knowledge_store.js";
import { listRetention, retentionFile } from "./retention.js";
import { listLearnPaths } from "./memory.js";
import { installedPacks } from "./memory.js";
import { integrityCheck } from "./doctor.js";

export interface ExportManifest {
  export_package_id: string;
  exported_at: string;
  learner_id: string;
  source_workspace_id: string;
  schema_version: string;
  ontology_version: string;
  target_pack_version: string;
  record_ids: {
    events: string[];
    archived_events: string[];
    evidence: string[];
    claims: string[];
    artifacts: string[];
    views: string[];
  };
  packs: { pack_id: string; pack_version: string; kind: string }[];
  content_summary: string;
}

export interface EventExtra {
  event_id: string;
  archive_ref?: string;
  boundaries: IndependenceBoundary[];
  transfer_probes: TransferProbe[];
  log: unknown[];
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
  const allViews = listViews(cwd, opts.learnerId);
  const artifacts = listArtifacts(cwd).filter((a) => allEvents.some((e) => e.id === a.event_id));

  const pkgId = `exp-${uuid().slice(0, 12)}`;
  const outDir = opts.outDir ?? omacPath(cwd, "export", pkgId);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "event-extra"), { recursive: true });
  mkdirSync(join(outDir, "artifact-files"), { recursive: true });

  const eventExtras: EventExtra[] = [];
  for (const e of allEvents) {
    const { archived: isArchived } = loadEventAnywhere(ws.omac, e.id);
    const dir = isArchived ? archivedEventDir(ws.omac, e.id) : join(ws.omac, "event", e.id);
    const boundaryFile = join(dir, "boundary.json");
    const probesFile = join(dir, "transfer-probes.jsonl");
    const logFile = join(dir, "event.jsonl");
    eventExtras.push({
      event_id: e.id,
      archive_ref: e.archive_ref,
      boundaries: existsSync(boundaryFile) ? readJson<IndependenceBoundary[]>(boundaryFile) : [],
      transfer_probes: readJsonl<TransferProbe>(probesFile),
      log: readJsonl<unknown>(logFile),
    });
    for (const a of artifacts.filter((x) => x.event_id === e.id)) {
      copyArtifactFile(cwd, a, outDir);
    }
  }

  const packs = installedPacks(cwd).map((p) => ({ pack_id: p.manifest.pack_id, pack_version: p.manifest.pack_version, kind: p.manifest.kind }));

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
      archived_events: archived.map((e) => e.id),
      evidence: allEvidence.map((e) => e.evidence_id),
      claims: allClaims.map((c) => c.claim_id),
      artifacts: artifacts.map((a) => a.artifact_id),
      views: allViews.map((v) => v.view_id),
    },
    packs,
    content_summary: `${allEvents.length} events (${archived.length} archived), ${allEvidence.length} evidence records, ${allClaims.length} claims, ${artifacts.length} artifacts, ${allViews.length} views`,
  };
  writeJson(join(outDir, "manifest.json"), manifest);
  writeJsonl(join(outDir, "events.jsonl"), allEvents);
  writeJsonl(join(outDir, "evidence.jsonl"), allEvidence);
  writeJsonl(join(outDir, "claims.jsonl"), allClaims);
  writeJsonl(join(outDir, "event-extra.jsonl"), eventExtras);
  writeJsonl(join(outDir, "artifacts.jsonl"), artifacts);
  writeJsonl(join(outDir, "views.jsonl"), allViews);
  writeJsonl(join(outDir, "retention.jsonl"), listRetention(cwd));
  writeJsonl(join(outDir, "learn-paths.jsonl"), listLearnPaths(cwd));
  return { manifest, path: outDir };
}

function copyArtifactFile(cwd: string, a: ArtifactRecord, outDir: string): void {
  const ws = requireWorkspace(cwd);
  const src = join(ws.omac, a.rel_path);
  const dst = join(outDir, "artifact-files", `${a.artifact_id}.bin`);
  if (existsSync(src)) copyFileSync(src, dst);
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
  const manifest = readJson<ExportManifest>(manifestPath);
  const ws = requireWorkspace(cwd);
  const sameLearner = new Set<string>();
  if (readWorkspaceConfig(cwd).learner_id === manifest.learner_id) sameLearner.add(manifest.learner_id);
  const existingEvents = new Set(listEvents(ws.omac).working.concat(listEvents(ws.omac).archived).map((e) => e.id));
  const existingEvidence = new Set(listEvidence(cwd).map((e) => e.evidence_id));
  const existingClaims = new Set(listClaims(cwd).map((c) => c.claim_id));
  const existingArtifacts = new Set(listArtifacts(cwd).map((a) => a.artifact_id));
  const dup: { kind: string; id: string }[] = [
    ...readJsonl<EventRecord>(join(packagePath, "events.jsonl")).filter((e) => existingEvents.has(e.id)).map((e) => ({ kind: "event", id: e.id })),
    ...readJsonl<EvidenceRecord>(join(packagePath, "evidence.jsonl")).filter((e) => existingEvidence.has(e.evidence_id)).map((e) => ({ kind: "evidence", id: e.evidence_id })),
    ...readJsonl<AssessmentClaim>(join(packagePath, "claims.jsonl")).filter((c) => existingClaims.has(c.claim_id)).map((c) => ({ kind: "claim", id: c.claim_id })),
    ...readJsonl<ArtifactRecord>(join(packagePath, "artifacts.jsonl")).filter((a) => existingArtifacts.has(a.artifact_id)).map((a) => ({ kind: "artifact", id: a.artifact_id })),
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
): { imported: { events: number; archived: number; evidence: number; claims: number; artifacts: number; learner_id: string }; integrity: { ok: boolean; issues: string[] } } {
  const ws = requireWorkspace(cwd);
  const preview = previewImport(cwd, packagePath);
  if (opts.strategy === "reject" && preview.conflicts.duplicate_records.length > 0) {
    throw new OmacError("import_conflict", "duplicate records detected; choose merge or new-learner");
  }
  let learnerId = preview.manifest.learner_id;
  const events = readJsonl<EventRecord>(join(packagePath, "events.jsonl"));
  const evidence = readJsonl<EvidenceRecord>(join(packagePath, "evidence.jsonl"));
  const claims = readJsonl<AssessmentClaim>(join(packagePath, "claims.jsonl"));
  const extras = readJsonl<EventExtra>(join(packagePath, "event-extra.jsonl"));
  const artifacts = readJsonl<ArtifactRecord>(join(packagePath, "artifacts.jsonl"));
  const views = readJsonl<LearnerView>(join(packagePath, "views.jsonl"));
  const retention = readJsonl<Record<string, unknown>>(join(packagePath, "retention.jsonl"));
  const learnPaths = readJsonl<Record<string, unknown>>(join(packagePath, "learn-paths.jsonl"));

  if (opts.strategy === "new-learner") {
    if (!learnerId) throw new OmacError("import_conflict", "package has no learner_id");
    learnerId = `${learnerId}-import-${uuid().slice(0, 6)}`;
    if (!readWorkspaceConfig(cwd).learner_id) setLearnerId(cwd, learnerId);
    for (const e of events) e.learner_id = learnerId;
    for (const e of evidence) e.learner_id = learnerId;
    for (const c of claims) c.learner_id = learnerId;
    for (const v of views) v.learner_id = learnerId;
  }

  let archived = 0;
  for (const e of events) {
    if (existingEvent(cwd, e.id) && opts.strategy !== "merge") continue;
    writeEventRecord(cwd, e);
    const extra = extras.find((x) => x.event_id === e.id);
    if (extra) writeEventExtra(cwd, e, extra);
    if (e.archive_ref || e.status === "closed" || e.status === "cancelled") {
      archived++;
    }
  }
  const existingEvidenceIds = new Set(listEvidence(cwd).map((x) => x.evidence_id));
  const newEvidence = evidence.filter((x) => !existingEvidenceIds.has(x.evidence_id));
  if (newEvidence.length > 0) {
    writeJsonl(evidenceFile(ws.omac), [...listEvidence(cwd), ...newEvidence]);
  }
  const existingClaimIds = new Set(listClaims(cwd).map((x) => x.claim_id));
  const newClaims = claims.filter((x) => !existingClaimIds.has(x.claim_id));
  if (newClaims.length > 0) {
    writeJsonl(claimsFile(ws.omac), [...listClaims(cwd), ...newClaims]);
  }
  for (const a of artifacts) {
    if (listArtifacts(cwd).some((x) => x.artifact_id === a.artifact_id)) continue;
    appendArtifactRecord(cwd, a);
    const src = join(packagePath, "artifact-files", `${a.artifact_id}.bin`);
    if (existsSync(src)) {
      const dst = join(ws.omac, a.rel_path);
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }
  for (const v of views) {
    if (!listViews(cwd, v.learner_id).some((x) => x.view_id === v.view_id)) {
      appendJsonl(viewsFile(ws.omac, v.learner_id), v);
    }
  }
  const retentionFile = join(ws.omac, "learner", "state", "retention.jsonl");
  for (const r of retention) appendJsonl(retentionFile, r);
  const lpFile = join(ws.omac, "learner", "state", "learn-paths.jsonl");
  for (const p of learnPaths) appendJsonl(lpFile, p);

  if (learnerId) {
    try {
      void rebuildView(cwd, { learnerId });
    } catch {
      // view rebuild failure is reported by the integrity check below
    }
  }
  const integrity = integrityCheck(cwd);
  return {
    imported: {
      events: events.length,
      archived,
      evidence: evidence.length,
      claims: claims.length,
      artifacts: artifacts.length,
      learner_id: learnerId ?? "",
    },
    integrity: { ok: integrity.ok, issues: integrity.issues.map((i) => i.message) },
  };
}

function existingEvent(cwd: string, eventId: string): boolean {
  const ws = requireWorkspace(cwd);
  try {
    loadEventAnywhere(ws.omac, eventId);
    return true;
  } catch {
    return false;
  }
}

function writeEventRecord(cwd: string, e: EventRecord): void {
  const ws = requireWorkspace(cwd);
  const isArchived = Boolean(e.archive_ref) || e.status === "closed" || e.status === "cancelled";
  const dir = isArchived ? archivedEventDir(ws.omac, e.id) : join(ws.omac, "event", e.id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "event.json"), e);
  if (isArchived) {
    const idxFile = join(ws.omac, "event", "index", "index.jsonl");
    const idx = existsSync(idxFile) ? readJsonl<{ event_id?: string }>(idxFile) : [];
    if (!idx.some((x) => x.event_id === e.id)) {
      appendJsonl(idxFile, {
        event_id: e.id,
        event_type: e.event_type,
        status: e.status,
        started_at: e.started_at,
        ended_at: e.ended_at,
        archived: true,
      });
    }
  }
}

function writeEventExtra(cwd: string, e: EventRecord, extra: EventExtra): void {
  const ws = requireWorkspace(cwd);
  const isArchived = Boolean(e.archive_ref) || e.status === "closed" || e.status === "cancelled";
  const dir = isArchived ? archivedEventDir(ws.omac, e.id) : join(ws.omac, "event", e.id);
  mkdirSync(dir, { recursive: true });
  if (extra.boundaries.length > 0) writeJson(join(dir, "boundary.json"), extra.boundaries);
  for (const probe of extra.transfer_probes) appendJsonl(join(dir, "transfer-probes.jsonl"), probe);
  for (const entry of extra.log) appendJsonl(join(dir, "event.jsonl"), entry);
}

function appendArtifactRecord(cwd: string, a: ArtifactRecord): void {
  const ws = requireWorkspace(cwd);
  appendJsonl(artifactsFile(ws.omac), a);
}
