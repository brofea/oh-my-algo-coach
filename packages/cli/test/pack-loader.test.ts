import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup } from "./helpers.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function writePack(dir: string, packId: string, kind: string, files: Record<string, unknown>, manifestExtra: Record<string, unknown> = {}): string {
  const p = join(dir, packId);
  mkdirSync(p, { recursive: true });
  const contentFiles = Object.keys(files);
  writeFileSync(
    join(p, "manifest.json"),
    JSON.stringify({ pack_id: packId, pack_version: "2.1.0", schema_version: "1.0", name: packId, kind, source: { type: "test-fixture" }, license: { id: "MIT" }, content_files: contentFiles, ...manifestExtra })
  );
  for (const [rel, data] of Object.entries(files)) {
    const full = join(p, rel);
    mkdirSync(join(p, rel.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(full, JSON.stringify(data));
  }
  return p;
}

test("pack loader: five kinds install and are queryable via list/get", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-pack5"]);
    const targetPack = writePack(dir, "fixture.targets", "target", {
      "targets/custom-target.json": { target_id: "algo.custom-target", target_version: "1.0.0", name: "Custom Target", category: "algorithm", prerequisites: [], observable_behaviors: ["does x"], success_criteria: ["y"], failure_taxonomy: ["z"], required_evidence: ["observation.x"] },
    });
    const patternPack = writePack(dir, "fixture.patterns", "pattern", {
      "patterns/pattern-a.json": { pattern_id: "pattern.a", name: "Pattern A", candidate_techniques: ["algo.custom-target"], related_targets: ["algo.custom-target"], version: "1.0.0" },
    });
    const misPack = writePack(dir, "fixture.misconceptions", "misconception", {
      "misconceptions/mis-a.json": { misconceptions: [{ id: "mis.a", name: "Mis A", description: "desc", related_targets: [], suggested_interventions: [], version: "1.0.0" }] },
    });
    const pedPack = writePack(dir, "fixture.pedagogy", "pedagogy", {
      "pedagogy/ped-a.json": { pedagogy_id: "ped.a", name: "Ped A", description: "desc", version: "1.0.0" },
    });
    const algPack = writePack(dir, "fixture.algorithms", "algorithm", {
      "algorithms/alg-a.json": { algorithm_id: "algo.a", name: "Alg A", description: "desc", version: "1.0.0" },
    });
    for (const p of [targetPack, patternPack, misPack, pedPack, algPack]) {
      const r = omac(dir, ["pack", "install", p]);
      assert.equal(r.ok, true, r.stderr);
    }

    const patternGet = omac(dir, ["pattern", "get", "pattern.a"]);
    assert.equal(patternGet.ok, true, patternGet.stderr);
    const pOut = patternGet.stdout as { pattern: { pattern_id: string; version: string }; provenance: { pack_id: string; pack_version: string; license: { id: string } } };
    assert.equal(pOut.pattern.pattern_id, "pattern.a");
    assert.equal(pOut.provenance.pack_id, "fixture.patterns");
    assert.equal(pOut.provenance.pack_version, "2.1.0");
    assert.equal(pOut.provenance.license.id, "MIT");

    const misGet = omac(dir, ["misconception", "get", "mis.a"]);
    assert.equal(misGet.ok, true, misGet.stderr);

    const pedGet = omac(dir, ["pedagogy", "get", "ped.a"]);
    assert.equal(pedGet.ok, true, pedGet.stderr);

    const algGet = omac(dir, ["algorithm", "get", "algo.a"]);
    assert.equal(algGet.ok, true, algGet.stderr);

    const patList = omac(dir, ["pattern", "list"]);
    assert.equal((patList.stdout as { patterns: { id: string; pack_id: string; version: string }[] }).patterns.some((x) => x.id === "pattern.a" && x.pack_id === "fixture.patterns" && x.version === "1.0.0"), true);

    const missing = omac(dir, ["pattern", "get", "pattern.does-not-exist"]);
    assert.equal(missing.ok, false);
    assert.match(missing.stderr, /pattern_not_found/);
    assert.match(missing.stderr, /known patterns/);
  } finally {
    cleanup(dir);
  }
});

test("pack loader: installed target pack is visible to targets list and event validation", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-packtarget"]);
    const targetPack = writePack(dir, "fixture.targets2", "target", {
      "targets/algo.pack-visible.json": { target_id: "algo.pack-visible", target_version: "3.0.0", name: "Pack Visible Target", category: "algorithm", prerequisites: [], observable_behaviors: ["x"], success_criteria: ["y"], failure_taxonomy: ["z"], required_evidence: ["observation.x"] },
    });
    const inst = omac(dir, ["pack", "install", targetPack]);
    assert.equal(inst.ok, true, inst.stderr);

    const targets = omac(dir, ["targets"]);
    assert.equal(targets.ok, true, targets.stderr);
    const list = (targets.stdout as { targets: { target_id: string; version: string; pack_id?: string }[] }).targets;
    const custom = list.find((t) => t.target_id === "algo.pack-visible");
    assert.ok(custom, "installed target pack must appear in targets list");
    assert.equal(custom?.pack_id, "fixture.targets2");
    assert.equal(custom?.version, "3.0.0");

    const ev = omac(dir, ["event", "create", "--type", "practice", "--target-ids", "algo.pack-visible"]);
    assert.equal(ev.ok, true, `event create with pack target failed: ${ev.stderr}`);
  } finally {
    cleanup(dir);
  }
});

test("pack loader: install validates kind and content_files", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-packval"]);
    const badKind = join(dir, "bad-kind");
    mkdirSync(badKind, { recursive: true });
    writeFileSync(join(badKind, "manifest.json"), JSON.stringify({ pack_id: "bad.kind", pack_version: "1.0.0", name: "bad", kind: "mystery", content_files: [] }));
    const r1 = omac(dir, ["pack", "install", badKind]);
    assert.equal(r1.ok, false);
    assert.match(r1.stderr, /invalid_pack/);
    assert.match(r1.stderr, /kind/);

    const missingContent = join(dir, "missing-content");
    mkdirSync(missingContent, { recursive: true });
    writeFileSync(join(missingContent, "manifest.json"), JSON.stringify({ pack_id: "bad.content", pack_version: "1.0.0", name: "bad", kind: "pattern", content_files: ["patterns/nope.json"] }));
    const r2 = omac(dir, ["pack", "install", missingContent]);
    assert.equal(r2.ok, false);
    assert.match(r2.stderr, /content file missing/);
  } finally {
    cleanup(dir);
  }
});

test("pack loader: legacy flat manifest (license string) still installs and queries", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-legacy"]);
    const legacy = join(dir, "legacy-pack");
    mkdirSync(join(legacy, "patterns"), { recursive: true });
    writeFileSync(join(legacy, "manifest.json"), JSON.stringify({ pack_id: "legacy.patterns", pack_version: "1.0.0", name: "legacy", kind: "pattern", license: "MIT", content_files: [] }));
    writeFileSync(join(legacy, "patterns", "legacy-p.json"), JSON.stringify({ pattern_id: "pattern.legacy", name: "Legacy Pattern", version: "0.9.0" }));
    const inst = omac(dir, ["pack", "install", legacy]);
    assert.equal(inst.ok, true, inst.stderr);
    const list = omac(dir, ["pack", "list"]);
    const pack = (list.stdout as { packs: { pack_id: string; license: string }[] }).packs.find((x) => x.pack_id === "legacy.patterns");
    assert.equal(pack?.license, "MIT", "legacy string license must be preserved");
    const get = omac(dir, ["pattern", "get", "pattern.legacy"]);
    assert.equal(get.ok, true, get.stderr);
    assert.equal((get.stdout as { provenance: { license: { id: string } } }).provenance.license.id, "MIT");
  } finally {
    cleanup(dir);
  }
});
