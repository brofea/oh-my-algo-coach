import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const bootstrap = join(root, "install", "cli-bootstrap.mjs");
const releaseManifest = join(root, "scripts", "create-cli-release-manifest.mjs");

function runNode(cwd, args, env) {
  return JSON.parse(execFileSync(process.execPath, [bootstrap, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }));
}

test("GitHub-style CLI asset bootstrap installs locally and runs init", () => {
  const dir = mkdtempSync(join(tmpdir(), "omac-bootstrap-test-"));
  const npmCache = join(dir, "npm-cache");
  try {
    execFileSync("npm", ["pack", "--workspace", "@omac/cli", "--pack-destination", dir], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NPM_CONFIG_CACHE: npmCache, npm_config_fund: "false", npm_config_audit: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const assetName = readdirSync(dir).find((name) => name.endsWith(".tgz"));
    assert.ok(assetName, "npm pack must produce a CLI tarball");
    const asset = join(dir, assetName);
    const manifest = join(dir, "manifest.json");
    execFileSync(process.execPath, [releaseManifest, "--asset", asset, "--version", "0.1", "--out", manifest], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const generatedManifest = JSON.parse(readFileSync(manifest, "utf8"));
    assert.equal(generatedManifest.version, "0.1.0");
    assert.match(generatedManifest.asset_url, /releases\/download\/v0\.1\//);
    generatedManifest.asset_url = asset;
    writeFileSync(manifest, JSON.stringify(generatedManifest));

    const env = { NPM_CONFIG_CACHE: npmCache, npm_config_fund: "false", npm_config_audit: "false" };
    const installed = runNode(dir, ["install", "--root", dir, "--manifest", manifest, "--asset", asset], env);
    assert.equal(installed.status, "installed");
    assert.equal(installed.current.package_name, "@omac/cli");
    assert.equal(runNode(dir, ["status"], env).installed, true);

    const initialized = runNode(dir, ["run", "init", "--learner-id", "bootstrap-test"], env);
    assert.equal(initialized.learner_id, "bootstrap-test");
    assert.equal(initialized.skill.status, "installed");
    const targets = runNode(dir, ["run", "targets"], env);
    assert.ok(targets.targets.some((target) => target.target_id === "algo.dp"));

    const repeated = runNode(dir, ["run", "init", "--learner-id", "bootstrap-test"], env);
    assert.equal(repeated.skill.status, "unchanged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
