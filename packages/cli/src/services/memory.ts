import { join } from "node:path";
import { readJsonl, appendJsonl, readJson, writeJson, jsonExists, ensureDir } from "../store/jsonl.js";
import { requireWorkspace, omacPath } from "../store/workspace.js";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import { KnowledgePackManifest } from "../core/types.js";
import { copyFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";

export interface LearnPathRecord {
  path_id: string;
  event_id: string;
  steps: string[];
  recorded_at: string;
}

export const TOP_DOWN_PATH = [
  "why",
  "concrete-problem",
  "core-intuition",
  "example",
  "visualization",
  "abstraction",
  "formal-algorithm",
  "correctness",
  "implementation",
  "complexity",
  "recognition",
  "variants",
  "transfer",
];

export function validateLearnPathSteps(steps: string[]): void {
  const known = new Set(TOP_DOWN_PATH);
  for (const s of steps) {
    if (!known.has(s)) {
      throw new OmacError("validation_error", `unknown learn path step '${s}'; must be one of: ${TOP_DOWN_PATH.join(", ")}`);
    }
  }
}

export function recordLearnPath(cwd: string, eventId: string, steps: string[]): LearnPathRecord {
  const ws = requireWorkspace(cwd);
  const record: LearnPathRecord = {
    path_id: `lp-${uuid().slice(0, 12)}`,
    event_id: eventId,
    steps,
    recorded_at: nowIso(),
  };
  appendJsonl(join(ws.omac, "learner", "state", "learn-paths.jsonl"), record);
  return record;
}

export function listLearnPaths(cwd: string, eventId?: string): LearnPathRecord[] {
  const ws = requireWorkspace(cwd);
  const all = readJsonl<LearnPathRecord>(join(ws.omac, "learner", "state", "learn-paths.jsonl"));
  return eventId ? all.filter((p) => p.event_id === eventId) : all;
}

export function packsDir(omac: string): string {
  return join(omac, "knowledge", "packs");
}

export function installedPacks(cwd: string): { manifest: KnowledgePackManifest; dir: string }[] {
  const ws = requireWorkspace(cwd);
  const dir = packsDir(ws.omac);
  if (!existsSync(dir)) return [];
  const out: { manifest: KnowledgePackManifest; dir: string }[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name, "manifest.json");
    if (!jsonExists(p)) continue;
    try {
      out.push({ manifest: readJson<KnowledgePackManifest>(p), dir: join(dir, name) });
    } catch {
      // skip broken pack
    }
  }
  return out;
}

export function installPack(cwd: string, sourceDir: string): KnowledgePackManifest {
  const ws = requireWorkspace(cwd);
  const manifestPath = join(sourceDir, "manifest.json");
  if (!jsonExists(manifestPath)) {
    throw new OmacError("invalid_pack", `no manifest.json in ${sourceDir}`);
  }
  const manifest = readJson<KnowledgePackManifest>(manifestPath);
  if (!manifest.pack_id || !manifest.pack_version) {
    throw new OmacError("invalid_pack", "manifest must contain pack_id and pack_version");
  }
  const dest = join(packsDir(ws.omac), manifest.pack_id);
  const existing = installedPacks(cwd).find((p) => p.manifest.pack_id === manifest.pack_id);
  if (existing) {
    throw new OmacError("pack_exists", `pack ${manifest.pack_id} already installed at ${existing.dir}`);
  }
  copyDir(sourceDir, dest);
  return manifest;
}

function copyDir(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else copyFileSync(src, dst);
  }
}

export interface PrereqEntry {
  concept_id: string;
  prerequisites: string[];
}

export function prereqGraph(cwd: string): PrereqEntry[] {
  const out: PrereqEntry[] = [];
  for (const pack of installedPacks(cwd)) {
    const p = join(pack.dir, "prerequisites.json");
    if (!jsonExists(p)) continue;
    const data = readJson<{ concepts: PrereqEntry[] }>(p);
    if (Array.isArray(data.concepts)) out.push(...data.concepts);
  }
  return out;
}

export function prereqOf(cwd: string, conceptId: string): string[] {
  return prereqGraph(cwd).find((e) => e.concept_id === conceptId)?.prerequisites ?? [];
}
