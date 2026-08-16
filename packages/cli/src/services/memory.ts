import { join } from "node:path";
import { readJsonl, appendJsonl, readJson, writeJson, jsonExists, ensureDir } from "../store/jsonl.js";
import { requireWorkspace, omacPath } from "../store/workspace.js";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import {
  AlgorithmCard,
  KnowledgePackManifest,
  MisconceptionCard,
  PackCardRef,
  PackKind,
  PACK_KINDS,
  PackLicense,
  PackSource,
  PatternCard,
  PedagogyCard,
  TargetContract,
} from "../core/types.js";
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

export function builtinPacksDir(): string {
  const env = process.env.OMAC_BUILTIN_PACKS;
  if (env) return env;
  const candidates = [
    join(import.meta.dirname, "../../../..", "knowledge", "packs"),
    join(import.meta.dirname, "../../..", "knowledge", "packs"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

export function installedPacks(cwd: string): { manifest: KnowledgePackManifest; dir: string; builtin: boolean }[] {
  const ws = requireWorkspace(cwd);
  const installed = scanPacksDir(packsDir(ws.omac), false);
  const builtin = scanPacksDir(builtinPacksDir(), true);
  const byId = new Map<string, { manifest: KnowledgePackManifest; dir: string; builtin: boolean }>();
  for (const p of builtin) byId.set(p.manifest.pack_id, p);
  for (const p of installed) byId.set(p.manifest.pack_id, p);
  return [...byId.values()];
}

function scanPacksDir(dir: string, builtin: boolean): { manifest: KnowledgePackManifest; dir: string; builtin: boolean }[] {
  if (!existsSync(dir)) return [];
  const out: { manifest: KnowledgePackManifest; dir: string; builtin: boolean }[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name, "manifest.json");
    if (!jsonExists(p)) continue;
    try {
      out.push({ manifest: normalizeManifest(readJson<KnowledgePackManifest>(p)), dir: join(dir, name), builtin });
    } catch {
      // skip broken pack
    }
  }
  return out;
}

const KIND_DIR: Record<PackKind, string> = {
  algorithm: "algorithms",
  pattern: "patterns",
  misconception: "misconceptions",
  pedagogy: "pedagogy",
  target: "targets",
};

export function normalizeManifest(raw: KnowledgePackManifest): KnowledgePackManifest {
  const source: PackSource | undefined =
    raw.source ??
    (raw.source_type || raw.source_url || raw.retrieved_at
      ? { type: raw.source_type ?? "unknown", uri: raw.source_url, retrieved_at: raw.retrieved_at }
      : undefined);
  const license: string | PackLicense | undefined =
    typeof raw.license === "string" ? { id: raw.license } : raw.license;
  return { ...raw, source, license };
}

export function manifestLicense(m: KnowledgePackManifest): string | undefined {
  return typeof m.license === "string" ? m.license : m.license?.id;
}

export function validatePackManifest(cwd: string, sourceDir: string, raw: KnowledgePackManifest): KnowledgePackManifest {
  const m = normalizeManifest(raw);
  if (!m.pack_id || !m.pack_version) {
    throw new OmacError("invalid_pack", "manifest must contain pack_id and pack_version");
  }
  if (!PACK_KINDS.includes(m.kind)) {
    throw new OmacError("invalid_pack", `manifest kind '${m.kind}' is invalid; must be one of: ${PACK_KINDS.join(", ")}`);
  }
  if (!Array.isArray(m.content_files)) {
    throw new OmacError("invalid_pack", "manifest content_files must be an array of relative paths");
  }
  for (const f of m.content_files) {
    if (!existsSync(join(sourceDir, f))) {
      throw new OmacError("invalid_pack", `manifest content file missing: ${f}`);
    }
  }
  return m;
}

/**
 * Read every card of `kind` from all installed packs. Cards are located via
 * manifest.content_files (canonical) or the kind subdirectory (legacy packs).
 * Card shape may be a single object or a `{ <plural-kind>: [...] }` wrapper.
 */
export function loadPackCards<T extends object>(cwd: string, kind: PackKind): PackCardRef<T>[] {
  const refs: PackCardRef<T>[] = [];
  for (const pack of installedPacks(cwd)) {
    if (pack.manifest.kind !== kind) continue;
    const files = pack.manifest.content_files.length > 0
      ? pack.manifest.content_files
      : listDirFiles(join(pack.dir, KIND_DIR[kind])).map((f) => join(KIND_DIR[kind], f));
    for (const f of files) {
      const p = join(pack.dir, f);
      if (!jsonExists(p)) continue;
      try {
        const data = readJson<unknown>(p);
        const cards = toCardArray(data, KIND_DIR[kind].slice(0, -1));
        for (const card of cards) {
          if (card && typeof card === "object") {
            refs.push({
              card: card as T,
              card_file: f,
              pack_id: pack.manifest.pack_id,
              pack_version: pack.manifest.pack_version,
              schema_version: pack.manifest.schema_version,
              source: pack.manifest.source,
              license: typeof pack.manifest.license === "string" ? { id: pack.manifest.license } : pack.manifest.license,
            });
          }
        }
      } catch {
        // skip unparseable card file
      }
    }
  }
  return refs;
}

function toCardArray(data: unknown, singular: string): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((c) => c && typeof c === "object") as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const plural = `${singular}s`;
    const wrapped = (data as Record<string, unknown>)[plural];
    if (Array.isArray(wrapped)) return wrapped.filter((c) => c && typeof c === "object") as Record<string, unknown>[];
    return [data as Record<string, unknown>];
  }
  return [];
}

function listDirFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

export function listPatternCards(cwd: string): PackCardRef<PatternCard>[] {
  return loadPackCards<PatternCard>(cwd, "pattern");
}

export function getPatternCard(cwd: string, patternId: string): PackCardRef<PatternCard> {
  const refs = listPatternCards(cwd);
  const hit = refs.find((r) => r.card.pattern_id === patternId);
  if (!hit) {
    const known = refs.map((r) => r.card.pattern_id).join(", ") || "(none installed)";
    throw new OmacError("pattern_not_found", `pattern card '${patternId}' not found; known patterns: ${known}`);
  }
  return hit;
}

export function listMisconceptionCards(cwd: string): PackCardRef<MisconceptionCard>[] {
  return loadPackCards<MisconceptionCard>(cwd, "misconception").map((r) => ({
    ...r,
    card: { ...r.card, misconception_id: r.card.misconception_id ?? (r.card as unknown as { id?: string }).id },
  }));
}

export function getMisconceptionCard(cwd: string, misconceptionId: string): PackCardRef<MisconceptionCard> {
  const refs = listMisconceptionCards(cwd);
  const hit = refs.find((r) => r.card.misconception_id === misconceptionId);
  if (!hit) {
    const known = refs.map((r) => r.card.misconception_id).join(", ") || "(none installed)";
    throw new OmacError("misconception_not_found", `misconception card '${misconceptionId}' not found; known misconceptions: ${known}`);
  }
  return hit;
}

export function listPedagogyCards(cwd: string): PackCardRef<PedagogyCard>[] {
  return loadPackCards<PedagogyCard>(cwd, "pedagogy");
}

export function getPedagogyCard(cwd: string, pedagogyId: string): PackCardRef<PedagogyCard> {
  const refs = listPedagogyCards(cwd);
  const hit = refs.find((r) => r.card.pedagogy_id === pedagogyId);
  if (!hit) {
    const known = refs.map((r) => r.card.pedagogy_id).join(", ") || "(none installed)";
    throw new OmacError("pedagogy_not_found", `pedagogy card '${pedagogyId}' not found; known pedagogy: ${known}`);
  }
  return hit;
}

export function listAlgorithmCards(cwd: string): PackCardRef<AlgorithmCard>[] {
  return loadPackCards<AlgorithmCard>(cwd, "algorithm");
}

export function getAlgorithmCard(cwd: string, algorithmId: string): PackCardRef<AlgorithmCard> {
  const refs = listAlgorithmCards(cwd);
  const hit = refs.find((r) => r.card.algorithm_id === algorithmId);
  if (!hit) {
    const known = refs.map((r) => r.card.algorithm_id).join(", ") || "(none installed)";
    throw new OmacError("algorithm_not_found", `algorithm card '${algorithmId}' not found; known algorithms: ${known}`);
  }
  return hit;
}

export function listTargetPackCards(cwd: string): PackCardRef<TargetContract>[] {
  return loadPackCards<TargetContract>(cwd, "target");
}

export function installPack(cwd: string, sourceDir: string): KnowledgePackManifest {
  const ws = requireWorkspace(cwd);
  const manifestPath = join(sourceDir, "manifest.json");
  if (!jsonExists(manifestPath)) {
    throw new OmacError("invalid_pack", `no manifest.json in ${sourceDir}`);
  }
  const manifest = validatePackManifest(cwd, sourceDir, readJson<KnowledgePackManifest>(manifestPath));
  const dest = join(packsDir(ws.omac), manifest.pack_id);
  const existing = scanPacksDir(packsDir(ws.omac), false).find((p) => p.manifest.pack_id === manifest.pack_id);
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
