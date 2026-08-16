import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI = join(import.meta.dirname, "..", "..", "dist", "index.js");
export interface OmacResult {
  ok: boolean;
  stdout: unknown;
  stderr: string;
}

export function omac(cwd: string, args: string[]): OmacResult {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, stdout: JSON.parse(stdout), stderr: "" };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { ok: false, stdout: null, stderr: err.stderr ?? String(e) };
  }
}

export function omacRaw(cwd: string, args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { stdout, status: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", status: err.status ?? 1 };
  }
}

export function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "omac-v0-"));
  return dir;
}

export function makeArtifact(dir: string, name: string, content: string): string {
  const p = join(dir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(p, content, "utf8");
  return p;
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function newEvent(cwd: string, type: string, extra: string[] = []): string {
  const r = omac(cwd, ["event", "create", "--type", type, ...extra]);
  assert.equal(r.ok, true, `event create failed: ${r.stderr}`);
  return (r.stdout as { event_id: string }).event_id;
}

export function appendEvidence(cwd: string, eventId: string, content: string, opId: string, extra: string[] = []): string {
  const r = omac(cwd, ["evidence", "append", "--event-id", eventId, "--content", content, "--operation-id", opId, ...extra]);
  assert.equal(r.ok, true, `evidence append failed: ${r.stderr}`);
  return (r.stdout as { evidence_id: string }).evidence_id;
}
