import { OmacError, nowIso, shortId, uuid, sha256 } from "../core/ids.js";
import { HintLevel, SubflowKind } from "../core/types.js";

export const HINT_LADDER: readonly { level: HintLevel; name: string; disclosure: string }[] = [
  { level: "L0", name: "Listening", disclosure: "no content disclosure" },
  { level: "L1", name: "Attention Guidance", disclosure: "attention direction, no technique" },
  { level: "L2", name: "Counterexample / Contradiction", disclosure: "counterexample targeting a specific belief" },
  { level: "L3", name: "Property Hint", disclosure: "a single property (monotonicity, optimal substructure)" },
  { level: "L4", name: "Technique Family", disclosure: "technique family name, not full solution" },
  { level: "L5", name: "Core Insight", disclosure: "core insight of the solution" },
  { level: "L6", name: "Pseudocode", disclosure: "pseudocode-level algorithm outline" },
  { level: "L7", name: "Implementation", disclosure: "full implementation guidance" },
];

export function validateHintLevel(v: string): HintLevel {
  if (!HINT_LADDER.some((h) => h.level === v)) {
    throw new OmacError("validation_error", `invalid hint level '${v}'; must be L0-L7`);
  }
  return v as HintLevel;
}

export function validateSubflowKind(v: string): SubflowKind {
  const kinds: readonly string[] = ["debug", "postmortem", "teach-back", "upsolve-review"];
  if (!kinds.includes(v)) {
    throw new OmacError("validation_error", `invalid subflow kind '${v}'; must be ${kinds.join(", ")}`);
  }
  return v as SubflowKind;
}

export function validateTransferResult(v: string): "independent-success" | "assisted-success" | "fail" | "unknown" {
  const allowed = ["independent-success", "assisted-success", "fail", "unknown"];
  if (!allowed.includes(v)) {
    throw new OmacError("validation_error", `invalid transfer result '${v}'`);
  }
  return v as "independent-success" | "assisted-success" | "fail" | "unknown";
}

export function validateInsightDistance(v: string): "far" | "medium" | "near" {
  if (!["far", "medium", "near"].includes(v)) {
    throw new OmacError("validation_error", `invalid insight distance '${v}'`);
  }
  return v as "far" | "medium" | "near";
}

export function validateTransferReadiness(v: string): "not-ready" | "ready-with-hint" | "ready" {
  if (!["not-ready", "ready-with-hint", "ready"].includes(v)) {
    throw new OmacError("validation_error", `invalid transfer readiness '${v}'`);
  }
  return v as "not-ready" | "ready-with-hint" | "ready";
}

export function validateTeachBackResult(v: string): "recall" | "explain" | "reimplement" | "transfer" | "fail" {
  if (!["recall", "explain", "reimplement", "transfer", "fail"].includes(v)) {
    throw new OmacError("validation_error", `invalid teach-back result '${v}'`);
  }
  return v as "recall" | "explain" | "reimplement" | "transfer" | "fail";
}

export function newSubflowId(): string {
  return `sf-${uuid().slice(0, 12)}`;
}

export function artifactChecksum(content: string): string {
  return `sha256:${sha256(content).slice(0, 32)}`;
}

export function problemRefHash(problemRef: string): string {
  return sha256(problemRef).slice(0, 12);
}

export function nowIsoTs(): string {
  return nowIso();
}
