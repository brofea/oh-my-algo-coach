import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, appendEvidence, setBoundary } from "./helpers.js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

test("M1: migrate upgrades a legacy 0.9.0 fixture, stamps events and backfills index", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-mig"]);
    const cfgPath = join(dir, ".omac", "config", "workspace.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.schema_version = "0.9.0";
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    const metaPath = join(dir, ".omac", "runtime", "metadata.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    meta.schema_version = "0.9.0";
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    const archivedDir = join(dir, ".omac", "event", "archive", "ev-legacy-1");
    mkdirSync(archivedDir, { recursive: true });
    writeFileSync(
      join(archivedDir, "event.json"),
      JSON.stringify({ id: "ev-legacy-1", event_type: "practice", workspace_id: "ws-x", learner_id: "ln-mig", target_ids: ["algo.dp"], mode: "practice", status: "closed", provenance: "legacy", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" })
    );

    const before = omac(dir, ["doctor"]);
    assert.equal((before.stdout as { integrity: { ok: boolean } }).integrity.ok, false, "old schema must fail doctor until migration");

    const r = omac(dir, ["migrate"]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { from: string; to: string; applied: string[] };
    assert.equal(out.from, "0.9.0");
    assert.equal(out.to, "1.0.0");
    assert.deepEqual(out.applied, ["0.9.0 -> 1.0.0"]);

    const cfg2 = JSON.parse(readFileSync(cfgPath, "utf8"));
    assert.equal(cfg2.schema_version, "1.0.0");
    assert.equal(cfg2.config_version, 2, "config_version must bump on migration");
    const stamped = JSON.parse(readFileSync(join(archivedDir, "event.json"), "utf8"));
    assert.equal(stamped.schema_version, "1.0.0", "legacy event must be stamped");
    const idx = readFileSync(join(dir, ".omac", "event", "index", "index.jsonl"), "utf8");
    assert.match(idx, /ev-legacy-1/);
    assert.match(idx, /"archived":true/);
    const meta2 = JSON.parse(readFileSync(metaPath, "utf8"));
    assert.equal(meta2.schema_version, "1.0.0");

    const idempotent = omac(dir, ["migrate"]);
    assert.equal(idempotent.ok, true, idempotent.stderr);
    assert.deepEqual((idempotent.stdout as { applied: string[] }).applied, []);
  } finally {
    cleanup(dir);
  }
});

test("M2: migration failure preserves original workspace and reports from/to/reason", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-mig2"]);
    const cfgPath = join(dir, ".omac", "config", "workspace.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.schema_version = "0.5.0";
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    const r = omac(dir, ["migrate"]);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /migration_path/);
    const cfg2 = JSON.parse(readFileSync(cfgPath, "utf8"));
    assert.equal(cfg2.schema_version, "0.5.0", "failed migration must not rewrite config");
  } finally {
    cleanup(dir);
  }
});

test("M3: export/import preserves archived events, index, artifacts and state; reject on conflict", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-io2"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const e1 = appendEvidence(dir, evId, "evidence one", "op-io2-1");
    const bnd = setBoundary(dir, evId, "algo.dp");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "independent", "--confidence", "0.8", "--evidence-ids", e1, "--boundary-id", bnd]);
    omac(dir, ["event", "close", "--event-id", evId]);
    const artPath = join(dir, "submission.cpp");
    writeFileSync(artPath, "int main(){}");
    const art = omac(dir, ["artifact", "add", "--event-id", evId, "--file", artPath, "--kind", "code"]);
    assert.equal(art.ok, true, art.stderr);
    omac(dir, ["rebuild"]);

    const exp = omac(dir, ["export", "--learner-id", "ln-io2", "--out", join(dir, "pkg")]);
    assert.equal(exp.ok, true, exp.stderr);
    assert.ok(existsSync(join(dir, "pkg", "event-extra.jsonl")));
    assert.ok(existsSync(join(dir, "pkg", "artifacts.jsonl")));
    assert.ok(existsSync(join(dir, "pkg", "views.jsonl")));

    const dir2 = makeWorkspace();
    try {
      omac(dir2, ["init", "--learner-id", "ln-io2-other"]);
      const imp = omac(dir2, ["import", join(dir, "pkg"), "--strategy", "new-learner"]);
      assert.equal(imp.ok, true, imp.stderr);
      const imported = imp.stdout as { imported: { events: number; archived: number; artifacts: number; learner_id: string }; integrity: { ok: boolean } };
      assert.equal(imported.imported.events, 1);
      assert.equal(imported.imported.archived, 1, "closed event must restore to archive");
      assert.equal(imported.imported.artifacts, 1);
      assert.equal(imported.integrity.ok, true, JSON.stringify(imported.integrity));
      const archivedEv = readFileSync(join(dir2, ".omac", "event", "archive", evId, "event.json"), "utf8");
      assert.ok(archivedEv.includes(evId));
      assert.ok(existsSync(join(dir2, ".omac", "event", "archive", evId, "boundary.json")), "boundary snapshot must be restored");
      assert.ok(existsSync(join(dir2, ".omac", "artifact", evId, "submission.cpp")), "artifact file must be restored");
      const idx = readFileSync(join(dir2, ".omac", "event", "index", "index.jsonl"), "utf8");
      assert.match(idx, new RegExp(evId));
      const list = omac(dir2, ["event", "list"]);
      assert.ok((list.stdout as { archived: { event_id: string }[] }).archived.some((e) => e.event_id === evId));
      const view2 = omac(dir2, ["learner", "view", "get", "--learner-id", imported.imported.learner_id]);
      assert.equal(view2.ok, true, view2.stderr);
      const abilities = (view2.stdout as { view: { abilities: Record<string, { status: string }> } }).view.abilities;
      assert.equal(abilities["algo.dp"].status, "independent");
    } finally {
      cleanup(dir2);
    }
  } finally {
    cleanup(dir);
  }
});

test("M4: import conflict strategy — reject refuses duplicates, merge skips them", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-cf"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    const exp = omac(dir, ["export", "--learner-id", "ln-cf", "--out", join(dir, "pkg2")]);
    assert.equal(exp.ok, true, exp.stderr);
    const reject = omac(dir, ["import", join(dir, "pkg2"), "--strategy", "reject"]);
    assert.equal(reject.ok, false);
    assert.match(reject.stderr, /import_conflict|duplicate/);
    const merge = omac(dir, ["import", join(dir, "pkg2"), "--strategy", "merge"]);
    assert.equal(merge.ok, true, merge.stderr);
    const m = merge.stdout as { integrity: { ok: boolean } };
    assert.equal(m.integrity.ok, true);
  } finally {
    cleanup(dir);
  }
});

test("M5: purge removes artifacts, subflows, retention and learn-paths; integrity stays ok", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-pg"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const artPath = join(dir, "code.py");
    writeFileSync(artPath, "print(1)");
    const art = omac(dir, ["artifact", "add", "--event-id", evId, "--file", artPath, "--kind", "code"]);
    assert.equal(art.ok, true, art.stderr);
    omac(dir, ["subflow", "add", "--event-id", evId, "--kind", "debug", "--wa-types", "WA1"]);
    omac(dir, ["learn", "path", "add", "--event-id", evId, "--path", "why,concrete-problem"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "success"]);
    omac(dir, ["problem", "status", "cf:2065A", "--status", "solved", "--event-id", evId]);
    omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    omac(dir, ["rebuild"]);
    const profileDir = join(dir, ".omac", "learner", "profile");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, "ln-pg.json"), JSON.stringify({ learner_id: "ln-pg" }));
    const contestArtPath = join(dir, "contest-art.json");
    writeFileSync(contestArtPath, JSON.stringify({ contest: { id: "abc389", platform: "atcoder" }, problems: [{ problem_ref: "abc389:A", rating: 400, opened_minutes: 0, submissions: [{ minutes_used: 12, verdict: "AC" }] }] }));
    const contestImport = omac(dir, ["contest", "import", "--artifact", contestArtPath]);
    assert.equal(contestImport.ok, true, contestImport.stderr);
    const contestEvId = (omac(dir, ["event", "create", "--type", "contest", "--artifact", contestArtPath, "--confirm-ended", "--contest-ref", "abc389", "--target-ids", "algo.dp"]).stdout as { event_id: string }).event_id;
    omac(dir, ["event", "close", "--event-id", contestEvId]);

    const noConfirm = omac(dir, ["learner", "purge", "--learner-id", "ln-pg"]);
    assert.equal(noConfirm.ok, false);
    assert.match(noConfirm.stderr, /--confirm/);

    const r = omac(dir, ["learner", "purge", "--learner-id", "ln-pg", "--confirm"]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { integrity: { ok: boolean } };
    assert.equal(out.integrity.ok, true, "purge must leave a healthy workspace");

    const evDir = join(dir, ".omac", "event", evId);
    const archiveDir = join(dir, ".omac", "event", "archive", evId);
    assert.ok(!existsSync(evDir), "working event dir must be gone");
    assert.ok(!existsSync(archiveDir), "archived event dir must be gone");
    const idx = readFileSync(join(dir, ".omac", "event", "index", "index.jsonl"), "utf8");
    assert.ok(!idx.includes(evId), "index entry must be gone");
    const subflows = readFileSync(join(dir, ".omac", "event", "subflows.jsonl"), "utf8");
    assert.ok(!subflows.includes(evId), "subflows must be gone");
    const retention = readFileSync(join(dir, ".omac", "learner", "state", "retention.jsonl"), "utf8");
    assert.equal(retention.trim(), "", "retention must be cleared");
    const learnPaths = readFileSync(join(dir, ".omac", "learner", "state", "learn-paths.jsonl"), "utf8");
    assert.ok(!learnPaths.includes(evId), "learn paths must be gone");
    const artifacts = readFileSync(join(dir, ".omac", "artifact", "index.jsonl"), "utf8");
    assert.ok(!artifacts.includes("code.py") && !artifacts.includes(evId), "artifact index must be gone");
    assert.ok(!existsSync(join(dir, ".omac", "artifact", evId, "code.py")), "artifact file must be gone");
    const problemStatus = readFileSync(join(dir, ".omac", "learner", "state", "problem-status.jsonl"), "utf8");
    assert.ok(!problemStatus.includes(evId), "problem status records must be gone");
    assert.ok(!existsSync(join(dir, ".omac", "report", `event-${evId}.md`)), "event report must be gone");
    assert.ok(!existsSync(join(profileDir, "ln-pg.json")), "learner profile must be gone");
    assert.ok(!existsSync(join(dir, ".omac", "artifact", "contest", "abc389.json")), "contest import artifact must be gone");
  } finally {
    cleanup(dir);
  }
});

test("M6: rebuild with unknown claim-set id fails explicitly", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-rs"]);
    const r = omac(dir, ["rebuild", "--claim-set", "clm-does-not-exist"]);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /claim_set_error/);
    assert.match(r.stderr, /clm-does-not-exist/);
  } finally {
    cleanup(dir);
  }
});
