import { rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CommandContext, flag, flagBool, outputJson } from "../core/cli.js";
import { initWorkspace, setLearnerId, readWorkspaceConfig, WARNING_TEXT, requireWorkspace, omacPath } from "../store/workspace.js";
import { OmacError, uuid, nowIso, sha256 } from "../core/ids.js";
import {
  createEvent,
  loadEventAnywhere,
  transition,
  updateEvent,
  archiveEvent,
  listEvents,
  appendBoundary,
  getBoundaries,
  getBoundary,
} from "../store/event_store.js";
import { appendClaim, listClaims } from "../store/claim_store.js";
import { appendEvidence, listEvidence, getEvidence } from "../store/evidence_store.js";
import { rebuildView, getView } from "../store/view_store.js";
import {
  validateAssessment,
  validateConfidence,
  validateEvidenceQuality,
  validateEvidenceType,
  validateActor,
  validateEventType,
  validateMode,
  validateStatus,
} from "../core/schema.js";
import { appendJsonl, ensureDir, readJsonl, writeJsonl } from "../store/jsonl.js";
import { artifactsFile } from "../store/knowledge_store.js";
import { explainWhy } from "../services/explain.js";
import { eventReport, learnerReport } from "../services/report.js";
import { doctor, integrityCheck } from "../services/doctor.js";
import { migrateWorkspace } from "../services/migrate.js";
import { exportPackage, previewImport, importPackage } from "../services/export_import.js";
import { listTargets, targetProvenance, getTarget, defaultBoundary } from "../protocol/target.js";
import {
  validateHintLevel,
  validateSubflowKind,
  validateTransferResult,
  validateInsightDistance,
  validateTransferReadiness,
  validateTeachBackResult,
  newSubflowId,
} from "../protocol/coaching.js";
import { addProblem, listProblems, addArtifact, listArtifacts } from "../store/knowledge_store.js";
import { appendSubflow, listSubflows } from "../store/subflow_store.js";
import { algorithmAbilityView, problemSolvingView, misconceptionView, transferProbeSummary, transferRateReport } from "../services/coaching_views.js";
import { recordTransferProbe } from "../store/event_store.js";
import { TransferProbe, ProblemManifestEntry, IndependenceBoundary, EvidenceRecord, AssessmentClaim } from "../core/types.js";
import {
  listRetention,
  getRetention,
  applyRecall,
  dueRetention,
  retentionGaps,
  retentionPairs,
  curriculumCandidates,
  REVIEW_FORMS,
} from "../services/retention.js";
import { recordLearnPath, validateLearnPathSteps, listLearnPaths, installPack, installedPacks, prereqOf, listPatternCards, getPatternCard, listMisconceptionCards, getMisconceptionCard, listPedagogyCards, getPedagogyCard, listAlgorithmCards, getAlgorithmCard, manifestLicense } from "../services/memory.js";
import { listConnectors, getConnector, fetchProblem, fetchEditorial, cachedContent, clearConnectorCache, setProblemStatus, problemStatuses } from "../services/ecosystem.js";
import { validateArtifact } from "../services/contest.js";
import { recommendProblems, explainRecommendation } from "../services/recommend.js";
import { importContestArtifact, findContestIdForEvent, contestTimeline, analyzeContest, recordContestAnalysis, contestAbilityView, linkUpsolve, contestFollowups } from "../services/contest.js";
import { computeRating, computeCalibration, advancedRetentionStatus, coachEval, coachPolicy, gainMatrix, visualize, longTermPlan, packVersions, updatePack } from "../services/adaptive.js";
import { syncLocalSkill } from "../services/skill_sync.js";

export function cmdInit(ctx: CommandContext): unknown {
  const opts = {
    learnerId: flag(ctx.args.flags, "learner-id"),
    saveConversation: flagBool(ctx.args.flags, "save-conversation"),
  };
  const skill = syncLocalSkill(ctx.cwd, { force: flagBool(ctx.args.flags, "force-skill") });
  const config = initWorkspace(ctx.cwd, opts);
  if (!config.learner_id) {
    const learnerId = opts.learnerId ?? `ln-${uuid().slice(0, 12)}`;
    setLearnerId(ctx.cwd, learnerId);
  }
  const final = readWorkspaceConfig(ctx.cwd);
  return {
    ok: true,
    workspace_id: final.workspace_id,
    learner_id: final.learner_id,
    schema_version: final.schema_version,
    warning: WARNING_TEXT,
    skill,
  };
}

export function cmdLearnerClaimSubmit(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const cfg = readWorkspaceConfig(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "learner claim submit requires --event-id");
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  if (archived) throw new OmacError("invalid_claim", "cannot submit claims for archived events");
  if (event.status !== "evaluating") {
    throw new OmacError(
      "invalid_claim",
      `claims may only be submitted when the event is 'evaluating' (current: ${event.status}); advance with 'event append --status evaluating' or close with evaluation`
    );
  }
  const skillId = flag(ctx.args.flags, "skill-id");
  const targetId = flag(ctx.args.flags, "target-id");
  if (!skillId) throw new OmacError("missing_flag", "learner claim submit requires --skill-id");
  if (targetId && !event.target_ids.includes(targetId) && !targetId.startsWith("misconception.")) {
    throw new OmacError(
      "target_mismatch",
      `claim target '${targetId}' is not declared on event '${eventId}' (event targets: ${event.target_ids.join(", ") || "none"}); declare it with 'event create --target-ids' or use a misconception scope`
    );
  }
  const assessment = flag(ctx.args.flags, "assessment");
  if (!assessment) throw new OmacError("missing_flag", "learner claim submit requires --assessment");
  const confidence = Number(flag(ctx.args.flags, "confidence") ?? "0.5");
  validateConfidence(confidence);
  const evidenceIds = (flag(ctx.args.flags, "evidence-ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const operationId = flag(ctx.args.flags, "operation-id") ?? `op-${uuid().slice(0, 12)}`;
  const studentConfirmation = flag(ctx.args.flags, "student-confirmation");
  if (event.event_type === "diagnose" && studentConfirmation !== "confirmed") {
    throw new OmacError(
      "diagnose_confirmation_required",
      "diagnose claims require student confirmation before they may update Learner State; re-submit with --student-confirmation confirmed"
    );
  }
  for (const eid of evidenceIds) {
    let evd: EvidenceRecord;
    try {
      evd = getEvidence(ctx.cwd, eid);
    } catch {
      throw new OmacError("evidence_not_found", `claim references missing evidence '${eid}'; append evidence before submitting claims`);
    }
    if (evd.learner_id !== event.learner_id || evd.event_id !== eventId) {
      throw new OmacError(
        "evidence_mismatch",
        `evidence '${eid}' does not belong to learner '${event.learner_id}' / event '${eventId}'`
      );
    }
  }
  const boundaryId = flag(ctx.args.flags, "boundary-id");
  const boundarySensitive = assessment === "independent" || assessment === "transferred" || assessment === "retained";
  if (boundarySensitive && !boundaryId) {
    throw new OmacError(
      "boundary_required",
      `${assessment} claims require an independence boundary snapshot; set one with 'event boundary set --event-id ${eventId} --target-id <id>' and pass --boundary-id <id>`
    );
  }
  if (boundaryId) {
    getBoundary(ws.omac, eventId, boundaryId);
  }
  const claim = appendClaim(ctx.cwd, {
    workspace_id: cfg.workspace_id,
    learner_id: event.learner_id,
    skill_id: skillId,
    target_id: targetId,
    assessment: validateAssessment(assessment),
    evidence_ids: evidenceIds,
    evidence_quality: validateEvidenceQuality(flag(ctx.args.flags, "evidence-quality") ?? "medium"),
    confidence,
    evaluator_version: flag(ctx.args.flags, "evaluator-version") ?? "coach-v0",
    evaluation_run_id: flag(ctx.args.flags, "evaluation-run-id") ?? `run-${uuid().slice(0, 12)}`,
    input_snapshot_ref: `event:${eventId}`,
    operation_id: operationId,
    student_confirmation: studentConfirmation ? (studentConfirmation as AssessmentClaim["student_confirmation"]) : "not_required",
    independence_boundary_ref: boundaryId,
    unknown_reason: flag(ctx.args.flags, "unknown-reason"),
    supersedes: (flag(ctx.args.flags, "supersedes") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  return { ok: true, claim_id: claim.claim_id, event_id: eventId, operation_id: operationId };
}

export function cmdLearnerViewGet(ctx: CommandContext): unknown {
  const cfg = readWorkspaceConfig(ctx.cwd);
  const id = flag(ctx.args.flags, "learner-id") ?? cfg.learner_id;
  if (!id) throw new OmacError("no_learner", "no learner_id bound; pass --learner-id");
  const view = getView(ctx.cwd, id);
  return { ok: true, learner_id: id, view };
}

export function cmdLearnerPurge(ctx: CommandContext): unknown {
  const cfg = readWorkspaceConfig(ctx.cwd);
  const id = flag(ctx.args.flags, "learner-id") ?? cfg.learner_id;
  if (!id) throw new OmacError("no_learner", "no learner_id bound; pass --learner-id");
  if (!flagBool(ctx.args.flags, "confirm")) {
    throw new OmacError(
      "confirmation_required",
      "purge is irreversible: it deletes the learner's Profile, Events, Evidence, Claims, Views, Reports, Artifacts, State, indexes and retention data. Re-run with --confirm. Export/backup copies and already-sent external data are NOT deleted."
    );
  }
  const ws = requireWorkspace(ctx.cwd);
  const { working, archived } = listEvents(ws.omac);
  const learnerEvents = [...working, ...archived].filter((e) => e.learner_id === id);
  const eventIds = new Set(learnerEvents.map((e) => e.id));
  const active = learnerEvents.filter((e) => ["active", "paused", "evaluating"].includes(e.status));
  if (active.length > 0) {
    throw new OmacError("purge_blocked", `cannot purge while active/paused/evaluating events exist for learner: ${active.map((e) => e.id).join(", ")}`);
  }
  const evidence = listEvidence(ctx.cwd).filter((e) => e.learner_id === id);
  const claims = listClaims(ctx.cwd, { learnerId: id });
  const evidenceFile = omacPath(ctx.cwd, "evidence", "evidence.jsonl");
  if (evidence.length > 0 && existsSync(evidenceFile)) {
    const removed = new Set(evidence.map((e) => e.evidence_id));
    const kept = (readJsonl(evidenceFile) as { evidence_id?: string }[]).filter((x) => !removed.has(x.evidence_id ?? ""));
    writeJsonl(evidenceFile, kept as never[]);
  }
  const claimsFile = omacPath(ctx.cwd, "claims", "claims.jsonl");
  if (claims.length > 0 && existsSync(claimsFile)) {
    const removed = new Set(claims.map((c) => c.claim_id));
    const kept = (readJsonl(claimsFile) as { claim_id?: string }[]).filter((x) => !removed.has(x.claim_id ?? ""));
    writeJsonl(claimsFile, kept as never[]);
  }
  for (const e of learnerEvents) {
    rmSync(omacPath(ctx.cwd, "event", e.id), { recursive: true, force: true });
    rmSync(omacPath(ctx.cwd, "event", "archive", e.id), { recursive: true, force: true });
  }
  const idxFile = omacPath(ctx.cwd, "event", "index", "index.jsonl");
  if (existsSync(idxFile)) {
    const kept = (readJsonl(idxFile) as { event_id?: string }[]).filter((x) => !eventIds.has(x.event_id ?? ""));
    writeJsonl(idxFile, kept as never[]);
  }
  const subflowsFile = omacPath(ctx.cwd, "event", "subflows.jsonl");
  if (eventIds.size > 0 && existsSync(subflowsFile)) {
    const kept = (readJsonl(subflowsFile) as { event_id?: string }[]).filter((x) => !eventIds.has(x.event_id ?? ""));
    writeJsonl(subflowsFile, kept as never[]);
  }
  const artifacts = listArtifacts(ctx.cwd).filter((a) => eventIds.has(a.event_id));
  if (artifacts.length > 0) {
    const artsFile = artifactsFile(ws.omac);
    const removed = new Set(artifacts.map((a) => a.artifact_id));
    const kept = (readJsonl(artsFile) as { artifact_id?: string }[]).filter((x) => !removed.has(x.artifact_id ?? ""));
    writeJsonl(artsFile, kept as never[]);
    for (const a of artifacts) {
      rmSync(join(ws.omac, a.rel_path), { force: true });
    }
  }
  rmSync(omacPath(ctx.cwd, "learner", "views", `${id}.views.json`), { force: true });
  rmSync(omacPath(ctx.cwd, "report", `learner-${id}.md`), { force: true });
  const retentionFile = omacPath(ctx.cwd, "learner", "state", "retention.jsonl");
  if (existsSync(retentionFile)) writeJsonl(retentionFile, []);
  const learnPathsFile = omacPath(ctx.cwd, "learner", "state", "learn-paths.jsonl");
  if (eventIds.size > 0 && existsSync(learnPathsFile)) {
    const kept = (readJsonl(learnPathsFile) as { event_id?: string }[]).filter((x) => !eventIds.has(x.event_id ?? ""));
    writeJsonl(learnPathsFile, kept as never[]);
  }
  const analysisFile = omacPath(ctx.cwd, "report", "contest-analysis.jsonl");
  if (eventIds.size > 0 && existsSync(analysisFile)) {
    const kept = (readJsonl(analysisFile) as { event_id?: string }[]).filter((x) => !eventIds.has(x.event_id ?? ""));
    writeJsonl(analysisFile, kept as never[]);
  }
  const upsolveFile = omacPath(ctx.cwd, "report", "contest-upsolve-links.jsonl");
  if (eventIds.size > 0 && existsSync(upsolveFile)) {
    const kept = (readJsonl(upsolveFile) as { event_id?: string }[]).filter((x) => !eventIds.has(x.event_id ?? ""));
    writeJsonl(upsolveFile, kept as never[]);
  }
  const problemStatusFile = omacPath(ctx.cwd, "learner", "state", "problem-status.jsonl");
  if (eventIds.size > 0 && existsSync(problemStatusFile)) {
    const kept = (readJsonl(problemStatusFile) as { event_id?: string }[]).filter((x) => !eventIds.has(x.event_id ?? ""));
    writeJsonl(problemStatusFile, kept as never[]);
  }
  for (const e of learnerEvents) {
    rmSync(omacPath(ctx.cwd, "report", `event-${e.id}.md`), { force: true });
    if (e.contest_ref) {
      rmSync(join(ws.omac, "artifact", "contest", `${e.contest_ref}.json`), { force: true });
    }
  }
  const profileDir = omacPath(ctx.cwd, "learner", "profile");
  if (existsSync(profileDir)) {
    for (const name of readdirSync(profileDir)) {
      if (name.startsWith(id)) rmSync(join(profileDir, name), { force: true });
    }
  }
  const integrity = integrityCheck(ctx.cwd);
  return {
    ok: true,
    purged: id,
    integrity: { ok: integrity.ok, issues: integrity.issues.map((i) => i.message) },
    note: "export/backup copies and already-sent external data are NOT deleted",
  };
}

export function cmdEvidenceAppend(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const cfg = readWorkspaceConfig(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "evidence append requires --event-id");
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  const operationId = flag(ctx.args.flags, "operation-id") ?? `op-${uuid().slice(0, 12)}`;
  const evidenceType = validateEvidenceType(flag(ctx.args.flags, "type") ?? "observation");
  const isClosed = archived || event.status === "closed" || event.status === "cancelled";
  if (isClosed && evidenceType !== "correction") {
    throw new OmacError(
      "event_closed",
      `event '${eventId}' is closed/archived; ordinary evidence appends are rejected. Use correction path: evidence append --type correction --operation-id <id> --supercedes <evidence-id> --reason <text>`
    );
  }
  if (evidenceType === "correction") {
    const supersedes = (flag(ctx.args.flags, "supercedes") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const reason = flag(ctx.args.flags, "reason") ?? flag(ctx.args.flags, "content");
    const explicitOpId = flag(ctx.args.flags, "operation-id");
    if (!explicitOpId || supersedes.length === 0 || !reason) {
      throw new OmacError(
        "correction_gate",
        "correction evidence requires --operation-id, --supercedes <evidence-id> and --reason; original records are never rewritten"
      );
    }
    for (const sid of supersedes) {
      const original = getEvidence(ctx.cwd, sid);
      if (original.event_id !== eventId) {
        throw new OmacError("evidence_mismatch", `superseded evidence '${sid}' does not belong to event '${eventId}'`);
      }
    }
  }
  const boundaryId = flag(ctx.args.flags, "boundary-id");
  if (boundaryId) {
    getBoundary(ws.omac, eventId, boundaryId);
  }
  const evTargets = (flag(ctx.args.flags, "target-ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const t of evTargets) {
    if (!event.target_ids.includes(t) && !t.startsWith("misconception.")) {
      throw new OmacError(
        "target_mismatch",
        `evidence target '${t}' is not declared on event '${eventId}' (event targets: ${event.target_ids.join(", ") || "none"})`
      );
    }
  }
  const extra: Record<string, unknown> = flag(ctx.args.flags, "extra") ? JSON.parse(flag(ctx.args.flags, "extra")!) : {};
  if (evidenceType === "intervention") {
    const intervention: Record<string, unknown> = {
      intervention_type: flag(ctx.args.flags, "intervention-type") ?? "hint",
    };
    if (flag(ctx.args.flags, "hint-level")) {
      intervention.disclosure_level = validateHintLevel(flag(ctx.args.flags, "hint-level")!);
    }
    if (ctx.args.flags.has("student-requested")) {
      intervention.student_requested = flagBool(ctx.args.flags, "student-requested");
    }
    if (flag(ctx.args.flags, "failure-cause")) intervention.failure_cause = flag(ctx.args.flags, "failure-cause");
    if (flag(ctx.args.flags, "response-evidence-ids")) {
      intervention.response_evidence_ids = flag(ctx.args.flags, "response-evidence-ids")!.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (flag(ctx.args.flags, "content")) intervention.content = flag(ctx.args.flags, "content");
    Object.assign(intervention, extra);
    extra.intervention = intervention;
  }
  if (evidenceType === "correction") {
    extra.correction = {
      operation_id: operationId,
      reason: flag(ctx.args.flags, "reason") ?? "",
      supersedes: (flag(ctx.args.flags, "supercedes") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    };
  }
  const record = appendEvidence(ctx.cwd, {
    evidence_type: evidenceType,
    event_id: eventId,
    workspace_id: cfg.workspace_id,
    learner_id: event.learner_id,
    actor: validateActor(flag(ctx.args.flags, "actor") ?? "coach"),
    observed_at: flag(ctx.args.flags, "observed-at") ?? new Date().toISOString(),
    target_ids: evTargets,
    problem_ref: flag(ctx.args.flags, "problem-ref"),
    artifact_ref: flag(ctx.args.flags, "artifact-ref"),
    source: flag(ctx.args.flags, "source"),
    content_summary: flag(ctx.args.flags, "content") ?? "",
    provenance: flag(ctx.args.flags, "provenance") ?? "cli",
    evidence_quality: validateEvidenceQuality(flag(ctx.args.flags, "quality") ?? "medium"),
    independence_boundary_ref: boundaryId,
    operation_id: operationId,
    extraction_confidence: flag(ctx.args.flags, "extraction-confidence")
      ? Number(flag(ctx.args.flags, "extraction-confidence"))
      : undefined,
    extra,
  });
  return { ok: true, evidence_id: record.evidence_id, event_id: eventId, operation_id: operationId };
}

export function cmdEventCreate(ctx: CommandContext): unknown {
  const cfg = readWorkspaceConfig(ctx.cwd);
  if (!cfg.learner_id) throw new OmacError("no_learner", "no learner bound; run 'omac init --learner-id <id>'");
  const eventType = validateEventType(flag(ctx.args.flags, "type") ?? "");
  const mode = flag(ctx.args.flags, "mode") ? validateMode(flag(ctx.args.flags, "mode")!) : undefined;
  const contestRef = flag(ctx.args.flags, "contest-ref");
  const targetIds = (flag(ctx.args.flags, "target-ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const targetStatusFlag = flag(ctx.args.flags, "target-status");
  const targetStatus = targetStatusFlag ? validateTargetStatus(targetStatusFlag) : undefined;
  for (const t of targetIds) {
    getTarget(ctx.cwd, t);
  }
  let artifactRef: string | undefined;
  if (eventType === "contest") {
    const artifact = flag(ctx.args.flags, "artifact");
    if (!artifact) {
      throw new OmacError("contest_gate", "Contest events require a finished contest/virtual contest artifact (--artifact)");
    }
    if (!flagBool(ctx.args.flags, "confirm-ended")) {
      throw new OmacError(
        "contest_gate",
        "Contest events require user confirmation that the activity has ended (--confirm-ended)"
      );
    }
    if (ctx.args.flags.has("live")) {
      throw new OmacError(
        "contest_gate",
        "live-contest solving events are not supported: OMAC Contest events are post-contest reviews only. Provide the finished artifact and confirm the activity has ended."
      );
    }
    if (!existsSync(artifact)) throw new OmacError("file_not_found", `contest artifact not found: ${artifact}`);
    const st = statSync(artifact);
    if (!st.isFile()) throw new OmacError("invalid_artifact", `contest artifact must be a regular file: ${artifact}`);
    if (st.size === 0) throw new OmacError("invalid_artifact", `contest artifact is empty: ${artifact}`);
    const parsed = JSON.parse(readFileSync(artifact, "utf8"));
    validateArtifact(parsed);
    if (targetIds.length === 0) {
      throw new OmacError("contest_gate", "Contest events require at least one confirmed target (--target-ids)");
    }
    if (targetStatus && targetStatus !== "confirmed") {
      throw new OmacError("contest_gate", "Contest events require confirmed targets; provisional/unresolved targets are not allowed");
    }
    const ws = requireWorkspace(ctx.cwd);
    const name = artifact.split("/").pop() ?? "artifact";
    const content = readFileSync(artifact, "utf8");
    const checksum = `sha256:${sha256(content).slice(0, 32)}`;
    const rel = `artifact/contest-${name}`;
    const destDir = join(ws.omac, "artifact");
    mkdirSync(destDir, { recursive: true });
    const destFile = join(destDir, `contest-${name}`);
    writeFileSync(destFile, content, "utf8");
    const art = addArtifact(ctx.cwd, {
      eventId: "",
      kind: "contest",
      filePath: artifact,
      relPath: rel,
      checksum,
    });
    artifactRef = art.artifact_id;
  }
  const event = createEvent({
    cwd: ctx.cwd,
    eventType,
    learnerId: cfg.learner_id,
    workspaceId: cfg.workspace_id,
    targetIds,
    targetStatus,
    intent: flag(ctx.args.flags, "intent"),
    problemRef: flag(ctx.args.flags, "problem-ref"),
    contestRef,
    artifactRef,
    mode,
    platformProfileRef: flag(ctx.args.flags, "platform-profile"),
    domainProfileRef: flag(ctx.args.flags, "domain-profile"),
    provenance: flag(ctx.args.flags, "provenance") ?? "cli",
    operationId: flag(ctx.args.flags, "operation-id"),
  });
  if (artifactRef) {
    relinkArtifact(ctx.cwd, artifactRef, event.id);
  }
  return { ok: true, event_id: event.id, event };
}

function relinkArtifact(cwd: string, artifactId: string, eventId: string): void {
  const ws = requireWorkspace(cwd);
  const file = artifactsFile(ws.omac);
  const records = readJsonl<{ artifact_id: string; event_id: string }>(file);
  const hit = records.find((r) => r.artifact_id === artifactId);
  if (hit) {
    hit.event_id = eventId;
    writeJsonl(file, records as never[]);
  }
}

function validateTargetStatus(v: string): "confirmed" | "provisional" | "unresolved" {
  if (v === "confirmed" || v === "provisional" || v === "unresolved") return v;
  throw new OmacError("validation_error", `target-status must be one of confirmed|provisional|unresolved`);
}

export function cmdEventBoundarySet(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "event boundary set requires --event-id");
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  if (archived || event.status === "closed" || event.status === "cancelled") {
    throw new OmacError("invalid_state", "cannot set boundary on closed/cancelled/archived event");
  }
  const boundaryJson = flag(ctx.args.flags, "boundary");
  const targetId = flag(ctx.args.flags, "target-id");
  let boundary: IndependenceBoundary;
  if (boundaryJson) {
    const parsed = JSON.parse(boundaryJson) as IndependenceBoundary;
    if (!parsed.boundary_id) throw new OmacError("validation_error", "boundary json must contain boundary_id");
    boundary = parsed;
  } else if (targetId) {
    const t = getTarget(ctx.cwd, targetId);
    boundary = defaultBoundary(ctx.cwd, targetId);
    boundary.evaluation_context = t.name;
  } else {
    throw new OmacError("missing_flag", "event boundary set requires --boundary <json> or --target-id <id>");
  }
  boundary.event_id = eventId;
  boundary.captured_at = boundary.captured_at ?? nowIso();
  boundary.operation_id = boundary.operation_id ?? flag(ctx.args.flags, "operation-id");
  const snap = appendBoundary(ws.omac, eventId, boundary);
  const wasRef = event.independence_boundary_ref;
  event.independence_boundary_ref = snap.boundary_id;
  updateEvent(ws.omac, event);
  return { ok: true, event_id: eventId, boundary: snap, previous_boundary_ref: wasRef, resumed: snap.boundary_id !== boundary.boundary_id };
}

export function cmdEventBoundaryList(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "event boundary list requires --event-id");
  loadEventAnywhere(ws.omac, eventId);
  return { ok: true, event_id: eventId, boundaries: getBoundaries(ws.omac, eventId) };
}

export function cmdEventAppend(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "event append requires --event-id");
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  if (archived) throw new OmacError("invalid_state", "cannot append to archived event");
  const op = flag(ctx.args.flags, "op") ?? "observation";
  const dir = join(ws.omac, "event", eventId);
  ensureDir(dir);
  const logEntry = {
    op,
    event_id: eventId,
    operation_id: flag(ctx.args.flags, "operation-id"),
    at: new Date().toISOString(),
    content: flag(ctx.args.flags, "content") ?? "",
  };
  const existing = readJsonl<{ operation_id?: string }>(join(dir, "event.jsonl"));
  if (!logEntry.operation_id || !existing.some((x) => x.operation_id === logEntry.operation_id)) {
    appendJsonl(join(dir, "event.jsonl"), logEntry);
  }
  const statusFlag = flag(ctx.args.flags, "status");
  if (statusFlag) {
    const to = validateStatus(statusFlag);
    if (to !== event.status) {
      updateEvent(ws.omac, event);
      transition(ws.omac, event, to);
    }
  }
  const modeFlag = flag(ctx.args.flags, "mode");
  if (modeFlag) {
    const to = validateMode(modeFlag);
    if (to !== event.mode) {
      const from = event.mode;
      event.mode = to;
      updateEvent(ws.omac, event);
      appendEvidence(ctx.cwd, {
        evidence_type: "observation",
        event_id: eventId,
        workspace_id: event.workspace_id,
        learner_id: event.learner_id,
        actor: "runtime",
        observed_at: nowIso(),
        content_summary: `coaching mode changed ${from} -> ${to}`,
        provenance: "cli",
        evidence_quality: "medium",
        operation_id: `op-mode-${eventId}-${to}`,
        extra: { mode_change: { from, to, changed_at: nowIso(), requested_by: flag(ctx.args.flags, "mode-requested-by") ?? "learner" } },
      });
    }
  }
  return { ok: true, event_id: eventId, operation_id: logEntry.operation_id };
}

export function cmdEventClose(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "event close requires --event-id");
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  const opId = flag(ctx.args.flags, "operation-id");
  if (opId) {
    const logFile = join(ws.omac, archived ? "event/archive" : "event", eventId, "event.jsonl");
    const log = readJsonl<{ op?: string; operation_id?: string; archive_ref?: string }>(logFile);
    const closedEntry = log.find((x) => x.op === "closed" && x.operation_id === opId);
    if (closedEntry) {
      return { ok: true, event_id: eventId, closed: true, resumed: true, archive_ref: closedEntry.archive_ref };
    }
  }
  if (archived) throw new OmacError("invalid_state", `event '${eventId}' is already archived`);
  if (event.status !== "evaluating" && event.status !== "active" && event.status !== "paused") {
    throw new OmacError(
      "invalid_state",
      `cannot close event in status '${event.status}'; event must be active, paused or evaluating`
    );
  }
  if (event.status !== "evaluating") {
    transition(ws.omac, event, "evaluating");
  }
  transition(ws.omac, event, "closed");
  archiveEvent(ws.omac, event);
  if (opId) {
    appendJsonl(join(ws.omac, "event", "archive", eventId, "event.jsonl"), {
      op: "closed",
      operation_id: opId,
      archive_ref: event.archive_ref,
      at: new Date().toISOString(),
    });
  }
  return { ok: true, event_id: eventId, closed: true, archive_ref: event.archive_ref };
}

export function cmdRebuild(ctx: CommandContext): unknown {
  const cfg = readWorkspaceConfig(ctx.cwd);
  const learnerId = flag(ctx.args.flags, "learner-id") ?? cfg.learner_id;
  if (!learnerId) throw new OmacError("no_learner", "no learner_id; pass --learner-id");
  const claimSet = (flag(ctx.args.flags, "claim-set") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const view = rebuildView(ctx.cwd, {
    learnerId,
    claimSet: claimSet.length ? claimSet : undefined,
    reducerVersion: flag(ctx.args.flags, "reducer-version"),
  });
  return {
    ok: true,
    view_id: view.view_id,
    learner_id: learnerId,
    reducer_version: view.reducer_version,
    claim_count: view.claim_set_ref.length,
    view,
  };
}

export function cmdReevaluate(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  const evalRunId = flag(ctx.args.flags, "evaluation-run-id");
  if (!eventId) throw new OmacError("missing_flag", "reevaluate requires --event-id");
  if (!evalRunId) throw new OmacError("missing_flag", "reevaluate requires --evaluation-run-id");
  const cfg = readWorkspaceConfig(ctx.cwd);
  const oldClaims = listClaims(ctx.cwd).filter((c) => c.input_snapshot_ref === `event:${eventId}`);
  const opId = flag(ctx.args.flags, "operation-id") ?? `op-${uuid().slice(0, 12)}`;
  const newAssessment = flag(ctx.args.flags, "assessment");
  const appended: string[] = [];
  for (const old of oldClaims) {
    const fresh = appendClaim(ctx.cwd, {
      ...old,
      assessment: newAssessment ? validateAssessment(newAssessment) : old.assessment,
      confidence: flag(ctx.args.flags, "confidence") ? Number(flag(ctx.args.flags, "confidence")) : old.confidence,
      evaluator_version: flag(ctx.args.flags, "evaluator-version") ?? "evaluator-v2",
      evaluation_run_id: evalRunId,
      supersedes: [...(old.supersedes ?? []), old.claim_id],
      operation_id: `${opId}:${old.claim_id}`,
    });
    appended.push(fresh.claim_id);
  }
  const learnerId = cfg.learner_id ?? "";
  const view = learnerId ? rebuildView(ctx.cwd, { learnerId }) : undefined;
  return {
    ok: true,
    evaluation_run_id: evalRunId,
    appended_claims: appended,
    note: "history claims are never rewritten; new claims supersede old ones",
    view_id: view?.view_id,
  };
}

export function cmdExplain(ctx: CommandContext): unknown {
  const cfg = readWorkspaceConfig(ctx.cwd);
  const learnerId = flag(ctx.args.flags, "learner-id") ?? cfg.learner_id;
  const skillId = flag(ctx.args.flags, "skill-id");
  if (!learnerId) throw new OmacError("no_learner", "no learner_id; pass --learner-id");
  if (!skillId) throw new OmacError("missing_flag", "explain requires --skill-id");
  const chain = explainWhy(ctx.cwd, learnerId, skillId);
  return {
    ok: true,
    learner_id: learnerId,
    skill_id: skillId,
    estimate: chain.view.abilities[skillId],
    claims: chain.claims.map((c) => ({
      claim_id: c.claim_id,
      assessment: c.assessment,
      confidence: c.confidence,
      evidence_ids: c.evidence_ids,
      created_at: c.created_at,
    })),
    evidence: chain.evidence.map((e) => ({
      evidence_id: e.evidence_id,
      type: e.evidence_type,
      content: e.content_summary,
      actor: e.actor,
    })),
    events: chain.events.map((e) => ({ event_id: e.id, event_type: e.event_type, status: e.status })),
    trace: "view -> claim -> evidence -> event",
  };
}

export function cmdReport(ctx: CommandContext): unknown {
  const scope = flag(ctx.args.flags, "scope") ?? "event";
  const format = flag(ctx.args.flags, "format") === "text" ? "text" : "json";
  const cfg = readWorkspaceConfig(ctx.cwd);
  if (scope === "event") {
    const eventId = flag(ctx.args.flags, "event-id");
    if (!eventId) throw new OmacError("missing_flag", "report event requires --event-id");
    const r = eventReport(ctx.cwd, eventId, { format });
    return { ok: true, path: r.path, content: format === "json" ? JSON.parse(r.content) : r.content };
  }
  const learnerId = flag(ctx.args.flags, "learner-id") ?? cfg.learner_id;
  if (!learnerId) throw new OmacError("no_learner", "no learner_id; pass --learner-id");
  const r = learnerReport(ctx.cwd, learnerId, { format });
  return { ok: true, path: r.path, content: r.content };
}

export function cmdDoctor(ctx: CommandContext): unknown {
  const result = doctor(ctx.cwd);
  return { ok: true, integrity: result.integrity, warnings: result.warnings, tips: result.tips, connectors: result.connectors };
}

export function cmdIntegrity(ctx: CommandContext): unknown {
  const report = integrityCheck(ctx.cwd);
  return { ok: report.ok, report };
}

export function cmdMigrate(ctx: CommandContext): unknown {
  const result = migrateWorkspace(ctx.cwd, flag(ctx.args.flags, "to"));
  return { ok: true, ...result };
}

export function cmdExport(ctx: CommandContext): unknown {
  const learnerId = flag(ctx.args.flags, "learner-id");
  if (!learnerId) throw new OmacError("missing_flag", "export requires --learner-id");
  const result = exportPackage(ctx.cwd, {
    learnerId,
    scope: flagBool(ctx.args.flags, "workspace") ? "workspace" : "learner",
    outDir: flag(ctx.args.flags, "out"),
  });
  return { ok: true, package_id: result.manifest.export_package_id, path: result.path, manifest: result.manifest };
}

export function cmdImport(ctx: CommandContext): unknown {
  const pkg = ctx.args.command[1] ?? flag(ctx.args.flags, "package");
  if (!pkg) throw new OmacError("missing_flag", "import requires a package path");
  if (flagBool(ctx.args.flags, "preview")) {
    const preview = previewImport(ctx.cwd, pkg);
    return { ok: true, preview: true, ...preview };
  }
  const strategy = flag(ctx.args.flags, "strategy") ?? "merge";
  if (!["reject", "merge", "new-learner"].includes(strategy)) {
    throw new OmacError("validation_error", "strategy must be reject|merge|new-learner");
  }
  const result = importPackage(ctx.cwd, pkg, { strategy: strategy as "reject" | "merge" | "new-learner" });
  return {
    ok: true,
    ...result,
    note: "imported learner view rebuilt locally via rebuild; external materialized views are never trusted",
  };
}

export function cmdEventList(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const { working, archived } = listEvents(ws.omac);
  return {
    ok: true,
    working: working.map((e) => ({ event_id: e.id, type: e.event_type, status: e.status, targets: e.target_ids })),
    archived: archived.map((e) => ({ event_id: e.id, type: e.event_type, status: e.status })),
  };
}

export function cmdTargets(ctx: CommandContext): unknown {
  return {
    ok: true,
    targets: listTargets(ctx.cwd).map((t) => {
      const prov = targetProvenance(ctx.cwd, t.target_id);
      return {
        target_id: t.target_id,
        name: t.name,
        category: t.category,
        version: t.target_version,
        source: prov?.source ?? { type: "builtin" },
        pack_id: prov?.pack_id,
        pack_version: prov?.pack_version,
        license: prov?.license?.id,
      };
    }),
  };
}

export function cmdProblemAdd(ctx: CommandContext): unknown {
  const manifestPath = flag(ctx.args.flags, "manifest");
  if (manifestPath) {
    if (!existsSync(manifestPath)) throw new OmacError("file_not_found", `manifest not found: ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { problems?: Omit<ProblemManifestEntry, "added_at">[]; problem_ref?: string; platform?: string; difficulty?: string; rating?: number; statement_ref?: string; tags?: string[] };
    const list = manifest.problems ?? [{ problem_ref: manifest.problem_ref ?? "", platform: manifest.platform, difficulty: manifest.difficulty, rating: manifest.rating, statement_ref: manifest.statement_ref, tags: manifest.tags }];
    if (list.length === 0 || list[0].problem_ref === "") {
      throw new OmacError("validation_error", "manifest must contain problems[] with problem_ref");
    }
    const added = list.map((p) => addProblem(ctx.cwd, p));
    return { ok: true, added };
  }
  const problemRef = flag(ctx.args.flags, "problem-ref") ?? ctx.args.command[2];
  if (!problemRef) throw new OmacError("missing_flag", "problem add requires --problem-ref or positional");
  const statementRef = flag(ctx.args.flags, "statement");
  if (statementRef && !existsSync(statementRef)) {
    throw new OmacError("file_not_found", `statement file not found: ${statementRef}`);
  }
  const entry = addProblem(ctx.cwd, {
    problem_ref: problemRef,
    platform: flag(ctx.args.flags, "platform"),
    difficulty: flag(ctx.args.flags, "difficulty"),
    rating: flag(ctx.args.flags, "rating") ? Number(flag(ctx.args.flags, "rating")) : undefined,
    statement_ref: statementRef,
    samples_ref: flag(ctx.args.flags, "samples"),
    tags: (flag(ctx.args.flags, "tags") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    editorial_ref: flag(ctx.args.flags, "editorial"),
    source_url: flag(ctx.args.flags, "source-url"),
  });
  return { ok: true, problem: entry };
}

export function cmdProblemList(ctx: CommandContext): unknown {
  return { ok: true, problems: listProblems(ctx.cwd, flag(ctx.args.flags, "platform")) };
}

export function cmdArtifactAdd(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  const filePath = flag(ctx.args.flags, "file");
  const kind = flag(ctx.args.flags, "kind") ?? "code";
  if (!eventId) throw new OmacError("missing_flag", "artifact add requires --event-id");
  if (!filePath) throw new OmacError("missing_flag", "artifact add requires --file");
  if (!existsSync(filePath)) throw new OmacError("file_not_found", `file not found: ${filePath}`);
  const opId = flag(ctx.args.flags, "operation-id");
  if (opId) {
    const dup = listArtifacts(ctx.cwd).find((a) => a.operation_id === opId);
    if (dup) {
      return { ok: true, artifact: dup, checksum: dup.sha256, stored_at: join(ctx.cwd, ".omac", dup.rel_path), resumed: true };
    }
  }
  const content = readFileSync(filePath, "utf8");
  const checksum = `sha256:${sha256(content).slice(0, 32)}`;
  const ws = requireWorkspace(ctx.cwd);
  const destDir = join(ws.omac, "artifact", eventId);
  const destFile = join(destDir, filePath.split("/").pop() ?? "artifact");
  mkdirSync(destDir, { recursive: true });
  writeFileSync(destFile, content, "utf8");
  const relPath = `artifact/${eventId}/${filePath.split("/").pop() ?? "artifact"}`;
  const record = addArtifact(ctx.cwd, { eventId, kind: kind as "code", filePath, relPath, checksum, operationId: opId });
  return { ok: true, artifact: record, checksum, stored_at: destFile, resumed: false };
}

export function cmdArtifactList(ctx: CommandContext): unknown {
  return { ok: true, artifacts: listArtifacts(ctx.cwd, flag(ctx.args.flags, "event-id")) };
}

export function cmdTransferProbeAdd(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const cfg = readWorkspaceConfig(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  const targetId = flag(ctx.args.flags, "target-id");
  if (!eventId) throw new OmacError("missing_flag", "transfer-probe add requires --event-id");
  if (!targetId) throw new OmacError("missing_flag", "transfer-probe add requires --target-id");
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  if (archived) throw new OmacError("invalid_state", "cannot add transfer probe to archived event");
  if (!event.target_ids.includes(targetId)) {
    throw new OmacError(
      "target_mismatch",
      `transfer probe target '${targetId}' is not declared on event '${eventId}' (event targets: ${event.target_ids.join(", ") || "none"})`
    );
  }
  const result = validateTransferResult(flag(ctx.args.flags, "result") ?? "unknown");
  const probe: TransferProbe = {
    probe_id: `prb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    event_id: eventId,
    target_id: targetId,
    operation_id: flag(ctx.args.flags, "operation-id"),
    problem_ref: flag(ctx.args.flags, "problem-ref") ?? event.problem_ref,
    statement_hash: flag(ctx.args.flags, "statement-hash"),
    declared_before_start: flagBool(ctx.args.flags, "declared-before-start"),
    similarity_rule_ref: flag(ctx.args.flags, "similarity-rule"),
    problem_familiarity: flag(ctx.args.flags, "familiarity"),
    prior_exposure: flag(ctx.args.flags, "prior-exposure") ? flagBool(ctx.args.flags, "prior-exposure") : undefined,
    editorial_exposure: flag(ctx.args.flags, "editorial-exposure") ? flagBool(ctx.args.flags, "editorial-exposure") : undefined,
    external_help: flag(ctx.args.flags, "external-help") ? flagBool(ctx.args.flags, "external-help") : undefined,
    result,
    criteria_met: flag(ctx.args.flags, "criteria-met") ? flagBool(ctx.args.flags, "criteria-met") : undefined,
    evidence_ids: (flag(ctx.args.flags, "evidence-ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  const recorded = recordTransferProbe(ws.omac, eventId, probe);
  void cfg;
  return { ok: true, probe: recorded.probe, resumed: recorded.resumed };
}

export function cmdSubflow(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "subflow requires --event-id");
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  if (archived) throw new OmacError("invalid_state", "cannot modify archived event");
  const kind = validateSubflowKind(flag(ctx.args.flags, "kind") ?? "");
  const record = {
    subflow_id: newSubflowId(),
    event_id: eventId,
    kind,
    started_at: nowIso(),
    evidence_ids: [],
    operation_id: flag(ctx.args.flags, "operation-id"),
    debug: kind === "debug" ? { wa_types: (flag(ctx.args.flags, "wa-types") ?? "").split(",").map((s) => s.trim()).filter(Boolean), verdicts: (flag(ctx.args.flags, "verdicts") ?? "").split(",").map((s) => s.trim()).filter(Boolean), resolved: flag(ctx.args.flags, "resolved") ? flagBool(ctx.args.flags, "resolved") : undefined, root_cause: flag(ctx.args.flags, "root-cause") } : undefined,
    postmortem: kind === "postmortem" ? { original_direction: flag(ctx.args.flags, "original-direction"), failure_cause: flag(ctx.args.flags, "failure-cause"), insight_distance: flag(ctx.args.flags, "insight-distance") ? validateInsightDistance(flag(ctx.args.flags, "insight-distance")!) : undefined, pattern_extracted: flag(ctx.args.flags, "pattern"), anchor_algorithm: flag(ctx.args.flags, "anchor"), gave_up_early: flag(ctx.args.flags, "gave-up-early") ? flagBool(ctx.args.flags, "gave-up-early") : undefined, hint_too_early: flag(ctx.args.flags, "hint-too-early") ? flagBool(ctx.args.flags, "hint-too-early") : undefined } : undefined,
    teach_back: kind === "teach-back" ? { result: validateTeachBackResult(flag(ctx.args.flags, "result") ?? "fail"), content: flag(ctx.args.flags, "content") } : undefined,
    upsolve_review: kind === "upsolve-review" ? { original_direction: flag(ctx.args.flags, "original-direction"), failure_cause: flag(ctx.args.flags, "failure-cause"), insight_distance: flag(ctx.args.flags, "insight-distance") ? validateInsightDistance(flag(ctx.args.flags, "insight-distance")!) : undefined, key_insight: flag(ctx.args.flags, "key-insight"), pattern_extraction: flag(ctx.args.flags, "pattern"), transfer_readiness: flag(ctx.args.flags, "transfer-readiness") ? validateTransferReadiness(flag(ctx.args.flags, "transfer-readiness")!) : undefined, follow_up_target_ids: (flag(ctx.args.flags, "follow-up-targets") ?? "").split(",").map((s) => s.trim()).filter(Boolean) } : undefined,
  };
  const appended = appendSubflow(ctx.cwd, record);
  return { ok: true, subflow: appended, resumed: appended.subflow_id !== record.subflow_id };
}

export function cmdSubflowList(ctx: CommandContext): unknown {
  return { ok: true, subflows: listSubflows(ctx.cwd, flag(ctx.args.flags, "event-id")) };
}

export function cmdViewAlgorithm(ctx: CommandContext): unknown {
  return { ok: true, view: algorithmAbilityView(ctx.cwd) };
}

export function cmdViewProblemSolving(ctx: CommandContext): unknown {
  return { ok: true, view: problemSolvingView(ctx.cwd) };
}

export function cmdViewMisconception(ctx: CommandContext): unknown {
  return { ok: true, view: misconceptionView(ctx.cwd) };
}

export function cmdTransferSummary(ctx: CommandContext): unknown {
  return { ok: true, summary: transferProbeSummary(ctx.cwd, flag(ctx.args.flags, "event-id")) };
}

export function cmdTransferRate(ctx: CommandContext): unknown {
  const report = transferRateReport(ctx.cwd, {
    timeWindowDays: flag(ctx.args.flags, "time-window-days") ? Number(flag(ctx.args.flags, "time-window-days")) : undefined,
    minSamples: flag(ctx.args.flags, "min-samples") ? Number(flag(ctx.args.flags, "min-samples")) : undefined,
    learnerId: flag(ctx.args.flags, "learner-id"),
  });
  return { ok: true, report };
}

export function cmdPackInstall(ctx: CommandContext): unknown {
  const src = flag(ctx.args.flags, "source") ?? ctx.args.command[2];
  if (!src) throw new OmacError("missing_flag", "pack install requires --source <dir>");
  if (!existsSync(src)) throw new OmacError("file_not_found", `pack dir not found: ${src}`);
  const manifest = installPack(ctx.cwd, src);
  return { ok: true, installed: manifest.pack_id, version: manifest.pack_version, kind: manifest.kind };
}

export function cmdPackList(ctx: CommandContext): unknown {
  return {
    ok: true,
    packs: installedPacks(ctx.cwd).map((p) => ({
      pack_id: p.manifest.pack_id,
      pack_version: p.manifest.pack_version,
      schema_version: p.manifest.schema_version,
      name: p.manifest.name,
      kind: p.manifest.kind,
      license: manifestLicense(p.manifest),
      source: p.manifest.source,
      dependencies: p.manifest.dependencies,
      builtin: p.builtin,
    })),
  };
}

function cardSummary(ref: { card: { name: string; version?: string }; pack_id: string; pack_version: string; source?: { type?: string }; license?: { id?: string } }): Record<string, unknown> {
  return {
    id: (ref.card as { pattern_id?: string; misconception_id?: string; pedagogy_id?: string; algorithm_id?: string }).pattern_id
      ?? (ref.card as { misconception_id?: string }).misconception_id
      ?? (ref.card as { pedagogy_id?: string }).pedagogy_id
      ?? (ref.card as { algorithm_id?: string }).algorithm_id,
    name: ref.card.name,
    version: ref.card.version ?? ref.pack_version,
    pack_id: ref.pack_id,
    pack_version: ref.pack_version,
    source: ref.source?.type,
    license: ref.license?.id,
  };
}

export function cmdTargetGet(ctx: CommandContext): unknown {
  const id = ctx.args.command[2] ?? flag(ctx.args.flags, "target-id");
  if (!id) throw new OmacError("missing_flag", "target get requires <target-id>");
  const t = getTarget(ctx.cwd, id);
  const prov = targetProvenance(ctx.cwd, id);
  return { ok: true, target: t, provenance: prov };
}

export function cmdPatternList(ctx: CommandContext): unknown {
  return { ok: true, patterns: listPatternCards(ctx.cwd).map(cardSummary) };
}

export function cmdPatternGet(ctx: CommandContext): unknown {
  const id = ctx.args.command[2] ?? flag(ctx.args.flags, "pattern-id");
  if (!id) throw new OmacError("missing_flag", "pattern get requires <pattern-id>");
  const ref = getPatternCard(ctx.cwd, id);
  return { ok: true, pattern: ref.card, provenance: { pack_id: ref.pack_id, pack_version: ref.pack_version, source: ref.source, license: ref.license } };
}

export function cmdMisconceptionList(ctx: CommandContext): unknown {
  return { ok: true, misconceptions: listMisconceptionCards(ctx.cwd).map(cardSummary) };
}

export function cmdMisconceptionGet(ctx: CommandContext): unknown {
  const id = ctx.args.command[2] ?? flag(ctx.args.flags, "misconception-id");
  if (!id) throw new OmacError("missing_flag", "misconception get requires <misconception-id>");
  const ref = getMisconceptionCard(ctx.cwd, id);
  return { ok: true, misconception: ref.card, provenance: { pack_id: ref.pack_id, pack_version: ref.pack_version, source: ref.source, license: ref.license } };
}

export function cmdPedagogyList(ctx: CommandContext): unknown {
  return { ok: true, pedagogy: listPedagogyCards(ctx.cwd).map(cardSummary) };
}

export function cmdPedagogyGet(ctx: CommandContext): unknown {
  const id = ctx.args.command[2] ?? flag(ctx.args.flags, "pedagogy-id");
  if (!id) throw new OmacError("missing_flag", "pedagogy get requires <pedagogy-id>");
  const ref = getPedagogyCard(ctx.cwd, id);
  return { ok: true, pedagogy: ref.card, provenance: { pack_id: ref.pack_id, pack_version: ref.pack_version, source: ref.source, license: ref.license } };
}

export function cmdAlgorithmList(ctx: CommandContext): unknown {
  return { ok: true, algorithms: listAlgorithmCards(ctx.cwd).map(cardSummary) };
}

export function cmdAlgorithmGet(ctx: CommandContext): unknown {
  const id = ctx.args.command[2] ?? flag(ctx.args.flags, "algorithm-id");
  if (!id) throw new OmacError("missing_flag", "algorithm get requires <algorithm-id>");
  const ref = getAlgorithmCard(ctx.cwd, id);
  return { ok: true, algorithm: ref.card, provenance: { pack_id: ref.pack_id, pack_version: ref.pack_version, source: ref.source, license: ref.license } };
}

export function cmdPackPrereq(ctx: CommandContext): unknown {
  const concept = ctx.args.command[2] ?? flag(ctx.args.flags, "concept");
  if (!concept) throw new OmacError("missing_flag", "pack prereq requires <concept>");
  return { ok: true, concept, prerequisites: prereqOf(ctx.cwd, concept) };
}

export function cmdLearnPath(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  const stepsRaw = flag(ctx.args.flags, "path");
  if (!eventId) throw new OmacError("missing_flag", "learn path add requires --event-id");
  if (!stepsRaw) throw new OmacError("missing_flag", "learn path add requires --path (comma-separated steps)");
  const steps = stepsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  validateLearnPathSteps(steps);
  const record = recordLearnPath(ctx.cwd, eventId, steps);
  return { ok: true, learn_path: record };
}

export function cmdLearnPathList(ctx: CommandContext): unknown {
  return { ok: true, learn_paths: listLearnPaths(ctx.cwd, flag(ctx.args.flags, "event-id")) };
}

export function cmdRetentionList(ctx: CommandContext): unknown {
  const dueOnly = flagBool(ctx.args.flags, "due-only");
  const all = listRetention(ctx.cwd);
  const rows = dueOnly ? dueRetention(ctx.cwd) : all;
  return {
    ok: true,
    retention: rows.map((r) => ({
      concept_id: r.concept_id,
      recall_strength: r.recall_strength,
      review_count: r.review_count,
      next_review_at: r.next_review_at,
      window_days: r.recommended_review_window_days,
    })),
    meta: metricMeta(all.length > 0 ? "ok" : "insufficient_evidence", all.length, "retention:heuristic", all.length === 0 ? "no retention records; nothing has been scheduled or recalled" : undefined),
  };
}

export function cmdRetentionSchedule(ctx: CommandContext): unknown {
  const concept = ctx.args.command[2] ?? flag(ctx.args.flags, "concept");
  if (!concept) throw new OmacError("missing_flag", "retention schedule requires <concept>");
  const r = getRetention(ctx.cwd, concept);
  if (!r) throw new OmacError("not_found", `no retention record for '${concept}'`);
  return {
    ok: true,
    concept_id: concept,
    recall_strength: r.recall_strength,
    retention_estimate: r.retention_estimate,
    review_count: r.review_count,
    last_reviewed: r.last_reviewed,
    last_successful_recall: r.last_successful_recall,
    recommended_review_window_days: r.recommended_review_window_days,
    next_review_at: r.next_review_at,
    history: r.reviews.map((v) => ({ form: v.form, result: v.result, reviewed_at: v.reviewed_at })),
    meta: metricMeta("ok", r.review_count, "retention:heuristic", r.review_count < 2 ? `only ${r.review_count} review(s); schedule is a heuristic baseline` : undefined),
  };
}

export function cmdRetentionRecall(ctx: CommandContext): unknown {
  const concept = ctx.args.command[2] ?? flag(ctx.args.flags, "concept");
  const result = flag(ctx.args.flags, "result");
  if (!concept) throw new OmacError("missing_flag", "retention recall requires <concept>");
  if (!result || !["success", "partial", "fail"].includes(result)) {
    throw new OmacError("validation_error", "recall --result must be success|partial|fail");
  }
  const form = flag(ctx.args.flags, "form");
  if (form && !REVIEW_FORMS.includes(form as never)) {
    throw new OmacError("validation_error", `form must be one of ${REVIEW_FORMS.join(", ")}`);
  }
  const ws = requireWorkspace(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (eventId) {
    loadEventAnywhere(ws.omac, eventId);
  }
  const record = applyRecall(ctx.cwd, concept, result as "success" | "partial" | "fail", { eventId, form: form as never });
  return {
    ok: true,
    concept_id: concept,
    result,
    recall_strength: record.recall_strength,
    next_review_at: record.next_review_at,
    window_days: record.recommended_review_window_days,
    meta: metricMeta("ok", record.review_count, "retention:heuristic", "strength update is a deterministic heuristic; no causal claim"),
  };
}

export function cmdRetentionGaps(ctx: CommandContext): unknown {
  const minDelay = flag(ctx.args.flags, "min-delay-days") ? Number(flag(ctx.args.flags, "min-delay-days")) : 1;
  return { ok: true, gaps: retentionGaps(ctx.cwd, { minDelayDays: minDelay }) };
}

export function cmdRetentionPairs(ctx: CommandContext): unknown {
  return { ok: true, pairs: retentionPairs(ctx.cwd) };
}

export function cmdReviewAdd(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  const concept = flag(ctx.args.flags, "concept");
  const form = flag(ctx.args.flags, "form") ?? "recall";
  const result = flag(ctx.args.flags, "result") ?? "success";
  if (!eventId) throw new OmacError("missing_flag", "review add requires --event-id");
  if (!concept) throw new OmacError("missing_flag", "review add requires --concept");
  if (!REVIEW_FORMS.includes(form as never)) {
    throw new OmacError("validation_error", `form must be one of ${REVIEW_FORMS.join(", ")}`);
  }
  if (!["success", "partial", "fail"].includes(result)) {
    throw new OmacError("validation_error", "result must be success|partial|fail");
  }
  const ws = requireWorkspace(ctx.cwd);
  const { event, archived } = loadEventAnywhere(ws.omac, eventId);
  if (archived) throw new OmacError("invalid_state", "cannot add review to archived event");
  const record = applyRecall(ctx.cwd, concept, result as "success" | "partial" | "fail", { eventId, form: form as never });
  const latest = record.reviews[record.reviews.length - 1];
  appendEvidence(ctx.cwd, {
    evidence_type: "observation",
    event_id: eventId,
    workspace_id: event.workspace_id,
    learner_id: event.learner_id,
    actor: "runtime",
    observed_at: latest.reviewed_at,
    target_ids: [concept],
    content_summary: `review: ${concept} form=${form} result=${result}`,
    provenance: "cli",
    evidence_quality: "medium",
    operation_id: `op-review-${eventId}-${concept}-${latest.review_id}`,
    extra: { review: { review_id: latest.review_id, concept_id: concept, form, result, reviewed_at: latest.reviewed_at } },
  });
  return { ok: true, review: latest, recall_strength: record.recall_strength, next_review_at: record.next_review_at };
}

export function cmdCurriculum(ctx: CommandContext): unknown {
  let view: { abilities?: Record<string, { status?: string }> } = {};
  try {
    const v = getView(ctx.cwd, readWorkspaceConfig(ctx.cwd).learner_id ?? "");
    view = v;
  } catch {
    view = {};
  }
  return { ok: true, candidates: curriculumCandidates(ctx.cwd, view) };
}

export function cmdConnectorList(ctx: CommandContext): unknown {
  return {
    ok: true,
    connectors: listConnectors().map((c) => ({
      connector_id: c.connector_id,
      platform: c.platform,
      version: c.version,
      capabilities: c.capabilities,
    })),
  };
}

export function cmdConnectorInspect(ctx: CommandContext): unknown {
  const id = ctx.args.command[2] ?? flag(ctx.args.flags, "connector");
  if (!id) throw new OmacError("missing_flag", "connector inspect requires <id>");
  const c = getConnector(id);
  const cache = cachedContent(ctx.cwd, id);
  return { ok: true, connector: c, cached_entries: cache.length, verified_entries: cache.filter((x) => x.verified).length };
}

export function cmdEditorialGet(ctx: CommandContext): unknown {
  const ref = ctx.args.command[2] ?? flag(ctx.args.flags, "ref");
  const connector = flag(ctx.args.flags, "connector") ?? "codeforces";
  if (!ref) throw new OmacError("missing_flag", "editorial get requires <ref>");
  try {
    const record = fetchEditorial(ctx.cwd, ref, connector);
    return {
      ok: true,
      editorial: record,
      degraded: !record.verified,
      note: record.verification_note,
    };
  } catch (e) {
    if (e instanceof OmacError && e.code === "capability_missing") {
      return {
        ok: true,
        editorial: null,
        degraded: true,
        note: `connector '${connector}' cannot fetch editorials — offline degradation`,
      };
    }
    throw e;
  }
}

export function cmdEditorialCacheClear(ctx: CommandContext): unknown {
  const connector = ctx.args.command[3] ?? flag(ctx.args.flags, "connector");
  if (!connector) throw new OmacError("missing_flag", "editorial cache clear requires <connector>");
  const result = clearConnectorCache(ctx.cwd, connector);
  return { ok: true, ...result };
}

export function cmdProblemStatus(ctx: CommandContext): unknown {
  const ref = ctx.args.command[2] ?? flag(ctx.args.flags, "problem-ref");
  const status = flag(ctx.args.flags, "status");
  if (!ref) throw new OmacError("missing_flag", "problem status requires <ref>");
  if (!status || !["solved", "attempted", "untouched"].includes(status)) {
    throw new OmacError("validation_error", "--status must be solved|attempted|untouched");
  }
  const independence = flag(ctx.args.flags, "independence");
  const record = setProblemStatus(ctx.cwd, {
    problem_ref: ref,
    status: status as "solved" | "attempted" | "untouched",
    independence_status: independence,
    solved_at: status === "solved" ? new Date().toISOString() : undefined,
    event_id: flag(ctx.args.flags, "event-id"),
    evidence_ids: (flag(ctx.args.flags, "evidence-ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  return { ok: true, problem_status: record };
}

export function cmdProblemStatusList(ctx: CommandContext): unknown {
  return { ok: true, statuses: problemStatuses(ctx.cwd) };
}

export function cmdRecommend(ctx: CommandContext): unknown {
  const targetId = flag(ctx.args.flags, "target");
  if (!targetId) throw new OmacError("missing_flag", "recommend requires --target <target_id>");
  const mode = flag(ctx.args.flags, "mode") ?? "auto";
  if (!["auto", "exploitation", "exploration"].includes(mode)) {
    throw new OmacError("validation_error", "--mode must be auto|exploitation|exploration");
  }
  const limit = flag(ctx.args.flags, "limit") ? Number(flag(ctx.args.flags, "limit")) : 5;
  let view: { abilities?: Record<string, { status?: string; confidence?: number; evidence_count?: number; estimate?: [number, number] }> } = {};
  try {
    const v = getView(ctx.cwd, readWorkspaceConfig(ctx.cwd).learner_id ?? "");
    view = v;
  } catch {
    view = {};
  }
  const result = recommendProblems(ctx.cwd, {
    targetId,
    mode: mode as "auto" | "exploitation" | "exploration",
    limit,
    platform: flag(ctx.args.flags, "platform"),
    solvedExcluded: !flagBool(ctx.args.flags, "include-solved"),
    learnerView: view,
  });
  return { ok: true, ...result };
}

export function cmdRecommendExplain(ctx: CommandContext): unknown {
  const explainVal = flag(ctx.args.flags, "explain");
  const ref = ctx.args.command[1] ?? (typeof explainVal === "string" && explainVal !== "true" ? explainVal : undefined) ?? flag(ctx.args.flags, "problem-ref");
  if (!ref) throw new OmacError("missing_flag", "recommend --explain requires <ref>");
  const explanation = explainRecommendation(ctx.cwd, ref);
  return { ok: true, explanation };
}

export function cmdContestImport(ctx: CommandContext): unknown {
  const artifact = flag(ctx.args.flags, "artifact") ?? ctx.args.command[2];
  if (!artifact) throw new OmacError("missing_flag", "contest import requires --artifact <path>");
  const eventId = flag(ctx.args.flags, "event-id");
  const result = importContestArtifact(ctx.cwd, artifact, { eventId });
  return { ok: true, ...result };
}

export function cmdContestTimeline(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "contest timeline requires --event-id");
  const contestId = findContestIdForEvent(ctx.cwd, eventId);
  if (!contestId) throw new OmacError("no_contest_ref", "event has no contest_ref");
  return { ok: true, contest_id: contestId, timeline: contestTimeline(ctx.cwd, contestId) };
}

export function cmdContestAnalyze(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  const contestId = flag(ctx.args.flags, "contest-id");
  if (!eventId && !contestId) throw new OmacError("missing_flag", "contest analyze requires --event-id or --contest-id");
  const cid = contestId ?? findContestIdForEvent(ctx.cwd, eventId!);
  if (!cid) throw new OmacError("no_contest_ref", "event has no contest_ref; import the artifact first");
  const analysis = analyzeContest(ctx.cwd, cid, { learnerRating: flag(ctx.args.flags, "learner-rating") ? Number(flag(ctx.args.flags, "learner-rating")) : undefined });
  recordContestAnalysis(ctx.cwd, analysis);
  return { ok: true, analysis };
}

export function cmdContestLinkUpsolve(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  const upsolveEvent = flag(ctx.args.flags, "upsolve-event");
  if (!eventId || !upsolveEvent) throw new OmacError("missing_flag", "contest link-upsolve requires --event-id and --upsolve-event");
  const result = linkUpsolve(ctx.cwd, eventId, upsolveEvent, flag(ctx.args.flags, "problem-ref"));
  return { ...result };
}

export function cmdContestFollowups(ctx: CommandContext): unknown {
  const eventId = flag(ctx.args.flags, "event-id");
  const contestId = flag(ctx.args.flags, "contest-id");
  if (!eventId && !contestId) throw new OmacError("missing_flag", "contest followups requires --event-id or --contest-id");
  const cid = contestId ?? findContestIdForEvent(ctx.cwd, eventId!);
  if (!cid) throw new OmacError("no_contest_ref", "event has no contest_ref");
  return { ok: true, contest_id: cid, ...contestFollowups(ctx.cwd, cid) };
}

export function cmdViewContest(ctx: CommandContext): unknown {
  return { ok: true, view: contestAbilityView(ctx.cwd) };
}

export function cmdRating(ctx: CommandContext): unknown {
  return { ok: true, rating: computeRating(ctx.cwd, flag(ctx.args.flags, "learner-id")) };
}

export function cmdCalibration(ctx: CommandContext): unknown {
  return { ok: true, calibration: computeCalibration(ctx.cwd) };
}

export function cmdRetentionModelStatus(ctx: CommandContext): unknown {
  const concept = ctx.args.command[2] ?? flag(ctx.args.flags, "concept");
  if (!concept) throw new OmacError("missing_flag", "retention model-status requires <concept>");
  const r = getRetention(ctx.cwd, concept);
  if (!r) throw new OmacError("not_found", `no retention for '${concept}'`);
  const advanced = advancedRetentionStatus({ ...r });
  return {
    ok: true,
    concept_id: concept,
    model: "exp-backoff-with-overdue-decay",
    recall_strength: advanced.recall_strength,
    retention_estimate: advanced.retention_estimate,
    next_review_at: advanced.next_review_at,
    overdue_decay_note: advanced.next_review_at && advanced.next_review_at < new Date().toISOString() ? "overdue: estimate decayed" : "not overdue",
    meta: metricMeta(r.review_count >= 2 ? "ok" : "insufficient_evidence", r.review_count, "retention:exp-backoff-heuristic", r.review_count < 2 ? `only ${r.review_count} review(s); retention estimate is not yet stable` : "heuristic estimate; no causal claim"),
  };
}

export function cmdCoachEval(ctx: CommandContext): unknown {
  const target = flag(ctx.args.flags, "target");
  if (!target) throw new OmacError("missing_flag", "coach eval requires --target");
  const result = coachEval(ctx.cwd, target, { minEvents: flag(ctx.args.flags, "min-events") ? Number(flag(ctx.args.flags, "min-events")) : undefined });
  return { ok: true, ...result, status: result.entries.some((e) => !e.insufficient) ? "ok" : "insufficient_evidence", uncertainty: result.sample_size === 0 ? "no intervention evidence for this target" : "heuristic gain sign; no causal claim" };
}

export function cmdCoachPolicy(ctx: CommandContext): unknown {
  const result = coachPolicy(ctx.cwd, { minSamples: flag(ctx.args.flags, "min-samples") ? Number(flag(ctx.args.flags, "min-samples")) : undefined });
  return { ok: true, ...result, status: result.policies.length > 0 ? "ok" : "insufficient_evidence", uncertainty: result.sample_size === 0 ? "no intervention evidence recorded" : "policy effectiveness is a heuristic baseline" };
}

export function cmdCoachGainMatrix(ctx: CommandContext): unknown {
  return { ok: true, ...gainMatrix(ctx.cwd) };
}

export function cmdVisualize(ctx: CommandContext): unknown {
  const kind = flag(ctx.args.flags, "kind") ?? "ascii";
  const view = flag(ctx.args.flags, "view") ?? "algorithm";
  if (!["chart", "graph", "ascii"].includes(kind)) throw new OmacError("validation_error", "--kind must be chart|graph|ascii");
  if (!["algorithm", "problem-solving", "retention", "rating"].includes(view)) throw new OmacError("validation_error", "--view must be algorithm|problem-solving|retention|rating");
  const result = visualize(ctx.cwd, { kind: kind as "chart" | "graph" | "ascii", view: view as never, concept: flag(ctx.args.flags, "concept") });
  return { ok: true, visualization: result };
}

export function cmdPlan(ctx: CommandContext): unknown {
  const horizon = flag(ctx.args.flags, "horizon") ? Number(flag(ctx.args.flags, "horizon")) : 4;
  const targets = (flag(ctx.args.flags, "targets") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const result = longTermPlan(ctx.cwd, { horizonWeeks: horizon, targets });
  const goalCount = result.weeks.reduce((n, w) => n + w.goals.length, 0);
  return { ok: true, ...result, status: goalCount > 0 ? "ok" : "insufficient_evidence", sample_size: goalCount, uncertainty: goalCount === 0 ? "no due retention or planned targets; plan is empty" : "plan is a deterministic heuristic; not a commitment" };
}

export function cmdPackUpdate(ctx: CommandContext): unknown {
  const packId = ctx.args.command[2] ?? flag(ctx.args.flags, "pack-id");
  if (!packId) throw new OmacError("missing_flag", "pack update requires <pack-id>");
  const result = updatePack(ctx.cwd, packId, { source: flag(ctx.args.flags, "source"), apply: flagBool(ctx.args.flags, "apply") });
  return { ok: true, ...result, source: "pack-audit:.versions.jsonl", sample_size: 1, uncertainty: result.action === "upgraded" ? "audit record appended; rollback requires a prior version pack" : undefined };
}

export function cmdPackVersions(ctx: CommandContext): unknown {
  const packId = ctx.args.command[2] ?? flag(ctx.args.flags, "pack-id");
  if (!packId) throw new OmacError("missing_flag", "pack versions requires <pack-id>");
  const result = packVersions(ctx.cwd, packId);
  return { ok: true, ...result, status: result.versions.length > 0 ? "ok" : "insufficient_evidence", sample_size: result.versions.length, source: "pack-audit:.versions.jsonl", uncertainty: result.versions.length === 0 ? "no version audit records for this pack" : "audit trail is replayable from/to" };
}

function metricMeta(status: "ok" | "insufficient_evidence", sampleSize: number, source: string, uncertainty?: string): { status: string; sample_size: number; source: string; uncertainty?: string } {
  return { status, sample_size: sampleSize, source, uncertainty };
}
