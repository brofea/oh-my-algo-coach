import { join } from "node:path";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import { AssessmentClaim, LearnerView, MisconceptionState, SkillEstimate, TargetHistoryEntry, IndependenceStatus } from "../core/types.js";
import { readJsonl, writeJson, appendJsonl } from "./jsonl.js";
import { requireWorkspace } from "./workspace.js";
import { CLAIM_SELECTION_POLICY_VERSION, selectClaims } from "./claim_store.js";

export const REDUCER_VERSION = "reducer-v1";

const STATUS_ORDER = ["unknown", "insufficient_evidence", "observed", "assisted", "independent", "transferred", "retained", "conflicted"];

export function viewsFile(omac: string, learnerId: string): string {
  return join(omac, "learner", "views", `${learnerId}.views.json`);
}

export interface RebuildInput {
  claimSet?: string[];
  reducerVersion?: string;
  learnerId: string;
}

export function rebuildView(cwd: string, input: RebuildInput): LearnerView {
  const ws = requireWorkspace(cwd);
  const reducerVersion = input.reducerVersion ?? REDUCER_VERSION;
  if (reducerVersion !== REDUCER_VERSION) {
    throw new OmacError("unsupported_reducer", `reducer version '${reducerVersion}' not supported`);
  }
  const allClaims = readJsonl<AssessmentClaim>(join(ws.omac, "claims", "claims.jsonl")).filter(
    (c) => c.learner_id === input.learnerId
  );
  const scope = input.claimSet
    ? allClaims.filter((c) => input.claimSet!.includes(c.claim_id))
    : allClaims;
  if (input.claimSet) {
    const found = new Set(scope.map((c) => c.claim_id));
    const missing = input.claimSet.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new OmacError(
        "claim_set_error",
        `claim set references claims not found for learner '${input.learnerId}': ${missing.join(", ")}`
      );
    }
  }
  const { claims } = selectClaims(scope);
  const view = computeView(ws.omac, input.learnerId, claims, reducerVersion);
  writeView(cwd, view);
  return view;
}

export function computeView(omac: string, learnerId: string, claims: AssessmentClaim[], reducerVersion: string): LearnerView {
  const abilities: Record<string, SkillEstimate> = {};
  const misconceptions: Record<string, MisconceptionState> = {};
  const targetHistory: TargetHistoryEntry[] = [];

  for (const c of claims) {
    if (c.assessment === "unknown" || c.assessment === "insufficient_evidence" || c.assessment === "conflicted") {
      const existing = abilities[c.skill_id];
      if (!existing) {
        abilities[c.skill_id] = {
          skill_id: c.skill_id,
          status: c.assessment,
          confidence: c.confidence,
          evidence_count: 1,
          evidence_ids: [...c.evidence_ids],
          last_seen: c.created_at,
        };
      }
      continue;
    }
    const prev = abilities[c.skill_id];
    const evidenceCount = (prev?.evidence_count ?? 0) + 1;
    const evidenceIds = [...(prev?.evidence_ids ?? []), ...c.evidence_ids];
    const statusRank = (v: string) => STATUS_ORDER.indexOf(v);
    const status = !prev || statusRank(c.assessment) >= statusRank(prev.status) ? c.assessment : prev.status;
    const estimate = mergeEstimate(prev?.estimate, c.confidence, evidenceCount);
    abilities[c.skill_id] = {
      skill_id: c.skill_id,
      status,
      estimate,
      confidence: c.confidence,
      evidence_count: evidenceCount,
      evidence_ids: evidenceIds,
      trend: prev ? trendOf(prev.status, status) : "flat",
      last_seen: c.created_at,
    };
  }

  for (const c of claims) {
    const misId = c.target_id ?? c.claim_scope ?? c.skill_id;
    if (!c.target_id && !c.claim_scope) continue;
    const existing = misconceptions[misId];
    const supporting = c.assessment === "observed" || c.assessment === "assisted" || c.assessment === "independent"
      ? [...(existing?.supporting_evidence ?? []), c.claim_id]
      : [...(existing?.supporting_evidence ?? [])];
    const contradicting = c.assessment === "transferred" || c.assessment === "retained"
      ? [...(existing?.contradicting_evidence ?? []), c.claim_id]
      : [...(existing?.contradicting_evidence ?? [])];
    misconceptions[misId] = {
      misconception_id: misId,
      status: classifyMisconception(supporting.length, contradicting.length, existing?.status),
      confidence: existing?.confidence ? Math.min(1, existing.confidence + c.confidence * 0.2) : c.confidence * 0.5,
      observed_count: (existing?.observed_count ?? 0) + (c.assessment === "observed" ? 1 : 0),
      first_seen: existing?.first_seen ?? c.created_at,
      last_seen: c.created_at,
      supporting_evidence: supporting,
      contradicting_evidence: contradicting,
      related_concepts: existing?.related_concepts ?? [],
    };
  }

  for (const c of claims) {
    if (!c.target_id) continue;
    const eventId = c.input_snapshot_ref?.startsWith("event:") ? c.input_snapshot_ref.slice("event:".length) : undefined;
    targetHistory.push({
      target_id: c.target_id,
      event_id: eventId ?? "unknown",
      event_type: (c as unknown as { extra?: { event_type?: string } }).extra?.event_type as LearnerView["target_history"][number]["event_type"] ?? "practice",
      assessment: c.assessment,
      independence_status: independenceOf(c),
      ended_at: c.created_at,
    });
  }
  targetHistory.sort((a, b) => (a.ended_at! < b.ended_at! ? -1 : 1));

  return {
    view_id: `view-${uuid().slice(0, 12)}`,
    view_version: "1.0.0",
    workspace_id: claims[0]?.workspace_id ?? "unknown",
    learner_id: learnerId,
    reducer_version: reducerVersion,
    claim_set_ref: claims.map((c) => c.claim_id),
    claim_selection_policy_version: CLAIM_SELECTION_POLICY_VERSION,
    generated_at: nowIso(),
    abilities,
    misconceptions,
    target_history: targetHistory,
    summary: {
      total_claims: claims.length,
      independent_count: claims.filter((c) => c.assessment === "independent").length,
      assisted_count: claims.filter((c) => c.assessment === "assisted").length,
    },
  };
}

function mergeEstimate(prev: [number, number] | undefined, confidence: number, evidenceCount: number): [number, number] {
  const width = Math.max(200, Math.round(1400 * Math.pow(0.75, evidenceCount - 1)));
  const center = prev ? (prev[0] + prev[1]) / 2 : 1500;
  const shift = (confidence - 0.5) * 100;
  const c = Math.round(center + shift);
  return [Math.max(0, c - Math.floor(width / 2)), c + Math.ceil(width / 2)];
}

function trendOf(prev: string, curr: string): "up" | "down" | "flat" {
  const a = STATUS_ORDER.indexOf(prev);
  const b = STATUS_ORDER.indexOf(curr);
  if (a < b) return "up";
  if (a > b) return "down";
  return "flat";
}

function independenceOf(c: AssessmentClaim): IndependenceStatus | undefined {
  if (c.assessment === "independent") return "independent";
  if (c.assessment === "assisted") return "assisted";
  if (c.assessment === "transferred") return "transferred";
  if (c.assessment === "retained") return "retained";
  return undefined;
}

function classifyMisconception(
  supporting: number,
  contradicting: number,
  prev?: MisconceptionState["status"]
): MisconceptionState["status"] {
  if (contradicting > supporting * 2 && supporting > 0) return "improving";
  if (contradicting > supporting) return "resolved";
  if (supporting >= 3) return "confirmed";
  if (supporting >= 1) return "suspected";
  return prev ?? "suspected";
}

export function getView(cwd: string, learnerId: string): LearnerView {
  const ws = requireWorkspace(cwd);
  const p = viewsFile(ws.omac, learnerId);
  const all = readJsonl<LearnerView>(p);
  if (all.length === 0) {
    throw new OmacError("view_not_found", `no learner view exists for '${learnerId}'; run 'omac learner claim submit' then rebuild`);
  }
  return all[all.length - 1];
}

export function writeView(cwd: string, view: LearnerView): void {
  const ws = requireWorkspace(cwd);
  const p = viewsFile(ws.omac, view.learner_id);
  appendJsonl(p, view);
}

export function listViews(cwd: string, learnerId: string): LearnerView[] {
  const ws = requireWorkspace(cwd);
  const p = viewsFile(ws.omac, learnerId);
  if (!p) return [];
  try {
    return readJsonl<LearnerView>(p);
  } catch {
    return [];
  }
}
