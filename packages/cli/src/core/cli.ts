import { OmacError } from "./ids.js";

export interface ParsedArgs {
  command: string[];
  flags: Map<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags.set(a.slice(2), next);
          i++;
        } else {
          flags.set(a.slice(2), true);
        }
      }
    } else if (a.startsWith("-") && a.length > 1) {
      flags.set(a.slice(1), true);
    } else {
      command.push(a);
    }
    i++;
  }
  return { command, flags, positional };
}

export function flag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const v = flags.get(name);
  return typeof v === "string" ? v : undefined;
}

export function flagBool(flags: Map<string, string | boolean>, name: string): boolean {
  const v = flags.get(name);
  return v === true || v === "true" || v === "1" || v === "yes";
}

export function requiredFlag(flags: Map<string, string | boolean>, name: string): string {
  const v = flag(flags, name);
  if (v === undefined) {
    throw new OmacError("missing_flag", `missing required flag --${name}`);
  }
  return v;
}

export function outputJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + "\n");
}

export function outputError(e: unknown): void {
  const err = e instanceof OmacError ? e : new OmacError("internal_error", e instanceof Error ? e.message : String(e));
  process.stderr.write(JSON.stringify({ error: { code: err.code, message: err.message } }) + "\n");
  process.exitCode = err.exitCode;
}

export interface CommandContext {
  cwd: string;
  args: ParsedArgs;
}

export type Command = (ctx: CommandContext) => Promise<unknown> | unknown;
