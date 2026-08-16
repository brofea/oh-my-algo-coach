import { AssessmentClaim, TransferProbe } from "../core/types.js";
import { listClaims } from "../store/claim_store.js";
import { getTransferProbes, loadEventAnywhere, listEvents } from "../store/event_store.js";
import { readWorkspaceConfig, requireWorkspace } from "../store/workspace.js";
import { AlgorithmAbilityViewEntry, ProblemSolvingViewEntry, MisconceptionState, TransferProbeSummary, EventRecord } from "../core/types.js";
import { OmacError, nowIso } from "../core/ids.js";
import { join } from "node:path";
import { archivedEventDir, jsonExists, readJson } from "../store/jsonl.js";

const ABILITY_DIMENSIONS = [
  "conceptual-understanding",
  "recognition",
  "recall",
  "implementation",
  "proof",
  "debugging",
  "generation",
  "transfer",
];

export interface AlgorithmAbilityView {
  learner_id: string;
  view: "algorithm-ability";
  generated_at: string;
  entries: AlgorithmAbilityViewEntry[];
}

export interface ProblemSolvingView {
  learner_id: string;
  view: "problem-solving";
  generated_at: string;
  entries: ProblemSolvingViewEntry[];
}

export interface MisconceptionView {
  learner_id: string;
  view: "misconception";
  generated_at: string;
  misconceptions: MisconceptionState[];
}

export function algorithmAbilityView(cwd: string): AlgorithmAbilityView {
  const cfg = readWorkspaceConfig(cwd);
  if (!cfg.learner_id) throw new OmacError("no_learner", "no learner bound");
  const claims = listClaims(cwd, { learnerId: cfg.learner_id }).filter((c) => c.skill_id.startsWith("algo."));
  const bySkill = new Map<string, AssessmentClaim[]>();
  for (const c of claims) {
    const arr = bySkill.get(c.skill_id) ?? [];
    arr.push(c);
    bySkill.set(c.skill_id, arr);
  }
  const entries: AlgorithmAbilityViewEntry[] = [];
  for (const [skillId, cs] of bySkill) {
    const dims: AlgorithmAbilityViewEntry["dimensions"] = {};
    for (const dim of ABILITY_DIMENSIONS) {
      const dimClaims = cs.filter((c) => (c.claim_scope ?? c.extra?.dimension) === dim);
      if (dimClaims.length > 0) {
        const last = dimClaims[dimClaims.length - 1];
        dims[dim] = {
          dimension: dim,
          status: last.assessment,
          evidence_count: dimClaims.length,
          evidence_ids: dimClaims.flatMap((x) => x.evidence_ids),
          last_seen: last.created_at,
        };
      }
    }
    const last = cs[cs.length - 1];
    entries.push({
      skill_id: skillId,
      overall: last.assessment,
      dimensions: dims,
      estimate: last.extra?.estimate as [number, number] | undefined,
      confidence: last.confidence,
      evidence_count: cs.length,
    });
  }
  entries.sort((a, b) => a.skill_id.localeCompare(b.skill_id));
  return { learner_id: cfg.learner_id, view: "algorithm-ability", generated_at: new Date().toISOString(), entries };
}

export function problemSolvingView(cwd: string): ProblemSolvingView {
  const cfg = readWorkspaceConfig(cwd);
  if (!cfg.learner_id) throw new OmacError("no_learner", "no learner bound");
  const claims = listClaims(cwd, { learnerId: cfg.learner_id }).filter((c) => c.skill_id.startsWith("skill.problem-solving."));
  const bySkill = new Map<string, AssessmentClaim[]>();
  for (const c of claims) {
    const arr = bySkill.get(c.skill_id) ?? [];
    arr.push(c);
    bySkill.set(c.skill_id, arr);
  }
  const entries: ProblemSolvingViewEntry[] = [];
  for (const [skillId, cs] of bySkill) {
    const sorted = [...cs].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const last = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
    const rank = (v: string) => ["unknown", "observed", "assisted", "independent", "transferred", "retained"].indexOf(v);
    const trend = prev && rank(last.assessment) > rank(prev.assessment) ? "up" : prev && rank(last.assessment) < rank(prev.assessment) ? "down" : "flat";
    entries.push({
      skill_id: skillId,
      overall: last.assessment,
      evidence_count: cs.length,
      confidence: last.confidence,
      trend,
    });
  }
  entries.sort((a, b) => a.skill_id.localeCompare(b.skill_id));
  return { learner_id: cfg.learner_id, view: "problem-solving", generated_at: new Date().toISOString(), entries };
}

export function misconceptionView(cwd: string): MisconceptionView {
  const cfg = readWorkspaceConfig(cwd);
  if (!cfg.learner_id) throw new OmacError("no_learner", "no learner bound");
  const claims = listClaims(cwd, { learnerId: cfg.learner_id });
  const map = new Map<string, MisconceptionState>();
  for (const c of claims) {
    const misId = c.target_id ?? c.claim_scope;
    if (!misId || !misId.startsWith("misconception.")) continue;
    const existing = map.get(misId);
    const supporting = c.assessment === "observed" || c.assessment === "assisted"
      ? [...(existing?.supporting_evidence ?? []), c.claim_id]
      : existing?.supporting_evidence ?? [];
    const contradicting = c.assessment === "transferred" || c.assessment === "retained" || c.assessment === "independent"
      ? [...(existing?.contradicting_evidence ?? []), c.claim_id]
      : existing?.contradicting_evidence ?? [];
    const observedCount = (existing?.observed_count ?? 0) + (c.assessment === "observed" ? 1 : 0);
    map.set(misId, {
      misconception_id: misId,
      status: classify(supporting.length, contradicting.length, observedCount),
      confidence: existing?.confidence ? Math.min(1, existing.confidence + c.confidence * 0.15) : c.confidence * 0.4,
      observed_count: observedCount,
      first_seen: existing?.first_seen ?? c.created_at,
      last_seen: c.created_at,
      supporting_evidence: supporting,
      contradicting_evidence: contradicting,
      related_concepts: existing?.related_concepts ?? [],
    });
  }
  const misconceptions = [...map.values()].sort((a, b) => b.observed_count - a.observed_count);
  return { learner_id: cfg.learner_id, view: "misconception", generated_at: new Date().toISOString(), misconceptions };
}

function classify(supporting: number, contradicting: number, observedCount: number): MisconceptionState["status"] {
  if (contradicting >= 2 && contradicting > supporting) return "resolved";
  if (contradicting >= 1 && contradicting >= supporting) return "improving";
  if (supporting >= 3 || observedCount >= 3) return "confirmed";
  if (supporting >= 1) return "suspected";
  return "suspected";
}

export function transferProbeSummary(cwd: string, eventId?: string): TransferProbeSummary {
  const ws = requireWorkspace(cwd);
  const probes = eventId
    ? getTransferProbes(ws.omac, eventId).map((probe) => ({ probe, event: { id: eventId } as EventRecord }))
    : allTransferProbes(cwd);
  const results = probes.map((x) => x.probe);
  return {
    total: results.length,
    independent_success: results.filter((p) => p.result === "independent-success").length,
    assisted_success: results.filter((p) => p.result === "assisted-success").length,
    fail: results.filter((p) => p.result === "fail").length,
    unknown: results.filter((p) => p.result === "unknown" || p.result === undefined).length,
  };
}

function allTransferProbes(cwd: string) {
  const ws = requireWorkspace(cwd);
  const { working, archived } = listEvents(ws.omac);
  const all: { probe: TransferProbe; event: EventRecord }[] = [];
  for (const e of [...working, ...archived]) {
    try {
      loadEventAnywhere(ws.omac, e.id);
      for (const probe of getTransferProbes(ws.omac, e.id)) {
        all.push({ probe, event: e });
      }
    } catch {
      continue;
    }
  }
  return all;
}

export interface TransferRateReport {
  metric_id: string;
  learner_id: string;
  status: "ok" | "insufficient_evidence";
  value: number | null;
  numerator: number;
  denominator: number;
  sample_size: number;
  time_window: { start?: string; end?: string };
  min_samples: number;
  target_summary: { target_id: string; count: number }[];
  boundary_summary: string;
  novelty_rule: string;
  source_event_ids: string[];
  assumptions: string[];
  uncertainty: string;
}

const TRANSFER_MIN_SAMPLES = 3;

function eventBoundaries(omac: string, event: EventRecord): unknown[] {
  const isArchived = event.archive_ref || event.status === "closed" || event.status === "cancelled";
  const dir = isArchived ? archivedEventDir(omac, event.id) : join(omac, "event", event.id);
  const p = join(dir, "boundary.json");
  if (!jsonExists(p)) return [];
  try {
    return readJson<unknown[]>(p);
  } catch {
    return [];
  }
}

/**
 * Novel Independent Transfer Rate (PRD §11 / V5):
 * denominator = eligible transfer attempts (confirmed target, boundary snapshot,
 * novelty declared, independent mode, complete result); numerator = eligible
 * attempts that achieved independent-success. Below min samples the value is
 * null and status is insufficient_evidence — never a fabricated 0%.
 */
export function transferRateReport(cwd: string, opts: { timeWindowDays?: number; minSamples?: number; learnerId?: string } = {}): TransferRateReport {
  const cfg = readWorkspaceConfig(cwd);
  const learnerId = opts.learnerId ?? cfg.learner_id;
  if (!learnerId) throw new OmacError("no_learner", "no learner bound");
  const ws = requireWorkspace(cwd);
  const minSamples = opts.minSamples ?? TRANSFER_MIN_SAMPLES;
  const windowDays = opts.timeWindowDays;
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString() : undefined;

  const eligible: { probe: TransferProbe; event: EventRecord }[] = [];
  const rejected: string[] = [];
  for (const { probe, event } of allTransferProbes(cwd)) {
    if (event.learner_id !== learnerId) continue;
    if (cutoff && event.created_at < cutoff) continue;
    if (!probe.result || !["independent-success", "assisted-success", "fail"].includes(probe.result)) {
      rejected.push(`incomplete result: ${probe.probe_id}`);
      continue;
    }
    if (event.target_status === "provisional" || event.target_status === "unresolved") {
      rejected.push(`unconfirmed target: ${probe.probe_id}`);
      continue;
    }
    if (eventBoundaries(ws.omac, event).length === 0) {
      rejected.push(`missing boundary: ${probe.probe_id}`);
      continue;
    }
    const noveltyDeclared = Boolean(probe.problem_familiarity || probe.prior_exposure !== undefined || probe.editorial_exposure !== undefined || probe.external_help !== undefined);
    if (!noveltyDeclared) {
      rejected.push(`novelty not declared: ${probe.probe_id}`);
      continue;
    }
    if (probe.result === "assisted-success") {
      rejected.push(`assisted attempt: ${probe.probe_id}`);
      continue;
    }
    eligible.push({ probe, event });
  }

  const numerator = eligible.filter((x) => x.probe.result === "independent-success").length;
  const denominator = eligible.length;
  const targetSummary = new Map<string, number>();
  for (const { probe } of eligible) {
    targetSummary.set(probe.target_id, (targetSummary.get(probe.target_id) ?? 0) + 1);
  }
  const timestamps = eligible.map((x) => x.event.created_at).sort();
  const value = denominator >= minSamples ? numerator / denominator : null;
  return {
    metric_id: "transfer-rate.novel-independent",
    learner_id: learnerId,
    status: denominator >= minSamples ? "ok" : "insufficient_evidence",
    value,
    numerator,
    denominator,
    sample_size: denominator,
    time_window: windowDays ? { start: cutoff, end: nowIso() } : { start: timestamps[0], end: timestamps[timestamps.length - 1] },
    min_samples: minSamples,
    target_summary: [...targetSummary.entries()].map(([target_id, count]) => ({ target_id, count })),
    boundary_summary: "eligible attempts must reference at least one event boundary snapshot; boundary content is not re-scored",
    novelty_rule: "novelty declared via problem_familiarity / prior_exposure / editorial_exposure / external_help on the probe",
    source_event_ids: eligible.map((x) => x.event.id),
    assumptions: ["denominator excludes assisted-success, provisional/unresolved targets, missing boundaries and undeclared novelty", "target confirmation defaults to confirmed when event.target_status is absent"],
    uncertainty: denominator < minSamples ? `insufficient evidence: ${denominator}/${minSamples} minimum samples; missing ${minSamples - denominator} eligible attempt(s); excluded: ${rejected.slice(0, 5).join("; ")}` : `heuristic baseline over ${denominator} eligible attempts; no causal claim`,
  };
}
