import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent } from "./helpers.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function makePack(dir: string, packId: string): string {
  const p = join(dir, packId);
  mkdirSync(join(p, "patterns"), { recursive: true });
  writeFileSync(join(p, "manifest.json"), JSON.stringify({ pack_id: packId, pack_version: "1.0.0", name: packId, kind: "algorithm", license: "MIT", content_files: [] }));
  writeFileSync(join(p, "prerequisites.json"), JSON.stringify({ concepts: [{ concept_id: "algo.segment-tree", prerequisites: ["algo.binary-search.basic", "data-structure.array"] }] }));
  writeFileSync(join(p, "patterns", "p.json"), JSON.stringify({ pattern_id: "p1" }));
  return p;
}

test("V2.1: knowledge pack install/list/prereq", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-pack"]);
    const packDir = makePack(dir, "omac.ds.segment-tree");
    const r = omac(dir, ["pack", "install", packDir]);
    assert.equal(r.ok, true, r.stderr);
    const dup = omac(dir, ["pack", "install", packDir]);
    assert.equal(dup.ok, false);
    assert.match(dup.stderr, /already installed/);
    const list = omac(dir, ["pack", "list"]);
    const packs = (list.stdout as { packs: { pack_id: string }[] }).packs;
    assert.equal(packs.length, 1);
    assert.equal(packs[0].pack_id, "omac.ds.segment-tree");
    const prereq = omac(dir, ["pack", "prereq", "algo.segment-tree"]);
    const p = prereq.stdout as { prerequisites: string[] };
    assert.deepEqual(p.prerequisites, ["algo.binary-search.basic", "data-structure.array"]);
  } finally {
    cleanup(dir);
  }
});

test("V2.2: learn path recording validates top-down steps", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-path"]);
    const evId = newEvent(dir, "learn", ["--target-ids", "algo.dp"]);
    const ok = omac(dir, ["learn", "path", "add", "--event-id", evId, "--path", "why,concrete-problem,core-intuition,example,abstraction,formal-algorithm,implementation,recognition,transfer"]);
    assert.equal(ok.ok, true, ok.stderr);
    const bad = omac(dir, ["learn", "path", "add", "--event-id", evId, "--path", "why,made-up-step"]);
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /unknown learn path step/);
    const list = omac(dir, ["learn", "path", "list", "--event-id", evId]);
    assert.equal((list.stdout as { learn_paths: unknown[] }).learn_paths.length, 1);
  } finally {
    cleanup(dir);
  }
});

test("V2.3: retention schedule is deterministic and recall updates strength", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-ret"]);
    const evId = newEvent(dir, "learn", ["--target-ids", "algo.dp"]);
    const r1 = omac(dir, ["retention", "recall", "algo.dp", "--result", "success", "--event-id", evId]);
    assert.equal(r1.ok, true, r1.stderr);
    const out1 = r1.stdout as { recall_strength: number; window_days: number };
    assert.ok(out1.recall_strength > 0);
    const r2 = omac(dir, ["retention", "recall", "algo.dp", "--result", "fail"]);
    const out2 = r2.stdout as { recall_strength: number };
    assert.ok(out2.recall_strength < out1.recall_strength, "fail must lower strength");
    const sched = omac(dir, ["retention", "schedule", "algo.dp"]);
    const s = sched.stdout as { review_count: number; history: { result: string }[] };
    assert.equal(s.review_count, 2);
    assert.deepEqual(s.history.map((h) => h.result), ["success", "fail"]);
    const list = omac(dir, ["retention", "list"]);
    const rows = (list.stdout as { retention: unknown[] }).retention;
    assert.equal(rows.length, 1);
  } finally {
    cleanup(dir);
  }
});

test("V2.4: retention due-only filtering works", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-due"]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "success"]);
    const all = omac(dir, ["retention", "list"]);
    assert.equal((all.stdout as { retention: unknown[] }).retention.length, 1);
    const due = omac(dir, ["retention", "list", "--due-only"]);
    assert.equal((due.stdout as { retention: unknown[] }).retention.length, 0, "fresh recall should not be due");
  } finally {
    cleanup(dir);
  }
});

test("V2.5: immediate vs delayed gap detection", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-gap"]);
    omac(dir, ["retention", "recall", "algo.binary-search", "--result", "success", "--form", "recall"]);
    omac(dir, ["retention", "recall", "algo.binary-search", "--result", "fail", "--form", "recall"]);
    const gaps = omac(dir, ["retention", "gaps", "--min-delay-days", "0"]);
    const g = (gaps.stdout as { gaps: { concept_id: string; immediate_vs_delayed: string }[] }).gaps;
    const entry = g.find((x) => x.concept_id === "algo.binary-search");
    assert.equal(entry?.immediate_vs_delayed, "forgotten");
  } finally {
    cleanup(dir);
  }
});

test("V2.6: curriculum candidates from retention and learner view", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-curr"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "assisted", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "fail"]);
    const curr = omac(dir, ["curriculum"]);
    assert.equal(curr.ok, true, curr.stderr);
    const cands = (curr.stdout as { candidates: { action: string; reason: string }[] }).candidates;
    assert.ok(cands.some((c) => c.action === "review"), "due retention should produce review candidate");
    assert.ok(cands.some((c) => c.action === "practice"), "assisted skill should produce practice candidate");
  } finally {
    cleanup(dir);
  }
});

test("V2.7: review add records forms and links to event evidence", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-rev"]);
    const evId = newEvent(dir, "learn", ["--target-ids", "algo.dp"]);
    const r = omac(dir, ["review", "add", "--event-id", evId, "--concept", "algo.dp", "--form", "small-variation", "--result", "partial"]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { review: { form: string; result: string; review_id: string } };
    assert.equal(out.review.form, "small-variation");
    const sched = omac(dir, ["retention", "schedule", "algo.dp"]);
    const s = sched.stdout as { history: { form: string; result: string }[] };
    assert.equal(s.history.length, 1);
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    const content = (report.stdout as { content: { evidence: unknown[] } }).content;
    assert.ok(content.evidence.some((e) => (e as { extra?: { review?: unknown } }).extra?.review), "review must be recorded as event evidence");
    const badForm = omac(dir, ["review", "add", "--event-id", evId, "--concept", "algo.dp", "--form", "nonsense"]);
    assert.equal(badForm.ok, false);
  } finally {
    cleanup(dir);
  }
});

test("V2.8: retention pairs shows immediate vs delayed outcome", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-pairs"]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "success"]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "success"]);
    const pairs = omac(dir, ["retention", "pairs"]);
    const p = (pairs.stdout as { pairs: { concept_id: string; outcome: string; delayed_result: string }[] }).pairs;
    const entry = p.find((x) => x.concept_id === "algo.dp");
    assert.equal(entry?.delayed_result, "success");
    assert.equal(entry?.outcome, "retained");
  } finally {
    cleanup(dir);
  }
});

test("V2.9: curriculum priority ordering is review > practice > learn > recognition", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-order"]);
    const ev1 = newEvent(dir, "practice", ["--target-ids", "algo.greedy"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "algo.greedy", "--assessment", "assisted", "--confidence", "0.5"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "skill.problem-solving.observation", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", ev1]);
    omac(dir, ["rebuild"]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "fail"]);
    const curr = omac(dir, ["curriculum"]);
    const cands = (curr.stdout as { candidates: { action: string; priority: number }[] }).candidates;
    assert.ok(cands.some((c) => c.action === "review"));
    assert.ok(cands.some((c) => c.action === "practice"));
    assert.ok(cands.some((c) => c.action === "recognition"));
    const rank = (a: string) => cands.find((c) => c.action === a)?.priority ?? 999;
    assert.ok(rank("review") < rank("practice"), "review should outrank practice");
    assert.ok(rank("practice") < rank("learn"), "practice should outrank learn");
  } finally {
    cleanup(dir);
  }
});
