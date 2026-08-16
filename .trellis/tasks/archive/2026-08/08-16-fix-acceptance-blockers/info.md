# Implementation Info — Fix PRD Acceptance Blockers

## 1. Handoff Summary

本任务基于上一轮（已归档 `08-16-complete-prd-v5-gaps`）的未提交工作树继续。上一轮实现：Pack Loader（canonical manifest + 5 类 Card 查询）、Event Target 校验、Boundary 快照、关闭门禁、Diagnose 确认门禁、迁移 0.9.0→1.0.0、Import/Export 保真、Purge 扩展、V5 指标基线、lint + README。验收结论 PARTIAL，本任务修复验收报告列出的 4 个阻断项 + Skill 专项 + 其余缺口。

## 2. 关键现状（上一轮已实现，勿重复）

- `services/memory.ts`：`normalizeManifest` / `validatePackManifest` / `loadPackCards` / `list{Pattern,Misconception,Pedagogy,Algorithm}Cards` / `get*Card`（未知 ID 带诊断）。只读 `.omac/knowledge/packs/`（installedPacks）。
- `protocol/target.ts`：`listTargets` = builtin + `.omac/knowledge/targets/*.json` + 已安装 pack target cards；`getTarget` 诊断错误；`targetProvenance`。
- `store/event_store.ts`：`appendBoundary`（append-only）、`getBoundaries`（只读工作目录 —— 需修）、`getBoundary`。
- `commands/commands.ts`：`event boundary set|list`、`transfer-probe add|summary|rate`、claim 的 evidence 校验与 boundary 门禁、correction 门禁。
- `services/migrate.ts`：0.9.0→1.0.0（stamp + backfill），`readWorkspaceConfigLoose`，原子 config 写入，失败保留原数据。
- `services/export_import.ts`：event-extra/artifacts/views/retention/learn-paths/packs 导出；import 保留原始 ID、归档目录恢复、integrity 后检。
- `services/adaptive.ts`：Rating/Calibration/GainMatrix 有 status/sample_size/source；CoachEval/Policy/Plan/Pack 版本缺统一元数据。
- 测试：pack-loader / boundary-event / migration-portability / transfer-metric / skill-conformance（79 个）。

## 3. 修复要点设计

### 3.1 归档事件统一读取

`getBoundaries` / `getTransferProbes` / `eventLog` 目前只读 `event/<id>/`。统一改为：优先工作目录，否则按 archive 目录读取（复用 `loadEventAnywhere` 定位逻辑）。`cmdEventBoundaryList` 随之可读归档事件。report 对归档事件需一致（`eventReport` 读 evidence 全局文件，应已可用；验证并补测试）。

### 3.2 Purge + Integrity

- purge 追加：`learner/profile/<id>.json`（若存在，检查实际文件名）、`learner/state/problem-status.jsonl`（该 learner 的 event 关联记录 + workspace 级残余按文档处理）、`report/event-<id>.md`、`artifact/contest/*`（Contest import 的 artifact 文件，按 artifact index 的 rel_path 删除即可覆盖）、contest-upsolve-links（已有）。
- integrityCheck 新增：artifact 索引事件引用存在性 + 文件存在性（rel_path）、boundary 引用（claim/evidence 的 boundary_id 存在于其 event 快照）、event index 重复项、purge 残留（learner-scoped 数据检查：problem-status / retention / learn-paths 无孤儿 event 引用）。

### 3.3 Target 一致性

- claim：`--target-id` 若提供必须 ∈ event.target_ids（`target_mismatch`）。
- transfer-probe add：`--target-id` 必须 ∈ event.target_ids。
- evidence append：`--target-ids` 若提供必须 ⊆ event.target_ids。
- 注意兼容：现有测试 claim 常不传 target-id（允许）；有 target-id 的事件才校验。Explore 事件允许无 target。

### 3.4 V5 统一元数据

统一 `status / sample_size / source / uncertainty`（可参考 TransferRateReport 形状）：
- retention model-status / schedule / list / recall：顶层加四字段。
- coach eval（entries 已有 insufficient/sample_size，补顶层 source/sample_size/status）、coach policy、plan、pack update/versions。
- 无数据 → `insufficient_evidence`，uncertainty 说明缺什么。

### 3.5 内置 Pack 自动加载

- `installedPacks` 合并 builtin registry：`<repo>/knowledge/packs/` 需在运行时定位 —— 不能写死仓库路径（CLI 是 npm 包）。方案：构建时把 builtin packs 作为资源打包？最小方案：`builtinPacksDir` 探测（`process.env.OMAC_BUILTIN_PACKS` 或相对 `import.meta.url` 的 `../../../knowledge/packs`，npm pack 场景用 package `files` 字段包含 knowledge/）。
- 优先级：已安装覆盖 builtin 同名（安装后可见新版本）；`pack install` 对 builtin 同名 pack_id 允许覆盖安装（视为更新）或报 `pack_exists`——选择：允许覆盖安装（用户显式 install 优先）。
- 测试：干净 workspace（无 pack install）下 `pack list` 非空、`pattern list`/`algorithm list` 非空、`targets` 含 builtin。

### 3.6 operation_id

- boundary set / artifact add / transfer-probe add / subflow add：缺省生成 operation-id，显式提供时同 id 重试返回原结果（幂等）。
- boundary：按 boundary_id 幂等（已有 appendBoundary 按 boundary_id 去重）；artifact/probe/subflow 需记录 operation_id 并去重。
- 注意：`transfer-probe add` 现在每次生成 probe_id（时间戳），需加 operation_id 字段去重。

### 3.7 其余

- migrate：stamp + backfill 失败回滚 —— 用临时目录改写后 rename 太复杂；最小方案：stamp 前备份受影响文件列表，失败恢复。或文档化"非事务，失败保留原文件"现状 + 测试断言失败后 index 原状。验收要求"不能保证全部回滚"——给出现状说明 + 尽力而为的回滚（备份恢复）。
- import merge：归档索引 append 前检查 index 中是否已存在。
- README：`omac target get` → 改为 `omac targets`（README 已有 `omac targets` 行，删除错误的 `target get` 行）。
- CLI help：补 V1–V5 命令清单（较大，覆盖常用即可，与 index.ts 分发表一致）。
- contest create：复用 `contest import` 的 artifact 校验（verdict 合法、problems 非空、时间单调）于 `event create --type contest`（把校验逻辑提取到共享函数，避免平行实现）。
- skill 文档 + conformance：补充 outbound 未实现边界、六类事件契约断言、Diagnose 替代证据链、Coach 自评。

## 4. 测试矩阵

- `boundary-event.test.ts` 增补：归档后 boundary list 可读；artifact/probe/subflow operation-id 幂等。
- `migration-portability.test.ts` 增补：purge 后 problem-status/profile/contest artifact/report 无残留；merge import 索引不重复；迁移失败回滚断言。
- 新 `target-consistency.test.ts`：claim/probe/evidence 的 target 一致性。
- `adaptive.test.ts` / 新 `v5-metadata.test.ts`：retention/coach/plan/pack 输出四字段。
- `pack-loader.test.ts` 增补：干净 workspace 内置 pack 可见 + install 覆盖 builtin。
- `skill-conformance.test.ts` 增补：六类事件契约、Diagnose 替代证据链、Coach 自评。

## 5. 完成条件

- 79 + 新增测试全绿；build/typecheck/lint 通过。
- research/acceptance-matrix.md 更新为 implemented / partial / out_of_scope 全表。
