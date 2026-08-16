# V4: Contest Domain Pack

> 权威需求来源：`docs/PRD.md`（PRD v0.8）§14.5、§8.6（Contest Event 赛后复盘）、§6.6 Contest Contract。本文件是 V4 可执行需求切片；第 17 节 Locked 决策（D-007/D-011）是硬约束。

## 1. 目标

把 Contest Event 做成严格的**赛后复盘 Domain Pack**，而不是实时解题助手。Contest 始终是纯赛后复盘：创建门槛（已结束 Artifact + 用户完成确认）由 V0 实现，V4 增加深度复盘能力。

## 2. 交付内容（PRD §14.5）

1. **比赛和 Virtual Contest Artifact 导入**（结构化导入 + 校验）。
2. **题目打开时间、思考时间、换题、放弃、提交和 Debug 时间线**（timeline 协议）。
3. **Problem Selection、Strategic Switching、Time Management、Risk Management 分析**（复盘评估维度）。
4. **Contest Ability Materialized View**。
5. **赛后 Upsolve 的关联**（Contest Event → 关联的 Upsolve Event）。
6. **赛后 Artifact 完整性检查与创建 `Contest` Event 时的用户完成确认**（V0 已有门槛，V4 增加完整性校验）。
7. **赛后生成 Follow-up Practice / Learn Event 建议**。

## 3. V4 验收重点（PRD §14.5）

系统能够说明"比赛表现损失发生在哪里"，并区分：算法不会 / 没有识别 / 实现慢 / Debug 慢 / 止损过晚；Contest Event 始终保持赛后复盘语义。

## 4. 设计

### 4.1 Contest Artifact 协议

```json
{
  "contest": { "id": "abc389", "platform": "atcoder", "started_at": "...", "ended_at": "..." },
  "problems": [{ "problem_ref": "abc389:A", "rating": 400, "open_at": "...", "submissions": [{ "at": "...", "verdict": "AC|WA|TLE|RE|CE", "minutes_used": 12 }] }],
  "switches": [{ "from": "abc389:C", "to": "abc389:B", "at_minutes": 48 }],
  "abandons": [{ "problem_ref": "abc389:C", "at_minutes": 76 }],
  "reviewer": "user"
}
```

- `omac contest import --artifact <path> [--event-id <id>]`：校验 artifact（必填字段、时间单调、submission verdict 枚举），导入到 `.omac/artifact/contest/<contest-id>.json`，并关联 Contest Event（若未创建则提示先创建）。
- 完整性检查：problems 列表非空、每个打开过的 problem 有 submissions 或 abandon、时间戳无冲突；输出 `integrity: {ok, issues[]}`。

### 4.2 Timeline 计算

- `omac contest timeline --event-id <id>`：按 problem 输出 open/thinking/submission/debug/switch/abandon 时间线；计算每题的 thinking duration、debug time。
- 输入来自 contest artifact + 关联的 Practice/Upsolve Event 中代码与提交 evidence。

### 4.3 损失分析（Loss Attribution）

- `omac contest analyze --event-id <id>`：输出每题的损失归因：
  - `algorithm-gap`（该题从未 open 或很快放弃且 rating 低于能力 → 可能算法不会）
  - `recognition-gap`（open 后长时间无有效提交 → 没识别出来）
  - `implementation-slow`（AC 前多次 WA 且 debug 时间短于思考时间 → 实现慢）
  - `debug-slow`（多次 WA 且 debug 时间长 → Debug 慢）
  - `switch-late`（换题晚于"无新信息"时刻 → 止损过晚 / Persistence Calibration）
- 规则确定性；输出每个结论的 reason。

### 4.4 Contest Ability View

- `omac view contest`：聚合多场比赛的 analysis，输出 per-skill（problem-selection / strategic-switching / time-management / risk-management）状态（unknown/observed/assisted/independent）与 confidence、evidence_count、趋势。

### 4.5 Upsolve 关联

- `omac contest link-upsolve --event-id <contest-id> --upsolve-event <upsolve-event-id> [--problem-ref]`。
- `omac contest followups --event-id <id>`：基于损失归因生成 Follow-up Practice/Learn 建议（如 switch-late → 训练 Persistence Calibration；algorithm-gap → Learn 该算法）。

## 5. 命令新增

```
omac contest import --artifact <path> [--event-id <id>]
omac contest timeline --event-id <id>
omac contest analyze --event-id <id>
omac view contest [--learner-id]
omac contest link-upsolve --event-id <id> --upsolve-event <id> [--problem-ref]
omac contest followups --event-id <id>
```

## 6. 完成条件

- `tsc --noEmit` + 全部测试通过（无回归）。
- 测试覆盖：artifact 导入与完整性校验、timeline 计算、损失归因（5 类）、contest view 聚合、upsolve 关联、followups 建议、赛时拒绝语义回归（V0.7 保持）。
- 新测试文件 `test/contest.test.ts`。

## 7. 非目标

- 实时比赛辅助、平台比赛状态识别、反作弊审计（D-011 禁止）。
- 自动采集赛时数据（输入来自用户提供的 Artifact）。
- 不改 V0-V3 命令语义。
