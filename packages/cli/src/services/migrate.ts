import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_VERSION, ONTOLOGY_VERSION, WorkspaceConfig } from "../core/types.js";
import { requireWorkspace, readWorkspaceConfigLoose, writeWorkspaceConfig } from "../store/workspace.js";
import { OmacError, nowIso } from "../core/ids.js";
import { readJson, readJsonl, appendJsonl, jsonExists } from "../store/jsonl.js";
import { integrityCheck } from "./doctor.js";

interface MigrationStep {
  from: string;
  to: string;
  apply: (cwd: string) => void;
}

type BackupEntry = { file: string; content: string; existed: boolean };

function snapshotMigrationTargets(cwd: string): BackupEntry[] {
  const ws = requireWorkspace(cwd);
  const out: BackupEntry[] = [];
  const collect = (root: string) => {
    if (!existsSync(root)) return;
    for (const name of readdirSync(root)) {
      const p = join(root, name, "event.json");
      if (!jsonExists(p)) continue;
      out.push({ file: p, content: readFileSync(p, "utf8"), existed: true });
    }
  };
  collect(join(ws.omac, "event"));
  collect(join(ws.omac, "event", "archive"));
  const idxFile = join(ws.omac, "event", "index", "index.jsonl");
  if (existsSync(idxFile)) {
    out.push({ file: idxFile, content: readFileSync(idxFile, "utf8"), existed: true });
  }
  return out;
}

function restoreBackup(backup: BackupEntry[]): void {
  for (const b of backup) {
    if (b.existed) {
      mkdirSync(b.file.split("/").slice(0, -1).join("/"), { recursive: true });
      writeFileSync(b.file, b.content, "utf8");
    }
  }
}

function stampEventSchemaVersion(cwd: string): number {
  const ws = requireWorkspace(cwd);
  let stamped = 0;
  const roots = [join(ws.omac, "event"), join(ws.omac, "event", "archive")];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const p = join(root, name, "event.json");
      if (!jsonExists(p)) continue;
      try {
        const rec = readJson<{ schema_version?: string; updated_at?: string }>(p);
        if (!rec.schema_version || rec.schema_version !== SCHEMA_VERSION) {
          const updated = { ...rec, schema_version: SCHEMA_VERSION, updated_at: rec.updated_at ?? nowIso() };
          writeFileSync(p, JSON.stringify(updated, null, 2));
          stamped++;
        }
      } catch {
        // leave unparseable events untouched; integrity check will report them
      }
    }
  }
  return stamped;
}

function backfillEventIndex(cwd: string): number {
  const ws = requireWorkspace(cwd);
  const idxFile = join(ws.omac, "event", "index", "index.jsonl");
  const idx = existsSync(idxFile) ? readJsonl<{ event_id: string; archived?: boolean }>(idxFile) : [];
  const known = new Set(idx.map((e) => e.event_id));
  const archiveDir = join(ws.omac, "event", "archive");
  let added = 0;
  if (existsSync(archiveDir)) {
    for (const name of readdirSync(archiveDir)) {
      const p = join(archiveDir, name, "event.json");
      if (!jsonExists(p) || known.has(name)) continue;
      const rec = readJson<{ event_type?: string; status?: string; started_at?: string; ended_at?: string }>(p);
      appendJsonl(idxFile, {
        event_id: name,
        event_type: rec.event_type ?? "practice",
        status: rec.status ?? "closed",
        started_at: rec.started_at,
        ended_at: rec.ended_at,
        archived: true,
      });
      known.add(name);
      added++;
    }
  }
  return added;
}

const MIGRATIONS: MigrationStep[] = [
  {
    from: "0.9.0",
    to: "1.0.0",
    apply(cwd) {
      stampEventSchemaVersion(cwd);
      backfillEventIndex(cwd);
    },
  },
];

export function migrateWorkspace(cwd: string, targetVersion?: string): { from: string; to: string; applied: string[] } {
  const ws = requireWorkspace(cwd);
  const cfg = readWorkspaceConfigLoose(cwd);
  const from = cfg.schema_version;
  const to = targetVersion ?? SCHEMA_VERSION;
  if (from === to) return { from, to, applied: [] };
  const applied: string[] = [];
  let current = from;
  let loopGuard = 0;
  const backup = snapshotMigrationTargets(cwd);
  while (current !== to && loopGuard < 10) {
    const migration = MIGRATIONS.find((m) => m.from === current);
    if (!migration) {
      throw new OmacError("migration_path", `no migration path from schema ${current} to ${to}`);
    }
    try {
      migration.apply(cwd);
    } catch (e) {
      restoreBackup(backup);
      throw new OmacError(
        "migration_failed",
        `migration ${migration.from} -> ${migration.to} failed and was rolled back; original data preserved. reason: ${(e as Error).message}`
      );
    }
    current = migration.to;
    applied.push(`${migration.from} -> ${migration.to}`);
    loopGuard++;
  }
  const next: WorkspaceConfig = {
    ...cfg,
    schema_version: current,
    config_version: (cfg.config_version ?? 1) + 1,
  };
  const configPath = join(ws.omac, "config", "workspace.json");
  const tmp = `${configPath}.migrate-${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, configPath);
  const metadataPath = join(ws.omac, "runtime", "metadata.json");
  const meta = jsonExists(metadataPath) ? JSON.parse(readFileSync(metadataPath, "utf8")) : {};
  writeFileSync(metadataPath, JSON.stringify({ ...meta, schema_version: current, ontology_version: ONTOLOGY_VERSION }, null, 2));
  const integrity = integrityCheck(cwd);
  if (!integrity.ok) {
    throw new OmacError("migration_integrity", `post-migration integrity check failed; run 'omac doctor'. issues: ${integrity.issues.map((i) => i.message).join("; ")}`);
  }
  return { from, to: current, applied };
}

export function currentSchemaVersion(): string {
  return SCHEMA_VERSION;
}
