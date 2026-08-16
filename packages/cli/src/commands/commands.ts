import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CommandContext, flag, flagBool, outputJson } from "../core/cli.js";
import { initWorkspace, setLearnerId, readWorkspaceConfig, WARNING_TEXT, requireWorkspace, omacPath } from "../store/workspace.js";
import { OmacError, uuid } from "../core/ids.js";
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
  const record = appendEvidence(ctx.cwd, {
    evidence_type: validateEvidenceType(flag(ctx.args.flags, "type") ?? "observation"),
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
    extra: flag(ctx.args.flags, "extra") ? JSON.parse(flag(ctx.args.flags, "extra")!) : undefined,
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
  return { ok: true, integrity: result.integrity, warnings: result.warnings, tips: result.tips };
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
