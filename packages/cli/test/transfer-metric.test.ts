import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, appendEvidence, setBoundary } from "./helpers.js";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function practiceEventWithProbe(dir: string, targetId: string, result: string, novelty: boolean): void {
  const evId = newEvent(dir, "practice", ["--target-ids", targetId, "--target-status", "confirmed"]);
  omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
  setBoundary(dir, evId, targetId);
  const extra = novelty ? ["--familiarity", "new-statement", "--prior-exposure"] : [];
  const r = omac(dir, ["transfer-probe", "add", "--event-id", evId, "--target-id", targetId, "--result", result, "--problem-ref", "cf:2070C", "--declared-before-start", ...extra]);
  assert.equal(r.ok, true, r.stderr);
  omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
  const bnd = "";
  void bnd;
  omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", targetId, "--assessment", result === "independent-success" ? "transferred" : "assisted", "--confidence", "0.7", ...(result === "independent-success" ? ["--boundary-id", (omac(dir, ["event", "boundary", "list", "--event-id", evId]).stdout as { boundaries: { boundary_id: string }[] }).boundaries[0].boundary_id] : [])]);
  omac(dir, ["event", "close", "--event-id", evId]);
}

test("T1: transfer rate reports insufficient_evidence with explainable gap when samples are missing", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tr1"]);
    practiceEventWithProbe(dir, "algo.dp", "fail", true);
    const r = omac(dir, ["transfer-probe", "rate", "--min-samples", "3"]);
    assert.equal(r.ok, true, r.stderr);
    const report = (r.stdout as { report: { metric_id: string; status: string; value: number | null; numerator: number; denominator: number; sample_size: number; min_samples: number; uncertainty: string; source_event_ids: string[] } }).report;
    assert.equal(report.metric_id, "transfer-rate.novel-independent");
    assert.equal(report.status, "insufficient_evidence");
    assert.equal(report.value, null, "insufficient samples must not fabricate a percentage");
    assert.equal(report.numerator, 0);
    assert.equal(report.denominator, 1);
    assert.equal(report.sample_size, 1);
    assert.equal(report.min_samples, 3);
    assert.match(report.uncertainty, /insufficient evidence/);
    assert.equal(report.source_event_ids.length, 1);
  } finally {
    cleanup(dir);
  }
});

test("T2: transfer rate denominator excludes missing boundary / novelty / provisional target / assisted", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tr2"]);
    practiceEventWithProbe(dir, "algo.dp", "independent-success", true);
    practiceEventWithProbe(dir, "algo.greedy", "independent-success", true);

    const noBoundary = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", noBoundary, "--status", "active"]);
    omac(dir, ["transfer-probe", "add", "--event-id", noBoundary, "--target-id", "algo.dp", "--result", "independent-success", "--problem-ref", "cf:2070C", "--declared-before-start", "--familiarity", "new"]);
    omac(dir, ["event", "append", "--event-id", noBoundary, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", noBoundary, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", noBoundary]);

    const noNovelty = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", noNovelty, "--status", "active"]);
    setBoundary(dir, noNovelty, "algo.dp");
    omac(dir, ["transfer-probe", "add", "--event-id", noNovelty, "--target-id", "algo.dp", "--result", "fail", "--problem-ref", "cf:2070C", "--declared-before-start"]);
    omac(dir, ["event", "append", "--event-id", noNovelty, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", noNovelty, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", noNovelty]);

    const provisional = newEvent(dir, "practice", ["--target-ids", "algo.dp", "--target-status", "provisional"]);
    omac(dir, ["event", "append", "--event-id", provisional, "--status", "active"]);
    setBoundary(dir, provisional, "algo.dp");
    omac(dir, ["transfer-probe", "add", "--event-id", provisional, "--target-id", "algo.dp", "--result", "independent-success", "--problem-ref", "cf:2070C", "--declared-before-start", "--familiarity", "new"]);
    omac(dir, ["event", "append", "--event-id", provisional, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", provisional, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", provisional]);

    const assisted = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", assisted, "--status", "active"]);
    setBoundary(dir, assisted, "algo.dp");
    omac(dir, ["transfer-probe", "add", "--event-id", assisted, "--target-id", "algo.dp", "--result", "assisted-success", "--problem-ref", "cf:2070C", "--declared-before-start", "--familiarity", "new"]);
    omac(dir, ["event", "append", "--event-id", assisted, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", assisted, "--skill-id", "algo.dp", "--assessment", "assisted", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", assisted]);

    const r = omac(dir, ["transfer-probe", "rate", "--min-samples", "2"]);
    assert.equal(r.ok, true, r.stderr);
    const report = (r.stdout as { report: { status: string; value: number | null; numerator: number; denominator: number; uncertainty: string } }).report;
    assert.equal(report.denominator, 2, "only the two fully eligible probes count");
    assert.equal(report.numerator, 2);
    assert.equal(report.status, "ok");
    assert.equal(report.value, 1);
  } finally {
    cleanup(dir);
  }
});

test("T3: rating/calibration/gain-matrix expose source, sample_size and insufficient status", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-mx"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const bnd = setBoundary(dir, evId, "algo.dp");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "independent", "--confidence", "0.7", "--boundary-id", bnd]);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);

    const rating = omac(dir, ["rating"]);
    const rOut = rating.stdout as { rating: { status: string; sample_size: number; source: string; skills: unknown[] } };
    assert.equal(rOut.rating.status, "ok");
    assert.equal(rOut.rating.sample_size, 1);
    assert.ok(rOut.rating.source.includes("reducer"));

    const gain = omac(dir, ["coach", "gain-matrix"]);
    const gOut = gain.stdout as { cells: unknown[]; source: string; sample_size: number; status: string };
    assert.equal(gOut.sample_size, 0);
    assert.equal(gOut.status, "insufficient_evidence");
    assert.ok(gOut.source.includes("intervention"));

    const cal = omac(dir, ["calibration"]);
    const cOut = cal.stdout as { calibration: { status: string; sample_size: number; source: string } };
    assert.equal(cOut.calibration.status, "insufficient_evidence");
    assert.ok(cOut.calibration.source.includes("problem-status"));
  } finally {
    cleanup(dir);
  }
});

test("T4: pack version audit records replayable from/to with operation ids", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-pva"]);
    const packDir = join(dir, "pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ pack_id: "pva.test", pack_version: "1.0.0", name: "t", kind: "algorithm", license: "MIT", content_files: [] }));
    omac(dir, ["pack", "install", packDir]);
    writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ pack_id: "pva.test", pack_version: "1.2.0", name: "t", kind: "algorithm", license: "MIT", content_files: [] }));
    const up = omac(dir, ["pack", "update", "pva.test", "--source", packDir, "--apply"]);
    assert.equal((up.stdout as { action: string }).action, "upgraded");
    const versions = omac(dir, ["pack", "versions", "pva.test"]);
    const entries = (versions.stdout as { versions: { from?: string; to: string; operation_id: string; result: string }[] }).versions;
    const last = entries[entries.length - 1];
    assert.equal(last.from, "1.0.0");
    assert.equal(last.to, "1.2.0");
    assert.ok(last.operation_id);
    assert.equal(last.result, "upgraded");
    const audit = readFileSync(join(dir, ".omac", "knowledge", "packs", ".versions.jsonl"), "utf8").trim().split("\n");
    const same = audit.filter((l: string) => l.includes("pva.test"));
    assert.equal(same.length, 1, "apply must append exactly one audit record");
  } finally {
    cleanup(dir);
  }
});
