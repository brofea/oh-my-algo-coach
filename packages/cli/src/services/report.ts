import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { OmacError, nowIso } from "../core/ids.js";
import { EventRecord } from "../core/types.js";
import { listClaims } from "../store/claim_store.js";
import { listEvidence } from "../store/evidence_store.js";
import { listEvents, loadEventAnywhere, eventLog } from "../store/event_store.js";
import { requireWorkspace, omacPath } from "../store/workspace.js";
import { explainWhy, learnerSummary } from "./explain.js";

export function eventReport(cwd: string, eventId: string, opts: { format?: "text" | "json" }): { path: string; content: string } {
  const ws = requireWorkspace(cwd);
  const { event } = loadEventAnywhere(ws.omac, eventId);
  const evidence = listEvidence(cwd, eventId);
  const claims = listClaims(cwd).filter((c) => c.input_snapshot_ref === `event:${eventId}` || c.evidence_ids.some((eid) => evidence.some((e) => e.evidence_id === eid)));
  const log = eventLog(ws.omac, eventId);
  const report = {
    type: "event-report",
    event,
    evidence_count: evidence.length,
    evidence,
    claims,
    log,
    generated_at: nowIso(),
  };
  const content = opts.format === "json" ? JSON.stringify(report, null, 2) : renderTextEvent(report);
  const file = join(ws.omac, "report", `event-${eventId}.md`);
  writeFileSync(file, opts.format === "json" ? `\`\`\`json\n${content}\n\`\`\`` : content, "utf8");
  return { path: file, content };
}

export function learnerReport(cwd: string, learnerId: string, opts: { format?: "text" | "json" }): { path: string; content: string } {
  const ws = requireWorkspace(cwd);
  const summary = learnerSummary(cwd, learnerId);
  const content = opts.format === "json" ? JSON.stringify(summary, null, 2) : renderTextLearner(summary);
  const file = join(ws.omac, "report", `learner-${learnerId}.md`);
  writeFileSync(file, content, "utf8");
  return { path: file, content };
}

function renderTextEvent(report: { event: EventRecord; evidence: unknown[]; claims: unknown[]; log: unknown[] }): string {
  const e = report.event;
  const lines: string[] = [];
  lines.push(`# Event Report: ${e.id}`);
  lines.push(`- type: ${e.event_type} | status: ${e.status} | mode: ${e.mode}`);
  lines.push(`- learner: ${e.learner_id} | workspace: ${e.workspace_id}`);
  lines.push(`- targets: ${e.target_ids.join(", ") || "-"}`);
  lines.push(`- started: ${e.started_at ?? "-"} | ended: ${e.ended_at ?? "-"}`);
  if (e.problem_ref) lines.push(`- problem: ${e.problem_ref}`);
  lines.push(`- evidence count: ${report.evidence.length} | claim count: ${report.claims.length}`);
  return lines.join("\n") + "\n";
}

function renderTextLearner(summary: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`# Learner Report: ${String(summary.learner_id)}`);
  lines.push(`- skills: ${String(summary.skill_count)} | misconceptions: ${String(summary.misconception_count)} | events: ${String(summary.event_count)}`);
  const skills = (summary.skills ?? []) as { skill_id: string; status: string; estimate?: [number, number]; confidence: number }[];
  for (const s of skills) {
    lines.push(`- ${s.skill_id}: ${s.status} ${s.estimate ? `[${s.estimate[0]}-${s.estimate[1]}]` : ""} (conf ${s.confidence.toFixed(2)})`);
  }
  return lines.join("\n") + "\n";
}
