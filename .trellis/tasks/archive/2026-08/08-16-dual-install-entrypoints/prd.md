# design: dual install entrypoints for skill and cli

## Goal

Support two equivalent onboarding paths for OMAC: installing the Agent Skill should be able to inspect the environment, acquire the CLI, initialize the current repository, and keep the local Skill current; running `omac init` should be able to initialize the repository and install or update the local Skill. All distributable artifacts should live in the GitHub repository package layout, while active Skills should be installed only under the user's local `.agents/skill` directory.

## What I already know

* The repository contains a TypeScript CLI under `packages/cli` and an Agent Skill under `skill/omac`.
* The current CLI initializes a project-local `.omac` Workspace and has a warning/privacy boundary.
* The current Skill instructs the Agent to use the local `omac` command and does not yet define a self-install/bootstrap protocol.
* The current npm package is `@omac/cli`; its published package surface currently contains only `dist` and `package.json`.
* Builtin Knowledge Packs are stored at the repository root under `knowledge/packs` and are resolved relative to the source tree or an override environment variable.
* The project requires Node.js >= 22 and supports offline fixture connectors only.

## Assumptions

* GitHub is the canonical source for Skill and CLI release artifacts.
* The only supported Skill installation target is the current business repository's `<repo>/.agents/skill/` directory. Never install to `~/.agents/skill`, Codex/Claude global Skill directories, or any other global location.
* Both entrypoints should be idempotent and safe to retry.
* A Skill update and a CLI update must be version-aware and must not silently downgrade the other side.

## Resolved Decisions

* CLI acquisition uses a GitHub Release `.tgz` and SHA256 manifest. npm publication is not required for the project-local installation flow.
* `omac init` writes the project-local `.omac` workspace and synchronizes the matching Skill to `.agents/skill/omac`; it does not write global Agent configuration or a separate pointer file.
* GitHub Release is the source of CLI assets; the release package embeds the matching Skill and builtin Knowledge Packs; version compatibility is enforced by the release manifest and embedded Skill manifest.

## Requirements (evolving)

* Entry A: Once the Skill already exists, its protocol performs environment inspection, downloads/acquires the CLI, runs `omac init`, and updates the local Skill. The first-ever Skill acquisition remains deferred.
* Entry B: CLI-only `omac init` initializes the current repository and installs/updates the local Skill.
* Skill payload is sourced from the GitHub repository package and installed under the current repository's `.agents/skill/` only.
* Both entrypoints use the same repository-local target: `<repo>/.agents/skill/omac/`.
* Initialization is idempotent, operation-aware, and does not create global learner state.
* Offline or partial failure must leave a recoverable state and report the failed step.
* Existing `.omac` data and unrelated user files must not be overwritten silently.

## Chosen Implementation

* GitHub Release publishes a self-contained CLI `.tgz` plus a release manifest with SHA256.
* GitHub Release tags use `v<major>.<minor>` (for example `v0.1`); the manifest keeps the canonical package version such as `0.1.0`.
* `install/cli-bootstrap.mjs` downloads and verifies the asset, then runs `npm install --prefix` into the current repository's `.agents/cli/`.
* The installed CLI package embeds the matching OMAC Skill and builtin Knowledge Packs; `omac init` copies only the Skill to `.agents/skill/omac/` and initializes `.omac`.
* CLI versions are installed under `.agents/cli/versions/`; `current.json` is an atomic pointer and old versions remain available for rollback.
* A pre-existing `.agents/skill/omac` without an OMAC manifest is a conflict unless `--force-skill` is explicit.

## Acceptance Criteria (evolving)

* Deferred: a clean repository can bootstrap from the Skill entrypoint before any Skill exists; this is reserved for a future Skill-market/distribution integration.
* [x] A clean repository can bootstrap from the CLI entrypoint without a preinstalled Skill.
* [x] Repeating the CLI entrypoint does not duplicate or corrupt `.omac` or `.agents/skill` contents.
* [x] Skill and CLI version compatibility is reported deterministically.
* [x] The Skill is installed only at the specified local path and is loaded by the supported Agent host.
* [x] GitHub release/package layout contains all runtime assets, including builtin Knowledge Packs where required.
* [x] Environment checks, download failures, permission failures, and interrupted updates have structured, actionable errors.
* [x] Existing CLI test, lint, typecheck, and packaging checks remain green.

## Definition of Done (team quality bar)

* Tests cover the repository-local CLI bootstrap, CLI init/Skill synchronization, idempotency, conflict handling, checksum verification, and clean-package smoke behavior.
* Lint, typecheck, full tests, and clean-package smoke tests pass.
* README and Skill protocol document both paths and their security boundaries.
* Release and rollback behavior is documented.

## Out of Scope (explicit)

* Multi-agent concurrent writes to `.omac`.
* Automatic writes to a user's global shell, global npm configuration, or unrelated projects.
* Real external web transfer or platform authentication.
* First-ever Skill acquisition from a Skill marketplace or host-specific installer.

## Technical Notes

* Relevant files: `skill/omac/SKILL.md`, `skill/omac/references/cli-protocol.md`, `packages/cli/src/commands/commands.ts`, `packages/cli/src/services/memory.ts`, `packages/cli/package.json`, `README.md`.
* Existing project contract: `.omac` is project-local; Skills are policy/declarative artifacts; CLI is the runtime interface.
