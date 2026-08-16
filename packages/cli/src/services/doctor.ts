import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OmacError } from "../core/ids.js";
import { DIRS, requireWorkspace, readWorkspaceConfig, WARNING_TEXT, omacPath } from "../store/workspace.js";
import { readJsonl } from "../store/jsonl.js";
import { EventRecord, EvidenceRecord, AssessmentClaim, ArtifactRecord } from "../core/types.js";
import { loadEventAnywhere, listEvents, getBoundaries } from "../store/event_store.js";
import { listEvidence } from "../store/evidence_store.js";
import { listClaims } from "../store/claim_store.js";
import { assertSchemaVersion } from "../core/schema.js";
import { listConnectors, cachedContent } from "./ecosystem.js";
import { listArtifacts } from "../store/knowledge_store.js";

export interface IntegrityIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface IntegrityReport {
  ok: boolean;
  issues: IntegrityIssue[];
}

export function integrityCheck(cwd: string): IntegrityReport {
  const ws = requireWorkspace(cwd);
  const issues: IntegrityIssue[] = [];

  for (const d of DIRS) {
    if (!existsSync(join(ws.omac, d))) {
      issues.push({ severity: "error", code: "missing_dir", message: `missing required directory: ${d}` });
    }
  }
  let cfg;
  try {
    cfg = readWorkspaceConfig(cwd);
  } catch (e) {
    issues.push({ severity: "error", code: "corrupt_config", message: (e as Error).message });
  }
  if (cfg && !cfg.workspace_id) issues.push({ severity: "error", code: "no_workspace_id", message: "workspace_id missing" });
  if (cfg && cfg.schema_version) {
    try {
      assertSchemaVersion(cfg.schema_version);
    } catch (e) {
      issues.push({ severity: "error", code: "schema_mismatch", message: (e as Error).message });
    }
  }

  const evidence = listEvidence(cwd);
  const claims = listClaims(cwd);
  const evidenceIds = new Set(evidence.map((e) => e.evidence_id));
  const eventIds = new Set<string>();
  for (const e of evidence) eventIds.add(e.event_id);
  for (const c of claims) {
    for (const eid of c.evidence_ids) {
      if (!evidenceIds.has(eid)) {
        issues.push({ severity: "error", code: "dangling_evidence_ref", message: `claim ${c.claim_id} references missing evidence ${eid}` });
      }
    }
  }
  const claimIds = new Set(claims.map((c) => c.claim_id));
  for (const c of claims) {
    for (const s of c.supersedes ?? []) {
      if (!claimIds.has(s)) {
        issues.push({ severity: "warning", code: "dangling_supersede", message: `claim ${c.claim_id} supersedes unknown claim ${s}` });
      }
    }
  }
  const evdIds = new Set(evidence.map((e) => e.evidence_id));
  for (const e of evidence) {
    if (!evdIds.has(e.evidence_id)) issues.push({ severity: "error", code: "dup_evidence", message: `duplicate evidence id ${e.evidence_id}` });
  }
  const { working, archived } = listEvents(ws.omac);
  const allEvents = [...working, ...archived];
  const eventById = new Map(allEvents.map((e) => [e.id, e]));
  for (const e of allEvents) {
    if (e.status === "closed" || e.status === "cancelled") {
      const dir = join(ws.omac, "event", "archive", e.id);
      if (!existsSync(join(dir, "event.json"))) {
        issues.push({ severity: "error", code: "archive_missing", message: `closed event ${e.id} not archived` });
      }
    }
  }
  for (const eid of eventIds) {
    try {
      loadEventAnywhere(ws.omac, eid);
    } catch {
      issues.push({ severity: "error", code: "dangling_event_ref", message: `evidence references missing event ${eid}` });
    }
  }

  const idxFile = join(ws.omac, "event", "index", "index.jsonl");
  if (existsSync(idxFile)) {
    const seen = new Set<string>();
    for (const entry of readJsonl<{ event_id?: string; archived?: boolean }>(idxFile)) {
      if (!entry.event_id) continue;
      if (seen.has(entry.event_id)) {
        issues.push({ severity: "error", code: "dup_index", message: `duplicate event index entry ${entry.event_id}` });
      }
      seen.add(entry.event_id);
      const event = eventById.get(entry.event_id);
      if (event && entry.archived && !event.archive_ref && event.status !== "closed" && event.status !== "cancelled") {
        issues.push({ severity: "error", code: "index_status_mismatch", message: `index marks ${entry.event_id} archived but event is not closed` });
      }
    }
  }

  for (const c of claims) {
    const bndRef = c.independence_boundary_ref;
    if (bndRef) {
      const eventIdRef = c.input_snapshot_ref?.startsWith("event:") ? c.input_snapshot_ref.slice(6) : undefined;
      if (eventIdRef && eventById.has(eventIdRef)) {
        const snapshots = getBoundaries(ws.omac, eventIdRef);
        if (!snapshots.some((b) => b.boundary_id === bndRef)) {
          issues.push({ severity: "error", code: "dangling_boundary_ref", message: `claim ${c.claim_id} references missing boundary ${bndRef} on event ${eventIdRef}` });
        }
      }
    }
  }
  for (const e of evidence) {
    const bndRef = e.independence_boundary_ref;
    if (bndRef) {
      const snapshots = getBoundaries(ws.omac, e.event_id);
      if (!snapshots.some((b) => b.boundary_id === bndRef)) {
        issues.push({ severity: "error", code: "dangling_boundary_ref", message: `evidence ${e.evidence_id} references missing boundary ${bndRef} on event ${e.event_id}` });
      }
    }
  }

  const artifacts = listArtifacts(cwd);
  const artifactIds = new Set<string>();
  for (const a of artifacts) {
    if (artifactIds.has(a.artifact_id)) {
      issues.push({ severity: "error", code: "dup_artifact", message: `duplicate artifact id ${a.artifact_id}` });
    }
    artifactIds.add(a.artifact_id);
    if (!eventById.has(a.event_id)) {
      issues.push({ severity: "error", code: "dangling_artifact_event", message: `artifact ${a.artifact_id} references missing event ${a.event_id}` });
    }
    if (!existsSync(join(ws.omac, a.rel_path))) {
      issues.push({ severity: "warning", code: "artifact_file_missing", message: `artifact file missing: ${a.rel_path}` });
    }
  }

  checkPurgeResiduals(cwd, ws.omac, issues, eventById);
  return { ok: issues.every((i) => i.severity !== "error"), issues };
}

function checkPurgeResiduals(cwd: string, omac: string, issues: { severity: "error" | "warning"; code: string; message: string }[], eventById: Map<string, EventRecord>): void {
  const learnerStateDir = join(omac, "learner", "state");
  const residualChecks: [string, string, (r: { event_id?: string }) => boolean][] = [
    ["problem-status.jsonl", "orphan_problem_status", (r) => Boolean(r.event_id && !eventById.has(r.event_id))],
    ["learn-paths.jsonl", "orphan_learn_path", (r) => Boolean(r.event_id && !eventById.has(r.event_id))],
  ];
  for (const [file, code, isOrphan] of residualChecks) {
    const p = join(learnerStateDir, file);
    if (!existsSync(p)) continue;
    for (const rec of readJsonl<{ event_id?: string }>(p)) {
      if (isOrphan(rec)) {
        issues.push({ severity: "warning", code, message: `${file} references missing event ${rec.event_id}` });
      }
    }
  }
  const subflowsFile = join(omac, "event", "subflows.jsonl");
  if (existsSync(subflowsFile)) {
    for (const rec of readJsonl<{ event_id?: string }>(subflowsFile)) {
      if (rec.event_id && !eventById.has(rec.event_id)) {
        issues.push({ severity: "warning", code: "orphan_subflow", message: `subflows.jsonl references missing event ${rec.event_id}` });
      }
    }
  }
}

export function doctor(cwd: string): { integrity: IntegrityReport; warnings: string[]; tips: string[]; connectors?: unknown[] } {
  const report = integrityCheck(cwd);
  const warnings = [WARNING_TEXT];
  const tips: string[] = [];
  const ws = requireWorkspace(cwd);
  const configPath = join(ws.omac, "config", "workspace.json");
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf8");
    if (/(api[_-]?key|token|password|secret)/i.test(raw)) {
      warnings.push("WARNING: credentials detected in workspace config — remove them; credentials must never be stored in .omac");
    }
  }
  const connectors = checkConnectors(cwd);
  if (report.ok) tips.push("integrity: ok — run 'omac export --learner-id <id>' to back up learner data");
  else tips.push("integrity: issues found — see report above");
  return { integrity: report, warnings, tips, connectors };
}

function checkConnectors(cwd: string): { connector_id: string; platform: string; cached_entries: number; verified_entries: number; healthy: boolean }[] {
  return listConnectors().map((c) => {
    const cache = cachedContent(cwd, c.connector_id);
    return {
      connector_id: c.connector_id,
      platform: c.platform,
      cached_entries: cache.length,
      verified_entries: cache.filter((x) => x.verified).length,
      healthy: true,
    };
  });
}
