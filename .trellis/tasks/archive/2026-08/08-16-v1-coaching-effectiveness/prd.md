# V1: Coaching Effectiveness

> 权威需求来源：`docs/PRD.md`（PRD v0.8）§14.2、§7（Teaching System）、§6.7（Target Contract）、§6.9（Independence Boundary）。本文件是 V1 可执行需求切片；第 17 节 Locked 决策是硬约束。

## 1. 目标

在 V0 通用 Event 协议之上，通过 Practice 与 Upsolve 的深度教学流程，验证 OMAC 最核心的教学差异——**最小有效帮助能否提高独立解题能力**。V1 不改变 V0 的通用 Event 协议，只增加教练策略和目标评估的有效性。

## 2. 交付内容（PRD §14.2）

1. **完整 Hint Policy 和 Intervention Disclosure 记录**（结构化 HintLadder 与 Intervention 记录模型）。
2. **Practice 与 Upsolve 的 Target Contract、Target-specific Rubric 和 Transfer Probe**（运行时协议，不只 markdown）。
3. **Teach-back、Postmortem 和迁移复盘**（Intervention 类型 + 结构化记录）。
4. **Practice 内的 Debug 子流程和 Upsolve Event 深度流程**（子流程协议）。
5. **原始思路、失败原因、关键突破口和迁移准备度分析**（结构化评估字段）。
6. **用户主动提供的题面、Problem Manifest 和本地题目 Artifact**（输入协议 + 校验）。
7. **Algorithm Ability、Problem-Solving Ability 和 Misconception 的基础 Materialized Views**（reducer 扩展，基于 §5.1/5.2/5.3）。
8. **Assisted / Independent 训练结果区分**（独立记录，不混用）。
9. **允许学生按模式选择帮助程度**：Practice、Learn、Upsolve、Direct Explanation（Coaching Mode 全实现 + 记录为 Evidence）。

## 3. V1 验收重点（PRD §14.2）

同类问题中，独立解决、首次提示时间、Hint Disclosure 和 Transfer Probe 结果能够被稳定记录，并影响后续 Target 或 Intervention 选择。

## 4. 设计

### 4.1 Hint Policy（运行时）

- `hint-level` 枚举 L0–L7（对应 `skill/omac/hint-policy.md`）。
- Intervention Evidence 增加结构化字段：`intervention_type`、`disclosure_level`、`student_requested`、`failure_cause`、`response_evidence_ids`。
- 新增命令或现有 `evidence append --type intervention` 的增强字段。

### 4.2 Target-specific Rubric + Transfer Probe（运行时）

- `transfer probe` 记录：probe_id、target_id、problem_ref、declared_before_start、similarity_rule、prior_exposure、result（independent-success/assisted-success/fail/unknown）、criteria_met、evidence_ids（V0 已有 TransferProbe 类型，补齐命令支持）。
- Target Contract 增加 `evaluation_rubric` 与 `transfer_probe` 的运行时校验。

### 4.3 子流程协议（Sub-flow）

- Practice Event 内 `debug` 子流程：记录 code/run/submission evidence、WA types、debug 时间、最小反例。
- Upsolve Event 深度流程：original_direction、failure_cause、insight_distance、pattern_extraction、transfer_readiness。
- Teach-back / Postmortem：intervention 类型 + 结果记录。

### 4.4 三个 Materialized View（reducer 扩展）

- **Algorithm Ability View**：按 `algo.*` skill 聚合（conceptual understanding / recognition / recall / implementation / generation / transfer 维度，来自 claim.extra.dimensions 或独立 claim）。
- **Problem-Solving Ability View**：按 `skill.problem-solving.*` 聚合。
- **Misconception View**：来自 §5.3 结构（status/confidence/observed_count/first_seen/last_seen/supporting/contradicting/related_concepts）。

### 4.5 输入协议

- `Problem Manifest`：`manifest.json`（problem_ref、platform、difficulty、statement_ref、samples、tags、editorial_ref?），`omac problem add` / `omac problem list` 命令，存于 `.omac/knowledge/problems/`。
- `omac artifact add --event-id <id> --file <path>`：把本地题面/代码/提交记录存入 `.omac/artifact/<event-id>/`。

### 4.6 Coaching Mode 记录

- mode 变更记录为 Evidence（actor=runtime，type=observation，content 含 mode 变更说明）。

## 5. 命令新增/修改

```
omac problem add --manifest <path> | --problem-ref <ref> [--platform] [--difficulty] [--statement <path>]
omac problem list [--platform]
omac artifact add --event-id <id> --file <path> [--kind code|statement|submission|editorial]
omac transfer-probe add --event-id <id> --target-id <t> --result <r> [--prior-exposure] [--problem-ref]
omac subflow debug start|add --event-id <id> [--content]
omac subflow postmortem add --event-id <id> --failure-cause <c> [--insight-distance] [--pattern]
omac subflow teach-back add --event-id <id> --result <recall|explain|reimplement|transfer|fail>
omac subflow upsolve add --event-id <id> --original-direction <d> --failure-cause <c> --insight-distance <n> --transfer-readiness <level>
omac view algorithm [--learner-id]        # Algorithm Ability View
omac view problem-solving [--learner-id]  # Problem-Solving Ability View
omac view misconception [--learner-id]    # Misconception View
```

## 6. 完成条件

- `tsc --noEmit` 与测试通过。
- 测试覆盖：hint/intervention 结构化记录、transfer probe 记录与查询、三个 view 的计算与追溯、debug/upsolve/postmortem/teach-back 子流程、problem manifest 增查、artifact 存储、mode 变更记录、Assisted/Independent 区分（V1 验收）。
- 复用 V0 的 `test/` 结构，新增 `test/coaching.test.ts`。
- 不改变 V0 已有命令语义与 Event schema（向后兼容；V1 只增强）。

## 7. 非目标

- 不做 Web Connector、自动推荐、Rating 校准、复杂 Retention（V2/V3/V5）。
- 不做 Coach 长期因果归因与自动 Teaching Policy Adaptation（V5）。
