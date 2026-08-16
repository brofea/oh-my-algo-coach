import { AssessmentClaim } from "../core/types.js";
import { listClaims } from "../store/claim_store.js";
import { getTransferProbes } from "../store/event_store.js";
import { readWorkspaceConfig, requireWorkspace } from "../store/workspace.js";
import { AlgorithmAbilityViewEntry, ProblemSolvingViewEntry, MisconceptionState, TransferProbeSummary } from "../core/types.js";
import { OmacError } from "../core/ids.js";

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
  const probes = eventId ? getTransferProbes(ws.omac, eventId) : allTransferProbes(cwd);
  return {
    total: probes.length,
    independent_success: probes.filter((p) => p.result === "independent-success").length,
    assisted_success: probes.filter((p) => p.result === "assisted-success").length,
    fail: probes.filter((p) => p.result === "fail").length,
    unknown: probes.filter((p) => p.result === "unknown" || p.result === undefined).length,
  };
}

function allTransferProbes(cwd: string) {
  const ws = requireWorkspace(cwd);
  const { listEvents, loadEventAnywhere, getTransferProbes } = require("../store/event_store.js") as typeof import("../store/event_store.js");
  const { working, archived } = listEvents(ws.omac);
  const all: ReturnType<typeof getTransferProbes> = [];
  for (const e of [...working, ...archived]) {
    try {
      loadEventAnywhere(ws.omac, e.id);
      all.push(...getTransferProbes(ws.omac, e.id));
    } catch {
      continue;
    }
  }
  return all;
}
