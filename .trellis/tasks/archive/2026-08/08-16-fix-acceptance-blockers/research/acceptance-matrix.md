# Acceptance Matrix — fix PRD acceptance blockers

> 上一轮结论 PARTIAL / NEEDS FIXES；本表记录修复后的逐项状态（implemented / partial / out_of_scope）与证据。
> 自动化基线：`npm run build` / `typecheck` / `lint` / `npm test`（89/89）/ `git diff --check` 全部通过。

## 阻断性问题（上一轮验收）

| # | 问题 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | 归档事件 Boundary 无法查询 | implemented | `store/event_store.ts eventFileAnywhere` + `getBoundaries/getTransferProbes/eventLog` 归档感知；`test/boundary-event.test.ts` B7（关闭后 boundary list 返回快照 + report 可读） |
| 2 | Purge 未清理全部学习者数据 | implemented | `cmdLearnerPurge` 追加 profile、problem-status、event 级 report、`artifact/contest/<ref>.json`；`integrityCheck` 追加 index 重复/archived 一致性、boundary 引用、artifact 文件、purge 残留检查；`test/migration-portability.test.ts` M5（problem-status/profile/contest artifact/event report 全无残留 + integrity ok） |
| 3 | Claim 未校验 target 属于事件 | implemented | claim/probe/evidence 的 target ⊆ event.target_ids（`target_mismatch`，misconception scope 豁免）；`test/target-consistency.test.ts` TC1–TC5 |
| 4 | V5 结果元数据不完整 | implemented | retention list/schedule/recall/model-status、coach eval/policy、plan、pack update/versions 补 `status/sample_size/source/uncertainty`（无数据 = insufficient）；`test/transfer-metric.test.ts` T3 + adaptive.test.ts 全部保留通过 |

## Skill 专项

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 内置 Pack 自动加载（干净 workspace 可见） | implemented | `services/memory.ts builtinPacksDir/scanPacksDir` 合并 builtin registry；`pack list` 输出 `builtin`；`test/memory.test.ts` V2.10（pack/pattern/algorithm/pedagogy/targets 开箱可见） |
| 写操作 operation_id 强制与幂等 | implemented | boundary/probe/subflow/artifact 支持 `--operation-id` 幂等（`resumed:true`）；`test/boundary-event.test.ts` B8 |
| consent/redaction/outbound audit 真实实现 | out_of_scope | 保持离线 Fixture；SKILL.md 与 cli-protocol.md 明确"未实现真实外发、未 consent/redact/audit 视为未发送"边界（本轮强化文档） |
| Knowledge Graph / Contest Ontology 完整本体 | partial | 骨架保留（prereqGraph + 五类 Pack 关系字段）；完整图库 out_of_scope（与 PRD 范围一致） |
| Skill Conformance 全事件契约/替代证据链/Coach 自评 | implemented | `test/skill-conformance.test.ts` 新增 Learn 教学契约、Diagnose 替代证据链（确认门禁 + 双证据链）、Coach 自评（evidence-based + SKILL.md 文档断言）；共 11 个场景 |

## 其他重要缺口

| 缺口 | 状态 | 证据 |
| --- | --- | --- |
| Migration 非完整事务 | implemented（尽力回滚） | `migrate.ts snapshotMigrationTargets/restoreBackup`：apply 前快照，失败恢复 + `migration_failed ... rolled back`；M1/M2 通过 |
| Export 归档事件日志读取不完整 | implemented | eventLog 归档感知后 export 的 event-extra 读取完整（M3 保真测试通过） |
| Merge Import 重复写归档索引 | implemented | `writeEventRecord` 写入 index 前检查 exists（M4 通过 + dup_index 完整性检查兜底） |
| README `omac target get` 不存在 | implemented | 新增 `target get <id>` 命令（带 provenance），README 与 CLI help 同步 |
| CLI help 未覆盖 V1–V5 命令 | implemented | `index.ts` HELP 补齐 problem/artifact/subflow/view/review/retention/curriculum/connector/editorial/recommend/contest/coach/visualize/plan/rating/calibration/pack 等 |
| Contest 创建只校验非空 | implemented | `cmdEventCreate` 复用 `validateArtifact`（id/platform/problems 非空/verdict 合法）；V0.7/B2 更新 fixture |
| integrityCheck 覆盖不足 | implemented | boundary/artifact/索引重复/purge 残留检查（见阻断项 2） |

## 验收结论

> **Acceptance: PASS（修复轮）** — 上一轮全部阻断项与主要缺口已修复并有回归测试；剩余 partial/out_of_scope 项均有明确文档边界，与 PRD 范围一致。
