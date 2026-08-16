# OMAC CLI Protocol

> Skill: oh-my-algo-coach · Version: 1.0.0 · Agent 与 OMAC Runtime 的交互协议

## 1. 通用约定

- 面向 Agent 的命令必须支持**结构化 JSON 输出**、稳定的退出状态、幂等重试和明确的错误信息。
- 所有写操作携带 `operation_id`；同一 Agent 中断后重试返回原结果，不重复追加。
- 一个 Learner Workspace 在任一时刻只由一个 Agent Coach 按顺序写入；不支持并发。

## 2. 命令一览

| 命令 | 用途 |
|---|---|
| `omac init` | 幂等初始化 `.omac`，绑定/创建 `learner_id` |
| `omac event create` | 创建 draft Event（含 target/intent/boundary/mode） |
| `omac event append` | 追加记录，推进 status |
| `omac event close` | 校验、关闭并归档 Event |
| `omac learner claim submit` | 唯一 Learner State 写入入口（仅 evaluating 阶段） |
| `omac learner view get` | 只读 Learner View |
| `omac learner purge` | 显式确认的数据删除 |
| `omac evidence append` | 追加 Evidence（observation/intervention/correction/submission/import） |
| `omac rebuild` | 从指定 Claim 集合确定性重建 View（不调用 LLM） |
| `omac reevaluate` | 追加新评估 Claim |
| `omac explain-why` | 追溯 View → Claim → Evidence → Event |
| `omac report` | Event / Learner 报告 |
| `omac export` / `omac import` | 数据迁移（默认 learner 范围，带 Manifest） |
| `omac doctor` / `omac integrity` | 健康检查 / 完整性校验 |
| `omac migrate` | Schema 迁移 |

## 3. 重要规则

1. **Learner State 写入的唯一入口是 `learner claim submit`**，且只能在 `event close` 的评估阶段调用；Agent / LLM 不得直接写 Learner View。
2. **`rebuild` 不得调用 LLM**；只有 `reevaluate` 才使用新 Evaluator 生成追加 Claim。
3. **Contest Event 创建门槛**：必须提供已结束 Contest / Virtual Contest Artifact 并确认活动已结束；赛时解题请求不创建 Event。
4. **不主动修改 `.gitignore`**；凭据不得写入 `.omac`；init/doctor 必须提醒公共仓库风险。
5. 错误响应：`{"error": {"code": "...", "message": "..."}}`；退出码非 0。

## 4. 输入文件协议

- **Problem Manifest**：本地题目清单，含 problem_ref、平台、难度、题面/样例路径。
- **Knowledge Pack**：版本化声明式知识（pattern/misconception/pedagogy/algorithm），含 source/version/license。
- **Contest Artifact**：已结束比赛的结构化记录，作为 Contest Event 输入。

## 5. 失败重试模式

```
1. Agent 发起写操作并携带 operation_id
2. 若中断/超时，使用同一 operation_id 重试
3. Runtime 返回原结果（幂等）
4. 若错误为确定性校验错误（validation_error 等），修正参数后重试
```

## 6. V3 补充：外部生态

- Connector 是可替换适配层：`connector list` 查看 Capability Manifest；当前参考实现为 fixture 数据源（web 能力声明为 false），真实网络连接器通过同一 manifest 声明。
- Editorial 只作为 Coach 知识输入（`editorial get` 返回 verified 状态）；Practice 中 Coach 知道题解 ≠ 学生看到题解。
- 外部内容必须带来源元数据；无法确认来源标记为未验证，不写入长期 Knowledge Pack。
- 推荐（`recommend --target <id>`）是可解释的确定性基线；Exclusion（排除已做）、Exploitation/Exploration 分流、离线降级。
