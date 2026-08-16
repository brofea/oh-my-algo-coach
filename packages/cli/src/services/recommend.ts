import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { readJsonl, readJson } from "../store/jsonl.js";
import { requireWorkspace } from "../store/workspace.js";
import { listProblems, getProblem } from "../store/knowledge_store.js";
import { ProblemManifestEntry, ProblemStatusRecord, RecommendationCandidate, TargetContract } from "../core/types.js";
import { OmacError } from "../core/ids.js";
import { getTarget, listTargets } from "../protocol/target.js";
import { problemStatuses, cachedContent } from "./ecosystem.js";
import { installedPacks } from "./memory.js";

export interface RecommendationInput {
  targetId: string;
  mode: "auto" | "exploitation" | "exploration";
  limit: number;
  platform?: string;
  solvedExcluded: boolean;
  learnerView?: { abilities?: Record<string, { status?: string; confidence?: number; evidence_count?: number; estimate?: [number, number] }> };
}

const STATUS_LEVEL: Record<string, number> = { unknown: 0, insufficient_evidence: 1, observed: 2, assisted: 3, independent: 4, transferred: 5, retained: 6 };

export function recommendProblems(cwd: string, input: RecommendationInput): { candidates: RecommendationCandidate[]; degraded: boolean; note: string } {
  const target = getTarget(cwd, input.targetId);
  const pool: ProblemManifestEntry[] = listProblems(cwd).filter((p) => !input.platform || p.platform === input.platform);
  const cacheProblems = cachedContent(cwd, "codeforces")
    .concat(cachedContent(cwd, "atcoder"))
    .filter((c) => c.kind === "problem")
    .map((c) => ({ problem_ref: c.ref, platform: c.connector_id, rating: (c.data as { rating?: number } | null)?.rating, tags: (c.data as { tags?: string[] } | null)?.tags ?? [], added_at: "" }));
  for (const cp of cacheProblems) {
    if (!pool.some((p) => p.problem_ref === cp.problem_ref)) {
      pool.push(cp);
    }
  }
  if (pool.length === 0) {
    return { candidates: [], degraded: true, note: "no local problem manifest — recommendation degraded to empty pool; add problems via 'problem add' or connector cache" };
  }
  const statuses = problemStatuses(cwd);
  const solved = new Set(statuses.filter((s) => s.status === "solved").map((s) => s.problem_ref));
  const attempted = new Set(statuses.filter((s) => s.status === "attempted").map((s) => s.problem_ref));

  const mode = resolveMode(input, target);
  const ability = input.learnerView?.abilities?.[input.targetId];
  const estimate = ability?.estimate ?? [1400, 1600];
  const targetTags = targetTagsFor(cwd, input.targetId);

  const candidates: RecommendationCandidate[] = [];
  for (const p of pool) {
    if (input.solvedExcluded && solved.has(p.problem_ref)) continue;
    if (attempted.has(p.problem_ref)) continue;
    const rating = p.rating ?? 1500;
    const novelty = !attempted.has(p.problem_ref) && !solved.has(p.problem_ref);
    const coverage = matchTags(p.tags ?? [], targetTags);
    if (mode === "exploitation") {
      const distancePenalty = Math.abs(rating - (estimate[0] + estimate[1]) / 2);
      const score = coverage * 40 + (novelty ? 20 : 0) - distancePenalty / 30;
      candidates.push({ problem_ref: p.problem_ref, platform: p.platform, difficulty: p.difficulty, rating, target_id: input.targetId, reason: `exploitation: rating ${rating} near estimate [${estimate[0]}-${estimate[1]}], coverage ${coverage}/2, novelty ${novelty}`, mode, score: Math.round(score * 100) / 100, novelty });
    } else {
      const distancePenalty = Math.abs(rating - (estimate[0] + estimate[1]) / 2) / 60;
      const coverage = matchTags(p.tags ?? [], targetTags);
      const score = coverage * 15 - distancePenalty + (p.tags?.length === 0 || p.tags === undefined ? 10 : 0);
      candidates.push({ problem_ref: p.problem_ref, platform: p.platform, difficulty: p.difficulty, rating, target_id: input.targetId, reason: `exploration: diagnostic value for ${input.targetId} (confidence ${ability?.confidence?.toFixed(2) ?? "?"}, evidence ${ability?.evidence_count ?? 0})`, mode, score: Math.round(score * 100) / 100, novelty });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return { candidates: candidates.slice(0, input.limit), degraded: false, note: `mode=${mode} pool=${pool.length} excluded=${solved.size + attempted.size}` };
}

function resolveMode(input: RecommendationInput, target: TargetContract): "exploitation" | "exploration" {
  if (input.mode !== "auto") return input.mode;
  const ability = input.learnerView?.abilities?.[input.targetId];
  if (!ability) return "exploration";
  if (ability.confidence !== undefined && ability.confidence < 0.35) return "exploration";
  if (ability.evidence_count !== undefined && ability.evidence_count < 3) return "exploration";
  return "exploitation";
}

function matchTags(problemTags: string[], targetTags: string[]): number {
  let n = 0;
  for (const t of targetTags) {
    if (problemTags.includes(t)) n++;
  }
  return n;
}

export function targetTagsFor(cwd: string, targetId: string): string[] {
  const t = getTarget(cwd, targetId);
  const tagMap: Record<string, string[]> = {
    "algo.binary-search-on-answer": ["binary-search", "greedy"],
    "skill.problem-solving.state-design": ["dp"],
    "algo.dp": ["dp"],
    "algo.greedy": ["greedy"],
    "algo.data-structure.bit": ["bit", "offline"],
  };
  return tagMap[targetId] ?? [t.category === "algorithm" ? t.target_id.split(".").pop() ?? "" : ""].filter(Boolean);
}

export function explainRecommendation(cwd: string, problemRef: string): { problem_ref: string; target_links: { target_id: string; name: string }[]; pattern_cards: string[]; reason: string } {
  const p = getProblem(cwd, problemRef);
  const targets = listTargets(cwd);
  const targetLinks = targets.filter((t) => matchTags(p.tags ?? [], targetTagsFor(cwd, t.target_id)) > 0).map((t) => ({ target_id: t.target_id, name: t.name }));
  return {
    problem_ref: problemRef,
    target_links: targetLinks,
    pattern_cards: patternCardsFor(cwd, p.tags ?? []),
    reason: `problem ${problemRef} tagged [${(p.tags ?? []).join(", ")}]; linked to targets via tag coverage`,
  };
}

function patternCardsFor(cwd: string, tags: string[]): string[] {
  const ws = requireWorkspace(cwd);
  const packs = installedPacks(cwd).filter((pk) => pk.manifest.kind === "pattern");
  const cards: string[] = [];
  for (const pack of packs) {
    const dir = join(pack.dir, "patterns");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const card = readJson<{ pattern_id: string; candidate_techniques?: string[]; related_targets?: string[] }>(join(dir, name));
        const cardTags = [...(card.candidate_techniques ?? []), ...(card.related_targets ?? [])].flatMap((t) => t.split("."));
        if (tags.some((t) => cardTags.includes(t))) cards.push(card.pattern_id);
      } catch {
        // skip
      }
    }
  }
  return cards;
}
