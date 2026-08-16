import { OmacError } from "../core/ids.js";
import { LearnerView, AssessmentClaim, EvidenceRecord, EventRecord } from "../core/types.js";
import { listClaims, getClaim } from "../store/claim_store.js";
import { listEvidence } from "../store/evidence_store.js";
import { loadEventAnywhere, listEvents } from "../store/event_store.js";
import { readJsonl } from "../store/jsonl.js";
import { requireWorkspace } from "../store/workspace.js";

export interface ExplainChain {
  view: LearnerView;
  skill_id: string;
  claims: AssessmentClaim[];
  evidence: EvidenceRecord[];
  events: EventRecord[];
}

export function explainWhy(cwd: string, learnerId: string, skillId: string): ExplainChain {
  const ws = requireWorkspace(cwd);
  const views = readViews(ws.omac, learnerId);
  if (views.length === 0) {
    throw new OmacError("view_not_found", `no learner view exists for '${learnerId}'`);
  }
  const view = views[views.length - 1];
  const estimate = view.abilities[skillId];
  if (!estimate) {
    throw new OmacError("skill_not_found", `skill '${skillId}' not in learner view`);
  }
  const claims = listClaims(cwd, { learnerId }).filter((c) => c.skill_id === skillId);
  const claimIds = new Set(claims.map((c) => c.claim_id));
  const evidenceIds = new Set(claims.flatMap((c) => c.evidence_ids));
  const evidence = listEvidence(cwd).filter((e) => evidenceIds.has(e.evidence_id));
  const eventIds = new Set<string>();
  for (const ev of evidence) eventIds.add(ev.event_id);
  const events: EventRecord[] = [];
  for (const e of eventIds) {
    try {
      events.push(loadEventAnywhere(ws.omac, e).event);
    } catch {
      // skip missing event
    }
  }
  return { view, skill_id: skillId, claims, evidence, events };
}

function readViews(omac: string, learnerId: string): LearnerView[] {
  const p = `${omac}/learner/views/${learnerId}.views.json`;
  try {
    return readJsonl<LearnerView>(p);
  } catch {
    return [];
  }
}

export function learnerSummary(cwd: string, learnerId: string): Record<string, unknown> {
  const ws = requireWorkspace(cwd);
  const views = readViews(ws.omac, learnerId);
  if (views.length === 0) return { learner_id: learnerId, message: "no evidence yet" };
  const view = views[views.length - 1];
  const skills = Object.values(view.abilities).map((a) => ({
    skill_id: a.skill_id,
    status: a.status,
    estimate: a.estimate,
    confidence: a.confidence,
  }));
  const { working, archived } = listEvents(ws.omac);
  return {
    learner_id: learnerId,
    skill_count: skills.length,
    skills,
    misconception_count: Object.keys(view.misconceptions).length,
    event_count: working.length + archived.length,
    archived_event_count: archived.length,
    target_history: view.target_history.map((t) => ({
      target_id: t.target_id,
      event_id: t.event_id,
      assessment: t.assessment,
    })),
  };
}
