import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, appendEvidence, setBoundary } from "./helpers.js";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Skill Conformance Fixture — verifies that the documented Skill behavior
 * rules (skill/omac/SKILL.md) and the Runtime enforce the same contract.
 * Offline only; no external web capability is claimed.
 */

test("SKILL: explore may be target-free and must not fabricate mastery", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-explore"]);
    const evId = newEvent(dir, "explore", ["--intent", "survey segment trees"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    appendEvidence(dir, evId, "learner read two editorials and asked a question", "op-exp1", ["--actor", "learner"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.segment-tree", "--assessment", "unknown", "--confidence", "0.2", "--unknown-reason", "exploration only"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const view = omac(dir, ["learner", "view", "get"]);
    const abilities = (view.stdout as { view: { abilities: Record<string, { status: string }> } }).view.abilities;
    assert.equal(abilities["algo.segment-tree"].status, "unknown", "explore must not fabricate mastery");
  } finally {
    cleanup(dir);
  }
});

test("SKILL: practice records hint ladder with disclosure; assisted stays traceable", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-hint"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const hint = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "intervention", "--intervention-type", "hint", "--hint-level", "L2", "--content", "consider what the state must retain", "--operation-id", "op-h1"]);
    assert.equal(hint.ok, true, hint.stderr);
    const l9 = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "intervention", "--intervention-type", "hint", "--hint-level", "L9", "--operation-id", "op-h2"]);
    assert.equal(l9.ok, false, "L9 is outside the documented hint ladder");
    assert.match(l9.stderr, /hint/i);
    const bnd = setBoundary(dir, evId, "algo.dp");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "assisted", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const view = omac(dir, ["learner", "view", "get"]);
    const abilities = (view.stdout as { view: { abilities: Record<string, { status: string }> } }).view.abilities;
    assert.equal(abilities["algo.dp"].status, "assisted");
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    const evidence = (report.stdout as { content: { evidence: unknown[] } }).content.evidence;
    const hintEv = evidence.find((e) => (e as { extra?: { intervention?: { disclosure_level?: string } } }).extra?.intervention?.disclosure_level === "L2");
    assert.ok(hintEv, "hint disclosure must be persisted");
    void bnd;
  } finally {
    cleanup(dir);
  }
});

test("SKILL: contest requires finished artifact and supports post-contest review", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skillcontest"]);
    const artifact = join(dir, "contest.json");
    writeFileSync(artifact, JSON.stringify({ contest: { id: "abc123", platform: "atcoder", started_at: "2026-08-01T09:00:00Z", ended_at: "2026-08-01T11:00:00Z" }, problems: [{ problem_ref: "abc123:A", rating: 400, opened_minutes: 0, submissions: [{ minutes_used: 20, verdict: "AC" }] }] }));
    const live = omac(dir, ["event", "create", "--type", "contest", "--artifact", artifact, "--live"]);
    assert.equal(live.ok, false, "live contest solving is out of scope");
    const evId = (omac(dir, ["event", "create", "--type", "contest", "--artifact", artifact, "--confirm-ended", "--contest-ref", "abc123", "--target-ids", "algo.dp"]).stdout as { event_id: string }).event_id;
    const imported = omac(dir, ["contest", "import", "--artifact", artifact]);
    assert.equal(imported.ok, true, imported.stderr);
    const timeline = omac(dir, ["contest", "timeline", "--event-id", evId]);
    assert.equal(timeline.ok, true, timeline.stderr);
    const analyze = omac(dir, ["contest", "analyze", "--event-id", evId]);
    assert.equal(analyze.ok, true, analyze.stderr);
  } finally {
    cleanup(dir);
  }
});

test("SKILL: diagnose stays no-op until student confirmation", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skdiag"]);
    const evId = newEvent(dir, "diagnose", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const before = omac(dir, ["learner", "view", "get"]);
    assert.equal(before.ok, false, "unconfirmed diagnosis must not touch learner state");
    const gate = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "assisted", "--confidence", "0.6"]);
    assert.equal(gate.ok, false);
    assert.match(gate.stderr, /diagnose_confirmation_required/);
    const confirmed = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "assisted", "--confidence", "0.6", "--student-confirmation", "confirmed"]);
    assert.equal(confirmed.ok, true, confirmed.stderr);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const after = omac(dir, ["learner", "view", "get"]);
    assert.equal(after.ok, true, after.stderr);
  } finally {
    cleanup(dir);
  }
});

test("SKILL: review references history and retention, never fabricates fresh evidence", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skrev"]);
    const evId = newEvent(dir, "learn", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const review = omac(dir, ["review", "add", "--event-id", evId, "--concept", "algo.dp", "--form", "recall", "--result", "success"]);
    assert.equal(review.ok, true, review.stderr);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    const content = (report.stdout as { content: { evidence: unknown[] } }).content;
    const reviewEv = content.evidence.find((e) => (e as { extra?: { review?: unknown } }).extra?.review);
    assert.ok(reviewEv, "review must link to the original event evidence stream");
  } finally {
    cleanup(dir);
  }
});

test("SKILL: upsolve/transfer requires boundary + novelty + independent outcome, else insufficient", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skup"]);
    const evId = newEvent(dir, "upsolve", ["--target-ids", "algo.greedy"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["transfer-probe", "add", "--event-id", evId, "--target-id", "algo.greedy", "--result", "independent-success", "--problem-ref", "cf:1", "--declared-before-start"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.greedy", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    const rate = omac(dir, ["transfer-probe", "rate"]);
    const report = (rate.stdout as { report: { status: string; denominator: number; uncertainty: string } }).report;
    assert.equal(report.status, "insufficient_evidence", "probe without boundary/novelty must be insufficient");
    assert.equal(report.denominator, 0);
    assert.match(report.uncertainty, /insufficient evidence/);
  } finally {
    cleanup(dir);
  }
});

test("SKILL: external content stays offline — fixture connector must not claim outbound send", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skweb"]);
    const connectors = omac(dir, ["connector", "list"]);
    const list = (connectors.stdout as { connectors: { connector_id: string; capabilities: { web: boolean } }[] }).connectors;
    for (const c of list) {
      assert.equal(c.capabilities.web, false, "fixture connectors must not claim real web capability");
    }
    const inspect = omac(dir, ["connector", "inspect", "codeforces"]);
    assert.equal(inspect.ok, true, inspect.stderr);
    const fetched = omac(dir, ["editorial", "get", "cf:2065C", "--connector", "codeforces"]);
    if (fetched.ok) {
      const out = fetched.stdout as { editorial: { source_type?: string; data?: { editorial?: string } } | null; degraded: boolean };
      if (out.editorial) {
        assert.match(JSON.stringify(out.editorial.data), /fixture/i, "content payload must be explicitly marked as fixture, not a live fetch");
      } else {
        assert.equal(out.degraded, true, "unfetched content must degrade explicitly");
      }
    }
  } finally {
    cleanup(dir);
  }
});

test("SKILL: pack install -> list/get -> runtime consumption is a closed loop", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skpack"]);
    const packDir = join(dir, "target-pack");
    mkdirSync(join(packDir, "targets"), { recursive: true });
    writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ pack_id: "skill.targets", pack_version: "1.0.0", schema_version: "1.0", name: "skill targets", kind: "target", source: { type: "fixture" }, license: { id: "MIT" }, content_files: ["targets/skill.t1.json"] }));
    writeFileSync(join(packDir, "targets", "skill.t1.json"), JSON.stringify({ target_id: "skill.t1", target_version: "1.0.0", name: "Skill Target 1", category: "algorithm", prerequisites: [], observable_behaviors: ["x"], success_criteria: ["y"], failure_taxonomy: ["z"], required_evidence: ["observation.x"] }));
    const inst = omac(dir, ["pack", "install", packDir]);
    assert.equal(inst.ok, true, inst.stderr);
    const targets = omac(dir, ["targets"]);
    assert.ok((targets.stdout as { targets: { target_id: string }[] }).targets.some((t) => t.target_id === "skill.t1"), "installed target must be consumable by targets list");
    const ev = omac(dir, ["event", "create", "--type", "practice", "--target-ids", "skill.t1"]);
    assert.equal(ev.ok, true, ev.stderr);
  } finally {
    cleanup(dir);
  }
});

test("SKILL: learn event runs the top-down contract with structured path recording", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-sklearn"]);
    const evId = newEvent(dir, "learn", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const path = omac(dir, ["learn", "path", "add", "--event-id", evId, "--path", "why,concrete-problem,core-intuition,example,abstraction,formal-algorithm,implementation,recognition,transfer"]);
    assert.equal(path.ok, true, path.stderr);
    const e1 = appendEvidence(dir, evId, "learner explained the state transition with a counterexample", "op-l1", ["--actor", "learner"]);
    const badPath = omac(dir, ["learn", "path", "add", "--event-id", evId, "--path", "made-up-step"]);
    assert.equal(badPath.ok, false, "learn path steps are constrained to the top-down enumeration");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const claim = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--evidence-ids", e1]);
    assert.equal(claim.ok, true, claim.stderr);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const view = omac(dir, ["learner", "view", "get"]);
    assert.equal((view.stdout as { view: { abilities: Record<string, { status: string }> } }).view.abilities["algo.dp"].status, "observed");
  } finally {
    cleanup(dir);
  }
});

test("SKILL: diagnose surfaces alternative evidence chains before confirmation", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skdiag2"]);
    const evId = newEvent(dir, "diagnose", ["--target-ids", "algo.dp", "--intent", "check dp understanding"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const support = appendEvidence(dir, evId, "student states state definition correctly", "op-dg-s", ["--actor", "learner"]);
    const contradict = appendEvidence(dir, evId, "student fails transition derivation on a variant", "op-dg-c", ["--actor", "learner"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const gated = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--evidence-ids", `${support},${contradict}`]);
    assert.equal(gated.ok, false, "diagnose claims must be confirmed by the student before reaching the reducer");
    assert.match(gated.stderr, /diagnose_confirmation_required/);
    const confirmed = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--evidence-ids", `${support},${contradict}`, "--student-confirmation", "confirmed"]);
    assert.equal(confirmed.ok, true, confirmed.stderr);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const view = omac(dir, ["learner", "view", "get"]);
    const abilities = (view.stdout as { view: { abilities: Record<string, { status: string }> } }).view.abilities;
    assert.equal(abilities["algo.dp"].status, "observed", "confirmed claim with both supporting and contradicting evidence still records the observation");
  } finally {
    cleanup(dir);
  }
});

test("SKILL: coach self-evaluation is evidence-based and documented in the skill", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-skeval"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.greedy"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const i1 = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "intervention", "--intervention-type", "counterexample", "--hint-level", "L2", "--target-ids", "algo.greedy", "--content", "try a counterexample", "--operation-id", "op-eval-1"]);
    assert.equal(i1.ok, true, i1.stderr);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.greedy", "--target-id", "algo.greedy", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    const evalOut = omac(dir, ["coach", "eval", "--target", "algo.greedy", "--min-events", "2"]);
    assert.equal(evalOut.ok, true, evalOut.stderr);
    const entries = (evalOut.stdout as { entries: { intervention_type: string; observed_count: number; insufficient: boolean }[] }).entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].intervention_type, "counterexample");
    assert.equal(entries[0].insufficient, true, "single-sample coach eval must be marked insufficient");
    const skill = readFileSync(new URL("../../../../skill/omac/SKILL.md", import.meta.url), "utf8");
    assert.match(skill, /Coach Self-Evaluation|自评/, "SKILL.md must document the coach self-evaluation policy");
  } finally {
    cleanup(dir);
  }
});
