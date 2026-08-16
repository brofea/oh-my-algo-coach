import { join } from "node:path";
import { readJsonl, appendJsonl } from "./jsonl.js";
import { requireWorkspace } from "./workspace.js";
import { SubflowRecord } from "../core/types.js";
import { OmacError } from "../core/ids.js";

export function subflowsFile(omac: string): string {
  return join(omac, "event", "subflows.jsonl");
}

export function appendSubflow(cwd: string, subflow: SubflowRecord): SubflowRecord {
  const ws = requireWorkspace(cwd);
  appendJsonl(subflowsFile(ws.omac), subflow);
  return subflow;
}

export function listSubflows(cwd: string, eventId?: string): SubflowRecord[] {
  const ws = requireWorkspace(cwd);
  const all = readJsonl<SubflowRecord>(subflowsFile(ws.omac));
  return eventId ? all.filter((s) => s.event_id === eventId) : all;
}

export function getSubflow(cwd: string, subflowId: string): SubflowRecord {
  const found = listSubflows(cwd).find((s) => s.subflow_id === subflowId);
  if (!found) throw new OmacError("subflow_not_found", `subflow '${subflowId}' not found`);
  return found;
}
