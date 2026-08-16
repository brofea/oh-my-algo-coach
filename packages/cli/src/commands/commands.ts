import { rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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
} from "../store/event_store.js";
import { appendClaim, listClaims } from "../store/claim_store.js";
import { appendEvidence, listEvidence } from "../store/evidence_store.js";
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
import { explainWhy } from "../services/explain.js";
import { eventReport, learnerReport } from "../services/report.js";
import { doctor, integrityCheck } from "../services/doctor.js";
import { migrateWorkspace } from "../services/migrate.js";
import { exportPackage, previewImport, importPackage } from "../services/export_import.js";
import { listTargets } from "../protocol/target.js";
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
import { algorithmAbilityView, problemSolvingView, misconceptionView, transferProbeSummary } from "../services/coaching_views.js";
import { recordTransferProbe } from "../store/event_store.js";
import { TransferProbe, ProblemManifestEntry } from "../core/types.js";
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
import { recordLearnPath, validateLearnPathSteps, listLearnPaths, installPack, installedPacks, prereqOf } from "../services/memory.js";
import { listConnectors, getConnector, fetchProblem, fetchEditorial, cachedContent, clearConnectorCache, setProblemStatus, problemStatuses } from "../services/ecosystem.js";
import { recommendProblems, explainRecommendation } from "../services/recommend.js";

export function cmdInit(ctx: CommandContext): unknown {
  const opts = {
    learnerId: flag(ctx.args.flags, "learner-id"),
    saveConversation: flagBool(ctx.args.flags, "save-conversation"),
  };
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
  const assessment = flag(ctx.args.flags, "assessment");
  if (!assessment) throw new OmacError("missing_flag", "learner claim submit requires --assessment");
  const confidence = Number(flag(ctx.args.flags, "confidence") ?? "0.5");
  validateConfidence(confidence);
  const evidenceIds = (flag(ctx.args.flags, "evidence-ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const operationId = flag(ctx.args.flags, "operation-id") ?? `op-${uuid().slice(0, 12)}`;
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
    student_confirmation: (flag(ctx.args.flags, "student-confirmation") as never) ?? "not_required",
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
      "purge is irreversible: it deletes the learner's Profile, Events, Evidence, Claims, Views, Reports and index refs. Re-run with --confirm. Export/backup copies and already-sent external data are NOT deleted."
    );
  }
  const ws = requireWorkspace(ctx.cwd);
  const { working, archived } = listEvents(ws.omac);
  const active = [...working, ...archived].filter((e) => e.learner_id === id && ["active", "paused", "evaluating"].includes(e.status));
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
  for (const e of [...working, ...archived]) {
    if (e.learner_id === id) {
      rmSync(omacPath(ctx.cwd, "event", e.id), { recursive: true, force: true });
      rmSync(omacPath(ctx.cwd, "event", "archive", e.id), { recursive: true, force: true });
    }
  }
  const idxFile = omacPath(ctx.cwd, "event", "index", "index.jsonl");
  if (existsSync(idxFile)) {
    const removed = new Set([...working, ...archived].filter((e) => e.learner_id === id).map((e) => e.id));
    const kept = (readJsonl(idxFile) as { event_id?: string }[]).filter((x) => !removed.has(x.event_id ?? ""));
    writeJsonl(idxFile, kept as never[]);
  }
  rmSync(omacPath(ctx.cwd, "learner", "views", `${id}.views.json`), { force: true });
  rmSync(omacPath(ctx.cwd, "report", `learner-${id}.md`), { force: true });
  return { ok: true, purged: id, note: "export/backup copies and already-sent external data are NOT deleted" };
}

export function cmdEvidenceAppend(ctx: CommandContext): unknown {
  const ws = requireWorkspace(ctx.cwd);
  const cfg = readWorkspaceConfig(ctx.cwd);
  const eventId = flag(ctx.args.flags, "event-id");
  if (!eventId) throw new OmacError("missing_flag", "evidence append requires --event-id");
  const { event } = loadEventAnywhere(ws.omac, eventId);
  const operationId = flag(ctx.args.flags, "operation-id") ?? `op-${uuid().slice(0, 12)}`;
  const evidenceType = validateEvidenceType(flag(ctx.args.flags, "type") ?? "observation");
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
  const record = appendEvidence(ctx.cwd, {
    evidence_type: evidenceType,
    event_id: eventId,
    workspace_id: cfg.workspace_id,
    learner_id: event.learner_id,
    actor: validateActor(flag(ctx.args.flags, "actor") ?? "coach"),
    observed_at: flag(ctx.args.flags, "observed-at") ?? new Date().toISOString(),
    target_ids: (flag(ctx.args.flags, "target-ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    problem_ref: flag(ctx.args.flags, "problem-ref"),
    artifact_ref: flag(ctx.args.flags, "artifact-ref"),
    source: flag(ctx.args.flags, "source"),
    content_summary: flag(ctx.args.flags, "content") ?? "",
    provenance: flag(ctx.args.flags, "provenance") ?? "cli",
    evidence_quality: validateEvidenceQuality(flag(ctx.args.flags, "quality") ?? "medium"),
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
  }
  const event = createEvent({
    cwd: ctx.cwd,
    eventType,
    learnerId: cfg.learner_id,
    workspaceId: cfg.workspace_id,
    targetIds: (flag(ctx.args.flags, "target-ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    intent: flag(ctx.args.flags, "intent"),
    problemRef: flag(ctx.args.flags, "problem-ref"),
    contestRef,
    mode,
    platformProfileRef: flag(ctx.args.flags, "platform-profile"),
    domainProfileRef: flag(ctx.args.flags, "domain-profile"),
    provenance: flag(ctx.args.flags, "provenance") ?? "cli",
    operationId: flag(ctx.args.flags, "operation-id"),
  });
  return { ok: true, event_id: event.id, event };
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
    targets: listTargets(ctx.cwd).map((t) => ({
      target_id: t.target_id,
      name: t.name,
      category: t.category,
      version: t.target_version,
    })),
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
  const content = readFileSync(filePath, "utf8");
  const checksum = `sha256:${sha256(content).slice(0, 32)}`;
  const ws = requireWorkspace(ctx.cwd);
  const destDir = join(ws.omac, "artifact", eventId);
  const destFile = join(destDir, filePath.split("/").pop() ?? "artifact");
  mkdirSync(destDir, { recursive: true });
  writeFileSync(destFile, content, "utf8");
  const relPath = `artifact/${eventId}/${filePath.split("/").pop() ?? "artifact"}`;
  const record = addArtifact(ctx.cwd, { eventId, kind: kind as "code", filePath, relPath, checksum });
  return { ok: true, artifact: record, checksum, stored_at: destFile };
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
  const result = validateTransferResult(flag(ctx.args.flags, "result") ?? "unknown");
  const probe: TransferProbe = {
    probe_id: `prb-${nowIso().slice(0, 19).replace(/[^0-9]/g, "")}`,
    event_id: eventId,
    target_id: targetId,
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
  recordTransferProbe(ws.omac, eventId, probe);
  void cfg;
  return { ok: true, probe };
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
    debug: kind === "debug" ? { wa_types: (flag(ctx.args.flags, "wa-types") ?? "").split(",").map((s) => s.trim()).filter(Boolean), verdicts: (flag(ctx.args.flags, "verdicts") ?? "").split(",").map((s) => s.trim()).filter(Boolean), resolved: flag(ctx.args.flags, "resolved") ? flagBool(ctx.args.flags, "resolved") : undefined, root_cause: flag(ctx.args.flags, "root-cause") } : undefined,
    postmortem: kind === "postmortem" ? { original_direction: flag(ctx.args.flags, "original-direction"), failure_cause: flag(ctx.args.flags, "failure-cause"), insight_distance: flag(ctx.args.flags, "insight-distance") ? validateInsightDistance(flag(ctx.args.flags, "insight-distance")!) : undefined, pattern_extracted: flag(ctx.args.flags, "pattern"), anchor_algorithm: flag(ctx.args.flags, "anchor"), gave_up_early: flag(ctx.args.flags, "gave-up-early") ? flagBool(ctx.args.flags, "gave-up-early") : undefined, hint_too_early: flag(ctx.args.flags, "hint-too-early") ? flagBool(ctx.args.flags, "hint-too-early") : undefined } : undefined,
    teach_back: kind === "teach-back" ? { result: validateTeachBackResult(flag(ctx.args.flags, "result") ?? "fail"), content: flag(ctx.args.flags, "content") } : undefined,
    upsolve_review: kind === "upsolve-review" ? { original_direction: flag(ctx.args.flags, "original-direction"), failure_cause: flag(ctx.args.flags, "failure-cause"), insight_distance: flag(ctx.args.flags, "insight-distance") ? validateInsightDistance(flag(ctx.args.flags, "insight-distance")!) : undefined, key_insight: flag(ctx.args.flags, "key-insight"), pattern_extraction: flag(ctx.args.flags, "pattern"), transfer_readiness: flag(ctx.args.flags, "transfer-readiness") ? validateTransferReadiness(flag(ctx.args.flags, "transfer-readiness")!) : undefined, follow_up_target_ids: (flag(ctx.args.flags, "follow-up-targets") ?? "").split(",").map((s) => s.trim()).filter(Boolean) } : undefined,
  };
  appendSubflow(ctx.cwd, record);
  return { ok: true, subflow: record };
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
      name: p.manifest.name,
      kind: p.manifest.kind,
      license: p.manifest.license,
    })),
  };
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
