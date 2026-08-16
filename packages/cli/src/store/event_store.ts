import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import {
  EventRecord,
  EventStatus,
  EventType,
  CoachingMode,
  IndependenceBoundary,
  TransferProbe,
} from "../core/types.js";
import { assertCanTransition, validateEventRecord, validateMode } from "../core/schema.js";
import { eventDir, archivedEventDir, readJson, readJsonl, writeJson, appendJsonl, moveDir, ensureDir } from "./jsonl.js";
import { requireWorkspace } from "./workspace.js";

export const EVENT_FILE = "event.json";
export const BOUNDARY_FILE = "boundary.json";
export const TRANSFER_FILE = "transfer-probes.jsonl";
export const EVENT_LOG = "event.jsonl";

export interface EventIndexEntry {
  event_id: string;
  event_type: EventType;
  status: EventStatus;
  started_at?: string;
  ended_at?: string;
  archived?: boolean;
}

export function eventPath(omac: string, eventId: string, file = EVENT_FILE): string {
  return join(eventDir(omac, eventId), file);
}

export function loadEvent(omac: string, eventId: string): EventRecord {
  const p = eventPath(omac, eventId);
  if (!existsSync(p)) {
    throw new OmacError("event_not_found", `event '${eventId}' not found in working dir or archive`);
  }
  return readJson<EventRecord>(p);
}

export function loadEventAnywhere(omac: string, eventId: string): { event: EventRecord; archived: boolean } {
  const working = join(eventDir(omac, eventId), EVENT_FILE);
  if (existsSync(working)) return { event: readJson<EventRecord>(working), archived: false };
  const archived = join(archivedEventDir(omac, eventId), EVENT_FILE);
  if (existsSync(archived)) return { event: readJson<EventRecord>(archived), archived: true };
  throw new OmacError("event_not_found", `event '${eventId}' not found`);
}

export function createEvent(opts: {
  cwd: string;
  eventType: EventType;
  learnerId: string;
  workspaceId: string;
  targetIds: string[];
  intent?: string;
  problemRef?: string;
  contestRef?: string;
  mode?: CoachingMode;
  platformProfileRef?: string;
  domainProfileRef?: string;
  targetStatus?: "confirmed" | "provisional" | "unresolved";
  artifactRef?: string;
  provenance: string;
  operationId?: string;
}): EventRecord {
  const ws = requireWorkspace(opts.cwd);
  const now = nowIso();
  const id = `ev-${uuid().slice(0, 12)}`;
  const record: EventRecord = {
    id,
    event_type: opts.eventType,
    schema_version: "1.0.0",
    workspace_id: opts.workspaceId,
    learner_id: opts.learnerId,
    platform_profile_ref: opts.platformProfileRef,
    domain_profile_ref: opts.domainProfileRef,
    target_ids: opts.targetIds,
    target_status: opts.targetStatus,
    intent: opts.intent,
    problem_ref: opts.problemRef,
    contest_ref: opts.contestRef,
    artifact_ref: opts.artifactRef,
    mode: opts.mode ?? (opts.eventType === "learn" ? "learn" : opts.eventType === "upsolve" ? "upsolve" : "practice"),
    status: "draft",
    provenance: opts.provenance,
    operation_id: opts.operationId,
    created_at: now,
    updated_at: now,
  };
  validateEventRecord(record);
  const dir = eventDir(ws.omac, id);
  ensureDir(dir);
  writeJson(eventPath(ws.omac, id), record);
  writeJson(join(dir, BOUNDARY_FILE), []);
  appendJsonl(join(dir, EVENT_LOG), { op: "created", at: now });
  return record;
}

export function updateEvent(omac: string, event: EventRecord): void {
  validateEventRecord(event);
  event.updated_at = nowIso();
  const p = eventPath(omac, event.id);
  if (!existsSync(p)) {
    throw new OmacError("event_not_found", `event '${event.id}' not found in working dir`);
  }
  writeJson(p, event);
}

export function transition(omac: string, event: EventRecord, to: EventStatus): EventRecord {
  assertCanTransition(event.status, to);
  event.status = to;
  if (to === "closed" || to === "cancelled") event.ended_at = nowIso();
  updateEvent(omac, event);
  appendJsonl(join(eventDir(omac, event.id), EVENT_LOG), { op: "status", to, at: nowIso() });
  return event;
}

export function setBoundaries(omac: string, eventId: string, boundaries: IndependenceBoundary[]): void {
  const dir = eventDir(omac, eventId);
  if (!existsSync(join(dir, EVENT_FILE))) {
    throw new OmacError("event_not_found", `event '${eventId}' not found in working dir`);
  }
  writeJson(join(dir, BOUNDARY_FILE), boundaries);
}

/**
 * Append a new boundary snapshot. Snapshots are immutable: existing records are
 * never rewritten. Retrying with the same boundary_id returns the original snapshot.
 */
export function appendBoundary(omac: string, eventId: string, boundary: IndependenceBoundary): IndependenceBoundary {
  const dir = eventDir(omac, eventId);
  if (!existsSync(join(dir, EVENT_FILE))) {
    throw new OmacError("event_not_found", `event '${eventId}' not found in working dir`);
  }
  const snapshots = getBoundaries(omac, eventId);
  const existing = snapshots.find((b) => b.boundary_id === boundary.boundary_id || (boundary.operation_id && b.operation_id === boundary.operation_id));
  if (existing) return existing;
  snapshots.push(boundary);
  writeJson(join(dir, BOUNDARY_FILE), snapshots);
  return boundary;
}

export function getBoundaries(omac: string, eventId: string): IndependenceBoundary[] {
  const p = eventFileAnywhere(omac, eventId, BOUNDARY_FILE);
  if (!p) return [];
  return readJson<IndependenceBoundary[]>(p);
}

/**
 * Resolve an event file (boundary.json / transfer-probes.jsonl / event.jsonl)
 * across the working and archived locations, so closed events stay readable.
 */
export function eventFileAnywhere(omac: string, eventId: string, file: string): string | null {
  const working = join(eventDir(omac, eventId), file);
  if (existsSync(working)) return working;
  const archived = join(archivedEventDir(omac, eventId), file);
  if (existsSync(archived)) return archived;
  return null;
}

export function getBoundary(omac: string, eventId: string, boundaryId: string): IndependenceBoundary {
  const hit = getBoundaries(omac, eventId).find((b) => b.boundary_id === boundaryId);
  if (!hit) {
    const known = getBoundaries(omac, eventId).map((b) => b.boundary_id).join(", ") || "(none)";
    throw new OmacError("boundary_not_found", `boundary snapshot '${boundaryId}' not found for event '${eventId}'; known snapshots: ${known}`);
  }
  return hit;
}

export function recordTransferProbe(omac: string, eventId: string, probe: TransferProbe): { probe: TransferProbe; resumed: boolean } {
  const dir = eventDir(omac, eventId);
  ensureDir(dir);
  if (probe.operation_id) {
    const existing = getTransferProbes(omac, eventId).find((p) => p.operation_id === probe.operation_id);
    if (existing) return { probe: existing, resumed: true };
  }
  appendJsonl(join(dir, TRANSFER_FILE), probe);
  return { probe, resumed: false };
}

export function getTransferProbes(omac: string, eventId: string): TransferProbe[] {
  const p = eventFileAnywhere(omac, eventId, TRANSFER_FILE);
  if (!p) return [];
  return readJsonl<TransferProbe>(p);
}

export function archiveEvent(omac: string, event: EventRecord): void {
  if (event.status !== "closed" && event.status !== "cancelled") {
    throw new OmacError("invalid_archive", "only closed or cancelled events can be archived");
  }
  const from = eventDir(omac, event.id);
  const to = archivedEventDir(omac, event.id);
  if (existsSync(to)) {
    throw new OmacError("archive_conflict", `archive target already exists for event '${event.id}'`);
  }
  moveDir(from, to);
  event.archive_ref = to;
  writeJson(join(to, EVENT_FILE), event);
  appendJsonl(join(to, EVENT_LOG), { op: "archived", at: nowIso() });
  appendJsonl(join(omac, "event", "index", "index.jsonl"), {
    event_id: event.id,
    event_type: event.event_type,
    status: event.status,
    started_at: event.started_at,
    ended_at: event.ended_at,
    archived: true,
  } satisfies EventIndexEntry);
}

export function listEvents(omac: string): { working: EventRecord[]; archived: EventRecord[] } {
  const working: EventRecord[] = [];
  const indexFile = join(omac, "event", "index", "index.jsonl");
  const archived: EventRecord[] = [];
  for (const entry of readJsonl<EventIndexEntry>(indexFile)) {
    const { event } = loadEventAnywhere(omac, entry.event_id);
    if (entry.archived) archived.push(event);
  }
  const workingDir = join(omac, "event");
  if (existsSync(workingDir)) {
    for (const name of readDirSafe(workingDir)) {
      if (name === "archive" || name === "index") continue;
      if (existsSync(join(workingDir, name, EVENT_FILE))) {
        working.push(readJson<EventRecord>(join(workingDir, name, EVENT_FILE)));
      }
    }
  }
  return { working, archived };
}

function readDirSafe(p: string): string[] {
  try {
    return readdirSync(p) as string[];
  } catch {
    return [];
  }
}

export function eventLog(omac: string, eventId: string): unknown[] {
  const p = eventFileAnywhere(omac, eventId, EVENT_LOG);
  if (!p) return [];
  return readJsonl(p);
}

export function eventHasActiveState(event: EventRecord): boolean {
  return event.status === "active" || event.status === "paused" || event.status === "evaluating";
}
