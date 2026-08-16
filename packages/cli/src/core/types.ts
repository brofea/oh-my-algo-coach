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
  event_id?: string;
  mode?: "independent" | "assisted" | "transferred" | "retained" | "mixed";
  operation_id?: string;
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

export type HintLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

export type InterventionType =
  | "hint"
  | "question"
  | "counterexample"
  | "teach-back"
  | "postmortem"
  | "visualization"
  | "direct-explanation"
  | "debug-guidance";

export interface InterventionRecord {
  intervention_type: InterventionType;
  disclosure_level?: HintLevel;
  student_requested?: boolean;
  failure_cause?: string;
  response_evidence_ids?: string[];
  content?: string;
}

export type SubflowKind = "debug" | "postmortem" | "teach-back" | "upsolve-review";

export interface DebugSubflowRecord {
  code_attempts?: number;
  wa_types?: string[];
  verdicts?: string[];
  debug_started_at?: string;
  debug_duration_minutes?: number;
  root_cause?: string;
  counterexample_found?: boolean;
  resolved?: boolean;
}

export interface PostmortemRecord {
  original_direction?: string;
  failure_cause?: string;
  insight_distance?: "far" | "medium" | "near";
  pattern_extracted?: string;
  anchor_algorithm?: string;
  gave_up_early?: boolean;
  hint_too_early?: boolean;
  wrong_direction_duration_minutes?: number;
}

export interface TeachBackRecord {
  result: "recall" | "explain" | "reimplement" | "transfer" | "fail";
  content?: string;
  evaluated_at?: string;
}

export interface UpsolveReviewRecord {
  original_direction?: string;
  failure_cause?: string;
  insight_distance?: "far" | "medium" | "near";
  key_insight?: string;
  pattern_extraction?: string;
  transfer_readiness?: "not-ready" | "ready-with-hint" | "ready";
  follow_up_target_ids?: string[];
}

export interface SubflowRecord {
  subflow_id: string;
  event_id: string;
  kind: SubflowKind;
  started_at: string;
  ended_at?: string;
  evidence_ids: string[];
  operation_id?: string;
  debug?: DebugSubflowRecord;
  postmortem?: PostmortemRecord;
  teach_back?: TeachBackRecord;
  upsolve_review?: UpsolveReviewRecord;
}

export interface ProblemManifestEntry {
  problem_ref: string;
  platform?: string;
  difficulty?: string;
  rating?: number;
  statement_ref?: string;
  samples_ref?: string;
  tags?: string[];
  editorial_ref?: string;
  source_url?: string;
  retrieved_at?: string;
  added_at: string;
}

export interface ArtifactRecord {
  artifact_id: string;
  event_id: string;
  kind: "code" | "statement" | "submission" | "editorial" | "contest";
  file_path: string;
  rel_path: string;
  sha256: string;
  operation_id?: string;
  added_at: string;
}

export interface SkillDimensionEstimate {
  dimension: string;
  status: AssessmentValue;
  evidence_count: number;
  evidence_ids: string[];
  last_seen?: string;
}

export interface AlgorithmAbilityViewEntry {
  skill_id: string;
  overall: AssessmentValue;
  dimensions: Record<string, SkillDimensionEstimate>;
  estimate?: [number, number];
  confidence: number;
  evidence_count: number;
}

export interface ProblemSolvingViewEntry {
  skill_id: string;
  overall: AssessmentValue;
  evidence_count: number;
  confidence: number;
  trend?: "up" | "down" | "flat";
}

export interface TransferProbeSummary {
  total: number;
  independent_success: number;
  assisted_success: number;
  fail: number;
  unknown: number;
}

export interface CoachingModeChange {
  event_id: string;
  from: CoachingMode;
  to: CoachingMode;
  changed_at: string;
  requested_by: "learner" | "coach";
  evidence_id?: string;
}

export interface ConnectorCapabilityManifest {
  connector_id: string;
  platform: string;
  version: string;
  capabilities: {
    fetch_problem: boolean;
    fetch_editorial: boolean;
    list_contest_problems: boolean;
    rate_limit_per_minute?: number;
    web: boolean;
  };
  source?: string;
  license?: string;
}

export interface ExternalContentRecord {
  content_id: string;
  ref: string;
  connector_id: string;
  kind: "problem" | "editorial" | "contest";
  source_url?: string;
  source_type: string;
  retrieved_at: string;
  content_license?: string;
  usage_policy?: string;
  contest_status?: string;
  cache_version: string;
  verified: boolean;
  verification_note?: string;
  data: unknown;
}

export interface ProblemStatusRecord {
  problem_ref: string;
  status: "solved" | "attempted" | "untouched";
  independence_status?: string;
  solved_at?: string;
  event_id?: string;
  evidence_ids: string[];
  updated_at: string;
}

export interface RecommendationCandidate {
  problem_ref: string;
  platform?: string;
  difficulty?: string;
  rating?: number;
  target_id: string;
  reason: string;
  mode: "exploitation" | "exploration";
  score: number;
  novelty: boolean;
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
  target_status?: "confirmed" | "provisional" | "unresolved";
  intent?: string;
  problem_ref?: string;
  contest_ref?: string;
  artifact_ref?: string;
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
  independence_boundary_ref?: string;
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

export type PackKind = "algorithm" | "pattern" | "misconception" | "pedagogy" | "target";
export const PACK_KINDS: readonly PackKind[] = ["algorithm", "pattern", "misconception", "pedagogy", "target"];

export interface PackSource {
  type: string;
  uri?: string;
  retrieved_at?: string;
}

export interface PackLicense {
  id: string;
  notice?: string;
}

export interface KnowledgePackManifest {
  pack_id: string;
  pack_version: string;
  schema_version?: string;
  name: string;
  kind: PackKind;
  source?: PackSource;
  source_type?: string;
  source_url?: string;
  retrieved_at?: string;
  license?: string | PackLicense;
  content_files: string[];
  dependencies?: string[];
  description?: string;
}

export interface PatternCard {
  pattern_id: string;
  name: string;
  version?: string;
  pattern?: string;
  observation?: string[];
  transformation?: string[];
  candidate_techniques?: string[];
  related_targets?: string[];
  example_problems?: string[];
  source?: string;
}

export interface MisconceptionCard {
  misconception_id: string;
  name: string;
  description: string;
  related_targets?: string[];
  suggested_interventions?: string[];
  version?: string;
}

export interface PedagogyCard {
  pedagogy_id: string;
  name: string;
  description: string;
  strategy?: string;
  related_targets?: string[];
  evidence_basis?: string;
  version?: string;
}

export interface AlgorithmCard {
  algorithm_id: string;
  name: string;
  category?: string;
  description: string;
  prerequisites?: string[];
  complexity?: string;
  variants?: string[];
  related_targets?: string[];
  version?: string;
}

export interface PackCardRef<T> {
  card: T;
  card_file: string;
  pack_id: string;
  pack_version: string;
  schema_version?: string;
  source?: PackSource;
  license?: PackLicense;
}

export interface TransferProbe {
  probe_id: string;
  event_id: string;
  target_id: string;
  operation_id?: string;
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
