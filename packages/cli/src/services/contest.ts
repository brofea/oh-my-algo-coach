import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { readJsonl, writeJson, readJson, appendJsonl, jsonExists } from "../store/jsonl.js";
import { requireWorkspace, omacPath, readWorkspaceConfig } from "../store/workspace.js";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import { loadEventAnywhere, listEvents } from "../store/event_store.js";

export interface ContestSubmission {
  at?: string;
  minutes_used?: number;
  verdict: "AC" | "WA" | "TLE" | "RE" | "CE" | "MLE";
}

export interface ContestProblemRecord {
  problem_ref: string;
  rating?: number;
  open_at?: string;
  opened_minutes?: number;
  submissions: ContestSubmission[];
}

export interface ContestSwitchRecord {
  from: string;
  to: string;
  at_minutes?: number;
  at?: string;
}

export interface ContestAbandonRecord {
  problem_ref: string;
  at_minutes?: number;
  at?: string;
}

export interface ContestArtifact {
  contest: { id: string; platform: string; started_at?: string; ended_at?: string };
  problems: ContestProblemRecord[];
  switches?: ContestSwitchRecord[];
  abandons?: ContestAbandonRecord[];
  reviewer?: string;
}

export interface ContestImportResult {
  contest_id: string;
  integrity: { ok: boolean; issues: string[] };
  event_id?: string;
  stored_at: string;
}

export interface ContestTimelineEntry {
  problem_ref: string;
  rating?: number;
  opened_minutes?: number;
  thinking_minutes?: number;
  debug_minutes?: number;
  ac_minutes?: number;
  submissions: { at_minutes?: number; verdict: string }[];
  switched_away_at?: number;
  abandoned_at?: number;
}

export type LossCause = "algorithm-gap" | "recognition-gap" | "implementation-slow" | "debug-slow" | "switch-late" | "risk-management";

export interface LossAttribution {
  problem_ref: string;
  cause?: LossCause;
  reason: string;
  minutes_lost?: number;
}

export interface ContestAnalysis {
  contest_id: string;
  attributions: LossAttribution[];
  summary: { total_loss_minutes: number; primary_cause?: LossCause };
}

const VERDICTS = ["AC", "WA", "TLE", "RE", "CE", "MLE"];

export function validateArtifact(a: unknown): ContestArtifact {
  const art = a as ContestArtifact;
  if (!art?.contest?.id || !art?.contest?.platform) {
    throw new OmacError("invalid_artifact", "artifact must contain contest.id and contest.platform");
  }
  if (!Array.isArray(art.problems) || art.problems.length === 0) {
    throw new OmacError("invalid_artifact", "artifact must contain a non-empty problems array");
  }
  for (const p of art.problems) {
    if (!p.problem_ref) throw new OmacError("invalid_artifact", "each problem needs problem_ref");
    for (const s of p.submissions ?? []) {
      if (!VERDICTS.includes(s.verdict)) {
        throw new OmacError("invalid_artifact", `invalid verdict '${s.verdict}' in ${p.problem_ref}`);
      }
    }
  }
  return art;
}

export function contestArtifactPath(omac: string, contestId: string): string {
  return join(omac, "artifact", "contest", `${contestId}.json`);
}

export function importContestArtifact(cwd: string, artifactPath: string, opts: { eventId?: string }): ContestImportResult {
  const ws = requireWorkspace(cwd);
  if (!existsSync(artifactPath)) throw new OmacError("file_not_found", `artifact not found: ${artifactPath}`);
  const raw = JSON.parse(readFileSync(artifactPath, "utf8"));
  const art = validateArtifact(raw);
  const issues: string[] = [];
  const opened = art.problems.filter((p) => p.opened_minutes !== undefined || p.open_at);
  if (opened.length === 0) issues.push("no problem has open time recorded");
  for (const p of opened) {
    if ((p.submissions?.length ?? 0) === 0 && !art.abandons?.some((ab) => ab.problem_ref === p.problem_ref)) {
      issues.push(`problem ${p.problem_ref} opened but has no submissions and no abandon record`);
    }
  }
  const subTimes = art.problems.flatMap((p) => (p.submissions ?? []).map((s) => s.minutes_used).filter((m): m is number => m !== undefined));
  for (let i = 1; i < subTimes.length; i++) {
    if (subTimes[i] < subTimes[i - 1]) issues.push("submission timestamps are not monotonic");
  }
  const dest = contestArtifactPath(ws.omac, art.contest.id);
  mkdirSync(join(ws.omac, "artifact", "contest"), { recursive: true });
  writeJson(dest, art);
  if (opts.eventId) {
    const { event } = loadEventAnywhere(ws.omac, opts.eventId);
    if (event.event_type !== "contest") {
      throw new OmacError("invalid_event_type", `event ${opts.eventId} is not a contest event`);
    }
  }
  return {
    contest_id: art.contest.id,
    integrity: { ok: issues.length === 0, issues },
    event_id: opts.eventId,
    stored_at: dest,
  };
}

export function loadContestArtifact(cwd: string, contestId: string): ContestArtifact {
  const ws = requireWorkspace(cwd);
  const p = contestArtifactPath(ws.omac, contestId);
  if (!jsonExists(p)) throw new OmacError("artifact_not_found", `contest artifact '${contestId}' not imported`);
  return readJson<ContestArtifact>(p);
}

export function findContestIdForEvent(cwd: string, eventId: string): string | undefined {
  const ws = requireWorkspace(cwd);
  const { event } = loadEventAnywhere(ws.omac, eventId);
  return event.contest_ref?.split("/").pop() ?? event.contest_ref;
}

export function contestTimeline(cwd: string, contestId: string): ContestTimelineEntry[] {
  const art = loadContestArtifact(cwd, contestId);
  return art.problems.map((p) => {
    const subs = p.submissions ?? [];
    const ac = subs.find((s) => s.verdict === "AC");
    const switched = art.switches?.find((s) => s.from === p.problem_ref);
    const abandoned = art.abandons?.find((a) => a.problem_ref === p.problem_ref);
    const lastSub = subs[subs.length - 1];
    const debugMinutes = subs.filter((s) => s.verdict !== "AC" && s.minutes_used !== undefined).length > 0
      ? Math.max(0, (ac?.minutes_used ?? lastSub?.minutes_used ?? p.opened_minutes ?? 0) - (p.opened_minutes ?? 0) - 5)
      : 0;
    return {
      problem_ref: p.problem_ref,
      rating: p.rating,
      opened_minutes: p.opened_minutes,
      thinking_minutes: Math.max(0, (subs[0]?.minutes_used ?? ac?.minutes_used ?? 0) - (p.opened_minutes ?? 0)),
      debug_minutes: debugMinutes,
      ac_minutes: ac?.minutes_used,
      submissions: subs.map((s) => ({ at_minutes: s.minutes_used, verdict: s.verdict })),
      switched_away_at: switched?.at_minutes,
      abandoned_at: abandoned?.at_minutes,
    };
  });
}

export function analyzeContest(cwd: string, contestId: string, opts: { learnerRating?: number }): ContestAnalysis {
  const art = loadContestArtifact(cwd, contestId);
  const timeline = contestTimeline(cwd, contestId);
  const attributions: LossAttribution[] = [];
  const learnerRating = opts.learnerRating ?? 1500;
  for (const t of timeline) {
    const rating = t.rating ?? 1500;
    if (t.opened_minutes === undefined) {
      attributions.push({ problem_ref: t.problem_ref, cause: "algorithm-gap", reason: `never opened; rating ${rating} (diff ${rating - learnerRating})`, minutes_lost: 0 });
      continue;
    }
    const ac = t.ac_minutes;
    const firstSub = t.submissions[0]?.at_minutes;
    const thinking = t.thinking_minutes ?? 0;
    const debug = t.debug_minutes ?? 0;
    if (ac === undefined) {
      const abandonedAt = t.abandoned_at ?? t.switched_away_at;
      const spent = abandonedAt !== undefined ? Math.max(0, abandonedAt - t.opened_minutes) : 60;
      if (t.submissions.length === 0 || firstSub === undefined) {
        if (spent >= 15 && spent < 45) {
          attributions.push({ problem_ref: t.problem_ref, cause: "recognition-gap", reason: `opened for ${spent} min with no effective submission — likely did not recognize the problem`, minutes_lost: spent });
        } else if (spent >= 45) {
          attributions.push({ problem_ref: t.problem_ref, cause: "switch-late", reason: `opened but produced no effective submission and kept going until ${abandonedAt ?? "?"} (${spent} min) — persistence calibration`, minutes_lost: spent });
        } else {
          attributions.push({ problem_ref: t.problem_ref, cause: "algorithm-gap", reason: `opened but abandoned quickly (${spent} min) with no submissions`, minutes_lost: spent });
        }
      } else if (spent > 20) {
        attributions.push({ problem_ref: t.problem_ref, cause: "switch-late", reason: `no new information after ~${Math.max(0, (firstSub ?? t.opened_minutes) - t.opened_minutes)} min but kept going until ${abandonedAt ?? "?"} — persistence calibration`, minutes_lost: spent });
      } else {
        attributions.push({ problem_ref: t.problem_ref, cause: "algorithm-gap", reason: `abandoned quickly (${spent} min)`, minutes_lost: spent });
      }
      continue;
    }
    if (t.submissions.length >= 4 && debug > thinking) {
      attributions.push({ problem_ref: t.problem_ref, cause: "debug-slow", reason: `${t.submissions.length} submissions, debug ${debug} min > thinking ${thinking} min`, minutes_lost: debug });
    } else if (t.submissions.length >= 2) {
      if ((t.rating ?? 1500) > learnerRating + 200) {
        attributions.push({ problem_ref: t.problem_ref, cause: "risk-management", reason: `high-value problem (rating ${t.rating}) burned ${t.submissions.length} submissions before AC at ${ac} min — risk management`, minutes_lost: ac });
      } else {
        attributions.push({ problem_ref: t.problem_ref, cause: "implementation-slow", reason: `${t.submissions.length} submissions before AC at ${ac} min`, minutes_lost: ac });
      }
    } else {
      attributions.push({ problem_ref: t.problem_ref, reason: `solved at ${ac} min with ${t.submissions.length} submissions — no major loss` });
    }
  }
  const withCause = attributions.filter((a) => a.cause !== undefined);
  const total = withCause.reduce((s, a) => s + (a.minutes_lost ?? 0), 0);
  const counts = new Map<LossCause, number>();
  for (const a of withCause) {
    if (a.cause) counts.set(a.cause, (counts.get(a.cause) ?? 0) + 1);
  }
  let primary: LossCause | undefined;
  let max = 0;
  for (const [k, v] of counts) {
    if (v > max) {
      max = v;
      primary = k;
    }
  }
  return { contest_id: contestId, attributions, summary: { total_loss_minutes: total, primary_cause: primary } };
}

export interface ContestAbilityEntry {
  skill_id: "problem-selection" | "strategic-switching" | "time-management" | "risk-management";
  status: "unknown" | "observed" | "assisted" | "independent";
  evidence_count: number;
  confidence: number;
  last_seen?: string;
}

export function contestAbilityView(cwd: string): { learner_id: string; contests_analyzed: number; entries: ContestAbilityEntry[] } {
  const ws = requireWorkspace(cwd);
  const cfg = readWorkspaceConfig(cwd);
  const analysisDir = join(ws.omac, "report", "contest-analysis.jsonl");
  const analyses = jsonExists(analysisDir) ? readJsonl<ContestAnalysis>(analysisDir) : [];
  const entries: ContestAbilityEntry[] = [];
  const causeToSkill: Record<LossCause, string> = {
    "algorithm-gap": "problem-selection",
    "recognition-gap": "problem-selection",
    "implementation-slow": "time-management",
    "debug-slow": "time-management",
    "switch-late": "strategic-switching",
    "risk-management": "risk-management",
  };  const skillStatus = new Map<string, { observed: number; independent: number; last?: string }>();
  for (const analysis of analyses) {
    for (const a of analysis.attributions) {
      if (!a.cause) continue;
      const skill = causeToSkill[a.cause];
      const entry = skillStatus.get(skill) ?? { observed: 0, independent: 0 };
      entry.observed++;
      skillStatus.set(skill, entry);
    }
  }
  for (const [skill, s] of skillStatus) {
    entries.push({
      skill_id: skill as ContestAbilityEntry["skill_id"],
      status: s.independent > 0 ? "independent" : s.observed >= 1 ? "observed" : "unknown",
      evidence_count: s.observed,
      confidence: Math.min(0.9, 0.3 + s.observed * 0.1),
    });
  }
  for (const skill of ["problem-selection", "strategic-switching", "time-management", "risk-management"] as const) {
    if (!entries.some((e) => e.skill_id === skill)) {
      entries.push({ skill_id: skill, status: "unknown", evidence_count: 0, confidence: 0 });
    }
  }
  entries.sort((a, b) => a.skill_id.localeCompare(b.skill_id));
  return { learner_id: cfg.learner_id ?? "unknown", contests_analyzed: analyses.length, entries };
}

export function recordContestAnalysis(cwd: string, analysis: ContestAnalysis): void {
  const ws = requireWorkspace(cwd);
  appendJsonl(join(ws.omac, "report", "contest-analysis.jsonl"), analysis);
}

export function linkUpsolve(cwd: string, contestEventId: string, upsolveEventId: string, problemRef?: string): { ok: boolean; contest: string; upsolve: string } {
  const ws = requireWorkspace(cwd);
  const { event: contestEvent } = loadEventAnywhere(ws.omac, contestEventId);
  if (contestEvent.event_type !== "contest") throw new OmacError("invalid_event_type", "source event must be a contest event");
  const { event: upsolveEvent } = loadEventAnywhere(ws.omac, upsolveEventId);
  if (upsolveEvent.event_type !== "upsolve") throw new OmacError("invalid_event_type", "linked event must be an upsolve event");
  appendJsonl(join(ws.omac, "report", "contest-upsolve-links.jsonl"), {
    contest_event_id: contestEventId,
    upsolve_event_id: upsolveEventId,
    problem_ref: problemRef,
    linked_at: nowIso(),
  });
  return { ok: true, contest: contestEventId, upsolve: upsolveEventId };
}

export interface FollowupSuggestion {
  event_type: "practice" | "learn";
  target_id: string;
  reason: string;
  source_cause: LossCause | "none";
}

export function contestFollowups(cwd: string, contestId: string): { suggestions: FollowupSuggestion[] } {
  const analysis = analyzeContest(cwd, contestId, {});
  const suggestions: FollowupSuggestion[] = [];
  const seen = new Set<string>();
  for (const a of analysis.attributions) {
    if (!a.cause) continue;
    if (a.cause === "switch-late" && !seen.has("strategic-switching")) {
      seen.add("strategic-switching");
      suggestions.push({ event_type: "practice", target_id: "skill.contest.strategic-switching", reason: `switch-late on ${a.problem_ref} — train persistence calibration with timed sessions`, source_cause: a.cause });
    }
    if (a.cause === "algorithm-gap" && !seen.has(`learn-${a.problem_ref}`)) {
      seen.add(`learn-${a.problem_ref}`);
      suggestions.push({ event_type: "learn", target_id: "algo.binary-search-on-answer", reason: `algorithm-gap on ${a.problem_ref} — learn/build the underlying algorithm`, source_cause: a.cause });
    }
    if ((a.cause === "implementation-slow" || a.cause === "debug-slow") && !seen.has("time-management")) {
      seen.add("time-management");
      suggestions.push({ event_type: "practice", target_id: "skill.contest.time-management", reason: `${a.cause} on ${a.problem_ref} — practice implementation speed with invariants`, source_cause: a.cause });
    }
  }
  return { suggestions };
}
