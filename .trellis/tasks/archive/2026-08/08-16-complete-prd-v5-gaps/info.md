# Implementation Info — V5 PRD Gap Completion

## 1. Handoff Summary

本文件是实现 Agent 的技术设计补充，不替代 `prd.md` 和 `docs/PRD.md`。目标是把当前“CLI 基线测试通过但 PRD 契约存在断点”的状态，收敛成可验证的 Skill → Runtime → `.omac` 数据 → Replay / Metric 闭环。

实现原则：优先复用现有 schema、store、service 和 command helper；新增行为必须先定义数据契约，再接入 CLI，最后补跨层测试。任何无法在离线 Fixture 中证明的外部 Web 能力，都只能记录为未实现或 out of scope。

## 2. Current Data Flow

当前主链路可以抽象为：

```text
CLI command
  -> core schema / protocol validation
  -> store append (event/evidence/claim)
  -> service reducer / replay
  -> view/report/index under .omac
  -> CLI query / Skill explanation
```

本任务需要把两条缺失链路接回主链路：

```text
knowledge pack install
  -> canonical pack loader
  -> target/pattern/misconception/pedagogy query
  -> Skill behavior / recommendation / event validation

event boundary + artifact + consent audit
  -> immutable snapshot/reference
  -> claim/replay/transfer metric
  -> explainable report with insufficient_evidence
```

禁止出现旁路：例如 command 直接修改 Learner View、Pack 只复制文件但查询仍读另一目录、指标只读 summary 而不引用 Evidence / Boundary。

## 3. Canonical Contracts

### 3.1 Knowledge Pack

统一 Pack Manifest 至少包含：

```ts
type KnowledgePackManifest = {
  pack_id: string;                 // stable, namespaced ID
  kind: "algorithm" | "pattern" | "misconception" | "pedagogy" | "target";
  schema_version: string;
  version: string;
  source: { type: string; uri?: string; retrieved_at?: string };
  license: { id: string; notice?: string };
  content_files: string[];
  dependencies?: string[];
};
```

每个 Card 必须有稳定 `id`、`kind`、`pack_id`、`version` 和可追溯的 manifest；内容字段可以按 kind 扩展，但不能让 Loader 依赖目录名猜测类型。代表性 Card 最少覆盖：一个 algorithm、一个 pattern、一个 misconception、一个 pedagogy 和一个 target。

Canonical 查询顺序：builtin registry → `.omac/knowledge/packs/<pack_id>` manifests/cards。已有 `.omac/knowledge/targets/*.json` 数据需要兼容读取或一次性迁移，不能因新 Loader 上线而令旧 builtin 消失。`pack install` 的成功条件是安装后 `list/get` 和至少一个 Runtime consumer 都能看到该 Pack。

### 3.2 Target Resolution

Event 创建时：

* 已声明的 Target ID 必须从 canonical loader 解析；不存在时返回明确的 unknown-target 错误。
* Explore 可以没有 Target。
* Practice 可以使用 `provisional` / `unresolved`，但必须持久化状态，且不能进入要求已确认 Target 的 Transfer / Retention 指标。
* Contest 应要求已确认 Target，除非 PRD 既有 Fixture 明确允许例外。

不要复制一套 Target 校验逻辑；优先让 `target.ts` 暴露统一 `resolveTarget` / `listTargets` 结果，commands、metrics 和 Skill fixture 复用同一结果。

### 3.3 Independence Boundary

建议提供以下等价 CLI（名称可按现有命令风格调整，但能力必须完整）：

```text
omac event boundary set --event-id <id> --boundary <json-or-file> [--operation-id <id>]
omac event boundary list --event-id <id>
```

Boundary snapshot 至少记录 `boundary_id`、`event_id`、`created_at`、`mode`（independent / assisted / transferred / retained）、允许的资源 / Hint 等级、声明者和规范化摘要。Event 保存当前 snapshot ID；Evidence / Claim 保存使用的 snapshot ID。更新 Boundary 只能追加新 snapshot，不能改写旧 snapshot。

Independent / Transferred / Retained 的结果如果缺 `boundary_id` 或快照内容不完整，应拒绝写入或产出 `insufficient_evidence`，不能默认当成 independent。

### 3.4 Evidence and Claim

Claim append 前必须验证：

1. Evidence ID 存在且能从当前 Workspace 读取。
2. Evidence 的 learner / event 与 Claim 当前上下文一致。
3. Event 类型、Claim 类型、phase 和 confirmation 状态符合协议。
4. 引用的 Boundary snapshot、Artifact reference（如需要）仍存在且未被篡改。

验证失败应保持 append 原子性：不写半条 Claim、不更新 View、不产生虚假 metric。Rebuild 必须重新执行相同校验；历史坏数据要给出记录级错误，而不是静默跳过。

### 3.5 Contest Artifact

`--artifact` 不能只检查参数 truthy。最小验证为：路径存在、是普通文件、可读、非空；写入 Event 的 reference 至少包含规范化相对路径或 artifact ID、size、hash、created_at。Artifact index 要纳入 export / import / purge；不要把绝对路径或 workspace 外的敏感路径写入可移植记录。

### 3.6 Closed Event and Diagnose

Event 关闭后普通 Evidence append 必须失败。允许的 correction / reevaluation 需要 operation ID、reason、actor 和原记录引用，并生成新记录；旧记录不可变。

Diagnose 的 learner claim 在 `student_confirmation !== "confirmed"` 时允许作为待确认记录或直接返回门禁错误，但不得触发 Learner State Reducer。确认后的 reducer 结果需要保留 before / after 或等价可 replay 证据。

## 4. Persistence, Migration and Portability

### 4.1 Migration

至少建立一条旧 fixture（建议 `0.9.0`）到当前 schema 的 migration。迁移入口不能先用当前 schema reader 拒绝旧配置；应先读取轻量版本信息，再选择 migration chain。每一步必须：

* 幂等或明确不可重复；
* 先写临时文件，再原子替换；
* 失败保留原目录并输出 from / to / reason；
* 迁移后运行 integrity / replay 检查。

`.versions.jsonl` 的 Pack 更新记录必须有 `from`、`to`、pack_id、operation_id、时间和结果，不得只记录当前 version / available。

### 4.2 Export / Import

Export manifest 要表达 working / archived Event、Event Index、Evidence、Claim、View / Report、Artifact index/files、Knowledge Pack references 和 Learner State 的关系。Import 应按 manifest 恢复到对应目录与索引，不能把 archived Event 无条件写回 working `event/<id>`。

默认禁止静默覆盖：目标已有同 ID 时要报冲突，或使用明确的 replace / merge 策略；策略行为必须有测试。导入后运行 doctor / integrity，并验证 replay 结果与导出前一致。

### 4.3 Purge

`learner purge` 的删除范围需要从实际 workspace inventory 推导，而不是只删固定几类路径。至少覆盖 profile、working/archived event、evidence、claims、views、reports、artifact files/index、retention、learn/problem status、subflows 和相关 pack state。删除后必须确认没有残留 learner-scoped records；若发现外部或不可识别文件，应报告而不是扩大删除范围。

## 5. V5 Metric Baseline

先实现离线、可解释、可重放的 heuristic，不追求复杂统计模型。每个报告统一返回：`metric_id`、`value`（或 null）、`status`、`numerator`、`denominator`、`sample_size`、`time_window`、`source_event_ids`、`assumptions`、`uncertainty`。

Novel Independent Transfer Rate 的最小算法：

1. 选定时间窗和 Learner cohort。
2. 分母只包含有确认 Target、Boundary snapshot、novelty 声明、独立模式和完整结果证据的 eligible transfer attempts。
3. 分子是 eligible attempts 中达到 Transfer success 判定的记录。
4. 输出 `numerator / denominator`、Target / Boundary 摘要、novelty 规则、时间窗和 source event IDs。
5. 低于项目设定的最小样本阈值时，value 可为 null，`status=insufficient_evidence`，并解释缺少什么；禁止以 0% 代替未知。

其它 Rating / Calibration / Retention / Coach Eval 指标同样要区分 heuristic、observed、insufficient，不得把缺数据当负反馈。

## 6. Skill Conformance Fixture

新增 fixture / 测试应覆盖至少以下场景，并同时验证“文档规则”和“Runtime 结果”不矛盾：

| 场景 | 关键断言 |
| --- | --- |
| Explore | 可无 Target；不产生虚假的 mastery claim |
| Practice | Target 已确认或显式 provisional；Hint Ladder 和 assisted 状态可追溯 |
| Contest | artifact 非空、Target 合法、结束后可复盘 |
| Diagnose | confirmation 前 reducer no-op，确认后才更新 |
| Review | 引用历史 Evidence / Claim，不能伪造新 Evidence |
| Upsolve / Transfer | Boundary、novelty、independent outcome 齐全，否则 insufficient |
| 外部内容 | 未 consent / 未 redacted / 未审计的 outbound 不得声称已发送 |
| Pack | install → list/get → runtime consumption 全链路可见 |

## 7. Test Matrix for Implementing Agent

建议最少新增以下回归测试；命名可适配现有测试框架：

* `target-pack-loader.test.ts`：五类 Pack schema、安装、查询、版本来源许可证、未知 ID。
* `boundary-event.test.ts`：快照、变更、引用、缺失边界、关闭 Event 门禁。
* `claim-evidence-integrity.test.ts`：不存在 Evidence、跨 Event / Learner、非法 Claim Set、确定性 rebuild。
* `contest-artifact.test.ts`：空文件、目录、hash/reference、export/import、purge。
* `migration-portability.test.ts`：旧 fixture、迁移失败保留原数据、archived index、冲突导入。
* `diagnose-confirmation.test.ts`：确认前后 State diff 和 replay。
* `transfer-metric.test.ts`：eligible 分母、novelty、Boundary、低样本 uncertainty。
* `skill-conformance.test.ts` 或离线 fixture runner：六种 Event、Hint、外部内容安全和 Pack consumption。

现有 50 个测试必须继续通过；不要用 snapshot 更新掩盖行为变化。所有临时 workspace 测试结束后要清理临时目录，并验证 cleanup 本身。

## 8. Handoff Completion Checklist

实现 Agent 交回前应提供：

* 变更文件清单和每个文件对应的 PRD 条款；
* 新增测试及其命令输出；
* build / typecheck / lint / test 全量输出；
* migration、export/import、purge、rebuild 的临时 workspace 验证结果；
* Skill conformance fixture 的运行方式；
* 最终矩阵中每项为 implemented / partial / out_of_scope，并解释 partial 的剩余风险；
* 未修改 D-001–D-014 的确认。
