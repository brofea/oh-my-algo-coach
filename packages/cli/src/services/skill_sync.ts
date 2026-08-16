import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { OmacError, uuid } from "../core/ids.js";
import { findWorkspace } from "../store/workspace.js";

export interface SkillManifest {
  schema_version: number;
  skill_id: string;
  version: string;
  protocol_version?: string;
  source?: {
    type?: string;
    repository?: string;
    path?: string;
  };
}

export interface SkillSyncResult {
  status: "installed" | "updated" | "unchanged";
  skill_id: string;
  version: string;
  path: string;
  previous_version?: string;
  backup_path?: string;
}

const SKILL_ID = "omac-coach";

function readManifest(dir: string): SkillManifest {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new OmacError("skill_invalid", `Skill manifest is missing at ${manifestPath}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new OmacError("skill_invalid", `Skill manifest is not valid JSON at ${manifestPath}: ${String(error)}`);
  }
  const manifest = raw as Partial<SkillManifest>;
  if (manifest.schema_version !== 1 || manifest.skill_id !== SKILL_ID || !manifest.version) {
    throw new OmacError("skill_invalid", `Skill manifest at ${manifestPath} must describe ${SKILL_ID} schema 1`);
  }
  if (!existsSync(join(dir, "SKILL.md"))) {
    throw new OmacError("skill_invalid", `Skill payload is missing SKILL.md at ${dir}`);
  }
  return manifest as SkillManifest;
}

function skillSourceDir(cwd: string): string {
  const override = process.env.OMAC_SKILL_SOURCE;
  const candidates = [
    override ? resolve(cwd, override) : undefined,
    join(import.meta.dirname, "..", "..", "skill", "omac"),
    join(import.meta.dirname, "..", "..", "..", "..", "skill", "omac"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "manifest.json")) && existsSync(join(candidate, "SKILL.md"))) {
      return candidate;
    }
  }
  throw new OmacError(
    "skill_unavailable",
    "bundled OMAC Skill was not found; install a release that includes skill/omac or set OMAC_SKILL_SOURCE"
  );
}

function projectRoot(cwd: string): string {
  return findWorkspace(cwd)?.root ?? cwd;
}

export function syncLocalSkill(cwd: string, opts: { force?: boolean } = {}): SkillSyncResult {
  const root = projectRoot(cwd);
  const sourceDir = skillSourceDir(root);
  const sourceManifest = readManifest(sourceDir);
  const skillRoot = join(root, ".agents", "skill");
  const targetDir = join(skillRoot, "omac");
  mkdirSync(skillRoot, { recursive: true });

  if (existsSync(targetDir)) {
    let currentManifest: SkillManifest | undefined;
    try {
      currentManifest = readManifest(targetDir);
    } catch (error) {
      if (!opts.force) {
        throw new OmacError(
          "skill_install_conflict",
          `refusing to overwrite existing non-OMAC Skill at ${targetDir}; use --force-skill only if this directory is disposable (${String(error)})`
        );
      }
    }
    if (currentManifest?.skill_id === sourceManifest.skill_id && currentManifest.version === sourceManifest.version) {
      return {
        status: "unchanged",
        skill_id: sourceManifest.skill_id,
        version: sourceManifest.version,
        path: targetDir,
      };
    }

    const stagingDir = join(skillRoot, `.omac-skill-staging-${uuid()}`);
    const backupDir = join(skillRoot, `.omac-skill-backup-${Date.now()}-${uuid()}`);
    let movedToBackup = false;
    let updated = false;
    try {
      cpSync(sourceDir, stagingDir, { recursive: true, force: true, errorOnExist: false });
      readManifest(stagingDir);
      renameSync(targetDir, backupDir);
      movedToBackup = true;
      renameSync(stagingDir, targetDir);
      updated = true;
      return {
        status: "updated",
        skill_id: sourceManifest.skill_id,
        version: sourceManifest.version,
        previous_version: currentManifest?.version,
        path: targetDir,
        backup_path: backupDir,
      };
    } catch (error) {
      if (movedToBackup && !existsSync(targetDir) && existsSync(backupDir)) {
        try {
          renameSync(backupDir, targetDir);
          movedToBackup = false;
        } catch {
          // Keep the backup directory in place so the failed update remains recoverable.
        }
      }
      throw error instanceof OmacError
        ? error
        : new OmacError("skill_install_failed", `failed to update Skill at ${targetDir}: ${String(error)}`);
    } finally {
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
      if (!updated && movedToBackup && existsSync(backupDir) && existsSync(targetDir)) {
        rmSync(backupDir, { recursive: true, force: true });
      }
    }
  }

  const stagingDir = join(skillRoot, `.omac-skill-staging-${uuid()}`);
  try {
    cpSync(sourceDir, stagingDir, { recursive: true, force: true, errorOnExist: false });
    readManifest(stagingDir);
    renameSync(stagingDir, targetDir);
  } catch (error) {
    throw error instanceof OmacError
      ? error
      : new OmacError("skill_install_failed", `failed to install Skill at ${targetDir}: ${String(error)}`);
  } finally {
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
  return {
    status: "installed",
    skill_id: sourceManifest.skill_id,
    version: sourceManifest.version,
    path: targetDir,
  };
}
