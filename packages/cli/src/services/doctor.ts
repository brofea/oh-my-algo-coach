import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OmacError } from "../core/ids.js";
import { DIRS, requireWorkspace, readWorkspaceConfig, WARNING_TEXT, omacPath } from "../store/workspace.js";
import { readJsonl } from "../store/jsonl.js";
import { EventRecord, EvidenceRecord, AssessmentClaim } from "../core/types.js";
import { loadEventAnywhere, listEvents } from "../store/event_store.js";
import { listEvidence } from "../store/evidence_store.js";
import { listClaims } from "../store/claim_store.js";
import { assertSchemaVersion } from "../core/schema.js";
import { listConnectors, cachedContent } from "./ecosystem.js";

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
  return { ok: issues.every((i) => i.severity !== "error"), issues };
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
