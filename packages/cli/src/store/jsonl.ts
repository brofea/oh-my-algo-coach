import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OmacError } from "../core/ids.js";

export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n");
  const out: T[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      throw new OmacError("corrupt_jsonl", `corrupt JSONL line in ${file}`);
    }
  }
  return out;
}

export function appendJsonl<T>(file: string, record: T): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
}

export function writeJsonl<T>(file: string, records: T[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""), "utf8");
}

export function readJson<T>(file: string): T {
  if (!existsSync(file)) {
    throw new OmacError("file_not_found", `file not found: ${file}`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeJson<T>(file: string, value: T): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

export function findLastByOperationId<T extends { operation_id?: string }>(records: T[], operationId: string): T | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].operation_id === operationId) return records[i];
  }
  return undefined;
}

export function moveDir(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

export function jsonExists(p: string): boolean {
  return existsSync(p);
}

export function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

export function eventDir(omac: string, eventId: string): string {
  return join(omac, "event", eventId);
}

export function archivedEventDir(omac: string, eventId: string): string {
  return join(omac, "event", "archive", eventId);
}
