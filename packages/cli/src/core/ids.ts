import { randomUUID, createHash } from "node:crypto";

export function uuid(): string {
  return randomUUID();
}

export function shortId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function statementHash(statement: string): string {
  return `sha256:${sha256(statement).slice(0, 32)}`;
}

export class OmacError extends Error {
  readonly code: string;
  readonly exitCode: number;
  constructor(code: string, message: string, exitCode = 1) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}
