#!/usr/bin/env node
import { parseArgs, outputError, outputJson, Command, flag } from "./core/cli.js";
import {
  cmdInit,
  cmdLearnerClaimSubmit,
  cmdLearnerViewGet,
  cmdLearnerPurge,
  cmdEvidenceAppend,
  cmdEventCreate,
  cmdEventAppend,
  cmdEventClose,
  cmdEventList,
  cmdRebuild,
  cmdReevaluate,
  cmdExplain,
  cmdReport,
  cmdDoctor,
  cmdIntegrity,
  cmdMigrate,
  cmdExport,
  cmdImport,
  cmdTargets,
  cmdProblemAdd,
  cmdProblemList,
  cmdArtifactAdd,
  cmdArtifactList,
  cmdTransferProbeAdd,
  cmdSubflow,
  cmdSubflowList,
  cmdViewAlgorithm,
  cmdViewProblemSolving,
  cmdViewMisconception,
  cmdTransferSummary,
  cmdPackInstall,
  cmdPackList,
  cmdPackPrereq,
  cmdLearnPath,
  cmdLearnPathList,
  cmdRetentionList,
  cmdRetentionSchedule,
  cmdRetentionRecall,
  cmdRetentionGaps,
  cmdRetentionPairs,
  cmdReviewAdd,
  cmdCurriculum,
  cmdConnectorList,
  cmdConnectorInspect,
  cmdEditorialGet,
  cmdEditorialCacheClear,
  cmdProblemStatus,
  cmdProblemStatusList,
  cmdRecommend,
  cmdRecommendExplain,
  cmdContestImport,
  cmdContestTimeline,
  cmdContestAnalyze,
  cmdContestLinkUpsolve,
  cmdContestFollowups,
  cmdViewContest,
  cmdRating,
  cmdCalibration,
  cmdRetentionModelStatus,
  cmdCoachEval,
  cmdCoachPolicy,
  cmdCoachGainMatrix,
  cmdVisualize,
  cmdPlan,
  cmdPackUpdate,
  cmdPackVersions,
} from "./commands/commands.js";
import { OmacError } from "./core/ids.js";

const HELP = `omac - Oh My Algo Coach runtime CLI

Usage: omac <command> [subcommand] [flags]

Commands:
  init                              initialize .omac workspace (idempotent)
      --learner-id <id>             bind or create learner identity
      --save-conversation           opt-in raw conversation saving
  event create                      create a draft event
      --type <learn|practice|upsolve|contest|diagnose|explore>
      --target-ids <a,b>            target contract ids
      --intent <text>               intent for explore events
      --mode <practice|learn|upsolve|direct-explanation>
      --problem-ref <ref>           local problem manifest ref
      --contest-ref <ref>           contest artifact ref (contest events)
      --artifact <path>             finished contest artifact (contest events; required)
      --confirm-ended               user confirmation activity has ended (contest events; required)
      --platform-profile <ref>      platform profile ref
      --domain-profile <ref>        domain profile ref
  event append                      append a record to an event
      --event-id <id>               event id
      --op <observation|...>        record kind
      --status <active|paused|evaluating>   advance lifecycle
      --operation-id <id>           idempotency key (retry-safe)
      --content <text>
  event close                       validate, close and archive an event
      --event-id <id>
      --operation-id <id>           idempotency key (retry returns original result)
  event list                        list working + archived events
  evidence append                   append an evidence record (observation/intervention/correction/submission)
      --event-id <id>  --type <t>  --actor <learner|coach|runtime|external>
      --content <text>  --quality <high|medium|low>  --operation-id <id>
  learner claim submit              ONLY learner-state write entry; requires evaluating phase
      --event-id <id>  --skill-id <s>  --assessment <a>  --confidence <0..1>
      --target-id <t>  --evidence-ids <a,b>  --operation-id <id>
      --evaluator-version <v>  --student-confirmation <c>  --supersedes <ids>
  learner view get                  read-only materialized view
      --learner-id <id>
  learner purge                     irreversible delete for one learner
      --learner-id <id>  --confirm
  rebuild                           rebuild learner view from claims (deterministic, no LLM)
      --learner-id <id>  --claim-set <ids>  --reducer-version <v>
  reevaluate                        append new claims with a new evaluator (never rewrites history)
      --event-id <id>  --evaluation-run-id <id>  --evaluator-version <v>
  explain-why                       trace view -> claim -> evidence -> event
      --learner-id <id>  --skill-id <s>
  report                            event or learner report
      --scope <event|learner>  --event-id <id>  --format <json|text>
  targets                           list registered target contracts
  doctor                            workspace health + public-repo warning
  integrity                         integrity check
  migrate                           schema migration
  export                            export package (default learner scope)
      --learner-id <id>  --workspace  --out <dir>
  import                            import package (read-only preview with --preview, then --strategy)
      <package-dir>  [--preview]  [--strategy reject|merge|new-learner]
`;

export async function main(argv: string[]): Promise<void> {
  const { command, flags, positional } = parseArgs(argv);
  const cwd = process.cwd();
  const ctx = { cwd, args: { command, flags, positional } };

  if (command.length === 0 || command[0] === "help" || command[0] === "--help") {
    process.stdout.write(HELP + "\n");
    return;
  }

  let result: unknown;
  switch (command[0]) {
    case "init":
      result = cmdInit(ctx);
      break;
    case "event":
      result = runSub(command[1], {
        create: cmdEventCreate,
        append: cmdEventAppend,
        close: cmdEventClose,
        list: cmdEventList,
      }, ctx);
      break;
    case "evidence":
      result = runSub(command[1], { append: cmdEvidenceAppend }, ctx);
      break;
    case "learner":
      if (command[1] === "claim" && command[2] === "submit") {
        result = cmdLearnerClaimSubmit(ctx);
      } else if (command[1] === "view" && command[2] === "get") {
        result = cmdLearnerViewGet(ctx);
      } else if (command[1] === "purge") {
        result = cmdLearnerPurge(ctx);
      } else {
        throw new OmacError("unknown_command", `unknown learner subcommand; expected 'claim submit', 'view get' or 'purge'`);
      }
      break;
    case "rebuild":
      result = cmdRebuild(ctx);
      break;
    case "reevaluate":
      result = cmdReevaluate(ctx);
      break;
    case "explain-why":
    case "explain":
      result = cmdExplain(ctx);
      break;
    case "report":
      result = cmdReport(ctx);
      break;
    case "targets":
      result = cmdTargets(ctx);
      break;
    case "problem":
      if (command[1] === "add") {
        result = cmdProblemAdd(ctx);
      } else if (command[1] === "list") {
        result = cmdProblemList(ctx);
      } else if (command[1] === "status") {
        result = command[2] === "list" ? cmdProblemStatusList(ctx) : cmdProblemStatus(ctx);
      } else {
        throw new OmacError("unknown_command", "expected 'problem add|list|status'");
      }
      break;
    case "artifact":
      result = runSub(command[1], { add: cmdArtifactAdd, list: cmdArtifactList }, ctx);
      break;
    case "transfer-probe":
      result = runSub(command[1], { add: cmdTransferProbeAdd, summary: cmdTransferSummary }, ctx);
      break;
    case "subflow":
      result = runSub(command[1], { add: cmdSubflow, list: cmdSubflowList }, ctx);
      break;
    case "view":
      result = runSub(command[1], {
        algorithm: cmdViewAlgorithm,
        "problem-solving": cmdViewProblemSolving,
        misconception: cmdViewMisconception,
        contest: cmdViewContest,
      }, ctx);
      break;
    case "pack":
      if (command[1] === "update") {
        result = cmdPackUpdate(ctx);
      } else if (command[1] === "versions") {
        result = cmdPackVersions(ctx);
      } else {
        result = runSub(command[1], { install: cmdPackInstall, list: cmdPackList, prereq: cmdPackPrereq }, ctx);
      }
      break;
    case "learn":
      if (command[1] === "path" && command[2] === "add") {
        result = cmdLearnPath(ctx);
      } else if (command[1] === "path" && command[2] === "list") {
        result = cmdLearnPathList(ctx);
      } else {
        throw new OmacError("unknown_command", `unknown learn subcommand; expected 'path add' or 'path list'`);
      }
      break;
    case "retention":
      result = runSub(command[1], {
        list: cmdRetentionList,
        schedule: cmdRetentionSchedule,
        recall: cmdRetentionRecall,
        gaps: cmdRetentionGaps,
        pairs: cmdRetentionPairs,
        "model-status": cmdRetentionModelStatus,
      }, ctx);
      break;
    case "review":
      result = runSub(command[1], { add: cmdReviewAdd }, ctx);
      break;
    case "curriculum":
      result = cmdCurriculum(ctx);
      break;
    case "connector":
      result = runSub(command[1], { list: cmdConnectorList, inspect: cmdConnectorInspect }, ctx);
      break;
    case "editorial":
      if (command[1] === "get") {
        result = cmdEditorialGet(ctx);
      } else if (command[1] === "cache" && command[2] === "clear") {
        result = cmdEditorialCacheClear(ctx);
      } else {
        throw new OmacError("unknown_command", "expected 'editorial get <ref>' or 'editorial cache clear <connector>'");
      }
      break;
    case "recommend":
      if (ctx.args.flags.has("explain")) {
        result = cmdRecommendExplain(ctx);
      } else {
        result = cmdRecommend(ctx);
      }
      break;
    case "contest":
      result = runSub(command[1], {
        import: cmdContestImport,
        timeline: cmdContestTimeline,
        analyze: cmdContestAnalyze,
        "link-upsolve": cmdContestLinkUpsolve,
        followups: cmdContestFollowups,
      }, ctx);
      break;
    case "rating":
      result = cmdRating(ctx);
      break;
    case "calibration":
      result = cmdCalibration(ctx);
      break;
    case "coach":
      result = runSub(command[1], { eval: cmdCoachEval, policy: cmdCoachPolicy, "gain-matrix": cmdCoachGainMatrix }, ctx);
      break;
    case "visualize":
      result = cmdVisualize(ctx);
      break;
    case "plan":
      result = cmdPlan(ctx);
      break;
    case "doctor":
      result = cmdDoctor(ctx);
      break;
    case "integrity":
      result = cmdIntegrity(ctx);
      break;
    case "migrate":
      result = cmdMigrate(ctx);
      break;
    case "export":
      result = cmdExport(ctx);
      break;
    case "import":
      result = cmdImport(ctx);
      break;
    default:
      throw new OmacError("unknown_command", `unknown command '${command[0]}'; run 'omac help'`);
  }
  outputJson(result);
}

function runSub(sub: string | undefined, table: Record<string, Command>, ctx: { cwd: string; args: { command: string[]; flags: Map<string, string | boolean>; positional: string[] } }): unknown {
  const fn = table[sub ?? ""];
  if (!fn) {
    throw new OmacError("unknown_command", `unknown subcommand '${sub ?? ""}'`);
  }
  return fn(ctx);
}

const isMain = process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts");
if (isMain) {
  main(process.argv.slice(2)).catch(outputError);
}
