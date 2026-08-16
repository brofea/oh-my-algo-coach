# Code-Spec: OMAC CLI Core Harness

> Package: cli · Layer: core · Owner: trellis-update-spec (V0)

## 1. Scope / Trigger

V0 Core Harness 首次实现：`.omac` workspace、Event lifecycle、Evidence/Claim/View 存储、CLI 命令。触发代码规范更新（新命令 API + 存储 schema）。

## 2. Signatures

```
omac init [--learner-id <id>] [--save-conversation]
omac event create --type <learn|practice|upsolve|contest|diagnose|explore> [--target-ids a,b] [--intent] [--mode] [--problem-ref] [--contest-ref] [--artifact] [--confirm-ended] [--platform-profile] [--domain-profile]
omac event append --event-id <id> [--op] [--status active|paused|evaluating] [--operation-id] [--content]
omac event close --event-id <id> [--operation-id]
omac event list
omac evidence append --event-id <id> [--type observation|intervention|correction|submission|import] [--actor] [--content] [--quality] [--operation-id]
omac learner claim submit --event-id <id> --skill-id <s> --assessment <a> [--confidence] [--target-id] [--evidence-ids] [--operation-id] [--supersedes]
omac learner view get [--learner-id]
omac learner purge --learner-id <id> --confirm
omac rebuild [--learner-id] [--claim-set] [--reducer-version]
omac reevaluate --event-id <id> --evaluation-run-id <r> [--assessment] [--confidence] [--evaluator-version]
omac explain-why --skill-id <s> [--learner-id]
omac report --scope event|learner [--event-id] [--format json|text]
omac doctor | integrity | migrate | export --learner-id <id> | import <pkg> [--preview|--strategy]
```

## 3. Contracts

- 所有命令 stdout 输出单个 JSON；错误输出 `{"error":{"code","message"}}` 且退出码非 0。
- `.omac/config/workspace.json`: `{schema_version, ontology_version, workspace_id, learner_id?, created_at, save_conversation?, config_version}`
- 存储: `event/<id>/event.json`(EventRecord), `evidence/evidence.jsonl`, `claims/claims.jsonl`, `learner/views/<learner>.views.json`(JSONL), `event/index/index.jsonl`。
- `learner claim submit` 仅允许 `evaluating` 状态；`event close` 内部做 evaluating→closed→archive 的原子推进。
- `operation_id` 幂等：证据/claim/event-append/close 重试返回原结果。
- `rebuild` 不调用 LLM；`reevaluate` 只追加且用 `supersedes` 指向旧 claim。

## 4. Validation & Error Matrix

| 错误 | 触发 |
|---|---|
| `no_workspace` | 未 init |
| `schema_mismatch` | workspace schema_version 与运行时不符 |
| `invalid_transition` | 非法 status 迁移 |
| `invalid_claim` | claim 提交于非 evaluating 或已归档事件 |
| `contest_gate` | contest 缺 artifact / 未确认结束 / 声明 live |
| `confirmation_required` | purge 无 --confirm |
| `validation_error` | 字段缺失/非法 |

## 5. Good / Base / Bad Cases

- Good: init → event create(practice) → append evidence → evaluating → claim submit → close(archive) → rebuild → view get → explain-why。
- Base: unknown/insufficient_evidence 正常结束 Event。
- Bad: active 阶段 claim submit → `invalid_claim`；同一 operation_id 重复 append → 返回原记录。

## 6. Tests Required

- `test/conformance.test.ts` V0.1–V0.11（init 幂等、生命周期+归档、opid 重试、unknown 结束、纠正→reevaluate→rebuild、重启持久化、contest 门槛、评估阶段门禁、assisted≠independent、export/import、双 profile 双 event type 矩阵）。

## 7. Wrong vs Correct

- Wrong: 在 `active` 阶段直接 `learner claim submit`（被接受）→ 违反 D-013。
- Correct: 仅 `evaluating` 阶段允许；`close` 内部先转 evaluating 再推进。

## 8. V1 追加（Coaching Effectiveness）

### 新命令

```
omac problem add --manifest <path> | --problem-ref <ref> [--platform --difficulty --rating --statement --tags]
omac problem list [--platform]
omac artifact add --event-id <id> --file <path> [--kind code|statement|submission|editorial]
omac artifact list [--event-id]
omac transfer-probe add --event-id <id> --target-id <t> --result <r> [--declared-before-start --prior-exposure --editorial-exposure --external-help --evidence-ids]
omac transfer-probe summary [--event-id]
omac subflow add --event-id <id> --kind debug|postmortem|teach-back|upsolve-review [kind-specific flags]
omac subflow list [--event-id]
omac view algorithm | problem-solving | misconception
omac event append ... --mode <mode> [--mode-requested-by learner|coach]   # 记录 mode 变更为 runtime evidence
```

### 契约

- Intervention evidence: `extra.intervention = {intervention_type, disclosure_level(L0-L7), student_requested, failure_cause, response_evidence_ids, content}`。
- 子流程存储 `event/subflows.jsonl`（JSONL append）；transfer probe 存储 `event/<id>/transfer-probes.jsonl`。
- Problem manifest 存储 `knowledge/problems.jsonl`；artifact 文件复制到 `.omac/artifact/<event-id>/`，索引在 `artifact/index.jsonl`。
- mode 变更写入 `evidence.jsonl`（actor=runtime, extra.mode_change={from,to,changed_at,requested_by}）。

### 错误

| code | 触发 |
|---|---|
| `invalid hint level` | hint-level 非 L0-L7 |
| `invalid transfer result` | result 非 4 值 |
| `subflow_not_found` | subflow 不存在 |

## 9. V2 追加（Learner Memory & Curriculum）

### 新命令

```
omac pack install <dir> | list | prereq <concept>
omac learn path add --event-id <id> --path <steps> | list
omac retention list [--due-only] | schedule <concept> | recall <concept> --result success|partial|fail [--form] [--event-id]
omac retention gaps [--min-delay-days <n>] | pairs
omac review add --event-id <id> --concept <c> --form <f> --result <r>
omac curriculum
```

### 契约

- Retention 存储 `learner/state/retention.jsonl`；learn path `learner/state/learn-paths.jsonl`。
- 调度窗口 [1,3,7,14,30,60] 天 × (0.5+strength) 修正；fail 后窗口重置 1 天；strength: +0.25/成功, -0.15/partial, -0.4/fail。
- Review forms: recall | small-variation | different-statement | combined-technique | novel-transfer；`review add` 同时写 retention 与 event evidence。
- Learn path steps 限制为 Top-down First 枚举（why→…→transfer）。
- gaps 默认要求延迟 ≥1 天；curriculum 优先级：review(≤40) < practice(50/65) < learn(80) < recognition(70/90)，低优先数值更紧急。

## 10. V3 追加（External Problem Ecosystem & Recommendation）

### 新命令

```
omac connector list | inspect <id>
omac editorial get <ref> [--connector <id>] | cache clear <connector>
omac problem status <ref> --status solved|attempted|untouched [--independence] [--event-id] | problem status list
omac recommend --target <id> [--mode auto|exploitation|exploration] [--limit] [--platform]
omac recommend --explain <ref>            # 注意: --explain <ref> 中 ref 是 flag 值或 command[1]
```

### 契约

- Connector registry: codeforces / atcoder（fixture 数据源，capability manifest，web:false）。
- 外部内容缓存 `.omac/knowledge/external/<connector>/<ref>.json`：source_url/source_type/retrieved_at/content_license/usage_policy/contest_status/cache_version/verified。
- 未验证来源 verified=false → 不视为长期知识；editorial 缺失或能力缺失 → degraded=true。
- Problem status 存 `learner/state/problem-status.jsonl`。
- 推荐：排除 solved/attempted；pool = 本地 manifest + connector 缓存；exploitation 按距离估计区间+coverage+novelty 排序；auto 分流（confidence<0.35 或 evidence<3 → exploration）；确定性输出。
- doctor 返回 connectors 健康检查数组。

## 11. V4 追加（Contest Domain Pack）

### 新命令

```
omac contest import --artifact <path> [--event-id <id>]
omac contest timeline --event-id <id>          # 需 event.contest_ref
omac contest analyze --event-id <id> [--learner-rating]
omac contest link-upsolve --event-id <id> --upsolve-event <id> [--problem-ref]
omac contest followups --event-id <id> | --contest-id <id>
omac view contest
```

### 契约

- Contest Artifact: `{contest:{id,platform},problems:[{problem_ref,rating,opened_minutes,submissions:[{minutes_used,verdict}]}],switches,abandons,reviewer}`；verdict ∈ AC/WA/TLE/RE/CE/MLE；完整性校验（非空 problems、opened 必须有 submission 或 abandon、时间单调）。
- 存储 `.omac/artifact/contest/<id>.json`；分析记录 `report/contest-analysis.jsonl`；upsolve 链接 `report/contest-upsolve-links.jsonl`。
- 损失归因（确定性）：never-opened→algorithm-gap；opened 15–45min 无有效提交→recognition-gap；≥45min→switch-late；≥4 次提交且 debug>thinking→debug-slow；≥2 次提交→implementation-slow（高 rating>+200→risk-management）；AC 且 ≤1 提交→无重大损失。
- `contest analyze` 写 analysis 记录（contest view 聚合）。
- 硬约束：Contest 纯赛后；live 请求拒绝；无 Contest Lock / 反作弊（D-011）。
