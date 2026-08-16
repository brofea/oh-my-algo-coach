import { join } from "node:path";
import { readJsonl, appendJsonl, readJson, jsonExists, writeJsonl } from "../store/jsonl.js";
import { requireWorkspace } from "../store/workspace.js";
import { OmacError, nowIso, uuid } from "../core/ids.js";

export interface RetentionRecord {
  concept_id: string;
  first_learned?: string;
  last_reviewed?: string;
  last_successful_recall?: string;
  review_count: number;
  recall_strength: number;
  retention_estimate: number;
  recommended_review_window_days: number;
  next_review_at?: string;
  reviews: RetentionReview[];
}

export interface RetentionReview {
  review_id: string;
  concept_id: string;
  event_id?: string;
  form: ReviewForm;
  result: "success" | "partial" | "fail";
  reviewed_at: string;
  evidence_id?: string;
}

export type ReviewForm = "recall" | "small-variation" | "different-statement" | "combined-technique" | "novel-transfer";
export const REVIEW_FORMS: readonly ReviewForm[] = ["recall", "small-variation", "different-statement", "combined-technique", "novel-transfer"];

const BASE_WINDOWS_DAYS = [1, 3, 7, 14, 30, 60];

export function retentionFile(omac: string): string {
  return join(omac, "learner", "state", "retention.jsonl");
}

export function listRetention(cwd: string): RetentionRecord[] {
  const ws = requireWorkspace(cwd);
  return readJsonl<RetentionRecord>(retentionFile(ws.omac));
}

export function getRetention(cwd: string, conceptId: string): RetentionRecord | undefined {
  return listRetention(cwd).find((r) => r.concept_id === conceptId);
}

export function upsertRetention(cwd: string, record: RetentionRecord): RetentionRecord {
  const ws = requireWorkspace(cwd);
  const all = listRetention(cwd);
  const rest = all.filter((r) => r.concept_id !== record.concept_id);
  writeJsonl(retentionFile(ws.omac), [...rest, record]);
  return record;
}

export function computeWindow(strength: number, successCount: number, failedSinceLastSuccess: boolean): number {
  const idx = Math.min(Math.max(successCount, 0), BASE_WINDOWS_DAYS.length - 1);
  const base = BASE_WINDOWS_DAYS[idx];
  if (failedSinceLastSuccess) return 1;
  const factor = Math.max(0.5, Math.min(2, 0.5 + strength));
  return Math.round(base * factor);
}

export function applyRecall(cwd: string, conceptId: string, result: "success" | "partial" | "fail", opts: { eventId?: string; form?: ReviewForm }): RetentionRecord {
  const existing = getRetention(cwd, conceptId) ?? {
    concept_id: conceptId,
    review_count: 0,
    recall_strength: 0,
    retention_estimate: 0,
    recommended_review_window_days: 1,
    reviews: [] as RetentionReview[],
  };
  const now = nowIso();
  const succeeded = result === "success";
  const review: RetentionReview = {
    review_id: `rev-${uuid().slice(0, 12)}`,
    concept_id: conceptId,
    event_id: opts.eventId,
    form: opts.form ?? "recall",
    result,
    reviewed_at: now,
  };
  const consecutiveSuccess = existing.reviews.length > 0 && existing.reviews[existing.reviews.length - 1].result === "success" ? lastConsecutiveSuccesses(existing) : 0;
  const failedSinceLastSuccess = existing.reviews.length > 0 && !succeeded;
  const newStrength = succeeded
    ? Math.min(1, existing.recall_strength + 0.25)
    : result === "partial"
      ? Math.max(0.1, existing.recall_strength - 0.15)
      : Math.max(0, existing.recall_strength - 0.4);
  const window = computeWindow(newStrength, succeeded ? consecutiveSuccess + 1 : consecutiveSuccess, failedSinceLastSuccess);
  const nextReview = new Date(Date.now() + window * 86400000).toISOString();
  const record: RetentionRecord = {
    concept_id: conceptId,
    first_learned: existing.first_learned ?? now,
    last_reviewed: now,
    last_successful_recall: succeeded ? now : existing.last_successful_recall,
    review_count: existing.review_count + 1,
    recall_strength: newStrength,
    retention_estimate: succeeded ? newStrength * 0.9 : existing.retention_estimate * 0.6,
    recommended_review_window_days: window,
    next_review_at: nextReview,
    reviews: [...existing.reviews, review],
  };
  upsertRetention(cwd, record);
  return record;
}

function lastConsecutiveSuccesses(r: RetentionRecord): number {
  let n = 0;
  for (let i = r.reviews.length - 1; i >= 0; i--) {
    if (r.reviews[i].result === "success") n++;
    else break;
  }
  return n;
}

export function dueRetention(cwd: string, now?: string): RetentionRecord[] {
  const ts = now ?? nowIso();
  return listRetention(cwd).filter((r) => !r.next_review_at || r.next_review_at <= ts);
}

export interface GapReport {
  concept_id: string;
  teach_back_success_at?: string;
  later_recall_fail_at?: string;
  immediate_vs_delayed: "forgotten" | "retained";
}

export function retentionGaps(cwd: string, opts?: { minDelayDays?: number }): GapReport[] {
  const records = listRetention(cwd);
  const minDelay = opts?.minDelayDays ?? 1;
  const gaps: GapReport[] = [];
  for (const r of records) {
    const teaches = r.reviews.filter((v) => v.form === "recall" && v.result === "success");
    const laterFails = r.reviews.filter((v) => v.form === "recall" && v.result === "fail");
    const immediate = teaches.length > 0 ? teaches[0] : undefined;
    const laterFail = immediate ? laterFails.find((f) => f.reviewed_at > immediate.reviewed_at && daysBetween(immediate.reviewed_at, f.reviewed_at) >= minDelay) : undefined;
    if (laterFail) {
      gaps.push({
        concept_id: r.concept_id,
        teach_back_success_at: immediate?.reviewed_at,
        later_recall_fail_at: laterFail.reviewed_at,
        immediate_vs_delayed: "forgotten",
      });
      continue;
    }
    gaps.push({ concept_id: r.concept_id, immediate_vs_delayed: "retained" });
  }
  return gaps;
}

export interface ImmediateDelayedPair {
  concept_id: string;
  immediate_at?: string;
  immediate_result?: string;
  delayed_at?: string;
  delayed_result?: string;
  outcome: "retained" | "forgotten" | "pending";
}

export function retentionPairs(cwd: string): ImmediateDelayedPair[] {
  const records = listRetention(cwd);
  const pairs: ImmediateDelayedPair[] = [];
  for (const r of records) {
    const immediate = r.reviews.find((v) => v.form === "recall" && v.result === "success");
    const delayed = immediate ? r.reviews.find((v) => v.form === "recall" && v.reviewed_at > immediate.reviewed_at) : undefined;
    pairs.push({
      concept_id: r.concept_id,
      immediate_at: immediate?.reviewed_at,
      immediate_result: immediate?.result,
      delayed_at: delayed?.reviewed_at,
      delayed_result: delayed?.result,
      outcome: delayed ? (delayed.result === "success" ? "retained" : "forgotten") : "pending",
    });
  }
  return pairs;
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export interface CurriculumCandidate {
  concept_id: string;
  action: "review" | "practice" | "learn" | "recognition";
  priority: number;
  reason: string;
}

export function curriculumCandidates(cwd: string, view: { abilities?: Record<string, { status?: string }> }): CurriculumCandidate[] {
  const all = listRetention(cwd);
  const due = dueRetention(cwd);
  const candidates: CurriculumCandidate[] = [];
  for (const r of all) {
    const isDue = due.some((d) => d.concept_id === r.concept_id);
    if (isDue || r.recall_strength < 0.3) {
      candidates.push({
        concept_id: r.concept_id,
        action: "review",
        priority: isDue ? 10 + Math.round((1 - r.retention_estimate) * 20) : 40,
        reason: isDue
          ? `retention due (strength ${r.recall_strength.toFixed(2)}, last reviewed ${r.last_reviewed ?? "never"})`
          : `low recall strength (${r.recall_strength.toFixed(2)}) — review before it decays further`,
      });
    }
  }
  const abilities = view.abilities ?? {};
  for (const [skillId, est] of Object.entries(abilities)) {
    if (est.status === "assisted" || est.status === "observed") {
      candidates.push({
        concept_id: skillId,
        action: "practice",
        priority: est.status === "assisted" ? 50 : 65,
        reason: `skill ${skillId} at ${est.status} — practice to build independence`,
      });
    }
    if (est.status === "insufficient_evidence") {
      candidates.push({
        concept_id: skillId,
        action: "learn",
        priority: 80,
        reason: `insufficient evidence for ${skillId} — diagnostic learn session recommended`,
      });
    }
    if (est.status === "unknown" || est.status === "observed") {
      candidates.push({
        concept_id: skillId,
        action: "recognition",
        priority: est.status === "unknown" ? 90 : 70,
        reason: `build recognition/generation for ${skillId} with unlabeled problems`,
      });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.slice(0, 10);
}
