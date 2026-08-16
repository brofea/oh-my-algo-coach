import { join } from "node:path";
import { readJsonl, writeJsonl, appendJsonl, readJson, writeJson, jsonExists } from "./jsonl.js";
import { requireWorkspace, omacPath } from "./workspace.js";
import { ProblemManifestEntry, ArtifactRecord } from "../core/types.js";
import { nowIso, shortId } from "../core/ids.js";

export function problemsFile(omac: string): string {
  return join(omac, "knowledge", "problems.jsonl");
}

export function addProblem(cwd: string, entry: Omit<ProblemManifestEntry, "added_at">): ProblemManifestEntry {
  const ws = requireWorkspace(cwd);
  const existing = readJsonl<ProblemManifestEntry>(problemsFile(ws.omac));
  const dup = existing.find((p) => p.problem_ref === entry.problem_ref);
  if (dup) return dup;
  const record: ProblemManifestEntry = { ...entry, added_at: nowIso() };
  appendJsonl(problemsFile(ws.omac), record);
  return record;
}

export function listProblems(cwd: string, platform?: string): ProblemManifestEntry[] {
  const ws = requireWorkspace(cwd);
  const all = readJsonl<ProblemManifestEntry>(problemsFile(ws.omac));
  return platform ? all.filter((p) => p.platform === platform) : all;
}

export function getProblem(cwd: string, problemRef: string): ProblemManifestEntry {
  const found = listProblems(cwd).find((p) => p.problem_ref === problemRef);
  if (!found) throw new Error(`problem '${problemRef}' not in manifest`);
  return found;
}

export function artifactsFile(omac: string): string {
  return join(omac, "artifact", "index.jsonl");
}

export function addArtifact(
  cwd: string,
  opts: { eventId: string; kind: ArtifactRecord["kind"]; filePath: string; relPath: string; checksum: string; operationId?: string }
): ArtifactRecord {
  const ws = requireWorkspace(cwd);
  if (opts.operationId) {
    const dup = listArtifacts(cwd).find((a) => a.operation_id === opts.operationId);
    if (dup) return dup;
  }
  const record: ArtifactRecord = {
    artifact_id: `art-${shortId("a").slice(4)}`,
    event_id: opts.eventId,
    kind: opts.kind,
    file_path: opts.filePath,
    rel_path: opts.relPath,
    sha256: opts.checksum,
    operation_id: opts.operationId,
    added_at: nowIso(),
  };
  appendJsonl(artifactsFile(ws.omac), record);
  return record;
}

export function listArtifacts(cwd: string, eventId?: string): ArtifactRecord[] {
  const ws = requireWorkspace(cwd);
  const all = readJsonl<ArtifactRecord>(artifactsFile(ws.omac));
  return eventId ? all.filter((a) => a.event_id === eventId) : all;
}
