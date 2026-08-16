import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent, appendEvidence, setBoundary } from "./helpers.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

test("B1: event create validates target contracts; explore may omit, practice may be provisional", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tg"]);
    const unknown = omac(dir, ["event", "create", "--type", "practice", "--target-ids", "algo.not-registered"]);
    assert.equal(unknown.ok, false);
    assert.match(unknown.stderr, /target_not_found/);
    assert.match(unknown.stderr, /known targets/);

    const explore = omac(dir, ["event", "create", "--type", "explore", "--intent", "explore DP"]);
    assert.equal(explore.ok, true, explore.stderr);

    const provisional = omac(dir, ["event", "create", "--type", "practice", "--target-ids", "algo.dp", "--target-status", "provisional"]);
    assert.equal(provisional.ok, true, provisional.stderr);
    assert.equal((provisional.stdout as { event: { target_status: string } }).event.target_status, "provisional");

    const badStatus = omac(dir, ["event", "create", "--type", "practice", "--target-ids", "algo.dp", "--target-status", "maybe"]);
    assert.equal(badStatus.ok, false);
    assert.match(badStatus.stderr, /target-status/);

    const confirmed = omac(dir, ["event", "create", "--type", "practice", "--target-ids", "algo.dp", "--target-status", "confirmed"]);
    assert.equal(confirmed.ok, true, confirmed.stderr);
  } finally {
    cleanup(dir);
  }
});

test("B2: contest requires confirmed target and non-empty artifact file", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-cg"]);
    const empty = join(dir, "empty.json");
    writeFileSync(empty, "");
    const rEmpty = omac(dir, ["event", "create", "--type", "contest", "--artifact", empty, "--confirm-ended", "--target-ids", "algo.dp"]);
    assert.equal(rEmpty.ok, false);
    assert.match(rEmpty.stderr, /empty/);

    const dirPath = join(dir, "adir");
    mkdirSync(dirPath);
    const rDir = omac(dir, ["event", "create", "--type", "contest", "--artifact", dirPath, "--confirm-ended", "--target-ids", "algo.dp"]);
    assert.equal(rDir.ok, false);
    assert.match(rDir.stderr, /regular file/);

    const missing = omac(dir, ["event", "create", "--type", "contest", "--artifact", join(dir, "nope.json"), "--confirm-ended", "--target-ids", "algo.dp"]);
    assert.equal(missing.ok, false);
    assert.match(missing.stderr, /not found/);

    const noTarget = join(dir, "fine.json");
    writeFileSync(noTarget, JSON.stringify({ contest: { id: "x", platform: "atcoder" }, problems: [{ problem_ref: "x:A", submissions: [{ minutes_used: 5, verdict: "AC" }] }] }));
    const rNoTarget = omac(dir, ["event", "create", "--type", "contest", "--artifact", noTarget, "--confirm-ended"]);
    assert.equal(rNoTarget.ok, false);
    assert.match(rNoTarget.stderr, /target/);

    const prov = omac(dir, ["event", "create", "--type", "contest", "--artifact", noTarget, "--confirm-ended", "--target-ids", "algo.dp", "--target-status", "provisional"]);
    assert.equal(prov.ok, false);
    assert.match(prov.stderr, /confirmed/);

    const ok = omac(dir, ["event", "create", "--type", "contest", "--artifact", noTarget, "--confirm-ended", "--target-ids", "algo.dp"]);
    assert.equal(ok.ok, true, ok.stderr);
    const event = (ok.stdout as { event: { artifact_ref?: string; id: string } }).event;
    assert.ok(event.artifact_ref, "contest event must store artifact reference");
    const arts = omac(dir, ["artifact", "list"]);
    const list = (arts.stdout as { artifacts: { artifact_id: string; event_id: string; kind: string; sha256: string }[] }).artifacts;
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, "contest");
    assert.equal(list[0].event_id, event.id);
    assert.match(list[0].sha256, /^sha256:/);
  } finally {
    cleanup(dir);
  }
});

test("B3: boundary snapshots are immutable, bindable to evidence and required for independent claims", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-bnd"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);

    const b1 = omac(dir, ["event", "boundary", "set", "--event-id", evId, "--target-id", "algo.dp"]);
    assert.equal(b1.ok, true, b1.stderr);
    const bndId1 = (b1.stdout as { boundary: { boundary_id: string } }).boundary.boundary_id;
    const bndMode1 = (b1.stdout as { boundary: { editorial_exposure?: boolean } }).boundary;

    const b2 = omac(dir, ["event", "boundary", "set", "--event-id", evId, "--target-id", "algo.dp"]);
    assert.equal(b2.ok, true, b2.stderr);
    const bndId2 = (b2.stdout as { boundary: { boundary_id: string } }).boundary.boundary_id;
    assert.notEqual(bndId1, bndId2, "each snapshot must get a fresh boundary_id");

    const list = omac(dir, ["event", "boundary", "list", "--event-id", evId]);
    const boundaries = (list.stdout as { boundaries: { boundary_id: string }[] }).boundaries;
    assert.equal(boundaries.length, 2, "snapshots must be append-only");

    const evd = appendEvidence(dir, evId, "observation under boundary", "op-b1", ["--boundary-id", bndId1]);
    const badBoundary = omac(dir, ["evidence", "append", "--event-id", evId, "--content", "x", "--boundary-id", "bnd-nope", "--operation-id", "op-b2"]);
    assert.equal(badBoundary.ok, false);
    assert.match(badBoundary.stderr, /boundary_not_found/);
    void evd;

    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    const noBnd = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "independent", "--confidence", "0.7"]);
    assert.equal(noBnd.ok, false);
    assert.match(noBnd.stderr, /boundary_required/);
    assert.match(noBnd.stderr, /event boundary set/);

    const withBnd = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "independent", "--confidence", "0.7", "--boundary-id", bndId2]);
    assert.equal(withBnd.ok, true, withBnd.stderr);
    const claims = omac(dir, ["learner", "view", "get"]).ok === true;
    void claims;
    void bndMode1;
  } finally {
    cleanup(dir);
  }
});

test("B4: closed events reject ordinary evidence; correction path requires operation-id + supersedes + reason", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-cls"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const e1 = appendEvidence(dir, evId, "original observation", "op-c1");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--evidence-ids", e1]);
    omac(dir, ["event", "close", "--event-id", evId]);

    const plain = omac(dir, ["evidence", "append", "--event-id", evId, "--content", "late fact", "--operation-id", "op-late"]);
    assert.equal(plain.ok, false);
    assert.match(plain.stderr, /event_closed/);
    assert.match(plain.stderr, /correction/);

    const noOp = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "correction", "--content", "fix", "--supercedes", e1, "--reason", "was wrong"]);
    assert.equal(noOp.ok, false);
    assert.match(noOp.stderr, /correction_gate/);

    const noSup = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "correction", "--content", "fix", "--operation-id", "op-fix", "--reason", "was wrong"]);
    assert.equal(noSup.ok, false);
    assert.match(noSup.stderr, /correction_gate/);

    const wrongEvent = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "correction", "--content", "fix", "--operation-id", "op-fix2", "--supercedes", "evd-not-this-event", "--reason", "x"]);
    assert.equal(wrongEvent.ok, false);
    assert.match(wrongEvent.stderr, /evidence_mismatch|not found/);

    const okFix = omac(dir, ["evidence", "append", "--event-id", evId, "--type", "correction", "--content", "fix", "--operation-id", "op-fix3", "--supercedes", e1, "--reason", "student saw editorial"]);
    assert.equal(okFix.ok, true, okFix.stderr);
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    const content = (report.stdout as { content: { evidence: unknown[] } }).content;
    const fix = content.evidence.find((x) => (x as { evidence_type: string }).evidence_type === "correction");
    assert.ok(fix, "correction must be persisted");
    const corr = (fix as { extra: { correction: { operation_id: string; supersedes: string[] } } }).extra.correction;
    assert.equal(corr.operation_id, "op-fix3");
    assert.deepEqual(corr.supersedes, [e1]);
  } finally {
    cleanup(dir);
  }
});

test("B5: diagnose claims require student confirmation; unconfirmed submit is rejected", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-dg"]);
    const evId = newEvent(dir, "diagnose", ["--target-ids", "algo.dp", "--intent", "check dp understanding"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);

    const unconfirmed = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--student-confirmation", "pending"]);
    assert.equal(unconfirmed.ok, false);
    assert.match(unconfirmed.stderr, /diagnose_confirmation_required/);

    const rejected = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--student-confirmation", "rejected"]);
    assert.equal(rejected.ok, false);
    assert.match(rejected.stderr, /diagnose_confirmation_required/);

    const before = omac(dir, ["learner", "view", "get"]);
    assert.equal(before.ok, false, "no view may exist before confirmation");

    const confirmed = omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--student-confirmation", "confirmed"]);
    assert.equal(confirmed.ok, true, confirmed.stderr);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const after = omac(dir, ["learner", "view", "get"]);
    assert.equal(after.ok, true, after.stderr);
    const abilities = (after.stdout as { view: { abilities: Record<string, { status: string }> } }).view.abilities;
    assert.equal(abilities["algo.dp"].status, "observed", "only the confirmed diagnose claim may update state");
  } finally {
    cleanup(dir);
  }
});

test("B6: claims reject missing and cross-event evidence", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-ev"]);
    const ev1 = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    const ev2 = newEvent(dir, "practice", ["--target-ids", "algo.greedy"]);
    const e2 = appendEvidence(dir, ev2, "evidence of event 2", "op-e2");
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", ev1, "--status", "evaluating"]);

    const missing = omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--evidence-ids", "evd-does-not-exist"]);
    assert.equal(missing.ok, false);
    assert.match(missing.stderr, /evidence_not_found/);

    const cross = omac(dir, ["learner", "claim", "submit", "--event-id", ev1, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5", "--evidence-ids", e2]);
    assert.equal(cross.ok, false);
    assert.match(cross.stderr, /evidence_mismatch/);
  } finally {
    cleanup(dir);
  }
});

test("B8: write paths honor operation_id idempotency (boundary/probe/subflow/artifact)", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-opid"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);

    const b1 = omac(dir, ["event", "boundary", "set", "--event-id", evId, "--target-id", "algo.dp", "--operation-id", "op-bnd-1"]);
    assert.equal(b1.ok, true, b1.stderr);
    const bndId1 = (b1.stdout as { boundary: { boundary_id: string } }).boundary.boundary_id;
    const b2 = omac(dir, ["event", "boundary", "set", "--event-id", evId, "--target-id", "algo.dp", "--operation-id", "op-bnd-1"]);
    assert.equal(b2.ok, true, b2.stderr);
    assert.equal((b2.stdout as { boundary: { boundary_id: string }; resumed: boolean }).boundary.boundary_id, bndId1, "same operation-id must return original snapshot");
    assert.equal((b2.stdout as { resumed: boolean }).resumed, true);
    const boundaries = (omac(dir, ["event", "boundary", "list", "--event-id", evId]).stdout as { boundaries: unknown[] }).boundaries;
    assert.equal(boundaries.length, 1, "retry must not append a second snapshot");

    const p1 = omac(dir, ["transfer-probe", "add", "--event-id", evId, "--target-id", "algo.dp", "--result", "independent-success", "--problem-ref", "cf:1", "--declared-before-start", "--operation-id", "op-prb-1"]);
    assert.equal(p1.ok, true, p1.stderr);
    const p2 = omac(dir, ["transfer-probe", "add", "--event-id", evId, "--target-id", "algo.dp", "--result", "independent-success", "--problem-ref", "cf:1", "--declared-before-start", "--operation-id", "op-prb-1"]);
    assert.equal(p2.ok, true, p2.stderr);
    assert.equal((p2.stdout as { resumed: boolean }).resumed, true);
    const summary = omac(dir, ["transfer-probe", "summary", "--event-id", evId]);
    assert.equal((summary.stdout as { summary: { total: number } }).summary.total, 1, "probe retry must not duplicate");

    const s1 = omac(dir, ["subflow", "add", "--event-id", evId, "--kind", "debug", "--operation-id", "op-sf-1"]);
    assert.equal(s1.ok, true, s1.stderr);
    const s2 = omac(dir, ["subflow", "add", "--event-id", evId, "--kind", "debug", "--operation-id", "op-sf-1"]);
    assert.equal((s2.stdout as { resumed: boolean }).resumed, true);
    const subflows = (omac(dir, ["subflow", "list", "--event-id", evId]).stdout as { subflows: unknown[] }).subflows;
    assert.equal(subflows.length, 1, "subflow retry must not duplicate");

    const artFile = join(dir, "code.cpp");
    writeFileSync(artFile, "int main(){}");
    const a1 = omac(dir, ["artifact", "add", "--event-id", evId, "--file", artFile, "--kind", "code", "--operation-id", "op-art-1"]);
    assert.equal(a1.ok, true, a1.stderr);
    const a2 = omac(dir, ["artifact", "add", "--event-id", evId, "--file", artFile, "--kind", "code", "--operation-id", "op-art-1"]);
    assert.equal((a2.stdout as { resumed: boolean }).resumed, true);
    const arts = (omac(dir, ["artifact", "list"]).stdout as { artifacts: unknown[] }).artifacts;
    assert.equal(arts.length, 1, "artifact retry must not duplicate");
  } finally {
    cleanup(dir);
  }
});

test("B7: boundary may not be modified on closed/cancelled/archived events", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-bcl"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.dp"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    const bnd = setBoundary(dir, evId, "algo.dp");
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.dp", "--assessment", "observed", "--confidence", "0.5"]);
    omac(dir, ["event", "close", "--event-id", evId]);
    const late = omac(dir, ["event", "boundary", "set", "--event-id", evId, "--target-id", "algo.dp"]);
    assert.equal(late.ok, false);
    assert.match(late.stderr, /closed|archived/);
    const list = omac(dir, ["event", "boundary", "list", "--event-id", evId]);
    assert.equal(list.ok, true, list.stderr);
    const boundaries = (list.stdout as { boundaries: { boundary_id: string }[] }).boundaries;
    assert.equal(boundaries.length, 1, "archived event boundaries must remain readable");
    assert.equal(boundaries[0].boundary_id, bnd);
    const report = omac(dir, ["report", "--scope", "event", "--event-id", evId, "--format", "json"]);
    assert.equal(report.ok, true, report.stderr);
  } finally {
    cleanup(dir);
  }
});
