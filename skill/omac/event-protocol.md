# OMAC Event Protocol

> Skill: oh-my-algo-coach · Version: 1.0.0 · Agent 操作 Event 的协议

## 1. 四阶段主循环

所有 Event 使用统一主循环：

```
Choose Target / Intent → Train / Explore → Evaluate → Update
```

## 2. Lifecycle

```
draft → active ↔ paused → evaluating → closed
任意阶段 → cancelled
```

- `archived` 不是独立状态；`close` 在 `closed`/`cancelled` 完成最终校验后一次性完成关闭与归档（工作态 `event/<id>/` → `event/archive/<id>/`）。
- 归档不得改变 Event ID、原始 Observation、Intervention 或历史 Claim。

## 3. Agent 命令协议

- `event create`：创建 draft Event；Contest 必须提供已结束 Artifact + 用户完成确认。
- `event append`：追加 Observation、Intervention 或其他记录；可推进 status。
- `event close`：完成校验、关闭并归档；同一操作重试必须返回原结果（`operation_id` 幂等）。
- `learner claim submit`：唯一 Learner State 写入入口，只能在 `evaluating` 阶段调用；只接受结构化 Assessment Claim。
- `learner view get`：只读 Materialized View。
- `rebuild`：只使用指定 Claim 集合与 Reducer Version 重建 View，不调用 LLM。
- `reevaluate`：使用新 Evaluator 追加新的 Assessment Claim，绝不改写历史 Claim。

## 4. Agent 行为约束

- active / paused 阶段只记录 Event Evidence，不产生 Learner View 写入。
- LLM 不得直接覆盖 Learner Model；只能提交结构化 Assessment Claim，由 Runtime 校验并执行 Reducer。
- 一次 Event 的成功不能只通过 AC / WA 判断：独立发现关键性质、暴露重要 Misconception 同样是有价值的结果。
- `unknown` / `insufficient_evidence` 是合法评估结果，不得强迫输出正向或负向能力判断。
- 用户纠正：追加 Correction Evidence → `reevaluate` → `rebuild`；历史事实不被静默改写。

## 5. 各 Event Type 评估维度

- Learn: Understanding / Recall / Recognition / Transfer
- Practice: Independent Insight / Hint Disclosure / Solve Time / Implementation Independence / Proof / Debug
- Upsolve: Original Failure Cause / Insight Distance / Pattern Extraction / Transfer Readiness
- Contest: Problem Selection / Time Usage / Direction Switching / Implementation / Debugging / Risk Management
- Diagnose: Evidence Sufficiency / Alternative Explanations / Confidence / Student Confirmation
- Explore: New Observation / Candidate Target / Knowledge Gain / Follow-up Value

## 6. V2 补充：Learn 教学路径与 Review

- Learn Event 采用 Top-down First 路径：why → concrete-problem → core-intuition → example → visualization/simulation → abstraction → formal-algorithm → correctness → implementation → complexity → recognition → variants → transfer（`learn path add`）。
- Review 是 Learn/Practice 内的场景：形态 recall / small-variation / different-statement / combined-technique / novel-transfer（`review add`）。
- Retention 由 Runtime 确定性调度（指数退避窗口），`retention recall` 更新 recall_strength 与下次复习时间。
- "当时听懂"与"后来仍会"通过 immediate（teach-back/首次 recall）与 delayed（后续间隔 recall）结果对区分（`retention gaps` / `pairs`）。
