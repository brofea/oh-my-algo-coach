import { OmacError } from "./ids.js";
import {
  EVENT_TYPES,
  EventRecord,
  EventStatus,
  EventType,
  EvidenceRecord,
  EvidenceType,
  AssessmentClaim,
  AssessmentValue,
  CoachingMode,
  Actor,
  SCHEMA_VERSION,
} from "./types.js";

const EVENT_STATUSES: readonly EventStatus[] = ["draft", "active", "paused", "evaluating", "closed", "cancelled"];

const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["paused", "evaluating", "cancelled"],
  paused: ["active", "cancelled"],
  evaluating: ["closed", "cancelled"],
  closed: [],
  cancelled: [],
};

export function requireString(obj: unknown, field: string): string {
  const v = (obj as Record<string, unknown> | null | undefined)?.[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new OmacError("validation_error", `field '${field}' is required and must be a non-empty string`);
  }
  return v;
}

export function optionalString(obj: unknown, field: string): string | undefined {
  const v = (obj as Record<string, unknown> | null | undefined)?.[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new OmacError("validation_error", `field '${field}' must be a string`);
  return v;
}

export function optionalBool(obj: unknown, field: string): boolean | undefined {
  const v = (obj as Record<string, unknown> | null | undefined)?.[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new OmacError("validation_error", `field '${field}' must be a boolean`);
  return v;
}

export function requireStringArray(obj: unknown, field: string): string[] {
  const v = (obj as Record<string, unknown> | null | undefined)?.[field];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new OmacError("validation_error", `field '${field}' must be an array of strings`);
  }
  return v as string[];
}

export function optionalStringArray(obj: unknown, field: string): string[] | undefined {
  const v = (obj as Record<string, unknown> | null | undefined)?.[field];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new OmacError("validation_error", `field '${field}' must be an array of strings`);
  }
  return v as string[];
}

export function validateEventType(v: string): EventType {
  if (!(EVENT_TYPES as readonly string[]).includes(v)) {
    throw new OmacError("validation_error", `invalid event_type '${v}'; must be one of ${EVENT_TYPES.join(", ")}`);
  }
  return v as EventType;
}

export function validateStatus(v: string): EventStatus {
  if (!(EVENT_STATUSES as readonly string[]).includes(v)) {
    throw new OmacError("validation_error", `invalid status '${v}'; must be one of ${EVENT_STATUSES.join(", ")}`);
  }
  return v as EventStatus;
}

export function validateMode(v: string): CoachingMode {
  const modes: readonly string[] = ["practice", "learn", "upsolve", "direct-explanation"];
  if (!modes.includes(v)) {
    throw new OmacError("validation_error", `invalid mode '${v}'; must be one of ${modes.join(", ")}`);
  }
  return v as CoachingMode;
}

export function validateEvidenceType(v: string): EvidenceType {
  const types: readonly string[] = ["observation", "intervention", "correction", "submission", "import"];
  if (!types.includes(v)) {
    throw new OmacError("validation_error", `invalid evidence_type '${v}'; must be one of ${types.join(", ")}`);
  }
  return v as EvidenceType;
}

export function validateActor(v: string): Actor {
  const actors: readonly string[] = ["learner", "coach", "runtime", "external"];
  if (!actors.includes(v)) {
    throw new OmacError("validation_error", `invalid actor '${v}'; must be one of ${actors.join(", ")}`);
  }
  return v as Actor;
}

export function validateAssessment(v: string): AssessmentValue {
  const allowed: readonly string[] = [
    "unknown",
    "insufficient_evidence",
    "conflicted",
    "observed",
    "assisted",
    "independent",
    "transferred",
    "retained",
  ];
  if (!allowed.includes(v)) {
    throw new OmacError("validation_error", `invalid assessment '${v}'; must be one of ${allowed.join(", ")}`);
  }
  return v as AssessmentValue;
}

export function validateConfidence(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new OmacError("validation_error", "confidence must be a number in [0, 1]");
  }
  return v;
}

export function validateEvidenceQuality(v: unknown): "high" | "medium" | "low" {
  if (v !== "high" && v !== "medium" && v !== "low") {
    throw new OmacError("validation_error", "evidence_quality must be one of high/medium/low");
  }
  return v;
}

export function validateEventRecord(e: EventRecord): EventRecord {
  requireString(e, "id");
  validateEventType(requireString(e, "event_type"));
  requireString(e, "schema_version");
  requireString(e, "workspace_id");
  requireString(e, "learner_id");
  validateMode(requireString(e, "mode"));
  validateStatus(requireString(e, "status"));
  return e;
}

export function validateEvidenceRecord(ev: EvidenceRecord): EvidenceRecord {
  requireString(ev, "evidence_id");
  validateEvidenceType(requireString(ev, "evidence_type"));
  requireString(ev, "event_id");
  requireString(ev, "workspace_id");
  requireString(ev, "learner_id");
  validateActor(requireString(ev, "actor"));
  requireString(ev, "operation_id");
  return ev;
}

export function validateClaim(c: AssessmentClaim): AssessmentClaim {
  requireString(c, "claim_id");
  requireString(c, "workspace_id");
  requireString(c, "learner_id");
  requireString(c, "skill_id");
  validateAssessment(requireString(c, "assessment"));
  validateConfidence(c.confidence);
  requireString(c, "evaluator_version");
  requireString(c, "evaluation_run_id");
  requireString(c, "operation_id");
  if (!Array.isArray(c.evidence_ids)) {
    throw new OmacError("validation_error", "evidence_ids must be an array");
  }
  return c;
}

export function assertSchemaVersion(version: string): void {
  if (version !== SCHEMA_VERSION) {
    throw new OmacError(
      "schema_mismatch",
      `workspace schema_version ${version} does not match runtime ${SCHEMA_VERSION}; run 'omac migrate'`
    );
  }
}

export function assertCanTransition(from: EventStatus, to: EventStatus): void {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
    throw new OmacError(
      "invalid_transition",
      `cannot transition event from '${from}' to '${to}'`
    );
  }
}
