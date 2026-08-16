import { join } from "node:path";
import { OmacError, nowIso, shortId } from "../core/ids.js";
import { EvidenceRecord } from "../core/types.js";
import { validateEvidenceRecord } from "../core/schema.js";
import { appendJsonl, findLastByOperationId, readJsonl, writeJsonl } from "./jsonl.js";
import { requireWorkspace } from "./workspace.js";

export const EVIDENCE_FILE = "evidence.jsonl";

export function evidenceFile(omac: string): string {
  return join(omac, "evidence", EVIDENCE_FILE);
}

export function appendEvidence(cwd: string, ev: Omit<EvidenceRecord, "evidence_id" | "created_at">): EvidenceRecord {
  const ws = requireWorkspace(cwd);
  const existing = readJsonl<EvidenceRecord>(evidenceFile(ws.omac));
  const dup = findLastByOperationId(existing, ev.operation_id);
  if (dup) return dup;
  const record: EvidenceRecord = {
    ...ev,
    evidence_id: shortId("evd"),
    created_at: nowIso(),
  };
  validateEvidenceRecord(record);
  appendJsonl(evidenceFile(ws.omac), record);
  return record;
}

export function listEvidence(cwd: string, eventId?: string): EvidenceRecord[] {
  const ws = requireWorkspace(cwd);
  const all = readJsonl<EvidenceRecord>(evidenceFile(ws.omac));
  return eventId ? all.filter((e) => e.event_id === eventId) : all;
}

export function getEvidence(cwd: string, evidenceId: string): EvidenceRecord {
  const found = listEvidence(cwd).find((e) => e.evidence_id === evidenceId);
  if (!found) throw new OmacError("evidence_not_found", `evidence '${evidenceId}' not found`);
  return found;
}

export function replaceEvidenceFile(cwd: string, records: EvidenceRecord[]): void {
  const ws = requireWorkspace(cwd);
  writeJsonl(evidenceFile(ws.omac), records);
}
