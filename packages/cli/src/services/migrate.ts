import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_VERSION, ONTOLOGY_VERSION, WorkspaceConfig } from "../core/types.js";
import { requireWorkspace, readWorkspaceConfig, writeWorkspaceConfig } from "../store/workspace.js";
import { OmacError } from "../core/ids.js";

const MIGRATIONS: { from: string; to: string; apply: (cfg: WorkspaceConfig) => WorkspaceConfig }[] = [];

export function migrateWorkspace(cwd: string, targetVersion?: string): { from: string; to: string; applied: string[] } {
  const ws = requireWorkspace(cwd);
  const cfg = readWorkspaceConfig(cwd);
  const from = cfg.schema_version;
  const to = targetVersion ?? SCHEMA_VERSION;
  if (from === to) return { from, to, applied: [] };
  const applied: string[] = [];
  let current = from;
  let loopGuard = 0;
  while (current !== to && loopGuard < 10) {
    const migration = MIGRATIONS.find((m) => m.from === current && (to === SCHEMA_VERSION || m.to !== to));
    if (!migration) {
      throw new OmacError("migration_path", `no migration path from schema ${current} to ${to}`);
    }
    migration.apply(cfg);
    current = migration.to;
    applied.push(`${migration.from} -> ${migration.to}`);
    loopGuard++;
  }
  cfg.schema_version = current;
  cfg.config_version = (cfg.config_version ?? 1) + 1;
  writeWorkspaceConfig(cwd, cfg);
  const metadataPath = join(ws.omac, "runtime", "metadata.json");
  const meta = JSON.parse(readFileSync(metadataPath, "utf8"));
  meta.schema_version = current;
  meta.ontology_version = ONTOLOGY_VERSION;
  writeFileSync(metadataPath, JSON.stringify(meta, null, 2));
  return { from, to: current, applied };
}

export function currentSchemaVersion(): string {
  return SCHEMA_VERSION;
}
