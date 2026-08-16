import { test } from "node:test";
import assert from "node:assert/strict";
import { omac, makeWorkspace, cleanup, newEvent } from "./helpers.js";
import { join } from "node:path";

test("V3.1: connector manifests list capabilities", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-conn"]);
    const r = omac(dir, ["connector", "list"]);
    assert.equal(r.ok, true);
    const connectors = (r.stdout as { connectors: { connector_id: string; capabilities: { fetch_editorial: boolean } }[] }).connectors;
    assert.equal(connectors.length, 2);
    const cf = connectors.find((c) => c.connector_id === "codeforces");
    assert.equal(cf?.capabilities.fetch_editorial, true);
    const atc = connectors.find((c) => c.connector_id === "atcoder");
    assert.equal(atc?.capabilities.fetch_editorial, false);
    const inspect = omac(dir, ["connector", "inspect", "codeforces"]);
    assert.equal(inspect.ok, true);
  } finally {
    cleanup(dir);
  }
});

test("V3.2: problem fetch caches provenance metadata; unverified marked", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-cache"]);
    const r = omac(dir, ["editorial", "get", "cf:2065C", "--connector", "codeforces"]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { editorial: { verified: boolean; source_url: string; source_type: string; cache_version: string }; degraded: boolean };
    assert.equal(out.editorial.verified, true);
    assert.equal(out.degraded, false);
    assert.equal(out.editorial.source_type, "official");
    assert.ok(out.editorial.source_url.startsWith("https://codeforces.com"));
    assert.equal(out.editorial.cache_version, "1.0.0");
    const unverified = omac(dir, ["editorial", "get", "cf:99999", "--connector", "codeforces"]);
    const unv = unverified.stdout as { editorial: { verified: boolean }; degraded: boolean };
    assert.equal(unv.editorial.verified, false);
    assert.equal(unv.degraded, true);
    const degraded = omac(dir, ["editorial", "get", "abc392:F", "--connector", "atcoder"]);
    const dg = degraded.stdout as { degraded: boolean; note: string };
    assert.equal(dg.degraded, true);
    assert.match(dg.note, /cannot fetch editorials/);
    const clear = omac(dir, ["editorial", "cache", "clear", "codeforces"]);
    assert.ok((clear.stdout as { removed: number }).removed >= 1);
  } finally {
    cleanup(dir);
  }
});

test("V3.3: problem status records solved/attempted and is traceable", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-st"]);
    const evId = newEvent(dir, "practice", ["--problem-ref", "cf:2065C"]);
    const r = omac(dir, ["problem", "status", "cf:2065C", "--status", "solved", "--independence", "independent", "--event-id", evId]);
    assert.equal(r.ok, true, r.stderr);
    const list = omac(dir, ["problem", "status"]);
    void list;
    const statuses = (omac(dir, ["problem", "status", "list"]).stdout as { statuses: { problem_ref: string; status: string; independence_status: string; event_id: string }[] }).statuses;
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].independence_status, "independent");
    assert.equal(statuses[0].event_id, evId);
  } finally {
    cleanup(dir);
  }
});

test("V3.4: recommendation excludes solved, is deterministic, and explains reasons", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-rec"]);
    const add = omac(dir, ["problem", "add", "cf:2065C", "--platform", "codeforces", "--rating", "1500", "--tags", "binary-search,greedy"]);
    assert.equal(add.ok, true);
    omac(dir, ["problem", "add", "cf:246E", "--platform", "codeforces", "--rating", "1800", "--tags", "data-structures,offline,bit"]);
    omac(dir, ["problem", "add", "abc392:F", "--platform", "atcoder", "--rating", "1600", "--tags", "dp"]);
    omac(dir, ["problem", "status", "cf:2065C", "--status", "solved", "--independence", "independent"]);
    const r1 = omac(dir, ["recommend", "--target", "algo.binary-search-on-answer", "--mode", "exploitation", "--limit", "5", "--platform", "codeforces"]);
    assert.equal(r1.ok, true, r1.stderr);
    const out1 = r1.stdout as { candidates: { problem_ref: string; reason: string; score: number }[] };
    assert.ok(!out1.candidates.some((c) => c.problem_ref === "cf:2065C"), "solved problems must be excluded");
    assert.ok(out1.candidates.length >= 1);
    assert.ok(out1.candidates[0].reason.includes("exploitation"));
    const r2 = omac(dir, ["recommend", "--target", "algo.binary-search-on-answer", "--mode", "exploitation", "--limit", "5", "--platform", "codeforces"]);
    const out2 = r2.stdout as { candidates: { problem_ref: string }[] };
    assert.deepEqual(out2.candidates.map((c) => c.problem_ref), out1.candidates.map((c) => c.problem_ref), "recommendation must be deterministic");
  } finally {
    cleanup(dir);
  }
});

test("V3.5: exploration/exploitation auto split by evidence confidence", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-split"]);
    omac(dir, ["problem", "add", "cf:2065C", "--platform", "codeforces", "--rating", "1500", "--tags", "binary-search,greedy"]);
    omac(dir, ["problem", "add", "cf:246E", "--platform", "codeforces", "--rating", "1800", "--tags", "offline,bit"]);
    const evId = newEvent(dir, "practice", ["--target-ids", "algo.binary-search-on-answer"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "active"]);
    omac(dir, ["event", "append", "--event-id", evId, "--status", "evaluating"]);
    omac(dir, ["learner", "claim", "submit", "--event-id", evId, "--skill-id", "algo.binary-search-on-answer", "--assessment", "assisted", "--confidence", "0.2", "--evidence-ids", ""]);
    omac(dir, ["event", "close", "--event-id", evId]);
    omac(dir, ["rebuild"]);
    const auto = omac(dir, ["recommend", "--target", "algo.binary-search-on-answer", "--mode", "auto"]);
    const cands = (auto.stdout as { candidates: { mode: string }[] }).candidates;
    assert.ok(cands.length > 0);
    assert.ok(cands.every((c) => c.mode === "exploration"), "low confidence must route to exploration");
  } finally {
    cleanup(dir);
  }
});

test("V3.7: doctor includes connector health check", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-doc"]);
    const r = omac(dir, ["doctor"]);
    assert.equal(r.ok, true);
    const out = r.stdout as { connectors: { connector_id: string; healthy: boolean }[] };
    assert.ok(Array.isArray(out.connectors));
    assert.equal(out.connectors.length, 2);
    assert.ok(out.connectors.every((c) => c.healthy === true));
  } finally {
    cleanup(dir);
  }
});

test("V3.8: recommend --explain associates pattern cards", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-explain"]);
    omac(dir, ["problem", "add", "cf:2065C", "--platform", "codeforces", "--rating", "1500", "--tags", "binary-search,greedy"]);
    const r = omac(dir, ["recommend", "--explain", "cf:2065C"]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { explanation: { target_links: unknown[]; pattern_cards: string[]; reason: string } };
    assert.ok(out.explanation.target_links.length >= 1, "should link to binary-search-on-answer target");
    assert.equal(out.explanation.pattern_cards.length, 0, "no pattern packs installed in fresh workspace");
  } finally {
    cleanup(dir);
  }
});

test("V3.9: recommendation pool merges connector-cached problems", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-pool"]);
    omac(dir, ["editorial", "get", "cf:2065C", "--connector", "codeforces"]);
    omac(dir, ["problem", "add", "lc:300", "--platform", "leetcode", "--rating", "1400", "--tags", "dp"]);
    const r = omac(dir, ["recommend", "--target", "algo.dp"]);
    assert.equal(r.ok, true, r.stderr);
    const out = r.stdout as { candidates: { problem_ref: string }[]; degraded: boolean };
    assert.equal(out.degraded, false);
    assert.ok(out.candidates.some((c) => c.problem_ref === "lc:300"));
  } finally {
    cleanup(dir);
  }
});

test("V3.6: degraded recommendation when no local pool", () => {
  const dir = makeWorkspace();
  try {
    omac(dir, ["init", "--learner-id", "ln-deg"]);
    const r = omac(dir, ["recommend", "--target", "algo.dp"]);
    assert.equal(r.ok, true);
    const out = r.stdout as { degraded: boolean; note: string };
    assert.equal(out.degraded, true);
    assert.match(out.note, /no local problem manifest/);
  } finally {
    cleanup(dir);
  }
});
