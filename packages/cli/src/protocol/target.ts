import { readdirSync } from "node:fs";
import { OmacError } from "../core/ids.js";
import { TargetContract, IndependenceBoundary, CoachingMode } from "../core/types.js";
import { readJson, writeJson, jsonExists } from "../store/jsonl.js";
import { omacPath, requireWorkspace } from "../store/workspace.js";

export const TARGET_VERSION = "1.0.0";

const BUILTIN_TARGETS: TargetContract[] = [
  {
    target_id: "skill.problem-solving.state-design",
    target_version: "1.0.0",
    name: "DP State Design",
    category: "problem-solving",
    prerequisites: ["algo.dp.basic"],
    observable_behaviors: [
      "states what the state represents",
      "identifies information the state must retain",
      "points out prerequisite states of the transition",
      "validates state sufficiency with boundary cases or counterexamples",
    ],
    success_criteria: [
      "learner can explain what the state represents",
      "learner can state which information the state must retain",
      "learner can point out the prerequisite states the transition depends on",
      "learner can validate whether the state is sufficient with a boundary case or counterexample",
      "learner transfers to a new statement without an explicit algorithm name",
    ],
    failure_taxonomy: ["state-stores-too-much", "state-stores-too-little", "transition-direction-confusion", "missing-boundary"],
    required_evidence: ["observation.student-state-explanation", "observation.transition-derivation"],
    transfer_probe: "unlabeled-variant-1",
    evaluation_rubric: { levels: ["unknown", "observed", "assisted", "independent", "transferred"] },
    assessment_scale: "levels",
    independence_boundary_defaults: { editorial_exposure: false, algorithm_name_disclosed: false, external_help: false },
  },
  {
    target_id: "algo.binary-search-on-answer",
    target_version: "1.0.0",
    name: "Binary Search on Answer",
    category: "algorithm",
    prerequisites: ["algo.binary-search.basic", "concept.monotonic-predicate"],
    observable_behaviors: [
      "recognizes maximization of minimum / minimization of maximum patterns",
      "fixes answer x and checks feasibility",
      "argues monotonicity of the feasibility predicate",
    ],
    success_criteria: [
      "learner identifies the fixed-answer feasibility check pattern",
      "learner argues the predicate is monotone",
      "learner implements the check function correctly",
    ],
    failure_taxonomy: ["answer-must-exist-in-array", "boundary-confusion", "non-monotone-predicate"],
    required_evidence: ["observation.monotonicity-discovery", "submission.verdict"],
    evaluation_rubric: { levels: ["unknown", "observed", "assisted", "independent"] },
    assessment_scale: "levels",
  },
];

export function listTargets(cwd: string): TargetContract[] {
  const ws = requireWorkspace(cwd);
  const packTargets: TargetContract[] = [];
  const known = new Set<string>();
  for (const t of BUILTIN_TARGETS) {
    known.add(t.target_id);
    packTargets.push(t);
  }
  const knowledgeDir = omacPath(cwd, "knowledge", "targets");
  if (jsonExists(knowledgeDir)) {
    for (const name of readDirSafe(knowledgeDir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const t = readJson<TargetContract>(`${knowledgeDir}/${name}`);
        if (!known.has(t.target_id)) {
          known.add(t.target_id);
          packTargets.push(t);
        }
      } catch {
        // skip unparseable
      }
    }
  }
  return packTargets;
}

export function getTarget(cwd: string, targetId: string): TargetContract {
  const t = listTargets(cwd).find((x) => x.target_id === targetId);
  if (!t) {
    throw new OmacError("target_not_found", `target contract '${targetId}' not found`);
  }
  return t;
}

export function writeTarget(cwd: string, target: TargetContract): void {
  const ws = requireWorkspace(cwd);
  writeJson(`${ws.omac}/knowledge/targets/${target.target_id.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`, target);
}

export function defaultBoundary(cwd: string, targetId: string): IndependenceBoundary {
  const t = getTarget(cwd, targetId);
  return {
    boundary_id: `bnd-${Date.now().toString(36)}`,
    ...t.independence_boundary_defaults,
    captured_at: new Date().toISOString(),
  };
}

export function requireBoundary(b: Partial<IndependenceBoundary>): IndependenceBoundary {
  if (!b.boundary_id) {
    throw new OmacError("validation_error", "boundary_id is required");
  }
  return b as IndependenceBoundary;
}

export function modeForEventType(eventType: string): CoachingMode {
  if (eventType === "learn") return "learn";
  if (eventType === "upsolve") return "upsolve";
  return "practice";
}

function readDirSafe(p: string): string[] {
  try {
    return readdirSync(p) as string[];
  } catch {
    return [];
  }
}

export function inspectTargetHistory(cwd: string): { target_id: string; count: number }[] {
  requireWorkspace(cwd);
  return [];
}
