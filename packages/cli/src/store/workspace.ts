import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import { SCHEMA_VERSION, ONTOLOGY_VERSION, WorkspaceConfig } from "../core/types.js";
import { assertSchemaVersion } from "../core/schema.js";

export const OMAC_DIR = ".omac";
export const DIRS = [
  "config",
  "learner/profile",
  "learner/state",
  "learner/views",
  "event",
  "event/archive",
  "event/index",
  "evidence",
  "claims",
  "knowledge",
  "artifact",
  "report",
  "import",
  "runtime",
] as const;

export function workspacePath(cwd: string): string {
  return join(cwd, OMAC_DIR);
}

export function findWorkspace(startDir: string): { root: string; omac: string } | null {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(dir, OMAC_DIR, "config", "workspace.json"))) {
      return { root: dir, omac: join(dir, OMAC_DIR) };
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function requireWorkspace(cwd: string): { root: string; omac: string } {
  const ws = findWorkspace(cwd);
  if (!ws) {
    throw new OmacError(
      "no_workspace",
      "no .omac workspace found in this or any parent directory; run 'omac init' first"
    );
  }
  return ws;
}

export function initWorkspace(cwd: string, opts: { learnerId?: string; saveConversation?: boolean }): WorkspaceConfig {
  const omac = workspacePath(cwd);
  if (existsSync(omac)) {
    const existing = readWorkspaceConfig(cwd);
    return existing;
  }
  mkdirSync(omac, { recursive: true });
  for (const d of DIRS) mkdirSync(join(omac, d), { recursive: true });
  const config: WorkspaceConfig = {
    schema_version: SCHEMA_VERSION,
    ontology_version: ONTOLOGY_VERSION,
    workspace_id: `ws-${uuid().slice(0, 12)}`,
    learner_id: opts.learnerId,
    created_at: nowIso(),
    save_conversation: opts.saveConversation ?? false,
    config_version: 1,
  };
  writeFileSync(join(omac, "config", "workspace.json"), JSON.stringify(config, null, 2));
  writeFileSync(
    join(omac, "runtime", "metadata.json"),
    JSON.stringify({ schema_version: SCHEMA_VERSION, ontology_version: ONTOLOGY_VERSION, integrity: "ok" }, null, 2)
  );
  return config;
}

export function readWorkspaceConfig(cwd: string): WorkspaceConfig {
  const ws = requireWorkspace(cwd);
  const p = join(ws.omac, "config", "workspace.json");
  if (!existsSync(p)) {
    throw new OmacError("corrupt_workspace", "workspace.json missing; run 'omac doctor'");
  }
  const cfg = JSON.parse(readFileSync(p, "utf8")) as WorkspaceConfig;
  assertSchemaVersion(cfg.schema_version);
  return cfg;
}

export function readWorkspaceConfigLoose(cwd: string): WorkspaceConfig {
  const ws = requireWorkspace(cwd);
  const p = join(ws.omac, "config", "workspace.json");
  if (!existsSync(p)) {
    throw new OmacError("corrupt_workspace", "workspace.json missing; run 'omac doctor'");
  }
  const cfg = JSON.parse(readFileSync(p, "utf8")) as WorkspaceConfig;
  if (!cfg.schema_version) {
    throw new OmacError("corrupt_workspace", "workspace.json missing schema_version; run 'omac migrate'");
  }
  return cfg;
}

export function writeWorkspaceConfig(cwd: string, cfg: WorkspaceConfig): void {
  const ws = requireWorkspace(cwd);
  writeFileSync(join(ws.omac, "config", "workspace.json"), JSON.stringify(cfg, null, 2));
}

export function setLearnerId(cwd: string, learnerId: string): WorkspaceConfig {
  const cfg = readWorkspaceConfig(cwd);
  cfg.learner_id = learnerId;
  writeWorkspaceConfig(cwd, cfg);
  return cfg;
}

export function omacPath(cwd: string, ...parts: string[]): string {
  const ws = requireWorkspace(cwd);
  return join(ws.omac, ...parts);
}

export const WARNING_TEXT =
  "WARNING: .omac may contain sensitive learning data (weaknesses, code, conversations, account info). Do NOT upload it to public repositories. Credentials/tokens/API keys must never be stored inside .omac.";
