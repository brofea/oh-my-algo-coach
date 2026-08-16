import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { omac, makeWorkspace, cleanup } from "./helpers.js";

test("init installs the bundled OMAC Skill into the repository-local .agents/skill directory", () => {
  const dir = makeWorkspace();
  try {
    const first = omac(dir, ["init", "--learner-id", "ln-skill-install"]);
    assert.equal(first.ok, true, first.stderr);
    const skill = (first.stdout as { skill: { status: string; version: string; path: string } }).skill;
    assert.equal(skill.status, "installed");
    assert.equal(skill.version, "0.1.0");
    assert.equal(realpathSync(skill.path), realpathSync(join(dir, ".agents", "skill", "omac")));
    assert.ok(existsSync(join(dir, ".agents", "skill", "omac", "SKILL.md")));
    assert.equal(JSON.parse(readFileSync(join(skill.path, "manifest.json"), "utf8")).skill_id, "omac-coach");
    assert.ok(existsSync(join(dir, ".omac", "config", "workspace.json")));
  } finally {
    cleanup(dir);
  }
});

test("init is idempotent for the repository-local Skill and does not create global paths", () => {
  const dir = makeWorkspace();
  try {
    const first = omac(dir, ["init", "--learner-id", "ln-skill-idempotent"]);
    assert.equal(first.ok, true, first.stderr);
    const second = omac(dir, ["init", "--learner-id", "ln-skill-idempotent"]);
    assert.equal(second.ok, true, second.stderr);
    assert.equal((second.stdout as { skill: { status: string } }).skill.status, "unchanged");
    assert.equal(existsSync(join(dir, ".agents", "skill", ".omac-skill-backup")), false);
    assert.equal(existsSync(join(dir, ".agents", "skill", "omac", "SKILL.md")), true);
  } finally {
    cleanup(dir);
  }
});

test("init refuses to overwrite an unmanaged repository-local Skill without --force-skill", () => {
  const dir = makeWorkspace();
  try {
    mkdirSync(join(dir, ".agents", "skill", "omac"), { recursive: true });
    writeFileSync(join(dir, ".agents", "skill", "omac", "SKILL.md"), "user-owned skill\n");
    const rejected = omac(dir, ["init", "--learner-id", "ln-skill-conflict"]);
    assert.equal(rejected.ok, false);
    assert.match(rejected.stderr, /skill_install_conflict/);
    assert.equal(existsSync(join(dir, ".omac")), false, "failed skill sync must not initialize the workspace");

    const forced = omac(dir, ["init", "--learner-id", "ln-skill-conflict", "--force-skill"]);
    assert.equal(forced.ok, true, forced.stderr);
    assert.equal((forced.stdout as { skill: { status: string } }).skill.status, "updated");
    assert.ok(existsSync(join(dir, ".agents", "skill", "omac", "manifest.json")));
  } finally {
    cleanup(dir);
  }
});
