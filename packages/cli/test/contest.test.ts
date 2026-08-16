import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup } from "./helpers.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function makeArtifact(dir: string, problems: unknown[], extra: Record<string, unknown> = {}): string {
  const p = join(dir, "artifact.json");
  writeFileSync(p, JSON.stringify({
    contest: { id: "abc389", platform: "atcoder", started_at: "2026-08-01T09:00:00Z", ended_at: "2026-08-01T11:00:00Z" },
    problems,
    ...extra,
  }));
  return p;
}

test("V4.1: contest artifact import validates and checks integrity", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-cont"]);
    const bad = makeArtifact(dir, [{ problem_ref: "abc389:A", submissions: [{ verdict: "XX" }] }]);
    const rBad = omac(dir, ["contest", "import", "--artifact", bad]);
    assert.equal(rBad.ok, false);
    assert.match(rBad.stderr, /invalid verdict/);
    const incomplete = makeArtifact(dir, [
      { problem_ref: "abc389:A", opened_minutes: 5, submissions: [] },
      { problem_ref: "abc389:B", opened_minutes: 20, submissions: [{ minutes_used: 30, verdict: "AC" }] },
    ]);
    const r = omac(dir, ["contest", "import", "--artifact", incomplete]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { contest_id: string; integrity: { ok: boolean; issues: string[] } };
    assert.equal(out.contest_id, "abc389");
    assert.equal(out.integrity.ok, false);
    assert.ok(out.integrity.issues.some((i) => i.includes("abc389:A")));
  } finally {
    cleanup(dir);
  }
});

test("V4.2: timeline computation from artifact", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-tl"]);
    const art = makeArtifact(dir, [
      { problem_ref: "abc389:A", rating: 400, opened_minutes: 0, submissions: [{ minutes_used: 12, verdict: "WA" }, { minutes_used: 18, verdict: "AC" }] },
      { problem_ref: "abc389:B", rating: 800, opened_minutes: 25, submissions: [] },
    ], { abandons: [{ problem_ref: "abc389:B", at_minutes: 60 }] });
    omac(dir, ["contest", "import", "--artifact", art]);
    const evId = (omac(dir, ["event", "create", "--type", "contest", "--artifact", art, "--confirm-ended", "--contest-ref", "abc389", "--target-ids", "algo.dp"]).stdout as { event_id: string }).event_id;
    const r = omac(dir, ["contest", "timeline", "--event-id", evId]);
    assert.equal(r.ok, true, r.stderr);
    const tl = (r.stdout as { timeline: { problem_ref: string; ac_minutes: number; submissions: unknown[] }[] }).timeline;
    const a = tl.find((x) => x.problem_ref === "abc389:A");
    assert.equal(a?.ac_minutes, 18);
    assert.equal(a?.submissions.length, 2);
  } finally {
    cleanup(dir);
  }
});

test("V4.3: loss attribution distinguishes the five causes", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-loss"]);
    const art = makeArtifact(dir, [
      { problem_ref: "p1", rating: 800, opened_minutes: 0, submissions: [{ minutes_used: 10, verdict: "WA" }, { minutes_used: 45, verdict: "AC" }] },
      { problem_ref: "p2", rating: 1000, opened_minutes: 30, submissions: [] },
      { problem_ref: "p3", rating: 1200, opened_minutes: 5, submissions: [{ minutes_used: 8, verdict: "WA" }, { minutes_used: 10, verdict: "WA" }, { minutes_used: 15, verdict: "WA" }, { minutes_used: 20, verdict: "WA" }, { minutes_used: 25, verdict: "AC" }] },
      { problem_ref: "p4", rating: 1400 },
      { problem_ref: "p5", rating: 900, opened_minutes: 40, submissions: [] },
    ], { abandons: [{ problem_ref: "p2", at_minutes: 75 }, { problem_ref: "p5", at_minutes: 60 }] });
    omac(dir, ["contest", "import", "--artifact", art]);
    const evId = (omac(dir, ["event", "create", "--type", "contest", "--artifact", art, "--confirm-ended", "--contest-ref", "abc389", "--target-ids", "algo.dp"]).stdout as { event_id: string }).event_id;
    const r = omac(dir, ["contest", "analyze", "--event-id", evId]);
    assert.equal(r.ok, true, r.stderr);
    const analysis = (r.stdout as { analysis: { attributions: { problem_ref: string; cause?: string }[]; summary: { primary_cause?: string } } }).analysis;
    const byProblem = new Map(analysis.attributions.map((a) => [a.problem_ref, a.cause]));
    assert.equal(byProblem.get("p1"), "implementation-slow", "p1: 2 submissions, debug likely <= thinking — implementation slow");
    assert.equal(byProblem.get("p2"), "switch-late", "p2: opened, no effective submissions, kept until 75min");
    assert.equal(byProblem.get("p3"), "debug-slow", "p3: 4 non-AC submissions with long debug");
    assert.equal(byProblem.get("p4"), "algorithm-gap", "p4: never opened");
    assert.equal(byProblem.get("p5"), "recognition-gap", "p5: opened 20 min, no submissions, abandoned");
    assert.ok(analysis.summary.primary_cause);
  } finally {
    cleanup(dir);
  }
});

test("V4.4: contest ability view aggregates analyses", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-cv"]);
    const art = makeArtifact(dir, [
      { problem_ref: "p1", rating: 800, opened_minutes: 0, submissions: [{ minutes_used: 10, verdict: "WA" }, { minutes_used: 45, verdict: "AC" }] },
      { problem_ref: "p2", rating: 1400 },
    ]);
    omac(dir, ["contest", "import", "--artifact", art]);
    const evId = (omac(dir, ["event", "create", "--type", "contest", "--artifact", art, "--confirm-ended", "--contest-ref", "abc389", "--target-ids", "algo.dp"]).stdout as { event_id: string }).event_id;
    omac(dir, ["contest", "analyze", "--event-id", evId]);
    const view = omac(dir, ["view", "contest"]);
    assert.equal(view.ok, true, view.stderr);
    const v = (view.stdout as { view: { contests_analyzed: number; entries: { skill_id: string; status: string }[] } }).view;
    assert.equal(v.contests_analyzed, 1);
    const skills = new Map(v.entries.map((e) => [e.skill_id, e.status]));
    assert.ok(skills.has("time-management"));
    assert.ok(skills.has("problem-selection"));
    assert.equal(skills.get("time-management"), "observed");
  } finally {
    cleanup(dir);
  }
});

test("V4.5: upsolve linking and followup suggestions", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-up"]);
    const art = makeArtifact(dir, [
      { problem_ref: "p1", rating: 800, opened_minutes: 0, submissions: [{ minutes_used: 10, verdict: "WA" }, { minutes_used: 45, verdict: "AC" }] },
      { problem_ref: "p2", rating: 1400 },
    ]);
    omac(dir, ["contest", "import", "--artifact", art]);
    const contestEv = (omac(dir, ["event", "create", "--type", "contest", "--artifact", art, "--confirm-ended", "--contest-ref", "abc389", "--target-ids", "algo.dp"]).stdout as { event_id: string }).event_id;
    const upsolveEv = (omac(dir, ["event", "create", "--type", "upsolve", "--problem-ref", "p2"]).stdout as { event_id: string }).event_id;
    const link = omac(dir, ["contest", "link-upsolve", "--event-id", contestEv, "--upsolve-event", upsolveEv, "--problem-ref", "p2"]);
    assert.equal(link.ok, true, link.stderr);
    const badLink = omac(dir, ["contest", "link-upsolve", "--event-id", upsolveEv, "--upsolve-event", contestEv]);
    assert.equal(badLink.ok, false);
    const fp = omac(dir, ["contest", "followups", "--event-id", contestEv]);
    assert.equal(fp.ok, true, fp.stderr);
    const suggestions = (fp.stdout as { suggestions: { event_type: string; source_cause: string }[] }).suggestions;
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some((s) => s.event_type === "learn" && s.source_cause === "algorithm-gap"));
  } finally {
    cleanup(dir);
  }
});

test("V4.6: live-contest solving still refused (D-011 regression)", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-live"]);
    const art = makeArtifact(dir, [{ problem_ref: "p1", submissions: [] }]);
    const r = omac(dir, ["event", "create", "--type", "contest", "--artifact", art, "--confirm-ended", "--live"]);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /post-contest|not supported/i);
  } finally {
    cleanup(dir);
  }
});
