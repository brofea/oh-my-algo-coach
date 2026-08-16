import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, appendEvidence } from "./helpers.js";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

test("V1.1: intervention evidence records structured hint ladder disclosure", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-hint"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "skill.problem-solving.state-design"]);
    const r = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "intervention", "--intervention-type", "hint", "--hint-level", "L1", "--student-requested", "--failure-cause", "no-observation", "--content", "先别想具体算法，考虑固定答案 x 后能否快速判断可行性", "--operation-id", "op-i1"]);
    assert.equal(r.ok, true, r.stderr);
    const evd = r.stdout as { evidence_id: string };
    const bad = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "intervention", "--hint-level", "L9", "--operation-id", "op-i2"]);
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /hint level/);
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    const content = (report.stdout as { content: { evidence: unknown[] } }).content;
    const inter = content.evidence[0] as { evidence_type: string; extra: { intervention: { disclosure_level: string; student_requested: boolean } } };
    assert.equal(inter.evidence_type, "intervention");
    assert.equal(inter.extra.intervention.disclosure_level, "L1");
    assert.equal(inter.extra.intervention.student_requested, true);
    void evd;
  } finally {
    cleanup(dir);
  }
});

test("V1.2: problem manifest add/list and artifact add/list", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-prob"]);
    const statement = join(dir, "statement.md");
    writeFileSync(statement, "# CF 2065C\nminimize max...", "utf8");
    const add = omac(dir, ["problem", "add", "cf:2065C", "--platform", "codeforces", "--difficulty", "div2", "--rating", "1500", "--statement", statement, "--tags", "binary-search,greedy"]);
    assert.equal(add.ok, true, add.stderr);
    const add2 = omac(dir, ["problem", "add", "lc:300", "--platform", "leetcode", "--rating", "1400"]);
    assert.equal(add2.ok, true);
    const list = omac(dir, ["problem", "list"]);
    const problems = (list.stdout as { problems: { problem_ref: string }[] }).problems;
    assert.equal(problems.length, 2);
    const lcOnly = omac(dir, ["problem", "list", "--platform", "leetcode"]);
    assert.equal((lcOnly.stdout as { problems: unknown[] }).problems.length, 1);
    const evId = newEvent(dir, "practice", ["--problem-ref", "cf:2065C"]);
    const codeFile = join(dir, "sol.cpp");
    writeFileSync(codeFile, "int main(){return 0;}", "utf8");
    const art = omac(dir, ["artifact", "add", "--event-id", evId, "--file", codeFile, "--kind", "code"]);
    assert.equal(art.ok, true, art.stderr);
    assert.ok((art.stdout as { checksum: string }).checksum.startsWith("sha256:"));
    const arts = omac(dir, ["artifact", "list", "--event-id", evId]);
    assert.equal((arts.stdout as { artifacts: unknown[] }).artifacts.length, 1);
  } finally {
    cleanup(dir);
  }
});

test("V1.3: transfer probe recorded and summarized", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-probe"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.binary-search-on-answer"]);
    const r = omac(dir, ["transfer-probe", "add", "--event-id", evId, "--target-id", "algo.binary-search-on-answer", "--result", "independent-success", "--declared-before-start", "--problem-ref", "cf:2070C", "--prior-exposure"]);
    assert.equal(r.ok, true, r.stderr);
    const summary = omac(dir, ["transfer-probe", "summary", "--event-id", evId]);
    const s = (summary.stdout as { summary: { total: number; independent_success: number } }).summary;
    assert.equal(s.total, 1);
    assert.equal(s.independent_success, 1);
  } finally {
    cleanup(dir);
  }
});

test("V1.4: subflows - debug, postmortem, teach-back, upsolve-review", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-sf"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    const dbg = omac(dir, ["subflow", "add", "--event-id", evId, "--kind", "debug", "--wa-types", "WA1,WA2", "--resolved"]);
    assert.equal(dbg.ok, true, dbg.stderr);
    const pm = omac(dir, ["subflow", "add", "--event-id", evId, "--kind", "postmortem", "--failure-cause", "no-counterexample", "--insight-distance", "medium", "--pattern", "interval-sweep", "--gave-up-early"]);
    assert.equal(pm.ok, true, pm.stderr);
    const tb = omac(dir, ["subflow", "add", "--event-id", evId, "--kind", "teach-back", "--result", "reimplement"]);
    assert.equal(tb.ok, true, tb.stderr);
    const up = omac(dir, ["subflow", "add", "--event-id", evId, "--kind", "upsolve-review", "--original-direction", "greedy", "--failure-cause", "anchored", "--insight-distance", "near", "--transfer-readiness", "ready", "--follow-up-targets", "algo.dp,skill.problem-solving.state-design"]);
    assert.equal(up.ok, true, up.stderr);
    const list = omac(dir, ["subflow", "list", "--event-id", evId]);
    const subflows = (list.stdout as { subflows: { kind: string }[] }).subflows;
    assert.deepEqual(subflows.map((s) => s.kind).sort(), ["debug", "postmortem", "teach-back", "upsolve-review"]);
  } finally {
    cleanup(dir);
  }
});

test("V1.5: algorithm / problem-solving / misconception views computed from claims", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-views"]);
    const ev1 = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "algo.dp", "--target-id", "misconception.dp.state-too-large", "--assessment", "observed", "--confidence", "0.6"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "algo.dp", "--claim-scope", "recall", "--assessment", "independent", "--confidence", "0.7"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "skill.problem-solving.state-design", "--assessment", "assisted", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", ev1]);
    const algo = omac(dir, ["view", "algorithm"]);
    assert.equal(algo.ok, true, algo.stderr);
    const algoView = (algo.stdout as { view: { entries: { skill_id: string; overall: string }[] } }).view;
    assert.equal(algoView.entries.length, 1);
    assert.equal(algoView.entries[0].overall, "independent");
    const ps = omac(dir, ["view", "problem-solving"]);
    assert.equal(ps.ok, true);
    const psView = (ps.stdout as { view: { entries: { skill_id: string; overall: string }[] } }).view;
    assert.equal(psView.entries[0].skill_id, "skill.problem-solving.state-design");
    const mis = omac(dir, ["view", "misconception"]);
    assert.equal(mis.ok, true, mis.stderr);
    const misView = (mis.stdout as { view: { misconceptions: { misconception_id: string; status: string }[] } }).view;
    assert.equal(misView.misconceptions.length, 1);
    assert.equal(misView.misconceptions[0].misconception_id, "misconception.dp.state-too-large");
  } finally {
    cleanup(dir);
  }
});

test("V1.7: coaching mode change recorded as runtime evidence", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-mode"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    const r = omac(dir, ["event", "append", "--event-id", evId, "--mode", "direct-explanation", "--mode-requested-by", "learner"]);
    assert.equal(r.ok, true, r.stderr);
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    const content = (report.stdout as { content: { evidence: unknown[] } }).content;
    const modeEv = content.evidence.find((e) => (e as { extra?: { mode_change?: unknown } }).extra?.mode_change);
    assert.ok(modeEv, "mode change must be recorded as evidence");
    const mc = (modeEv as { extra: { mode_change: { from: string; to: string; requested_by: string } } }).extra.mode_change;
    assert.equal(mc.from, "practice");
    assert.equal(mc.to, "direct-explanation");
    assert.equal(mc.requested_by, "learner");
  } finally {
    cleanup(dir);
  }
});

test("V1.6: assisted vs independent results remain distinct across coaching views", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-ind"]);
    const ev1 = newEvent(dir, "practice", ["--target-ids", "algo.greedy"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "algo.greedy", "--assessment", "assisted", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", ev1]);
    const ev2 = newEvent(dir, "upsolve", ["--target-ids", "algo.greedy"]);
    omac(dir, ["event", "append", "--event-id", ev2, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", ev2, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev2, "--skill-id", "algo.greedy", "--assessment", "independent", "--confidence", "0.7"]);
    omac(dir, ["event", "close", "--event-id", ev2]);
    const algo = omac(dir, ["view", "algorithm"]);
    const entry = (algo.stdout as { view: { entries: { overall: string }[] } }).view.entries[0];
    assert.equal(entry.overall, "independent");
  } finally {
    cleanup(dir);
  }
});
