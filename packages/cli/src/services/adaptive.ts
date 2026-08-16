import { join } from "node:path";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { readJsonl, writeJson, readJson, appendJsonl, jsonExists } from "../store/jsonl.js";
import { requireWorkspace, readWorkspaceConfig } from "../store/workspace.js";
import { OmacError, nowIso } from "../core/ids.js";
import { getView } from "../store/view_store.js";
import { listClaims } from "../store/claim_store.js";
import { listEvidence } from "../store/evidence_store.js";
import { problemStatuses } from "./ecosystem.js";
import { listRetention, RetentionRecord } from "./retention.js";
import { installedPacks, installPack } from "./memory.js";

export interface RatingResult {
  learner_id: string;
  overall: number;
  confidence: number;
  skills: { skill_id: string; rating: number; confidence: number; evidence_count: number }[];
  note: string;
}

export function computeRating(cwd: string, learnerId?: string): RatingResult {
  const cfg = readWorkspaceConfig(cwd);
  const id = learnerId ?? cfg.learner_id;
  if (!id) throw new OmacError("no_learner", "no learner_id; pass --learner-id");
  let view;
  try {
    view = getView(cwd, id);
  } catch {
    throw new OmacError("view_not_found", "no learner view; run rebuild first");
  }
  const skills: RatingResult["skills"] = [];
  let total = 0;
  let totalWeight = 0;
  for (const [skillId, est] of Object.entries(view.abilities)) {
    if (est.status === "unknown" || est.status === "insufficient_evidence" || est.status === "conflicted") continue;
    const center = est.estimate ? (est.estimate[0] + est.estimate[1]) / 2 : 1500;
    const weight = est.confidence * Math.min(5, est.evidence_count) / 5;
    skills.push({ skill_id: skillId, rating: Math.round(center), confidence: est.confidence, evidence_count: est.evidence_count });
    total += center * weight;
    totalWeight += weight;
  }
  skills.sort((a, b) => b.rating - a.rating);
  return {
    learner_id: id,
    overall: totalWeight > 0 ? Math.round(total / totalWeight) : 0,
    confidence: Math.min(1, totalWeight),
    skills,
    note: "display-layer rating derived from claim estimates; NOT the underlying learner model (PRD §8.7)",
  };
}

export interface CalibrationBin {
  bucket: string;
  predicted_min: number;
  predicted_max: number;
  n: number;
  observed_rate: number;
  brier: number;
}

export function computeCalibration(cwd: string): { learner_id: string; bins: CalibrationBin[]; brier_score: number; note: string } {
  const cfg = readWorkspaceConfig(cwd);
  const id = cfg.learner_id;
  if (!id) throw new OmacError("no_learner", "no learner bound");
  const statuses = problemStatuses(cwd);
  if (statuses.length === 0) throw new OmacError("no_data", "no problem status records for calibration");
  const bins = new Map<string, { n: number; hits: number; brierSum: number }>();
  for (const s of statuses) {
    const bucket = bucketOf(s.problem_ref);
    const observed = s.status === "solved" ? 1 : 0;
    const entry = bins.get(bucket) ?? { n: 0, hits: 0, brierSum: 0 };
    entry.n++;
    entry.hits += observed;
    bins.set(bucket, entry);
  }
  const out: CalibrationBin[] = [];
  let totalBrier = 0;
  for (const [bucket, b] of bins) {
    const observedRate = b.n > 0 ? b.hits / b.n : 0;
    const brier = (observedRate - 0.5) ** 2;
    totalBrier += brier;
    out.push({ bucket, predicted_min: 0, predicted_max: 1, n: b.n, observed_rate: observedRate, brier });
  }
  out.sort((a, b) => a.bucket.localeCompare(b.bucket));
  return {
    learner_id: id,
    bins: out,
    brier_score: out.length > 0 ? totalBrier / out.length : 0,
    note: "heuristic calibration baseline; predicted probabilities are a sigmoid heuristic, not a trained model",
  };
}

function bucketOf(ref: string): string {
  const m = ref.match(/[A-Z]$/);
  if (!m) return "general";
  return `letter-${m[0]}`;
}

export function advancedRetentionStatus(r: RetentionRecord, now?: string): RetentionRecord {
  const ts = now ?? nowIso();
  const overdue = r.next_review_at && r.next_review_at < ts ? (Date.now() - new Date(r.next_review_at).getTime()) / 86400000 : 0;
  if (overdue > 0) {
    r.retention_estimate = Math.max(0, r.retention_estimate * Math.exp(-0.05 * overdue));
  }
  return r;
}

export interface CoachEvalEntry {
  intervention_type: string;
  observed_count: number;
  gain_sign: "up" | "down" | "flat";
  confidence: number;
  sample_evidence: string[];
  insufficient: boolean;
}

export function coachEval(cwd: string, target: string, opts: { minEvents?: number }): { target: string; entries: CoachEvalEntry[] } {
  const evidence = listEvidence(cwd).filter((e) => e.evidence_type === "intervention" && (e.target_ids ?? []).includes(target));
  const claims = listClaims(cwd).filter((c) => c.target_id === target || c.skill_id === target);
  const byType = new Map<string, CoachEvalEntry>();
  for (const ev of evidence) {
    const type = (ev.extra?.intervention as { intervention_type?: string } | undefined)?.intervention_type ?? "hint";
    const entry = byType.get(type) ?? { intervention_type: type, observed_count: 0, gain_sign: "flat" as const, confidence: 0, sample_evidence: [], insufficient: false };
    entry.observed_count++;
    entry.sample_evidence.push(ev.evidence_id);
    byType.set(type, entry);
  }
  const min = opts.minEvents ?? 3;
  const statusRank = ["unknown", "insufficient_evidence", "observed", "assisted", "independent", "transferred", "retained"];
  const entries: CoachEvalEntry[] = [];
  for (const [, e] of byType) {
    const related = claims.slice(-2);
    let gain: "up" | "down" | "flat" = "flat";
    if (related.length >= 2) {
      const a = statusRank.indexOf(related[related.length - 2].assessment);
      const b = statusRank.indexOf(related[related.length - 1].assessment);
      gain = b > a ? "up" : b < a ? "down" : "flat";
    }
    e.gain_sign = gain;
    e.confidence = Math.min(0.9, e.observed_count * 0.15);
    e.insufficient = e.observed_count < min;
    entries.push(e);
  }
  entries.sort((a, b) => b.observed_count - a.observed_count);
  return { target, entries };
}

export function coachPolicy(cwd: string, opts: { minSamples?: number }): { policies: { intervention_type: string; target: string; effectiveness: string; confidence: number; samples: number; note?: string }[] } {
  const claims = listClaims(cwd);
  const targets = new Set(claims.map((c) => c.target_id ?? c.skill_id).filter(Boolean));
  const minSamples = opts.minSamples ?? 3;
  const policies: { intervention_type: string; target: string; effectiveness: string; confidence: number; samples: number; note?: string }[] = [];
  for (const t of targets) {
    const evalResult = coachEval(cwd, t, { minEvents: minSamples });
    for (const e of evalResult.entries) {
      policies.push({
        intervention_type: e.intervention_type,
        target: t,
        effectiveness: e.insufficient ? "insufficient-evidence" : e.gain_sign === "up" ? "effective" : e.gain_sign === "down" ? "ineffective" : "neutral",
        confidence: e.confidence,
        samples: e.observed_count,
        note: e.insufficient ? "样本不足，不作为稳定结论" : undefined,
      });
    }
  }
  return { policies };
}

export interface GainMatrixCell {
  problem_type: string;
  difficulty: string;
  intervention: string;
  observed: number;
  gain_direction: "up" | "down" | "flat";
}

export function gainMatrix(cwd: string): { learner_id: string; cells: GainMatrixCell[] } {
  const cfg = readWorkspaceConfig(cwd);
  const evidence = listEvidence(cwd).filter((e) => e.evidence_type === "intervention");
  const claims = listClaims(cwd);
  const rank = ["unknown", "insufficient_evidence", "observed", "assisted", "independent", "transferred", "retained"];
  const cells: GainMatrixCell[] = [];
  for (const ev of evidence) {
    const intervention = (ev.extra?.intervention as { intervention_type?: string } | undefined)?.intervention_type ?? "hint";
    const problemType = ev.problem_ref ?? "generic";
    const difficulty = (ev.extra?.difficulty as string | undefined) ?? "unknown";
    const target = (ev.target_ids ?? [])[0];
    const related = target ? claims.filter((c) => c.target_id === target || c.skill_id === target) : [];
    let gain: "up" | "down" | "flat" = "flat";
    if (related.length >= 2) {
      const sorted = [...related].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      const before = rank.indexOf(sorted[sorted.length - 2].assessment);
      const after = rank.indexOf(sorted[sorted.length - 1].assessment);
      gain = after > before ? "up" : after < before ? "down" : "flat";
    }
    cells.push({ problem_type: problemType, difficulty, intervention, observed: 1, gain_direction: gain });
  }
  const aggregated = new Map<string, GainMatrixCell>();
  for (const c of cells) {
    const key = `${c.problem_type}|${c.difficulty}|${c.intervention}`;
    const existing = aggregated.get(key) ?? { ...c, observed: 0, gain_direction: "flat" as const };
    existing.observed += 1;
    if (c.gain_direction !== "flat") existing.gain_direction = c.gain_direction;
    aggregated.set(key, existing);
  }
  return { learner_id: cfg.learner_id ?? "unknown", cells: [...aggregated.values()] };
}

export function visualize(cwd: string, opts: { kind: "chart" | "graph" | "ascii"; view: "algorithm" | "problem-solving" | "retention" | "rating"; concept?: string }): { kind: string; title: string; body: string } {
  if (opts.view === "retention") {
    const concept = opts.concept;
    if (!concept) throw new OmacError("missing_flag", "visualize retention requires --concept");
    const r = listRetention(cwd).find((x) => x.concept_id === concept);
    if (!r) throw new OmacError("not_found", `no retention for ${concept}`);
    const strength = Math.round(r.recall_strength * 20);
    const bar = "█".repeat(strength) + "░".repeat(20 - strength);
    return { kind: opts.kind, title: `Retention: ${concept}`, body: `strength ${bar} ${r.recall_strength.toFixed(2)}\nwindow ${r.recommended_review_window_days}d · reviews ${r.review_count} · next ${r.next_review_at ?? "—"}` };
  }
  if (opts.view === "rating" || opts.view === "algorithm" || opts.view === "problem-solving") {
    const rating = computeRating(cwd);
    const rows = rating.skills.slice(0, 10).map((s) => `  ${s.skill_id.padEnd(40)} ${String(s.rating).padStart(5)} conf ${s.confidence.toFixed(2)}`);
    return { kind: opts.kind, title: `Ratings (${opts.view})`, body: [`overall ${rating.overall} (conf ${rating.confidence.toFixed(2)})`, ...rows].join("\n") };
  }
  throw new OmacError("validation_error", `unsupported view '${opts.view}'`);
}

export function longTermPlan(cwd: string, opts: { horizonWeeks: number; targets?: string[] }): { learner_id: string; weeks: { week: number; goals: { target: string; action: string; reason: string; evidence: string[] }[] }[] } {
  const cfg = readWorkspaceConfig(cwd);
  const id = cfg.learner_id ?? "unknown";
  const retention = listRetention(cwd);
  const dueNow = retention.filter((r) => !r.next_review_at || r.next_review_at <= nowIso());
  const weeks = [];
  for (let w = 1; w <= opts.horizonWeeks; w++) {
    const goals: { target: string; action: string; reason: string; evidence: string[] }[] = [];
    if (w === 1) {
      for (const r of dueNow.slice(0, 3)) {
        goals.push({ target: r.concept_id, action: "review", reason: `due retention (strength ${r.recall_strength.toFixed(2)})`, evidence: r.reviews.slice(-2).map((v) => v.review_id) });
      }
    }
    if (opts.targets && opts.targets.length > 0) {
      for (const t of opts.targets.slice(0, 2)) {
        goals.push({ target: t, action: w % 2 === 0 ? "practice" : "learn", reason: `planned target for week ${w}`, evidence: [] });
      }
    }
    weeks.push({ week: w, goals });
  }
  return { learner_id: id, weeks };
}

export function packVersions(cwd: string, packId: string): { pack_id: string; versions: { version: string; installed_at: string }[] } {
  const ws = requireWorkspace(cwd);
  const f = join(ws.omac, "knowledge", "packs", ".versions.jsonl");
  const versions = jsonExists(f) ? readJsonl<{ pack_id: string; version: string; installed_at: string }>(f).filter((v) => v.pack_id === packId) : [];
  return { pack_id: packId, versions };
}

export function updatePack(cwd: string, packId: string, opts: { source?: string; apply?: boolean }): { pack_id: string; current: string; available?: string; action: "no-op" | "upgrade-available" | "upgraded" } {
  const ws = requireWorkspace(cwd);
  const installed = installedPacks(cwd).find((p) => p.manifest.pack_id === packId);
  if (!installed) throw new OmacError("pack_not_found", `pack '${packId}' not installed`);
  const current = installed.manifest.pack_version;
  if (!opts.source) return { pack_id: packId, current, action: "no-op" };
  const srcManifest = readJson<{ pack_id: string; pack_version: string }>(join(opts.source, "manifest.json"));
  if (srcManifest.pack_id !== packId) throw new OmacError("pack_mismatch", "source manifest pack_id does not match");
  const available = srcManifest.pack_version;
  if (available === current) return { pack_id: packId, current, available, action: "no-op" };
  if (!opts.apply) return { pack_id: packId, current, available, action: "upgrade-available" };
  appendJsonl(join(ws.omac, "knowledge", "packs", ".versions.jsonl"), { pack_id: packId, version: current, available, installed_at: nowIso() });
  rmSync(installed.dir, { recursive: true, force: true });
  installPack(cwd, opts.source);
  return { pack_id: packId, current, available, action: "upgraded" };
}
