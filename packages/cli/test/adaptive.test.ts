import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, setBoundary } from "./helpers.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function seedView(dir: string, skills: [string, string, number][]): void {
  for (const [skill, assessment, confidence] of skills) {
    const evId = newEvent(dir, "practice", ["--target-ids", skill]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const bnd = ["independent", "transferred", "retained"].includes(assessment) ? setBoundary(dir, evId, skill) : "";
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", skill, "--assessment", assessment, "--confidence", String(confidence), ...(bnd ? ["--boundary-id", bnd] : [])]);
    omac(dir, ["event", "close", "--event-id", evId]);
  }
  omac(dir, ["rebuild"]);
}

test("V5.1: rating is display-layer with confidence and skills", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-rate"]);
    seedView(dir, [["algo.dp", "independent", 0.8], ["algo.greedy", "assisted", 0.5]]);
    const r = omac(dir, ["rating"]);
    assert.equal(r.ok, true, r.stderr);
    const rating = (r.stdout as { rating: { overall: number; skills: unknown[]; note: string; confidence: number } }).rating;
    assert.ok(rating.overall > 0);
    assert.equal(rating.skills.length, 2);
    assert.match(rating.note, /display-layer|NOT the underlying/);
    assert.ok(rating.confidence > 0);
  } finally {
    cleanup(dir);
  }
});

test("V5.2: calibration reports bins over problem statuses", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-cal"]);
    seedView(dir, [["algo.dp", "independent", 0.7]]);
    omac(dir, ["problem", "status", "cf:2065A", "--status", "solved"]);
    omac(dir, ["problem", "status", "cf:2065B", "--status", "attempted"]);
    const r = omac(dir, ["calibration"]);
    assert.equal(r.ok, true, r.stderr);
    const cal = (r.stdout as { calibration: { bins: { bucket: string; n: number }[]; note: string } }).calibration;
    assert.ok(cal.bins.length > 0);
    assert.match(cal.note, /heuristic/);
    assert.ok(cal.bins.some((b) => b.bucket === "letter-A"));
  } finally {
    cleanup(dir);
  }
});

test("V5.3: coach eval distinguishes gains and marks insufficient samples", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-eval"]);
    const ev1 = newEvent(dir, "practice", ["--target-ids", "algo.greedy"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "active"]);
    omac(dir, ["evidence", "append", "--event-id", ev1, "--type", "intervention", "--intervention-type", "counterexample", "--hint-level", "L2", "--target-ids", "algo.greedy", "--content", "try a counterexample", "--operation-id", "op-i1"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "algo.greedy", "--target-id", "algo.greedy", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", ev1]);
    const ev2 = newEvent(dir, "practice", ["--target-ids", "algo.greedy"]);
    omac(dir, ["event", "append", "--event-id", ev2, "--status", "active"]);
    omac(dir, ["evidence", "append", "--event-id", ev2, "--type", "intervention", "--intervention-type", "counterexample", "--hint-level", "L2", "--target-ids", "algo.greedy", "--operation-id", "op-i2"]);
    omac(dir, ["event", "append", "--event-id", ev2, "--status", "evaluating"]);
    const bnd = setBoundary(dir, ev2, "algo.greedy");
    omac(dir, ["learner", "claim", "submit", "--event-id", ev2, "--skill-id", "algo.greedy", "--target-id", "algo.greedy", "--assessment", "independent", "--confidence", "0.7", "--boundary-id", bnd]);
    omac(dir, ["event", "close", "--event-id", ev2]);
    const r = omac(dir, ["coach", "eval", "--target", "algo.greedy", "--min-events", "3"]);
    assert.equal(r.ok, true, r.stderr);
    const entries = (r.stdout as { entries: { intervention_type: string; observed_count: number; gain_sign: string; insufficient: boolean }[] }).entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].intervention_type, "counterexample");
    assert.equal(entries[0].observed_count, 2);
    assert.equal(entries[0].insufficient, true, "2 samples < min 3 must be marked insufficient");
  } finally {
    cleanup(dir);
  }
});

test("V5.4: gain matrix aggregates intervention dimensions", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-gm"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["evidence", "append", "--event-id", evId, "--type", "intervention", "--intervention-type", "hint", "--hint-level", "L3", "--target-ids", "algo.dp", "--problem-ref", "lc:300", "--extra", JSON.stringify({ difficulty: "medium" }), "--operation-id", "op-g1"]);
    omac(dir, ["evidence", "append", "--event-id", evId, "--type", "intervention", "--intervention-type", "hint", "--hint-level", "L3", "--target-ids", "algo.dp", "--problem-ref", "lc:300", "--extra", JSON.stringify({ difficulty: "medium" }), "--operation-id", "op-g2"]);
    const r = omac(dir, ["coach", "gain-matrix"]);
    assert.equal(r.ok, true, r.stderr);
    const cells = (r.stdout as { cells: { observed: number }[] }).cells;
    assert.ok(cells.length >= 1);
    assert.equal(cells[0].observed, 2, "identical intervention rows must aggregate");
  } finally {
    cleanup(dir);
  }
});

test("V5.5: visualization produces ascii output", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-viz"]);
    seedView(dir, [["algo.dp", "independent", 0.8]]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "success"]);
    const r = omac(dir, ["visualize", "--kind", "ascii", "--view", "retention", "--concept", "algo.dp"]);
    assert.equal(r.ok, true, r.stderr);
    const viz = (r.stdout as { visualization: { body: string } }).visualization;
    assert.match(viz.body, /█|░|strength/);
    const bad = omac(dir, ["visualize", "--kind", "chart", "--view", "nonsense"]);
    assert.equal(bad.ok, false);
  } finally {
    cleanup(dir);
  }
});

test("V5.6: long-term plan generates weekly goals with evidence", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-plan"]);
    seedView(dir, [["algo.dp", "assisted", 0.5]]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "fail"]);
    const r = omac(dir, ["plan", "--horizon", "2", "--targets", "algo.dp,algo.greedy"]);
    assert.equal(r.ok, true, r.stderr);
    const plan = (r.stdout as { weeks: { week: number; goals: unknown[] }[] }).weeks;
    assert.equal(plan.length, 2);
    assert.ok(plan[0].goals.length > 0);
  } finally {
    cleanup(dir);
  }
});

test("V5.7: pack update compares versions with audit trail", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-pk"]);
    const packDir = join(dir, "pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ pack_id: "pk.test", pack_version: "1.0.0", name: "t", kind: "algorithm", license: "MIT", content_files: [] }));
    omac(dir, ["pack", "install", packDir]);
    const noUpdate = omac(dir, ["pack", "update", "pk.test"]);
    assert.equal((noUpdate.stdout as { action: string }).action, "no-op");
    writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ pack_id: "pk.test", pack_version: "1.1.0", name: "t", kind: "algorithm", license: "MIT", content_files: [] }));
    const available = omac(dir, ["pack", "update", "pk.test", "--source", packDir]);
    assert.equal((available.stdout as { action: string }).action, "upgrade-available");
    const applied = omac(dir, ["pack", "update", "pk.test", "--source", packDir, "--apply"]);
    assert.equal((applied.stdout as { action: string }).action, "upgraded");
    const versions = omac(dir, ["pack", "versions", "pk.test"]);
    assert.ok((versions.stdout as { versions: unknown[] }).versions.length >= 1, "upgrade must be audited");
  } finally {
    cleanup(dir);
  }
});

test("V5.8: retention model-status applies overdue decay", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-decay"]);
    omac(dir, ["retention", "recall", "algo.dp", "--result", "success"]);
    const r = omac(dir, ["retention", "model-status", "algo.dp"]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { model: string; retention_estimate: number };
    assert.equal(out.model, "exp-backoff-with-overdue-decay");
    assert.ok(out.retention_estimate > 0);
  } finally {
    cleanup(dir);
  }
});
