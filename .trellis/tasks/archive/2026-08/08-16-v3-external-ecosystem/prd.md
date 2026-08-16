# V3: External Problem Ecosystem & Recommendation

> 权威需求来源：`docs/PRD.md`（PRD v0.8）§14.4、§9（Agent Web Research & External Problem Ecosystem）、§8.1-8.3（Recommendation/Recognition Training）。本文件是 V3 可执行需求切片；第 17 节 Locked 决策是硬约束。

## 1. 目标

在本地训练闭环之外接入可审计的外部题目生态和基础推荐。V3 是可替换的外部扩展，**不应成为离线 Coaching Loop 的前置依赖**。

## 2. 交付内容（PRD §14.4）

1. **Codeforces、AtCoder 等 Platform Connector**（可替换 Connector 接口 + 参考实现）。
2. **Problem、Contest、Submission、Editorial 的来源、版本和缓存**（provenance 元数据）。
3. **题目状态、已做记录、题面和 Editorial 使用政策**（solved/attempted 状态、usage policy）。
4. **基于过滤、Target Coverage、难度、Novelty 和历史的确定性推荐基线**。
5. **Exploration 与 Exploitation 的基础分流**。
6. **Web 失败、限流、题面缺失和 Editorial 不存在时的离线降级**。
7. **Problem Pattern Card 与题目实例的关联**。
8. **Connector Capability Manifest**。

## 3. V3 验收重点（PRD §14.4）

Connector 和推荐可解释、可复现、可排除已做题；网络不可用时不破坏已有训练；来源和内容政策可追溯。

## 4. 设计

### 4.1 Connector 抽象

- `ConnectorCapabilityManifest`：connector_id、platform、capabilities（fetch_problem/fetch_contest/fetch_submissions/fetch_editorial/rate_limit）、version。
- 接口：`fetchProblem(ref)`、`fetchEditorial(ref)`、`listContestProblems(contestId)`。参考实现以 **manifest-driven 本地数据源**（`test/fixtures/` JSON）模拟平台响应，不依赖真实网络——离线可测、可复现。真实网络 Connector 通过 manifest 声明 `web: true` 标记，提供 stub。
- `omac connector list | inspect <id>`。

### 4.2 来源治理与缓存

- 外部内容缓存于 `.omac/knowledge/external/<connector>/<ref>.json`，带 `source_url`、`source_type`、`retrieved_at`、`content_license/usage_policy`、`contest_status`、`cache_version`（PRD §9.2）。
- 无法确认来源 → 标记 `verified: false`，不写入长期 Knowledge Pack。
- Editorial 仅作 Coach 知识输入：`omac editorial get <ref>`（标记 verified 状态）；`omac editorial cache clear <connector>`。

### 4.3 题目状态

- `.omac/learner/state/problem-status.jsonl`：problem_ref、status（solved/attempted/untouched）、independence_status、solved_at、evidence_ids。
- `omac problem status <ref> --status solved|attempted`（由事件结果驱动；命令用于显式记录）。

### 4.4 确定性推荐基线

- `omac recommend --target <target_id> [--mode exploitation|exploration|auto] [--limit n]`。
- 候选池：本地 manifest + connector 缓存题。
- 过滤：排除 solved、排除近期做过、匹配 target 覆盖（pattern card 关联 target）。
- 排序：exploitation = 难度接近估计区间 + 高 target coverage + 高 novelty（未见过）；exploration = 低 confidence skill 的诊断题优先 + 难度 ±150。
- 输出每个候选的 reason（可解释字段）。
- 确定性：同输入 → 同输出（seed 固定）。

### 4.5 Exploitation / Exploration 分流

- auto 模式：skill 证据 < 阈值（confidence < 0.35 或 evidence_count < 3）→ exploration；否则 exploitation。

### 4.6 离线降级

- Connector fetch 失败/超时/缺题面 → 返回降级结果（`degraded: true`，reason），训练闭环不受影响；推荐退化为本地 manifest 池。
- `omac doctor` 增加 connector 健康检查项。

### 4.7 Pattern Card 关联

- `omac recommend --explain <ref>`：输出该题关联的 pattern card（通过 tags/target 匹配 knowledge 目录 pattern pack）。

## 5. 命令新增

```
omac connector list | inspect <id>
omac editorial get <ref> [--connector <id>] | cache clear <connector>
omac problem status <ref> --status solved|attempted|untouched [--independence <s>] [--event-id]
omac recommend --target <target_id> [--mode auto|exploitation|exploration] [--limit] [--platform]
omac recommend --explain <ref>
```

## 6. 完成条件

- `tsc --noEmit` + 全部测试通过（无回归）。
- 测试覆盖：connector manifest/能力枚举、缓存 provenance 元数据、未验证来源标记、problem status 记录、推荐过滤（排除已做）、exploitation/exploration 分流逻辑、确定性（同输入同输出）、离线降级（connector 失败不影响闭环）、pattern 关联解释。
- 新测试文件 `test/ecosystem.test.ts`。

## 7. 非目标

- 真实网络抓取/平台 API 认证（Connector 以 fixture 数据源实现，web 标记为 capability 声明）。
- Rating 校准、Solve Probability 模型（V5）。
- 不改 V0-V2 命令语义。
