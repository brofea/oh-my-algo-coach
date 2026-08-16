# fix PRD acceptance blockers

## Goal

上一轮任务 `08-16-complete-prd-v5-gaps`（已归档）完成了 Pack Loader、Boundary/Event 门禁、迁移/导入导出/Purge、V5 指标基线，自动化检查全绿（build/typecheck/lint/79 测试），但 PRD 全量验收结论为 **PARTIAL / NEEDS FIXES**。

本任务按验收报告逐条修复阻断性问题与其余缺口；工作树中上一轮未提交的改动是本轮的基础，继续在其上修改。

## Acceptance Review（上一轮验收结论，权威依据）

自动化检查：`npm run build` / `npm run typecheck` / `npm run lint` / `npm test`（79/79）/ `git diff --check` 全部通过。

### 阻断性问题（必须修复）

1. **归档事件的 Boundary 无法查询**：`event boundary list` 只读取工作目录（`event_store.ts` getBoundaries / `commands.ts` cmdEventBoundaryList），关闭/归档后返回空列表。事件级日志、Transfer Probes、Reports 同样存在归档后不可读的问题。
2. **Purge 未清理全部学习者数据**：未删除 `learner/profile`、`learner/state/problem-status.jsonl`、事件级报告（`report/event-*.md`、contest-analysis 中该学习者事件）、Contest import 产生的 artifact 文件（`.omac/artifact/contest/<id>.json`）、以及其它 learner-scoped 状态文件。手工验收确认 Purge 返回 `integrity.ok=true` 但 `problem-status.jsonl` 仍存在 —— `integrityCheck` 覆盖不足。
3. **Claim 未校验 target 是否属于事件**：可在 `--target-ids algo.dp` 的事件中提交 `--target-id algo.unknown` 的 Claim 并成功。需校验 claim.target_id（若提供）∈ event.target_ids；Evidence 与 Transfer Probe 的 target 一致性同样需要校验。
4. **V5 结果元数据不完整**：Rating/Calibration/Gain Matrix 已有 `status/sample_size/source`，但以下结果缺少统一元数据：Retention（model-status/schedule/list）、Coach Eval / Coach Policy、Long-term Plan、Pack Update / Version Audit。需要统一的 `status / sample_size / source / uncertainty`（或 `insufficient_evidence` 说明），无数据 = insufficient 而非 0 或 error。

### Skill 专项（部分完成）

- 仓库内置 Pack 不会自动加载到新 Workspace：干净环境下 `pack list`、`pattern list`、`algorithm list` 为空。需要 builtin registry（`knowledge/packs/`）自动并入 canonical loader。
- Skill 要求写操作具备 `operation_id`，但 Boundary / Artifact / Transfer Probe 等写入路径未统一强制（`event boundary set` 的 operation-id 幂等、`artifact add` 的 operation-id、`transfer-probe add` 的 operation-id）。
- 真实 consent / redaction / outbound audit 不在本轮范围（保持离线 fixture），但需在 Skill 文档与输出中明确"未实现外发"边界（已有部分）。
- Knowledge Graph / Contest Skill Ontology 为最小骨架：可提供关系遍历的最小实现（prereqGraph 已有；可扩展 algorithm→target→pattern 关系查询）或明确标记 out_of_scope 并提供骨架文档。
- Skill Conformance 测试补充：全部六类事件的教学契约断言、Diagnose 的替代诊断证据链、完整 Coach 自评流程。

### 其他重要缺口

- **Migration 非完整事务**：事件文件 stamp + index backfill 失败时不能保证全部回滚。需要事务性（备份→apply→校验→回滚）或明确记录哪些步骤不原子。
- **Export 对归档事件日志读取不完整 / Learner 过滤边界**：export 已含 event-extra；需核对 archived 事件 log 完整性、artifacts 的 learner 过滤（当前按 event 归属，已覆盖）以及 views/retention/learn-paths 的 learner 过滤一致性。
- **Merge Import 可能重复写入归档索引**：`writeEventRecord` 对 archived 事件无条件 append 索引；merge 时若事件已存在会重复 append。需在写入索引前检查。
- **README 中 `omac target get` 不存在**：删除或改为 `omac targets` / 新增 `target get` 命令（建议删掉 README 错误用法；如需单查 target 可新增 `target get <id>`）。
- **CLI help 未覆盖 V1–V5 命令**：补充 `problem/artifact/subflow/transfer-probe/review/retention/curriculum/connector/editorial/recommend/contest/coach/visualize/plan/view/rating/calibration/pattern/misconception/pedagogy/algorithm` 等。
- **Contest 创建只校验非空**：复用 `contest import` 的 artifact schema 校验（problems 非空、verdict 合法、时间单调）于 `event create --type contest`。
- **`integrityCheck` 覆盖不足**：增加 Boundary（引用快照存在性）、Artifact（索引 vs 文件、event 引用）、索引重复项、Purge 残留（learner-scoped 数据残留）检查。

## Requirements

### R1 归档事件统一读取

- 提供统一的 `loadEventArtifacts(omac, eventId)` 或在 getBoundaries/getTransferProbes/eventLog 中支持归档目录（按 `archive_ref` / status 定位），使 `event boundary list`、transfer probes、event log、report 对归档事件可读。
- 回归测试：关闭事件后 `event boundary list` 返回快照；report 对归档事件输出一致。

### R2 完整 Purge + 强化 Integrity Check

- Purge 删除范围（按实际 inventory 推导）：profile、working/archived event、evidence、claims、views、reports（learner/event 级 + contest-analysis 中该学习者事件）、artifacts（index + 文件 + `artifact/contest/*`）、retention、learn-paths、problem-status、subflows、index。
- Purge 后运行增强版 Integrity Check：新增 boundary/artifact/索引重复/learner 残留检查；`doctor` 输出这些项。
- 回归测试：problem-status、profile、artifact/contest 文件、event 级 report 全部无残留。

### R3 Target 一致性校验

- Claim：`--target-id`（若提供）必须 ∈ event.target_ids（否则 `target_mismatch` 错误）。
- Transfer Probe：`--target-id` 必须 ∈ event.target_ids。
- Evidence：`--target-ids`（若提供）必须 ⊆ event.target_ids（或仅校验声明的 target 可解析）。
- 回归测试：跨事件/未声明 target 的 Claim、Probe、Evidence 被拒。

### R4 V5 统一可解释输出契约

- 为 Retention（`retention model-status/schedule/list/recall`）、Coach Eval / Policy、Long-term Plan、Pack Update / Versions 补 `status / sample_size / source / uncertainty`（结构可与现有 Rating/Calibration 一致）。
- 无数据 → `status: "insufficient_evidence"` + uncertainty 说明，禁止 0 或 error。
- 回归测试：各命令输出含四字段且状态正确。

### R5 内置 Pack 自动加载

- Canonical loader 顺序：builtin registry（`knowledge/packs/`）→ `.omac/knowledge/packs/`；`installedPacks` / `loadPackCards` / `listTargets` 在干净 workspace 下能看到内置 6 个 Pack。
- 注意 builtin 与已安装同名 pack 的优先级与重复安装语义（`pack install` 对 builtin 同 pack_id 的行为需定义：拒绝或允许覆盖，测试固定）。
- 回归测试：干净 workspace 下 `pack list` ≥6、`pattern list` 非空、`algorithm list` 非空、`targets` 含 builtin target 且 `target get`（或 targets）可溯源。

### R6 写操作 operation_id 强制与幂等

- `event boundary set`：要求 `--operation-id`（或自动生成但支持重试幂等——与 Evidence/Claim 一致：显式 operation-id 去重，缺省自动生成）。以现有 Evidence 语义为准：缺省生成 + 同 operation-id 重试返回原结果。
- `artifact add`、`transfer-probe add`、`subflow add`：同上。
- 回归测试：同 operation-id 重试不产生重复记录。

### R7 其余缺口

- Migration：失败时保留原数据（已有）基础上，将 apply 步骤做成可回滚或记录部分完成状态；测试断言 stamp 一半时失败不丢 index 原状。
- Merge Import：归档索引去重（写入前检查 exists）。
- Export：校验归档事件 log 完整导出。
- README：修正 `omac target get` 错误用法（改为 `omac targets` 或新增 `target get` 命令并同步 help）。
- CLI help：补齐 V1–V5 全部命令。
- Contest `event create`：复用 artifact schema 校验。
- Skill 文档：明确 consent/redact/audit 未实现的边界（补充 outbound 未实现说明）；补充六类事件教学契约、Diagnose 替代证据链、Coach 自评的 conformance 断言。

## Out of Scope

- 真实 Web Connector / 外发、consent/redact/audit 的真实实现（保持离线 fixture 边界）。
- 完整 Knowledge Graph / Contest Skill Ontology 本体（最小骨架 + 遍历即可，不做完整图库）。
- 多 Agent 并发、D-001–D-014 修改。

## Definition of Done

- 全部阻断性问题（R1–R6）有测试 + 全绿；`npm run build/typecheck/lint/test` 通过。
- R7 各缺口有明确状态（修复或记录 out_of_scope）。
- 更新验收矩阵（research/acceptance-matrix.md），每项标注 implemented / partial / out_of_scope 与证据。
