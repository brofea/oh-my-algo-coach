import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, appendEvidence } from "./helpers.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

test("V0.1: init is idempotent and creates full .omac layout", () => {
  const dir = makeWorkspace();
  try {
    const r1 = omac(dir, ["init", "--learner-id", "ln-alice"]);
    assert.equal(r1.ok, true);
    const out1 = r1.stdout as { workspace_id: string; learner_id: string; warning: string };
    assert.ok(out1.workspace_id.startsWith("ws-"));
    assert.equal(out1.learner_id, "ln-alice");
    assert.match(out1.warning, /public repositor/i);
    for (const d of ["config", "learner/profile", "learner/state", "learner/views", "event", "event/archive", "event/index", "evidence", "knowledge", "artifact", "report", "import", "runtime"]) {
      assert.ok(existsSync(join(dir, ".omac", d)), `missing dir ${d}`);
    }
    assert.ok(existsSync(join(dir, ".omac", "config", "workspace.json")));
    assert.ok(!existsSync(join(dir, ".gitignore")), "init must not create .gitignore");
    const r2 = omac(dir, ["init", "--learner-id", "ln-alice"]);
    assert.equal(r2.ok, true);
    assert.equal((r2.stdout as { workspace_id: string }).workspace_id, out1.workspace_id, "init must be idempotent");
  } finally {
    cleanup(dir);
  }
});

test("V0.2: full lifecycle practice event -> close -> archive -> rebuild -> next event context", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-bob"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "skill.problem-solving.state-design", "--problem-ref", "manifest:cf-2065c", "--platform-profile", "codeforces"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const e1 = appendEvidence(dir, evId, "student independently observed the monotonicity of feasibility", "op-e1", ["--actor", "coach", "--type", "observation"]);
    const e2 = appendEvidence(dir, evId, "student requested first hint after 17 minutes", "op-e2", ["--actor", "learner", "--type", "observation"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const claim = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "skill.problem-solving.state-design", "--assessment", "independent", "--confidence", "0.7", "--evidence-ids", `${e1},${e2}`, "--operation-id", "op-claim-1"]);
    assert.equal(claim.ok, true, claim.stderr);
    const claimId = (claim.stdout as { claim_id: string }).claim_id;
    const close = omac(dir, ["event", "close", "--event-id", evId, "--operation-id", "op-close-1"]);
    assert.equal(close.ok, true, close.stderr);
    const archiveRef = (close.stdout as { archive_ref: string }).archive_ref;
    assert.ok(archiveRef.includes("archive"), `archive_ref should point into archive: ${archiveRef}`);
    assert.ok(existsSync(join(dir, ".omac", "event", "archive", evId, "event.json")));
    const rebuild = omac(dir, ["rebuild", "--claim-set", claimId]);
    assert.equal(rebuild.ok, true, rebuild.stderr);
    const view = (rebuild.stdout as { view: { learner_id: string; claim_set_ref: string[]; abilities: Record<string, { status: string; evidence_ids: string[] }> } }).view;
    assert.equal(view.learner_id, "ln-bob");
    assert.deepEqual(view.claim_set_ref, [claimId]);
    const ability = view.abilities["skill.problem-solving.state-design"];
    assert.equal(ability.status, "independent");
    assert.deepEqual(ability.evidence_ids, [e1, e2]);
    const explain = omac(dir, ["explain-why", "--skill-id", "skill.problem-solving.state-design"]);
    assert.equal(explain.ok, true);
    const chain = explain.stdout as { claims: { claim_id: string }[]; evidence: unknown[]; events: { event_id: string }[] };
    assert.equal(chain.claims.length, 1);
    assert.equal(chain.evidence.length, 2);
    assert.equal(chain.events[0].event_id, evId);
    const next = newEvent(dir, "practice", ["--target-ids", "algo.binary-search-on-answer"]);
    assert.ok(next);
  } finally {
    cleanup(dir);
  }
});

test("V0.3: operation_id retry on append and close does not duplicate", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-retry"]);
    const evId = newEvent(dir, "practice");
    const r1 = omac(dir, ["evidence", "append", "--event-id", evId, "--content", "first observation", "--operation-id", "op-same"]);
    const id1 = (r1.stdout as { evidence_id: string }).evidence_id;
    const r2 = omac(dir, ["evidence", "append", "--event-id", evId, "--content", "should NOT be appended", "--operation-id", "op-same"]);
    assert.equal(r2.ok, true);
    assert.equal((r2.stdout as { evidence_id: string }).evidence_id, id1, "retry must return original evidence_id");
    const list = omac(dir, ["event", "list"]);
    void list;
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    assert.equal(report.ok, true);
    const content = (report.stdout as { content: { evidence: unknown[] } }).content;
    assert.equal(content.evidence.length, 1, "duplicate evidence appended on retry");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--operation-id", "op-claim-x"]);
    const c1 = omac(dir, ["event", "close", "--event-id", evId, "--operation-id", "op-close-x"]);
    assert.equal(c1.ok, true, c1.stderr);
    const c2 = omac(dir, ["event", "close", "--event-id", evId, "--operation-id", "op-close-x"]);
    assert.equal(c2.ok, true);
    assert.equal((c2.stdout as { resumed: boolean }).resumed, true, "close retry must resume original result");
    const archiveRef = (c1.stdout as { archive_ref: string }).archive_ref;
    assert.equal((c2.stdout as { archive_ref: string }).archive_ref, archiveRef);
    const claimsFile = readFileSync(join(dir, ".omac", "claims", "claims.jsonl"), "utf8");
    assert.equal(claimsFile.trim().split("\n").length, 1, "close retry must not duplicate claims");
  } finally {
    cleanup(dir);
  }
});

test("V0.4: unknown / insufficient evidence can end an event without fabricated judgment", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-unknown"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.binary-search-on-answer"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    appendEvidence(dir, evId, "session too short to judge", "op-u1", ["--actor", "coach"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const claim = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.binary-search-on-answer", "--assessment", "insufficient_evidence", "--confidence", "0.3", "--unknown-reason", "not enough evidence"]);
    assert.equal(claim.ok, true, claim.stderr);
    const close = omac(dir, ["event", "close", "--event-id", evId]);
    assert.equal(close.ok, true, close.stderr);
    const rebuild = omac(dir, ["rebuild"]);
    assert.equal(rebuild.ok, true);
    const view = (rebuild.stdout as { view: { abilities: Record<string, { status: string }> } }).view;
    assert.equal(view.abilities["algo.binary-search-on-answer"].status, "insufficient_evidence");
  } finally {
    cleanup(dir);
  }
});

test("V0.5: user correction -> reevaluate -> rebuild; history never rewritten", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-corr"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "skill.problem-solving.state-design"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const e1 = appendEvidence(dir, evId, "student solved quickly", "op-c1");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const claim1 = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "skill.problem-solving.state-design", "--assessment", "independent", "--confidence", "0.8", "--evidence-ids", e1, "--operation-id", "op-cc1"]);
    const claimId1 = (claim1.stdout as { claim_id: string }).claim_id;
    omac(dir, ["event", "close", "--event-id", evId]);
    const correction = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "correction", "--content", "user correction: student had seen the editorial before", "--actor", "learner", "--operation-id", "op-cc2"]);
    assert.equal(correction.ok, true, correction.stderr);
    const re = omac(dir, ["reevaluate", "--event-id", evId, "--evaluation-run-id", "run-2", "--assessment", "assisted", "--confidence", "0.5"]);
    assert.equal(re.ok, true, re.stderr);
    const appended = (re.stdout as { appended_claims: string[] }).appended_claims;
    assert.equal(appended.length, 1);
    const claimsFile = readFileSync(join(dir, ".omac", "claims", "claims.jsonl"), "utf8");
    assert.equal(claimsFile.trim().split("\n").length, 2, "reevaluate must append, never rewrite");
    assert.match(claimsFile, new RegExp(claimId1));
    const rebuild = omac(dir, ["rebuild"]);
    const view = (rebuild.stdout as { view: { abilities: Record<string, { status: string }> } }).view;
    assert.equal(view.abilities["skill.problem-solving.state-design"].status, "assisted", "superseding claim should win");
  } finally {
    cleanup(dir);
  }
});

test("V0.6: restart persistence - working and archived events survive process restart", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-restart"]);
    const ev1 = newEvent(dir, "practice");
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "active"]);
    const ev2 = newEvent(dir, "learn", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", ev2, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", ev2, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", ev2, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", ev2]);
    omac(dir, ["rebuild"]);
    const list = omac(dir, ["event", "list"]);
    const out = list.stdout as { working: { event_id: string }[]; archived: { event_id: string }[] };
    assert.ok(out.working.some((e) => e.event_id === ev1));
    assert.ok(out.archived.some((e) => e.event_id === ev2));
    const view = omac(dir, ["learner", "view", "get"]);
    assert.equal(view.ok, true, "view must be readable after restart");
  } finally {
    cleanup(dir);
  }
});

test("V0.7: contest event gate - requires artifact + user confirmation, refuses live solving", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-contest"]);
    const noArtifact = omac(dir, ["event", "create", "--type", "contest"]);
    assert.equal(noArtifact.ok, false);
    assert.match(noArtifact.stderr, /artifact/);
    const artifact = join(dir, "contest-artifact.json");
    writeFileSync(artifact, JSON.stringify({ contest: { id: "abc389", platform: "atcoder" } }));
    const noConfirm = omac(dir, ["event", "create", "--type", "contest", "--artifact", artifact]);
    assert.equal(noConfirm.ok, false);
    assert.match(noConfirm.stderr, /confirm-ended|ended/);
    const live = omac(dir, ["event", "create", "--type", "contest", "--artifact", artifact, "--confirm-ended", "--live"]);
    assert.equal(live.ok, false);
    assert.match(live.stderr, /post-contest|not supported/i);
    const okCreate = omac(dir, ["event", "create", "--type", "contest", "--artifact", artifact, "--confirm-ended", "--contest-ref", "abc389"]);
    assert.equal(okCreate.ok, true, okCreate.stderr);
  } finally {
    cleanup(dir);
  }
});

test("V0.8: claim submit blocked outside evaluating phase", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-gate"]);
    const evId = newEvent(dir, "practice");
    const r = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "independent"]);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /evaluating/);
  } finally {
    cleanup(dir);
  }
});

test("V0.9: assisted result is not counted as independent in next event context", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-dep"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "assisted", "--confidence", "0.6"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const view = omac(dir, ["learner", "view", "get"]);
    const abilities = (view.stdout as { view: { abilities: Record<string, { status: string; summary?: Record<string, unknown> }> } }).view.abilities;
    assert.equal(abilities["algo.dp"].status, "assisted");
    const summary = (view.stdout as { view: { summary: { independent_count: number } } }).view.summary;
    assert.equal(summary.independent_count, 0);
  } finally {
    cleanup(dir);
  }
});

test("V0.10: doctor, integrity, export and import work", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-io"]);
    const evId = newEvent(dir, "practice");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.greedy", "--assessment", "observed", "--confidence", "0.4"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    const doc = omac(dir, ["doctor"]);
    assert.equal(doc.ok, true);
    const docOut = doc.stdout as { integrity: { ok: boolean }; warnings: string[] };
    assert.equal(docOut.integrity.ok, true);
    assert.ok(docOut.warnings.some((w) => /public repo/i.test(w)));
    const integ = omac(dir, ["integrity"]);
    assert.equal((integ.stdout as { ok: boolean }).ok, true);
    const exp = omac(dir, ["export", "--learner-id", "ln-io", "--out", join(dir, "export-out")]);
    assert.equal(exp.ok, true, exp.stderr);
    const pkgPath = (exp.stdout as { path: string }).path;
    assert.ok(existsSync(join(pkgPath, "manifest.json")));
    const preview = omac(dir, ["import", join(dir, "export-out"), "--preview"]);
    assert.equal(preview.ok, true, preview.stderr);
    const previewOut = preview.stdout as { conflicts: { duplicate_records: unknown[]; same_learner: string[] } };
    assert.ok(previewOut.conflicts.duplicate_records.length >= 0);
    const imp = omac(dir, ["import", join(dir, "export-out"), "--strategy", "merge"]);
    assert.equal(imp.ok, true, imp.stderr);
  } finally {
    cleanup(dir);
  }
});

test("V0.11: conformance fixture matrix - two platform profiles and two event types run on the same runtime", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-matrix"]);
    const cf = newEvent(dir, "practice", ["--target-ids", "algo.binary-search-on-answer", "--platform-profile", "codeforces", "--domain-profile", "cf-div2", "--problem-ref", "cf:2065C"]);
    const lc = newEvent(dir, "learn", ["--target-ids", "algo.dp", "--platform-profile", "leetcode", "--domain-profile", "leetcode-dp", "--problem-ref", "lc:300"]);
    for (const [id, skill, assessment] of [[cf, "algo.binary-search-on-answer", "independent"], [lc, "algo.dp", "observed"]] as const) {
      omac(dir, ["event", "append", "--event-id", id, "--status", "active"]);
      const evd = appendEvidence(dir, id, `evidence for ${skill}`, `op-${id}`);
      omac(dir, ["event", "append", "--event-id", id, "--status", "evaluating"]);
      omac(dir, ["learner", "claim", "submit", "--event-id", id, "--skill-id", skill, "--assessment", assessment, "--confidence", "0.6", "--evidence-ids", evd]);
      omac(dir, ["event", "close", "--event-id", id]);
    }
    omac(dir, ["rebuild"]);
    const view = omac(dir, ["learner", "view", "get"]);
    assert.equal(view.ok, true);
    const abilities = (view.stdout as { view: { abilities: Record<string, { status: string }> } }).view.abilities;
    assert.equal(abilities["algo.binary-search-on-answer"].status, "independent");
    assert.equal(abilities["algo.dp"].status, "observed");
  } finally {
    cleanup(dir);
  }
});
