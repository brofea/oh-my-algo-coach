import { join } from "node:path";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { readJsonl, writeJson, readJson, jsonExists, writeJsonl } from "../store/jsonl.js";
import { requireWorkspace } from "../store/workspace.js";
import { OmacError, nowIso, uuid } from "../core/ids.js";
import { ConnectorCapabilityManifest, ExternalContentRecord, ProblemStatusRecord } from "../core/types.js";

const CONNECTOR_REGISTRY: ConnectorCapabilityManifest[] = [
  {
    connector_id: "codeforces",
    platform: "codeforces",
    version: "1.0.0",
    capabilities: { fetch_problem: true, fetch_editorial: true, list_contest_problems: true, rate_limit_per_minute: 5, web: false },
    source: "fixture",
    license: "codeforces-api-terms",
  },
  {
    connector_id: "atcoder",
    platform: "atcoder",
    version: "1.0.0",
    capabilities: { fetch_problem: true, fetch_editorial: false, list_contest_problems: true, rate_limit_per_minute: 5, web: false },
    source: "fixture",
    license: "atcoder-terms",
  },
];

export function listConnectors(): ConnectorCapabilityManifest[] {
  return CONNECTOR_REGISTRY;
}

export function getConnector(connectorId: string): ConnectorCapabilityManifest {
  const c = CONNECTOR_REGISTRY.find((x) => x.connector_id === connectorId);
  if (!c) throw new OmacError("connector_not_found", `connector '${connectorId}' not found`);
  return c;
}

export function externalDir(omac: string, connectorId: string): string {
  return join(omac, "knowledge", "external", connectorId);
}

export function fetchProblem(cwd: string, ref: string, connectorId: string): ExternalContentRecord {
  const c = getConnector(connectorId);
  if (!c.capabilities.fetch_problem) {
    throw new OmacError("capability_missing", `connector '${connectorId}' cannot fetch problems`);
  }
  const ws = requireWorkspace(cwd);
  const fixture = findFixture(ref);
  const now = nowIso();
  const record: ExternalContentRecord = {
    content_id: `ext-${uuid().slice(0, 12)}`,
    ref,
    connector_id: connectorId,
    kind: "problem",
    source_url: fixture?.source_url ?? `${connectorId}://${ref}`,
    source_type: fixture ? "fixture" : "unverified",
    retrieved_at: now,
    content_license: c.license,
    usage_policy: "coach-knowledge-only: never expose full solution to learner during practice; requires verified source",
    contest_status: fixture?.contest_status,
    cache_version: c.version,
    verified: fixture !== undefined,
    verification_note: fixture ? "matched fixture data source" : "no verified source found — unverified, not cached as long-term knowledge",
    data: fixture?.data ?? { statement: null, tags: fixture?.tags ?? [] },
  };
  writeJson(join(externalDir(ws.omac, connectorId), `${ref.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`), record);
  return record;
}

export function fetchEditorial(cwd: string, ref: string, connectorId: string): ExternalContentRecord {
  const c = getConnector(connectorId);
  if (!c.capabilities.fetch_editorial) {
    throw new OmacError("capability_missing", `connector '${connectorId}' does not support editorials (degraded)`);
  }
  const ws = requireWorkspace(cwd);
  const fixture = findFixture(ref, true);
  const record: ExternalContentRecord = {
    content_id: `ext-${uuid().slice(0, 12)}`,
    ref,
    connector_id: connectorId,
    kind: "editorial",
    source_url: fixture?.source_url,
    source_type: fixture ? "official" : "unverified",
    retrieved_at: nowIso(),
    content_license: c.license,
    usage_policy: "coach-knowledge-only: coach may know the solution, learner must still receive hints per Hint Policy",
    contest_status: fixture?.contest_status,
    cache_version: c.version,
    verified: fixture !== undefined,
    verification_note: fixture ? "verified official/community source" : "editorial not found or unverified",
    data: fixture?.data ?? null,
  };
  writeJson(join(externalDir(ws.omac, connectorId), `${ref.replace(/[^a-zA-Z0-9.-]/g, "_")}.editorial.json`), record);
  return record;
}

export function cachedContent(cwd: string, connectorId: string): ExternalContentRecord[] {
  const ws = requireWorkspace(cwd);
  const dir = externalDir(ws.omac, connectorId);
  if (!existsSync(dir)) return [];
  const out: ExternalContentRecord[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      out.push(readJson<ExternalContentRecord>(join(dir, name)));
    } catch {
      // skip
    }
  }
  return out;
}

export function clearConnectorCache(cwd: string, connectorId: string): { removed: number } {
  const ws = requireWorkspace(cwd);
  const dir = externalDir(ws.omac, connectorId);
  if (!existsSync(dir)) return { removed: 0 };
  let removed = 0;
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { force: true });
    removed++;
  }
  return { removed };
}

interface Fixture {
  source_url: string;
  contest_status?: string;
  data?: unknown;
  tags?: string[];
  rating?: number;
  title?: string;
}

const FIXTURES: Record<string, Fixture> = {
  "cf:2065C": {
    source_url: "https://codeforces.com/contest/2065/problem/C",
    contest_status: "finished",
    rating: 1500,
    title: "Two Types of Pairs",
    tags: ["binary-search", "greedy"],
    data: { statement: "minimize the maximum ... (fixture)", samples: [] },
  },
  "cf:246E": {
    source_url: "https://codeforces.com/problemset/problem/246/E",
    contest_status: "finished",
    rating: 1800,
    title: "Blood Cousins Return",
    tags: ["data-structures", "offline", "bit"],
    data: { statement: "count distinct names ... (fixture)", samples: [] },
  },
  "abc392:F": {
    source_url: "https://atcoder.jp/contests/abc392/tasks/abc392_f",
    contest_status: "finished",
    rating: 1600,
    title: "F - Keep Pieces",
    tags: ["dp"],
    data: { statement: "fixture", samples: [] },
  },
  "lc:300": {
    source_url: "https://leetcode.com/problems/longest-increasing-subsequence",
    contest_status: undefined,
    rating: 1400,
    title: "Longest Increasing Subsequence",
    tags: ["dp"],
    data: { statement: "fixture", samples: [] },
  },
};

function findFixture(ref: string, editorial = false): Fixture | undefined {
  if (ref.startsWith("cf:")) {
    const match = Object.entries(FIXTURES).find(([k]) => k === ref || (ref === "cf:2065C" && k === "cf:2065C"));
    if (match && (match[1] as Fixture).source_url) {
      const f = match[1] as Fixture;
      if (editorial) {
        return f.source_url ? { ...f, data: { editorial: "official editorial (fixture)" } } : undefined;
      }
      return f;
    }
    return undefined;
  }
  const f = FIXTURES[ref];
  if (!f) return undefined;
  if (editorial && !f.source_url) return undefined;
  return f;
}

export function problemStatusFile(omac: string): string {
  return join(omac, "learner", "state", "problem-status.jsonl");
}

export function setProblemStatus(cwd: string, record: Omit<ProblemStatusRecord, "updated_at">): ProblemStatusRecord {
  const ws = requireWorkspace(cwd);
  const all = readJsonl<ProblemStatusRecord>(problemStatusFile(ws.omac));
  const rest = all.filter((r) => r.problem_ref !== record.problem_ref);
  const final: ProblemStatusRecord = { ...record, updated_at: nowIso() };
  writeJsonl(problemStatusFile(ws.omac), [...rest, final]);
  return final;
}

export function problemStatuses(cwd: string): ProblemStatusRecord[] {
  const ws = requireWorkspace(cwd);
  return readJsonl<ProblemStatusRecord>(problemStatusFile(ws.omac));
}
