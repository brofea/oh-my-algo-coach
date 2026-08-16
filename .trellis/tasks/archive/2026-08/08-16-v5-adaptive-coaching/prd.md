# V5: Adaptive Coaching Research & Ecosystem

> 权威需求来源：`docs/PRD.md`（PRD v0.8）§14.6、§8.7（Rating）、§11（Coach Self-Evaluation）、§13（成功指标）。本文件是 V5 可执行需求切片；第 17 节 Locked 决策是硬约束。

## 1. 目标

在 V0–V2 积累稳定 Evidence 后，发展更成熟的自适应 Coach 研究与生态能力。V5 不是单一一次性交付物，下面的能力分别定义实现与验收。**不构建不可解释的"学生数字替身"**：一切自适应都基于 Evidence、Confidence、Traceability 和用户控制。

## 2. 交付内容（PRD §14.6）

1. **更成熟的 Rating、Calibration 和 Solve Probability**（用户友好的展示层 + 校准基线）。
2. **高级 Retention Model**（比 V2 指数退避更强的模型：间隔反馈修正 + 过期衰减）。
3. **Coach Intervention Self-Evaluation**（Intervention → Observed Learning Gain 关联）。
4. **Student × Problem Type × Difficulty × Intervention 的 Observed Learning Gain**。
5. **教学 Policy 的可解释自适应**（规则化，有 Confidence，不把少量样本当稳定结论）。
6. **更多 Agent Host 与 Platform Connector**（manifest 扩展 + host 适配说明）。
7. **Interactive Visualization 和可复用教学工具**（ASCII/图表生成，作为 Runtime 服务）。
8. **Long-term Curriculum Planning**（跨目标规划，可解释）。
9. **Knowledge / Pattern / Misconception Pack 的社区协作与版本治理**（pack 版本 + 更新检查）。

## 3. V5 验收重点（PRD §14.6）

自适应能力必须有 Evidence、Confidence、Traceability；不得产生无法解释的模型行为；用户可控制何时启用自适应。

## 4. 设计

### 4.1 Rating / Calibration / Solve Probability

- `omac rating [--learner-id]`：从 Learner View 的 estimate 区间 + claim 历史计算 per-skill rating（区间中点加权）与 overall（evidence-weighted），输出 `{overall, skills, confidence}`。标注"展示层，非底层模型"。
- `omac calibration`：比较预测 solve probability 与实际 AC 结果（从 problem status + claim 生成 calibration 报告：predicted vs observed 分箱、Brier score 简化版）。
- Solve Probability：`P(solve) = sigmoid((rating_problem - rating_student)/300)` 基线（文档说明为启发式校准基线）。

### 4.2 高级 Retention Model

- V2 的指数退避基础上增加：overdue 衰减（超期后 retention_estimate 按天衰减）、recall 结果强度修正（success 间隔越短加分越多）。
- `omac retention model-status <concept>`：输出当前模型参数与估计。
- 保留 V2 命令语义（向后兼容）。

### 4.3 Coach Self-Evaluation

- 记录 Intervention 与后续 learner 行为/结果 Evidence 的关联（已有 intervention evidence + response evidence，新增聚合）。
- `omac coach eval --target <skill> [--min-events]`：对每个 intervention_type 输出 `{intervention_type, observed_count, gain_sign: up|down|flat, confidence, sample_evidence}`。
- gain 判定：intervention 之后学生是否产生新的独立行为（后续 claim status 提升 / transfer 成功）。
- `omac coach policy`：可解释 Teaching Policy 快照（如 "counterexample 在 greedy 类问题上有效"），带 confidence 与样本量；样本 <3 时明确标注 insufficient。

### 4.4 Observed Learning Gain 矩阵

- `omac coach gain-matrix`：Student(per-skill) × Problem Type × Difficulty × Intervention → Observed Learning Gain 汇总（计数 + 方向）。

### 4.5 Interactive Visualization

- `omac visualize --kind <chart|graph|ascii> [--view algorithm]`：从 Learner View / Retention 生成文本/ASCII 可视化（sparkline、进度条、表格式矩阵）；作为 Runtime 服务，不改变 Skill（Skill 不放 Script）。
- 输出 `{kind, title, body}`。

### 4.6 长期 Curriculum Planning

- `omac plan --horizon <weeks> [--targets a,b]`：基于 learner view + retention + target history 生成周计划（每周目标列表，含 reason 与 evidence 引用）。

### 4.7 社区协作与版本治理

- `omac pack update <pack-id> [--source <dir>]`：比较 installed 与 source manifest 版本，提示升级（dry-run 默认）。
- `omac pack versions <pack-id>`：列出已安装版本历史（`.omac/knowledge/packs/.versions.jsonl`）。
- 版本升级记录审计：who/when/from/to。

## 5. 命令新增

```
omac rating [--learner-id]
omac calibration
omac retention model-status <concept>
omac coach eval --target <skill> [--min-events n]
omac coach policy [--min-samples n]
omac coach gain-matrix
omac visualize --kind chart|graph|ascii [--view algorithm|problem-solving|retention] [--concept <id>]
omac plan --horizon <weeks> [--targets a,b]
omac pack update <pack-id> [--source <dir>] [--apply]
omac pack versions <pack-id>
```

## 6. 完成条件

- `tsc --noEmit` + 全部测试通过（无回归）。
- 测试覆盖：rating 计算与 confidence、calibration 分箱、高级 retention 衰减、coach eval 的 gain 判定与 insufficient 标注、gain-matrix 聚合、visualize 输出、plan 生成、pack 版本升级审计。
- 新测试文件 `test/adaptive.test.ts`。
- 所有输出可解释（reason/evidence 引用），无黑盒。

## 7. 非目标

- 真实机器学习模型（Glicko/IRT/Knowledge Tracing 集成留作后续研究——本 PRD 不规定最终数学模型，§8.7）。
- 不可解释的自适应行为。
- 改 V0-V4 命令语义。
