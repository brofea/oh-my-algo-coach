import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageDir = join(root, "packages", "cli");

const generatedEntries = [
  join(packageDir, "skill"),
  join(packageDir, "knowledge"),
  join(packageDir, "LICENSE"),
];

function cleanGeneratedEntries() {
  for (const entry of generatedEntries) {
    rmSync(entry, { recursive: true, force: true });
  }
}

function prepare() {
  cleanGeneratedEntries();
  mkdirSync(join(packageDir, "skill"), { recursive: true });
  mkdirSync(join(packageDir, "knowledge"), { recursive: true });
  cpSync(join(root, "skill", "omac"), join(packageDir, "skill", "omac"), { recursive: true });
  cpSync(join(root, "knowledge", "packs"), join(packageDir, "knowledge", "packs"), { recursive: true });
  cpSync(join(root, "LICENSE"), join(packageDir, "LICENSE"));
  const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const skillManifestPath = join(packageDir, "skill", "omac", "manifest.json");
  const skillManifest = JSON.parse(readFileSync(skillManifestPath, "utf8"));
  writeFileSync(skillManifestPath, `${JSON.stringify({ ...skillManifest, version: packageJson.version }, null, 2)}\n`, "utf8");
}

const action = process.argv[2];
if (action === "prepare") {
  prepare();
} else if (action === "clean") {
  cleanGeneratedEntries();
} else {
  throw new Error("usage: node scripts/prepare-cli-package.mjs <prepare|clean>");
}

if (!existsSync(join(packageDir, "README.md"))) {
  throw new Error("packages/cli/README.md is required for the CLI package");
}
