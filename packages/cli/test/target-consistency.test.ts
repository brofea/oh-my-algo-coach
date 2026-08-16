import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, appendEvidence } from "./helpers.js";

test("TC1: claim target must be declared on the event", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tc1"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const bad = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--target-id", "algo.unknown", "--assessment", "observed", "--confidence", "0.5"]);
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /target_mismatch/);
    assert.match(bad.stderr, /not declared on event/);
    const good = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--target-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    assert.equal(good.ok, true, good.stderr);
    const noTarget = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    assert.equal(noTarget.ok, true, "claim without target-id stays allowed");
  } finally {
    cleanup(dir);
  }
});

test("TC2: misconception scope claims are exempt from event target declaration", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tc2"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const r = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--target-id", "misconception.dp.state-too-large", "--assessment", "observed", "--confidence", "0.6"]);
    assert.equal(r.ok, true, r.stderr);
  } finally {
    cleanup(dir);
  }
});

test("TC3: transfer probe target must be declared on the event", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tc3"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const bad = omac(dir, ["transfer-probe", "add", "--event-id", evId, "--target-id", "algo.greedy", "--result", "independent-success", "--problem-ref", "cf:1", "--declared-before-start"]);
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /target_mismatch/);
    const good = omac(dir, ["transfer-probe", "add", "--event-id", evId, "--target-id", "algo.dp", "--result", "independent-success", "--problem-ref", "cf:1", "--declared-before-start"]);
    assert.equal(good.ok, true, good.stderr);
  } finally {
    cleanup(dir);
  }
});

test("TC4: evidence targets must be declared on the event", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tc4"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const bad = omac(dir, ["evidence", "append", "--event-id", evId, "--content", "x", "--target-ids", "algo.greedy", "--operation-id", "op-tc4-1"]);
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /target_mismatch/);
    const good = omac(dir, ["evidence", "append", "--event-id", evId, "--content", "x", "--target-ids", "algo.dp", "--operation-id", "op-tc4-2"]);
    assert.equal(good.ok, true, good.stderr);
    const partial = omac(dir, ["evidence", "append", "--event-id", evId, "--content", "y", "--target-ids", "algo.dp,algo.greedy", "--operation-id", "op-tc4-3"]);
    assert.equal(partial.ok, false, "mixed undeclared target must be rejected");
  } finally {
    cleanup(dir);
  }
});

test("TC5: explore events allow target-free claims and evidence", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tc5"]);
    const evId = newEvent(dir, "explore", ["--intent", "survey"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const evd = appendEvidence(dir, evId, "exploration observation", "op-tc5-1");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const claim = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.segment-tree", "--assessment", "unknown", "--confidence", "0.2", "--unknown-reason", "exploration", "--evidence-ids", evd]);
    assert.equal(claim.ok, true, claim.stderr);
  } finally {
    cleanup(dir);
  }
});
