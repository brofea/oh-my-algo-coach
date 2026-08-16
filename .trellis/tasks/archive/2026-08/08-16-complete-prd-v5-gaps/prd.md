# complete PRD V5 implementation gaps

## Goal

根据 `docs/PRD.md` v0.8 的完整产品、Runtime、Skill、Knowledge Model、数据治理和 V0–V5 验收要求，补全当前项目的实现缺失，使项目不仅通过现有 CLI 测试，也能形成 Skill Policy → Runtime Contract → `.omac` State → 可追溯指标的完整闭环。

本任务优先处理上一轮验收确认的契约断点，并补充 Skill 行为级验证；不把已有 50 个 Runtime 测试全绿视为 PRD 全量完成。

## What I already know

* 当前仓库为 TypeScript npm CLI + `skill/omac` + `knowledge/packs` 的单仓库项目。
* `npm run build`、`npm run typecheck` 和 `npm test` 已通过；当前测试为 50/50。
* 现有自动化测试主要验证 CLI / Runtime，缺少 Skill 行为级测试。
* Skill 已具备 Coaching Constitution、Event Protocol、Hint Policy、CLI Protocol 四类核心文档。
* Skill/Knowledge Model 仍缺少完整的 Algorithm Graph、Contest Skill Ontology、Pedagogy Pack、统一 Ontology 关系和可验证的 Pack 加载约定。
* `pack install` 将 Pack 放入 `.omac/knowledge/packs`，但 `targets` 查询读取 `.omac/knowledge/targets`，自定义 Target Pack 安装后不可见。
* Event 创建后 Independence Boundary 为空，当前没有 CLI Boundary 声明 / 快照入口。
* 任意不存在的 Target ID 可以创建 Event；Claim 可以引用不存在或不属于当前 Event 的 Evidence。
* Contest 创建只检查 `--artifact` 参数是否存在，不验证文件内容，也不保存 Artifact 引用到 Event。
* 关闭 Event 后仍可追加普通 Evidence；Diagnose Event 没有强制确认前不更新 Learner State。
* `learner purge` 未完整删除 Artifact 和索引；Import 不保留已归档 Event 的目录和索引语义。
* `migrate` 当前没有迁移表，Schema 漂移后无法正常执行迁移。
* PRD 的 Novel Independent Transfer Rate、分母、不确定性和分层指标尚未形成 Runtime 报告。
* 根目录没有 lint script，`README.md` 仍为占位内容。

## Scope Decisions

* 采用“完整架构 + 代表性内容”的 MVP：本任务必须完成 Pack Schema、Loader、版本/来源/许可证元数据、查询链路和 Skill 行为骨架，并提供每类 Pack 的代表性 Card；不要求一次性补齐全部算法知识库。
* 一次任务内修复本 PRD 列出的阻塞性 Runtime / 数据治理缺口；V5 指标先实现可解释的离线基线，不承诺学习效果或因果结论。
* 保持 PRD D-012：单 Agent 顺序写入，不引入并发锁或多 Agent 合并；后续 Agent 仍按本任务顺序实现。
* 保持 PRD D-013：Learner State 只能通过 Assessment Claim → Reducer 更新，不增加直接 View CRUD。
* 保持 Fixture Connector 的离线基线；真实 Web Connector 不在本任务中实现，但 Skill 必须明确 consent、redact、audit 和“未实现外发”的边界。
* 新增字段应优先向后兼容：旧 Event / Evidence / Claim 能被读取；不能读取时必须给出可操作的 migration 错误，不得静默丢数据。

## Resolved Questions

* Knowledge Pack 采用“架构先行、代表性 Card 验证”的范围。实现 Agent 不应因知识量大而扩大任务，也不应只增加静态文档而跳过 Loader、查询、版本审计和行为测试。
* Boundary 采用 Event 级不可变快照：Event 可有当前 Boundary，Evidence / Claim 记录引用快照 ID；Boundary 变更产生新快照，不原地改写历史。
* 普通 Event 在关闭后只读；如需修正，必须走带 operation ID 的 correction / reevaluation 路径，并留下新 Evidence / Claim 关联，不直接改写旧记录。
* Diagnose 的确认门禁由 Runtime 强制：未提供有效的 `student_confirmation=confirmed` 时，提交的诊断结论不得进入 Learner State Reducer。
* Novel Independent Transfer Rate 只对声明了 Boundary、Target、novelty、independent outcome 和时间窗的记录计入；样本不足时输出 `insufficient_evidence`，不得输出伪精确百分比。

## Requirements (evolving)

### A. Skill 与 Knowledge Model

* 明确 Skill Package 的目录和加载约定，覆盖 Coaching Constitution、Event Protocol、Hint Policy、CLI Protocol、教学策略、Knowledge Pack 使用、Web / 外部内容安全和六种 Event 行为。
* 建立可版本化的 Knowledge Pack 最小 Schema：algorithm、pattern、misconception、pedagogy、target，并支持来源、版本、许可证和稳定 ID。
* 修复 Pack 安装与 Target / Pattern / Misconception 查询之间的加载链路。
* 为 Skill 增加覆盖 PRD V2–V5 的行为规则：复习、推荐、Contest 复盘、Rating、Coach Self-Evaluation、指标解释和低样本不确定性。
* 增加 Skill 行为级测试或 Conformance Fixture，验证最小帮助、Assisted/Independent、Contest 门槛、Diagnose 确认、Upsolve Transfer 和不可信外部内容边界。

### B. Target、Boundary 与 Event Contract

* Event 创建时校验 Target Contract；允许 Explore 的空 Target 和 Practice 的显式 provisional candidate，但不得静默接受未知 Target。
* 提供 Independence Boundary 声明、快照、变更和 Evidence / Claim 引用能力。
* 对 Independent、Transferred、Retained 结果验证必要 Boundary 信息。
* 限制关闭后的 Evidence 写入：只允许符合纠正 / 重评估流程的追加记录，禁止普通事实被追加到已关闭 Event。
* 对 Diagnose 的确认前 No-op 行为提供 Runtime 门禁或明确的 Claim 状态约束。

### C. Evidence、Claim、Replay 与数据治理

* Claim 提交时校验 Evidence 存在、属于当前 Workspace / Learner / Event，并维护完整追溯链。
* 保证 `rebuild` 对非法 Claim Set 显式报错、选择策略确定性和 View 维度不丢失。
* 补齐 Schema Migration 的可执行路径和回归测试。
* 修复 Export / Import 对 archived Event、Event Index、Artifact、Pack / State 数据的保真性。
* 修复 `learner purge` 对 Profile、Event、Evidence、Claim、View、Report、Artifact、State 和索引的完整删除，并执行 Integrity Check。
* 设计外部传输同意与审计记录的最小本地协议；若本任务不实现真实外发，至少保证 Connector / Skill 不声称已具备外发能力。

### D. V5 自适应能力与指标

* 对 Rating、Calibration、Retention Model、Coach Eval、Policy、Gain Matrix、Plan 和 Visualization 明确启发式基线、置信度、样本不足状态和可追溯来源。
* 实现 Novel Independent Transfer Rate 的最小可解释报告：分母、分子、Target、Boundary、难度 / 新颖度、时间窗和 insufficient_evidence。
* 修正 Pack Version Audit，使 `.versions.jsonl` 记录 `from` / `to` 并可重放。

### E. 交付与质量

* 增加 lint 或明确可执行的静态质量检查命令。
* 补充 README 的安装、初始化、Skill 使用、CLI 闭环和测试说明。
* 所有新增行为必须有单元 / 集成 / Conformance 测试，并保持现有测试全部通过。

## Acceptance Criteria (evolving)

### Skill

* [ ] Skill Package 的核心协议、知识 Pack、加载方式和行为边界与 PRD 第 3、4、7、9、11 节一致。
* [ ] 自定义 Target / Pattern / Misconception / Pedagogy Pack 安装后可被 Runtime / Skill 查询并保留版本、来源和许可证。
* [ ] Skill Conformance Fixture 能验证六种 Event、Hint Ladder、Assisted/Independent、Transfer、Diagnose、Contest 和外部内容安全行为。

### Runtime / Data

* [ ] Event Target 与 Independence Boundary 可创建、快照、引用和追溯。
* [ ] 非法 Target、非法 Evidence 引用、跨 Event Claim 和关闭后普通 Evidence 会被拒绝。
* [ ] Contest Artifact 创建门槛验证内容并保存引用；Import / Export 保留 archived Event 和 index。
* [ ] Purge 删除 Learner 所属全部动态数据和 Artifact，并通过 Integrity Check。
* [ ] Schema Migration 可从至少一个旧 Schema Fixture 升级到当前版本。
* [ ] Rebuild / Reevaluate / Correction 保持历史不可变且可重复。

### V5 / Metrics

* [ ] Rating、Calibration、Retention、Coach Eval、Gain Matrix、Plan 和 Pack Update 输出来源、样本和 insufficient 状态。
* [ ] Novel Independent Transfer Rate 报告具备明确分母、Boundary、Target、时间窗和不确定性说明。

### Delivery

* [ ] `npm run build`、`npm run typecheck`、`npm test` 和 lint / 静态检查全部通过。
* [ ] README 能让新用户完成安装、初始化、一次完整训练闭环和测试。
* [ ] 不修改 PRD Locked 决策 D-001–D-014，不引入多 Agent 并发写入或 Learner View 直接 CRUD。

## Definition of Done (team quality bar)

* Tests added/updated for each fixed contract and regression.
* Build, typecheck, lint/static check and full test suite green.
* Skill docs, Pack schemas, README and CLI help stay synchronized.
* Migration, import/export, purge and rollback behavior are tested with temporary workspaces.
* Final PRD acceptance matrix records implemented, partial and explicitly out-of-scope items.

## Out of Scope (explicit)

* 不实现多 Agent 并发写入、文件锁或冲突合并。
* 不将 OMAC 改造成 Online Judge 或实时 Contest 反作弊系统。
* 不在没有外部授权和明确需求时接入真实 Web API；Fixture Connector 仍作为离线基线。
* 不承诺真实学习效果、Rating 提升或 Intervention 的因果效果；只实现可解释的观察性指标。
* 不把所有算法知识一次性扩展成 Wikipedia；优先完成可加载、可版本化、可扩展的 Pack 机制和代表性 Card。

## Technical Notes

* Product contract: [`docs/PRD.md`](../../../docs/PRD.md), especially §§3–11, 13–17.
* Core CLI spec: [`.trellis/spec/cli/core/omac-cli-core-spec.md`](../../../.trellis/spec/cli/core/omac-cli-core-spec.md).
* Skill entry: [`skill/omac/SKILL.md`](../../../skill/omac/SKILL.md).
* Skill references: `skill/omac/references/{coaching-constitution,event-protocol,hint-policy,cli-protocol}.md`.
* Runtime entry: `packages/cli/src/index.ts`; Event / Evidence / Claim / View stores under `packages/cli/src/{store,services,protocol}`.
* Existing conformance tests: `packages/cli/test/{conformance,coaching,memory,ecosystem,contest,adaptive}.test.ts`.
* Current quality baseline: build and typecheck pass; 50 tests pass; lint script missing.

## Implementation Plan

实现 Agent 按以下顺序执行；每阶段完成后运行该阶段测试，避免在所有层同时修改导致追溯困难。

### Phase 0 — Baseline and contracts

1. 阅读本 PRD、`info.md`、`research/implementation-audit.md` 及 Implement/Check 上下文中的 spec。
2. 固化当前 50/50 测试、build、typecheck 基线；为每个缺口先补失败回归测试或 fixture。
3. 保留 D-001–D-014，并将新增 CLI 参数、JSON schema 和错误码写入 CLI 帮助 / 文档。

### Phase 1 — Knowledge Pack and Skill foundation

1. 统一 `algorithm`、`pattern`、`misconception`、`pedagogy`、`target` 五类 Pack 的 manifest / card schema，包含稳定 ID、版本、来源、许可证、内容文件和 schema 版本。
2. 将 Pack 安装位置与查询位置统一为同一 canonical loader；兼容现有 builtin 与已安装 `.omac/knowledge/packs/<pack_id>` 数据。
3. Target、Pattern、Misconception、Pedagogy 查询必须返回来源和版本，并对未知 ID 返回可诊断错误。
4. 扩展 `skill/omac` 文档和 references，覆盖 V2–V5 行为规则；新增代表性 Pack Card 和 Skill Conformance Fixture。Fixture 可离线运行，不得伪造真实 Web 能力。

### Phase 2 — Target, Boundary and Event gates

1. Event 创建校验 Target；Practice 可声明 provisional / unresolved，但必须显式标记，未知 Target 不得静默接受。
2. 增加 Boundary set/list 或等价 CLI，写入 Event 级快照；Independent、Transferred、Retained 结果缺少 Boundary 时拒绝或标记 insufficient。
3. Contest artifact 必须验证文件存在、可读、非空且生成稳定引用；Event 保存 artifact reference。
4. 关闭 Event 的普通 Evidence 写入必须拒绝；correction / reevaluation 要求 operation ID、原因和关联记录。
5. Diagnose 在确认前保持 No-op；确认后才允许 Reducer 改变 Learner State，并保留前后状态证据。

### Phase 3 — Evidence, replay and data governance

1. Claim 提交前验证 Evidence 存在、属于当前 Workspace / Learner / Event，且事件类型和 Claim 类型匹配。
2. 保证 rebuild、reevaluate、correction 的确定性、历史不可变和 View 维度完整；非法 Claim Set 显式报错。
3. 实现旧 Schema fixture → 当前 Schema 的 migration table；`migrate` 必须能在旧配置下启动，迁移失败要保留原数据并报告原因。
4. Export / Import 保持 archived Event 的目录、Event Index、Artifact、Pack / State 语义；禁止导入时静默覆盖。
5. Purge 覆盖 Profile、Event、Evidence、Claim、View、Report、Artifact、State、索引和 retention 数据；完成后运行 Integrity Check。

### Phase 4 — V5 adaptive and metrics

1. 为 Rating、Calibration、Retention、Coach Eval、Policy、Gain Matrix、Plan、Visualization 和 Pack Update 补齐 `source`、样本量、置信度 / heuristic、时间窗和 insufficient 状态。
2. 实现 Novel Independent Transfer Rate 的最小报告：明确 cohort、分母、分子、Target、Boundary、novelty、独立性判定、时间窗及低样本解释。
3. 修复 `.versions.jsonl` 的 `from` / `to` 审计并补重放测试。

### Phase 5 — Quality and handoff

1. 增加 lint 或等价静态检查脚本，补齐 README 的安装、初始化、Skill、闭环和测试说明。
2. 运行全量 build、typecheck、lint、test，以及临时 workspace 下的 migration / import-export / purge / rebuild 测试。
3. 更新最终验收矩阵：每条 PRD 要求标注 `implemented`、`partial` 或 `out_of_scope`，并给出测试或文档证据。

## File-level Change Map

以下是建议落点，不是要求机械修改每个文件；实现 Agent 应复用现有 store / protocol / service，不新增平行数据通道。

* CLI contract：`packages/cli/src/index.ts`、`packages/cli/src/commands/commands.ts`、`packages/cli/src/core/{types,schema}.ts`、`packages/cli/src/protocol/{target,coaching}.ts`。
* Persistence and replay：`packages/cli/src/store/{workspace,event_store,evidence_store,claim_store,view_store,knowledge_store,subflow_store}.ts`、`packages/cli/src/services/{migrate,export_import,doctor,retention}.ts`。
* Runtime behavior：`packages/cli/src/services/{contest,adaptive,coaching_views,recommend}.ts` 及其现有测试。
* Skill / Knowledge：`skill/omac/SKILL.md`、`skill/omac/references/`、`knowledge/packs/`；如需新增 loader，应放在现有 Knowledge / target 模块的 canonical 路径。
* Tests and delivery：`packages/cli/test/{conformance,coaching,memory,ecosystem,contest,adaptive}.test.ts`、新增 Skill conformance fixture、根目录 `package.json` 和 `README.md`。

## Implementation Guardrails

* 不允许通过 View 直接写 Learner State；所有状态变化仍必须经过 Claim → Reducer。
* 不允许为了让旧测试通过而放宽未知 Target、跨 Event Evidence、关闭 Event 写入或 Diagnose 确认门禁。
* 不允许把 Pack 安装成功等同于 Pack 可查询；必须从 install 到 list / get / runtime consumption 做端到端测试。
* 不允许把“有结果”当成“有独立迁移证据”；Transfer 指标缺 Boundary、novelty 或独立性证据时必须降级为 insufficient。
* 不允许静默覆盖 Import 数据、静默丢失 archived/index/artifact、或用 destructive migration 覆盖原始 workspace。
* 新增错误应沿用现有 CLI 错误输出和 exit code 风格；先查 `core/schema.ts` 与既有 command helper，避免重复校验器。

## Agent Handoff Instructions

接手 Agent 应先运行 `task.py current`、读取本任务 `prd.md` / `info.md` / `research/implementation-audit.md`，再读取 Implement 上下文注入的 spec。按 Phase 0–5 顺序实现；每个 Phase 完成后更新测试和任务进度。若发现 PRD 与现有锁定决策冲突，应暂停并报告具体冲突，不自行修改 D-001–D-014。完成实现后运行 Trellis Check，并输出“已实现 / 部分实现 / 明确 out of scope”的验收矩阵；不要仅以旧测试全绿作为完成证明。
