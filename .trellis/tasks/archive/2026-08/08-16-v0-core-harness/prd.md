# V0: Core Harness & Local Coaching Loop

> 权威需求来源：`docs/PRD.md`（PRD v0.8）。本文件是 V0 阶段的可执行需求切片；第 17 节 Locked 决策（D-001..D-014）是硬约束。冲突时以 `docs/PRD.md` 为准。

## 1. 目标

在不依赖外部平台、不依赖复杂数学模型的前提下，以较大实现粒度一次打通 OMAC 主流程，交付一个能承载不同平台、领域、Target 和 Event Type 的**通用 Local Coaching Loop**：

```
Init → Know Student → Choose Target → Run Event → Record Evidence → Evaluate → Update Learner → Use History in Next Event
```

## 2. 交付物（对应 PRD §14.1）

1. **TypeScript npm CLI**（`packages/cli`，bin 名 `omac`）+ 项目级 `.omac` Workspace 初始化。
2. **六种 Event Type** 的稳定公共 Schema、统一 Lifecycle（`draft → active ↔ paused → evaluating → closed`，任意阶段可 `cancelled`）、工作态 `event/<event-id>/ → event/archive/<event-id>/` 归档流程（D-005/D-010：无 `event/active` 目录；`close` 一次性完成关闭+归档）。
3. `Choose Target / Intent → Train / Explore → Evaluate → Update` 完整通用主循环。
4. Event、Evidence（Observation/Intervention/Correction/Submission）、Assessment Claim、Learner View 的持久化与引用关系。
5. Target Contract、Coaching Mode、Independence Boundary 基础协议；基础 Transfer Probe Contract。
6. **LLM 只能提交结构化 Assessment Claim**：`omac learner claim submit` 是唯一 Learner State 写入入口（D-013），仅允许在 `evaluating` 或 `event close` 评估阶段调用；Runtime 负责 Schema 校验、Claim 持久化、Reducer 执行。无 `learner update` CRUD。
7. V0 Evaluate 基线：`event close` 时 Coach 生成结构化 Assessment Claim；`rebuild` 从已有 Claim 重建 View（不调用 LLM）；`reevaluate` 追加新 Claim 不改写历史。
8. 用户纠正（Correction Evidence → reevaluate → rebuild）、Claim 冲突、`unknown / insufficient_evidence`、重新评估流程。
9. 本地 Problem Manifest、Knowledge Pack、代码 / Contest Artifact 显式输入。
10. `Explain Why`、Learner Summary、Event Report、下一次 Event 上下文读取。
11. 基础 Schema Validation、Migration、Export、Import、Doctor、Integrity Check。
12. `Contest` Event 赛后创建门槛：已结束 Artifact + 用户完成确认；拒绝赛时解题 Event（D-007/D-011）；不实现平台比赛状态识别/反作弊。
13. `.omac` 公共仓库风险提示、凭据禁止写入、原始对话保存策略（默认不保存，可配置）。
14. **最小 Host Capability Contract** + 可版本化 **Conformance Fixture Matrix**（2 个不同本地 Platform/Domain Profile + ≥2 个 Event Type，含输入 Artifact、预期引用关系、可重复 CLI 断言）。

## 3. V0 不实现（PRD §14.1 明确排除）

- 自动搜索题目、Platform Connector、Web Recommendation
- 完整 Algorithm/Pattern Knowledge Graph
- 自动 Problem Recommendation、Solve Probability、Expected Learning Gain
- 准确 Rating、复杂 Retention Model、长期 Spaced Review 调度
- Contest 时间线自动采集、平台比赛状态识别、反作弊审计
- Coach Intervention 长期因果归因、自动 Teaching Policy Adaptation
- Interactive Visualization、社区知识协作、多 Host 深度适配
- 并发写入、多 Agent 协作、文件锁（D-012：单 Agent 顺序写入；`operation_id` 幂等重试）

## 4. 架构与目录布局

```
oh-my-algo-coach/
├── package.json               # root（npm workspaces）
├── packages/cli/              # TypeScript npm CLI（@omac/cli，bin: omac）
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts           # CLI 入口（子命令分发，结构化 JSON 输出）
│   │   ├── commands/          # init / event / learner / evidence / import / export /
│   │   │                      # rebuild / reevaluate / report / explain / doctor / migrate / integrity
│   │   ├── core/
│   │   │   ├── types.ts       # Event/Evidence/Claim/View/Target/Boundary 等类型
│   │   │   ├── schemas.ts     # JSON Schema + 校验
│   │   │   ├── lifecycle.ts   # Event 状态机
│   │   │   ├── reducer.ts     # 确定性 Reducer（View 计算）
│   │   │   ├── idgen.ts       # id 生成（event-id/evidence-id/claim-id）
│   │   │   └── opid.ts        # operation_id 幂等去重
│   │   ├── store/             # .omac 文件存储
│   │   │   ├── workspace.ts   # .omac 布局创建/读取
│   │   │   ├── event_store.ts
│   │   │   ├── evidence_store.ts
│   │   │   ├── claim_store.ts
│   │   │   ├── view_store.ts
│   │   │   └── index_store.ts # event/index 索引
│   │   ├── protocol/          # target / boundary / mode / transfer-probe
│   │   ├── services/          # explain / report / export / import / doctor / integrity / migrate
│   │   └── fixtures/          # Conformance Fixture Matrix 定义
│   └── test/                  # 集成测试（CLI 断言）
├── skill/                     # Agent Skill（声明式 markdown，不放 Script）
│   └── omac/
│       ├── coaching-constitution.md
│       ├── event-protocol.md
│       ├── hint-policy.md
│       ├── cli-protocol.md
│       └── knowledge/
├── knowledge/                 # Knowledge Pack（版本化声明式内容）
│   └── packs/
└── docs/PRD.md
```

`.omac` 运行时布局（PRD §3.3，D-004/D-005/D-010）：

```
.omac/
├── config/            # workspace.json（workspace_id、schema_version、learner_id、对话保存策略）
├── learner/
│   ├── profile/       # learner profile
│   ├── state/         # 长期状态摘要
│   └── views/         # materialized views（含 reducer_version、claim_set_ref）
├── event/
│   ├── <event-id>/    # draft/active/paused/evaluating 状态
│   ├── archive/       # closed/cancelled（event/archive/<event-id>/）
│   └── index/         # 索引
├── evidence/
├── knowledge/
├── artifact/
├── report/
├── import/
└── runtime/           # schema/migrator/integrity 元数据
```

## 5. 关键协议（字段以 PRD §6.6/6.7/6.9/10.2 为准）

- **Event 公共字段**：id、event_type、schema_version、workspace_id、learner_id、platform_profile_ref、domain_profile_ref、target_ids/intent、problem_ref/contest_ref、mode、status、started_at、ended_at、provenance、independence_boundary_ref、archive_ref。
- **Event Type**：learn / practice / upsolve / contest / diagnose / explore（仅此六种，D-006）。
- **Evidence 字段**：evidence_id、evidence_type(observation/intervention/correction/submission/import)、event_id、workspace_id、learner_id、actor、observed_at、target_ids、problem_ref/artifact_ref、source、content_ref/content_summary、provenance、evidence_quality、independence_boundary_ref、operation_id、created_at、extraction_confidence(可选)。
- **Assessment Claim 字段**：claim_id、workspace_id、learner_id、skill_id、target_id/claim_scope、assessment、assessment_scale、evidence_ids、evidence_quality、confidence、evaluator_version、model_provenance、evaluation_run_id、policy_pack_ref、input_snapshot_ref、operation_id、created_at、unknown_reason、student_confirmation、supersedes/contradicted_by。允许 `unknown`/`insufficient_evidence`/`conflicted` 结果。
- **Learner View**：view_version、reducer_version、claim_set_ref、claim_selection_policy_version、可追溯 claim/evidence 引用、workspace/learner identity、generated_at。
- **Target Contract**：target_id、target_version、name、category、domain/platform_scope、learner_profile_scope、prerequisites、observable_behaviors、success_criteria、failure_taxonomy、required_evidence、transfer_probe、evaluation_rubric、assessment_scale、independence_boundary_defaults。
- **Independence Boundary**：problem_familiarity、prior_exposure、allowed_resources、editorial_exposure、algorithm_name_disclosed、hint_limit、code_assistance_allowed、external_help、time_limit、evaluation_context；结果维度：independence_status、first_intervention_at、max_disclosure、independent_behavior_observed、transfer_observed、retention_observed。
- **Coaching Mode**：practice / learn / upsolve / direct-explanation；用户可改变模式并记录为 Evidence。
- **幂等**：append/close/claim submit 都携带 `operation_id`；重试返回原结果，不重复追加。

## 6. 验收标准（PRD §14.1 V0 验收）

自动化验收（conformance 测试 + 集成测试）必须覆盖：

1. `omac init` 幂等创建 `.omac` 及全部一级目录、schema metadata；输出公共仓库风险提示；不修改 `.gitignore`；支持 `--learner-id` 绑定或创建。
2. 完整闭环 CLI 演练：init → event create（含 target/intent、boundary、mode）→ event append（observation/intervention）→ learner claim submit（evaluating 阶段）→ event close（归档到 `event/archive/<id>/`）→ learner view get（可追溯）→ rebuild（指定 claim set + reducer version，确定性重建）→ 下一 Event 读取上一 Event 上下文（Learner View、Target History、Boundary，且 Assisted 结果不被当作 Independent）。
3. 进程重启后工作态与 archived Event 不丢失。
4. 同一 `operation_id` 的 append/close 重试不重复追加。
5. `unknown`/证据不足可正常结束 Event，不强迫伪造判断。
6. 用户纠正：追加 Correction Evidence → reevaluate 产生新/superseding Claim → rebuild 新 View；历史 Claim 不被改写。
7. `rebuild` 不调用 LLM（无 LLM 依赖即可重建）；`reevaluate` 只追加。
8. 同一 Runtime 承载 ≥2 个 Platform/Domain Profile + ≥2 个 Event Type，不改变核心 Schema（Fixture Matrix 验证）。
9. `Contest` Event 创建需已结束 Artifact + 用户确认；赛时请求被拒绝（错误提示）。
10. `doctor`/`integrity`/`export`/`import`/`migrate` 基础命令可用；Export 按 learner_id 范围、带 Manifest；Import 只读校验预览后用户选择导入；导入后本地 rebuild。
11. Conformance Fixture Matrix：2 个 Profile（如 codeforces-practice / leetcode-dp）+ 至少 2 个 Event Type（如 practice、learn），每个场景给出输入 Artifact、预期 Event/Evidence/Claim 引用链、预期 View 追溯链、可重复 CLI 断言（`test/` 中以脚本化方式运行）。

## 7. 完成条件（本任务）

- 代码通过 `tsc --noEmit`（或等价 typecheck）与测试套件。
- Conformance Fixture Matrix 脚本可重复运行且通过。
- Skill 目录包含核心 4 个 markdown（constitution/event-protocol/hint-policy/cli-protocol），不含 Script。
- 上述验收 1–11 全部通过测试验证。
