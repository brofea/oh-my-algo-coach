import { join } from "node:path";
import { OmacError, nowIso, shortId } from "../core/ids.js";
import { AssessmentClaim } from "../core/types.js";
import { validateClaim } from "../core/schema.js";
import { appendJsonl, findLastByOperationId, readJsonl } from "./jsonl.js";
import { requireWorkspace } from "./workspace.js";

export const CLAIMS_FILE = "claims.jsonl";

export function claimsFile(omac: string): string {
  return join(omac, "claims", CLAIMS_FILE);
}

export function appendClaim(cwd: string, claim: Omit<AssessmentClaim, "claim_id" | "created_at">): AssessmentClaim {
  const ws = requireWorkspace(cwd);
  const existing = readJsonl<AssessmentClaim>(claimsFile(ws.omac));
  const dup = findLastByOperationId(existing, claim.operation_id);
  if (dup) return dup;
  const record: AssessmentClaim = {
    ...claim,
    claim_id: shortId("clm"),
    created_at: nowIso(),
  };
  validateClaim(record);
  appendJsonl(claimsFile(ws.omac), record);
  return record;
}

export function listClaims(cwd: string, opts?: { learnerId?: string; evaluationRunId?: string }): AssessmentClaim[] {
  const ws = requireWorkspace(cwd);
  const all = readJsonl<AssessmentClaim>(claimsFile(ws.omac));
  return all.filter(
    (c) => (!opts?.learnerId || c.learner_id === opts.learnerId) && (!opts?.evaluationRunId || c.evaluation_run_id === opts.evaluationRunId)
  );
}

export function getClaim(cwd: string, claimId: string): AssessmentClaim {
  const found = listClaims(cwd).find((c) => c.claim_id === claimId);
  if (!found) throw new OmacError("claim_not_found", `claim '${claimId}' not found`);
  return found;
}

export interface ClaimSelectionPolicyResult {
  claims: AssessmentClaim[];
  selection_policy_version: string;
}

export const CLAIM_SELECTION_POLICY_VERSION = "select-latest-v1";

export function selectClaims(claims: AssessmentClaim[]): ClaimSelectionPolicyResult {
  const byKey = new Map<string, AssessmentClaim[]>();
  for (const c of claims) {
    const key = `${c.skill_id}::${c.target_id ?? "*"}`;
    const arr = byKey.get(key) ?? [];
    arr.push(c);
    byKey.set(key, arr);
  }
  const selected: AssessmentClaim[] = [];
  for (const [, group] of byKey) {
    const live: AssessmentClaim[] = [];
    for (const c of group) {
      const supersededByAnother = group.some((g) => g.claim_id !== c.claim_id && (g.supersedes ?? []).includes(c.claim_id));
      if (!supersededByAnother) live.push(c);
    }
    live.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    if (live.length > 0) selected.push(live[live.length - 1]);
  }
  return { claims: selected, selection_policy_version: CLAIM_SELECTION_POLICY_VERSION };
}
