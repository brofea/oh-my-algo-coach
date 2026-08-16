#!/usr/bin/env node
// Static quality checks for the OMAC repo (no external deps).
// 1. All knowledge pack manifests under knowledge/packs/ must satisfy the
//    canonical Pack schema (kind, schema_version, content_files exist).
// 2. No console.log / process.stdout debugging statements in src (dist is built).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_KINDS = ["algorithm", "pattern", "misconception", "pedagogy", "target"];
const problems = [];
let packsChecked = 0;

function checkPacks() {
  const packsDir = join(root, "knowledge", "packs");
  if (!existsSync(packsDir)) return;
  for (const name of readdirSync(packsDir)) {
    const dir = join(packsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) {
      problems.push(`pack ${name}: missing manifest.json`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!manifest.pack_id) problems.push(`pack ${name}: missing pack_id`);
    if (!manifest.pack_version) problems.push(`pack ${name}: missing pack_version`);
    if (!manifest.schema_version) problems.push(`pack ${name}: missing schema_version`);
    if (!PACK_KINDS.includes(manifest.kind)) problems.push(`pack ${name}: invalid kind '${manifest.kind}'`);
    if (!Array.isArray(manifest.content_files)) {
      problems.push(`pack ${name}: content_files must be an array`);
    } else {
      for (const f of manifest.content_files) {
        if (!existsSync(join(dir, f))) problems.push(`pack ${name}: content file missing: ${f}`);
      }
    }
    packsChecked++;
  }
}

function checkSrc() {
  const srcDir = join(root, "packages", "cli", "src");
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!p.endsWith(".ts")) continue;
      const src = readFileSync(p, "utf8");
      if (/console\.(log|debug)\(/.test(src)) {
        problems.push(`src file ${p.replace(root + "/", "")} contains console.log/debug`);
      }
    }
  };
  if (existsSync(srcDir)) walk(srcDir);
}

checkPacks();
checkSrc();

if (problems.length > 0) {
  for (const p of problems) console.error(`lint: ${p}`);
  process.exit(1);
}
console.log(`lint: ok (${packsChecked} packs, no stray console statements)`);
