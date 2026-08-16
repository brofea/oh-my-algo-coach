# Acceptance Matrix — complete PRD V5 implementation gaps

> 依据 `docs/PRD.md` v0.8 与本任务 `prd.md` 验收清单逐条记录。状态：`implemented` / `partial` / `out_of_scope`，附证据（测试或文档路径）。

## Skill

| PRD 要求 | 状态 | 证据 |
| --- | --- | --- |
| Skill 核心协议、知识 Pack、加载方式、行为边界与 PRD §3/4/7/9/11 一致 | implemented | `skill/omac/SKILL.md`（含新增 V2–V5 行为规则与外部内容安全边界）、`references/*.md`；`test/skill-conformance.test.ts` |
| 自定义 Target / Pattern / Misconception / Pedagogy Pack 安装后可查询并保留版本/来源/许可证 | implemented | 统一 manifest schema（`core/types.ts` PackKind/PackSource/PackLicense）、canonical loader（`services/memory.ts` normalizeManifest/validatePackManifest/loadPackCards）、`protocol/target.ts` listTargets 读取已装包；`test/pack-loader.test.ts`（5 类 pack、来源版本许可证、legacy 兼容） |
| Skill Conformance Fixture 验证六种 Event、Hint Ladder、Assisted/Independent、Transfer、Diagnose、Contest、外部内容安全 | implemented | `test/skill-conformance.test.ts`（8 个场景，离线运行） |

## Runtime / Data

| PRD 要求 | 状态 | 证据 |
| --- | --- | --- |
| Event Target 与 Independence Boundary 可创建、快照、引用、追溯 | implemented | `event boundary set/list`、`appendBoundary` 不可变快照、`event.independence_boundary_ref`、Evidence/Claim 绑定 `--boundary-id`；`test/boundary-event.test.ts` B3/B7、M3 导入保真 |
| 非法 Target、非法 Evidence 引用、跨 Event Claim、关闭后普通 Evidence 被拒绝 | implemented | `cmdEventCreate` target 校验（含诊断信息）、`cmdLearnerClaimSubmit` evidence 存在/归属校验、`cmdEvidenceAppend` 关闭门禁 + correction 路径；`test/boundary-event.test.ts` B1/B4/B6 |
| Contest Artifact 创建门槛验证内容并保存引用；Import/Export 保留 archived Event 和 index | implemented | `cmdEventCreate` 校验存在/普通文件/非空，写入 `.omac/artifact` + `artifact_ref`；`test/boundary-event.test.ts` B2；`test/migration-portability.test.ts` M3（archived 目录、index、boundary、artifact 文件、view 恢复） |
| Purge 删除 Learner 全部动态数据 + Artifact，并通过 Integrity Check | implemented | `cmdLearnerPurge` 覆盖 artifact index/文件、subflow、retention、learn-paths、contest 分析、index；`test/migration-portability.test.ts` M5 |
| Schema Migration 可从至少一个旧 Schema Fixture 升级到当前版本 | implemented | `migrate.ts` 0.9.0→1.0.0（事件 stamp + index backfill，原子写入，失败保留原数据，迁移后 integrity）；`test/migration-portability.test.ts` M1/M2 |
| Rebuild / Reevaluate / Correction 保持历史不可变且可重复 | implemented | 非法 claim-set 显式报错（`view_store.ts`）、correction 只追加；`test/migration-portability.test.ts` M6、`conformance.test.ts` V0.5 |

## V5 / Metrics

| PRD 要求 | 状态 | 证据 |
| --- | --- | --- |
| Rating、Calibration、Retention、Coach Eval、Gain Matrix、Plan、Pack Update 输出来源、样本、insufficient 状态 | implemented | `adaptive.ts` 各函数补 `source`/`sample_size`/`status`；`test/transfer-metric.test.ts` T3 |
| Novel Independent Transfer Rate 报告具备分母、Boundary、Target、时间窗、不确定性 | implemented | `coaching_views.ts transferRateReport` + `transfer-probe rate` 命令；`test/transfer-metric.test.ts` T1/T2 |
| `.versions.jsonl` 记录 from/to 并可重放 | implemented | `adaptive.ts updatePack/packVersions`；`test/transfer-metric.test.ts` T4 |

## Delivery

| PRD 要求 | 状态 | 证据 |
| --- | --- | --- |
| build / typecheck / test / lint 全通过 | implemented | `npm run build`、`npm run typecheck`、`npm run lint`（新增，`scripts/check-packs.mjs`）、`npm test` 79/79 |
| README 覆盖安装、初始化、Skill 使用、CLI 闭环、测试 | implemented | `README.md` 重写 |
| 不修改 D-001–D-014，不引入多 Agent 并发写入或 View 直接 CRUD | implemented | 未触碰 `docs/PRD.md`；所有 Learner State 仍经 Claim→Reducer；无锁/并发代码 |

## 明确 out_of_scope（与 PRD 一致）

- 多 Agent 并发写入、文件锁、冲突合并（D-012）
- Online Judge / 实时 Contest 反作弊（D-011 拒绝 live contest）
- 真实 Web API 外发；Fixture Connector 保持离线基线，Skill 明确"未实现外发不得声称已发送"边界
- 学习效果 / Rating 提升 / Intervention 的因果结论（仅可解释观察性指标）
- 全量算法知识库（只提供可版本化 Pack 机制 + 代表性 Card）

## 已知限制（partial 残余风险）

- `inspectTargetHistory`（`protocol/target.ts`）仍是空实现 stub，未被任何命令引用；如需 Target 历史审计需后续任务实现。
- Export/Import 的 `new-learner` 策略不会改写已绑定的 workspace learner（导入学习者以重命名 ID 存在，需显式 `--learner-id` 查询）；符合"禁止静默覆盖"原则。
- V5 指标为启发式基线：时间窗默认全量、最小样本阈值为常量（3），可通过 CLI 参数调整但无持久化配置。
