# V2: Learner Memory & Curriculum

> 权威需求来源：`docs/PRD.md`（PRD v0.8）§14.3、§5.5（Retention）、§8.4（Spaced Review）、§6.6 Learn Event Contract。本文件是 V2 可执行需求切片；第 17 节 Locked 决策是硬约束。

## 1. 目标

把一次性做题训练扩展为知识建立、主动回忆、长期保持和训练路径规划。Learn 的通用 Event 语义由 V0 提供，V2 增加完整教学、复习和跨 Event Learner Memory 能力。

## 2. 交付内容（PRD §14.3）

1. **Learn Event 的完整教学流程**（Top-down First 教学路径作为结构化协议）。
2. **Prerequisite、Algorithm Knowledge Pack 和 Pattern Card 基础版本**（运行时协议 + 内容）。
3. **Review 作为 Learn / Practice 内场景的统一协议**。
4. **Recall、Recognition、Generation、Transfer 的区分**（维度化记录）。
5. **基础 Retention Schedule**（不要求复杂遗忘模型；基于 Review History 的确定性调度）。
6. **Small Variation、Different Statement、Combined Technique 和 Novel Transfer**（复习形态协议）。
7. **教学 Intervention 的即时结果与延迟结果关联**。
8. **基于 Target History、Learner View 和 Retention 的基础 Curriculum Candidate**。

## 3. V2 验收重点（PRD §14.3）

学生在间隔一段时间后，仍能主动回忆、解释或迁移已训练内容；系统能区分"当时听懂"与"后来仍会"，并能用历史状态产生可解释的后续训练候选。

## 4. 设计

### 4.1 Learn 教学流程协议

- `learn-path` 结构：why → concrete-problem → core-intuition → example → visualization/simulation → abstraction → formal-algorithm → correctness → implementation → complexity → recognition → variants → transfer（Top-down First 默认路径，可记录实际选择）。
- `omac learn path` 记录某 Learn Event 采用的教学路径。

### 4.2 Knowledge Pack / Pattern Card 运行时

- `.omac/knowledge/packs/` 注册（pack_id、pack_version、kind、license、source）；`omac pack install <dir>` 复制本地 Knowledge Pack 到 workspace，`omac pack list`。
- Pattern Card：`pattern_id`、observation/transformation/pattern/candidate_techniques/example_problems（V0 已有 JSON 结构，增加 install/list 命令）。
- Prerequisite 图：pack 内 `prerequisites.json`（concept → [prereqs]），`omac pack prereq <concept>` 查询。

### 4.3 Retention Schedule

- 每个 `algo.*` / `skill.*` concept 维护 Retention 记录：first_learned、last_reviewed、last_successful_recall、review_count、recall_strength（0..1）、retention_estimate、recommended_review_window_days。
- 确定性调度：窗口 = 指数退避（1、3、7、14、30 天）乘以 recall_strength 修正；recall 成功提升 strength，失败重置。
- `omac retention list`（due now / future）、`omac retention schedule <concept>`、`omac retention recall <concept> --result success|fail`（生成 Review 记录 + Evidence）。

### 4.4 Review 协议与形态

- Review 场景 = Learn/Practice Event 内的场景（不新增 Event Type）。
- 形态枚举：`recall`、`small-variation`、`different-statement`、`combined-technique`、`novel-transfer`。
- `omac review add --event-id <id> --concept <c> --form <f> [--result success|partial|fail]`；记录为 subflow-like 结构 + evidence。

### 4.5 即时与延迟结果关联

- Learn Event 结束时的 Teach-back 结果 = immediate result；后续 Review（间隔 ≥1 天）结果 = delayed result。
- `omac retention pair --teach-back-id <id> --review-id <id>` 或自动按 concept 聚合，形成 `immediate_vs_delayed` 视图。
- `omac retention gaps`：对每个 concept 输出 "当时听懂但后来遗忘"（teach-back 成功 + 后续 recall 失败）。

### 4.6 Curriculum Candidate

- `omac curriculum`：基于 Learner View 的 status/estimate + retention due + target history 生成可解释候选：due review > 弱 skill 的 practice > 新 concept 的 learn > recognition 训练。
- 每个候选带理由（evidence 引用）与优先级。

## 5. 命令新增

```
omac pack install <dir> | list | prereq <concept>
omac learn path add --event-id <id> --path <comma-separated steps>
omac retention list [--due-only] | schedule <concept> | recall <concept> --result success|partial|fail
omac review add --event-id <id> --concept <c> --form <f> [--result] [--target-id]
omac retention gaps | pairs | curriculum
```

## 6. 完成条件

- `tsc --noEmit` + 全部测试通过（含既有 V0/V1 无回归）。
- 测试覆盖：pack install/list/prereq、learn path 记录、retention 调度确定性（同输入同输出）、recall 更新 strength、review 形态记录、即时/延迟关联与 gaps、curriculum 候选生成。
- 新测试文件 `test/memory.test.ts`。

## 7. 非目标

- 复杂遗忘模型（FSRS/IRT）、自动推荐（V3）、Rating 校准（V5）。
- 不改动 V0/V1 命令语义。
