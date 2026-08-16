export const SCHEMA_VERSION = "1.0.0";
export const ONTOLOGY_VERSION = "1.0.0";

export type EventType = "learn" | "practice" | "upsolve" | "contest" | "diagnose" | "explore";
export const EVENT_TYPES: readonly EventType[] = ["learn", "practice", "upsolve", "contest", "diagnose", "explore"];

export type EventStatus = "draft" | "active" | "paused" | "evaluating" | "closed" | "cancelled";

export type CoachingMode = "practice" | "learn" | "upsolve" | "direct-explanation";

export type EvidenceType = "observation" | "intervention" | "correction" | "submission" | "import";
export type Actor = "learner" | "coach" | "runtime" | "external";

export type IndependenceStatus = "unknown" | "assisted" | "independent" | "transferred" | "retained";

export interface IndependenceBoundary {
  boundary_id: string;
  problem_familiarity?: string;
  prior_exposure?: boolean;
  allowed_resources?: string[];
  editorial_exposure?: boolean;
  algorithm_name_disclosed?: boolean;
  hint_limit?: number;
  code_assistance_allowed?: boolean;
  external_help?: boolean;
  time_limit_minutes?: number;
  evaluation_context?: string;
  captured_at: string;
}

export interface IndependenceResult {
  independence_status: IndependenceStatus;
  first_intervention_at?: string;
  max_disclosure?: string;
  independent_behavior_observed?: boolean;
  transfer_observed?: boolean;
  retention_observed?: boolean;
}

export interface WorkspaceConfig {
  schema_version: string;
  ontology_version: string;
  workspace_id: string;
  learner_id?: string;
  created_at: string;
  save_conversation?: boolean;
  config_version: number;
}

export interface EventRecord {
  id: string;
  event_type: EventType;
  schema_version: string;
  workspace_id: string;
  learner_id: string;
  platform_profile_ref?: string;
  domain_profile_ref?: string;
  target_ids: string[];
  intent?: string;
  problem_ref?: string;
  contest_ref?: string;
  mode: CoachingMode;
  status: EventStatus;
  started_at?: string;
  ended_at?: string;
  provenance: string;
  independence_boundary_ref?: string;
  archive_ref?: string;
  operation_id?: string;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRecord {
  evidence_id: string;
  evidence_type: EvidenceType;
  event_id: string;
  workspace_id: string;
  learner_id: string;
  actor: Actor;
  observed_at: string;
  target_ids?: string[];
  problem_ref?: string;
  artifact_ref?: string;
  source?: string;
  content_ref?: string;
  content_summary?: string;
  provenance: string;
  evidence_quality: "high" | "medium" | "low";
  independence_boundary_ref?: string;
  operation_id: string;
  created_at: string;
  extraction_confidence?: number;
  extra?: Record<string, unknown>;
}

export type AssessmentValue =
  | "unknown"
  | "insufficient_evidence"
  | "conflicted"
  | "observed"
  | "assisted"
  | "independent"
  | "transferred"
  | "retained";

export interface AssessmentClaim {
  claim_id: string;
  workspace_id: string;
  learner_id: string;
  skill_id: string;
  target_id?: string;
  claim_scope?: string;
  assessment: AssessmentValue;
  assessment_scale?: string;
  evidence_ids: string[];
  evidence_quality: "high" | "medium" | "low";
  confidence: number;
  evaluator_version: string;
  model_provenance?: string;
  evaluation_run_id: string;
  policy_pack_ref?: string;
  input_snapshot_ref?: string;
  operation_id: string;
  created_at: string;
  unknown_reason?: string;
  student_confirmation?: "confirmed" | "rejected" | "pending" | "not_required";
  supersedes?: string[];
  contradicted_by?: string[];
  extra?: Record<string, unknown>;
}

export interface LearnerView {
  view_id: string;
  view_version: string;
  workspace_id: string;
  learner_id: string;
  reducer_version: string;
  claim_set_ref: string[];
  claim_selection_policy_version: string;
  generated_at: string;
  abilities: Record<string, SkillEstimate>;
  misconceptions: Record<string, MisconceptionState>;
  target_history: TargetHistoryEntry[];
  summary?: Record<string, unknown>;
}

export interface SkillEstimate {
  skill_id: string;
  status: AssessmentValue;
  estimate?: [number, number];
  confidence: number;
  evidence_count: number;
  evidence_ids: string[];
  trend?: "up" | "down" | "flat";
  last_seen?: string;
}

export interface MisconceptionState {
  misconception_id: string;
  status: "suspected" | "confirmed" | "improving" | "resolved" | "regressed";
  confidence: number;
  observed_count: number;
  first_seen?: string;
  last_seen?: string;
  supporting_evidence: string[];
  contradicting_evidence: string[];
  related_concepts: string[];
}

export interface TargetHistoryEntry {
  target_id: string;
  event_id: string;
  event_type: EventType;
  assessment: AssessmentValue;
  independence_status?: IndependenceStatus;
  ended_at?: string;
}

export interface TargetContract {
  target_id: string;
  target_version: string;
  name: string;
  category: "algorithm" | "problem-solving" | "contest" | "knowledge";
  domain?: string;
  platform_scope?: string[];
  learner_profile_scope?: string;
  prerequisites: string[];
  observable_behaviors: string[];
  success_criteria: string[];
  failure_taxonomy: string[];
  required_evidence: string[];
  transfer_probe?: string;
  evaluation_rubric?: Record<string, unknown>;
  assessment_scale?: string;
  independence_boundary_defaults?: Partial<IndependenceBoundary>;
}

export interface KnowledgePackManifest {
  pack_id: string;
  pack_version: string;
  name: string;
  kind: "algorithm" | "pattern" | "misconception" | "pedagogy" | "target";
  source_url?: string;
  source_type?: string;
  retrieved_at?: string;
  license?: string;
  content_files: string[];
}

export interface TransferProbe {
  probe_id: string;
  event_id: string;
  target_id: string;
  problem_ref?: string;
  statement_hash?: string;
  declared_before_start: boolean;
  similarity_rule_ref?: string;
  problem_familiarity?: string;
  prior_exposure?: boolean;
  editorial_exposure?: boolean;
  external_help?: boolean;
  result?: "independent-success" | "assisted-success" | "fail" | "unknown";
  criteria_met?: boolean;
  evidence_ids: string[];
}

export interface HostCapabilityContract {
  version: string;
  capabilities: {
    local_cli: boolean;
    structured_json_io: boolean;
    workspace_read_write: boolean;
    confirmation_prompts: boolean;
    web: boolean;
  };
}
