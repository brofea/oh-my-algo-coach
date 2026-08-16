# Repository Implementation Audit

> 本文件是本仓库现状的本地审计记录，不是外部资料。结论来自上一轮验收、源码阅读、现有测试和临时 workspace 探针；实现 Agent 修改后应重新运行对应探针和回归测试。

## Baseline

* `npm run build`：通过。
* `npm run typecheck`：通过。
* `npm test`：现有测试 50/50 通过。
* 根目录没有 lint script；`README.md` 仍是占位内容。
* 当前测试偏 CLI / Runtime，Skill 文档的行为规则没有形成同等强度的 conformance test。

## Verified Gaps

### Skill and Knowledge

* `skill/omac/SKILL.md` 及 references 已覆盖 Constitution、Event Protocol、Hint Policy、CLI Protocol，但 V2–V5 的复习、推荐、Transfer、Coach Eval、低样本指标和外部内容边界尚未以行为 fixture 闭环。
* `knowledge/packs` 当前只有少量 pattern / misconception 内容；Algorithm Graph、Contest Skill Ontology、Pedagogy Pack 和统一 Ontology 关系不完整。
* `packages/cli/src/memory.ts` 的安装路径为 `.omac/knowledge/packs/<pack_id>`，而 `packages/cli/src/target.ts` 的自定义 Target 查询读取 `.omac/knowledge/targets/*.json`。已复现“pack install 成功但 custom target list 不可见”。
* 因此当前“文件已复制”不能作为“Pack 可被 Runtime / Skill 消费”的完成证明。

### Target, Event and Boundary

* `cmdEventCreate` 当前对目标 ID 缺少统一 resolve / validate；已复现不存在的 Target 可以创建 Event。
* Event 创建后没有可用的 Independence Boundary 声明 / 快照 CLI；Transfer / Retention 无法从 Runtime 追溯 Boundary。
* `cmdEvidenceAppend` 允许在已关闭 Event 上追加普通 Evidence；缺少 correction / reevaluation operation 语义。
* Contest 创建只检查 `--artifact` 参数是否 truthy；空对象也能通过，且 Event 没有稳定 Artifact reference。

### Evidence, Claim and Replay

* Claim 提交校验 Claim 形状和 phase，但未严格验证 Evidence 存在、属于当前 Event / Learner，已复现不存在或跨 Event 引用可进入路径。
* Diagnose 流程当前缺少 Runtime 强制的 student confirmation gate；确认前 No-op 需要在 reducer 边界补齐。
* `rebuild` / `reevaluate` 的目标是事件溯源，但非法历史数据的显式错误和 View 维度完整性仍需回归测试固定。

### Migration, Import / Export and Purge

* Migration registry 当前为空；将 workspace schema 置为旧版本后，`readWorkspaceConfig` 会在真正选择 migration 前因 schema mismatch 失败。
* `services/export_import.ts` 的导入逻辑总是把 Event 写到 working event 目录，未完整恢复 archived 路径和 Event Index；也需要明确冲突策略。
* `cmdLearnerPurge` 已覆盖部分 event/evidence/claim/view/report/index，但遗漏 artifact index / artifact 文件以及 retention、learn/problem、subflow 等动态数据；已复现 purge 后 artifact 残留。

### V5 Metrics and Audit

* `services/coaching_views.ts` 的 transfer probe 仅计数结果，尚未形成具备分母、Boundary、novelty、时间窗和不确定性状态的 Novel Independent Transfer Rate 报告。
* `services/adaptive.ts` 的 Pack version audit 记录当前版本和 available，缺少可重放的 `from` / `to`。
* 现有 Rating、Calibration、Retention、Coach Eval 等实现需要统一补充 source、sample size、heuristic / observed 和 insufficient 状态，避免“无数据 = 0”。

## Relevant Code Areas

* CLI entry and commands：`packages/cli/src/index.ts`、`packages/cli/src/commands/commands.ts`
* Shared contracts：`packages/cli/src/core/types.ts`、`packages/cli/src/core/schema.ts`
* Target / protocol：`packages/cli/src/target.ts`、`packages/cli/src/protocol/`
* Store：`packages/cli/src/store/`
* Services：`packages/cli/src/services/{adaptive,coaching_views,contest,export_import,migrate,retention}.ts`
* Skill：`skill/omac/SKILL.md`、`skill/omac/references/`
* Product contract：`docs/PRD.md` §§3–11、13–17
* Project specs：`.trellis/spec/cli/core/omac-cli-core-spec.md`、`.trellis/spec/guides/`

## Reproduction Expectations

后续 Agent 不要求保留临时探针，但修复必须有等价自动化回归：

1. 安装自定义 Target Pack 后，list/get 和 Event target validation 可见。
2. 创建非法 Target、跨 Event Claim、关闭 Event 普通 Evidence、空 Contest Artifact 均失败。
3. Diagnose 未确认前 Learner State 不变。
4. 旧 Schema 可迁移；导出再导入 archived Event 后目录、index、artifact 和 replay 结果保真。
5. purge 后 artifact / index / learner 动态数据无残留。
6. Transfer metric 对缺 Boundary / novelty / 独立性材料给出 insufficient，而不是 0 或成功。
