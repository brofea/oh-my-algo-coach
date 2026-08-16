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
| `contest_gate` | contest 缺 artifact / 未确认结束 / 声明 live / 缺 target / provisional target |
| `confirmation_required` | purge 无 --confirm |
| `validation_error` | 字段缺失/非法 |
| `target_not_found` | Event 声明的 Target 无法从 canonical loader 解析（附已知列表） |
| `boundary_required` | independent/transferred/retained claim 缺 boundary-id |
| `boundary_not_found` | evidence/claim 引用不存在的 boundary snapshot |
| `evidence_not_found` / `evidence_mismatch` | claim 引用缺失 Evidence / 跨 Event 或 Learner |
| `event_closed` | 已关闭/已归档 Event 追加普通 Evidence |
| `correction_gate` | correction 缺 operation-id / supersedes / reason |
| `diagnose_confirmation_required` | diagnose claim 未带 `--student-confirmation confirmed` |
| `claim_set_error` | rebuild --claim-set 引用不存在或不属于该 Learner 的 claim |
| `invalid_pack` / `pack_exists` | pack manifest 非法 / 已安装 |
| `pattern_not_found` / `misconception_not_found` / `pedagogy_not_found` / `algorithm_not_found` | 未知 Card ID（附已知列表） |
| `migration_path` / `migration_failed` | 无迁移路径 / 迁移 apply 失败（保留原数据） |
| `import_conflict` | reject 策略下发现重复记录 |

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

## 12. V5 追加（Adaptive Coaching Research & Ecosystem）

### 新命令

```
omac rating [--learner-id]
omac calibration
omac retention model-status <concept>
omac coach eval --target <skill> [--min-events n]
omac coach policy [--min-samples n]
omac coach gain-matrix
omac visualize --kind chart|graph|ascii --view algorithm|problem-solving|retention|rating [--concept <id>]
omac plan --horizon <weeks> [--targets a,b]
omac pack update <pack-id> [--source <dir>] [--apply]
omac pack versions <pack-id>
```

### 契约

- Rating：display-layer（estimate 区间中点 × confidence×evidence 加权）；note 声明非底层模型。
- Calibration：按 problem-ref 字母分箱的 observed rate + Brier；标注 heuristic。
- Retention 高级模型：指数退避 + overdue 衰减（estimate × exp(-0.05×overdue_days)）。
- Coach eval：intervention_type → observed_count / gain_sign（按前后 claim 状态）/ insufficient（样本 < min）。
- gain-matrix：Student × Problem Type × Difficulty × Intervention 聚合，方向来自关联 claim 变化。
- Visualize：Runtime 服务输出 {kind,title,body}（ASCII），Skill 不放 Script。
- Pack 版本治理：update 默认 dry-run（upgrade-available），--apply 才删除旧目录并重装，.versions.jsonl 审计（含 from/to）。

## 13. V5.1 追加（Contract Gates / Pack Loader / Governance）

### 新命令

```
omac event boundary set --event-id <id> --target-id <t> | --boundary <json> [--operation-id]
omac event boundary list --event-id <id>
omac transfer-probe rate [--time-window-days <n>] [--min-samples <n>] [--learner-id <id>]
omac pattern list|get <id> | misconception list|get <id> | pedagogy list|get <id> | algorithm list|get <id>
```

### 契约

- **Target 校验**：所有 Event 声明的 Target 必须从 canonical loader 解析（builtin → `.omac/knowledge/targets/*.json` → 已安装 pack 的 target cards）；Explore 可无 Target；Practice 可 `--target-status provisional|unresolved|confirmed`（持久化到 EventRecord.target_status）；Contest 必须 ≥1 个 confirmed Target。
- **Boundary 快照**：`event/<id>/boundary.json` 为 append-only 快照数组；更新只追加，不改写历史；Event 保存当前 `independence_boundary_ref`；Evidence / Claim 用 `--boundary-id` 绑定（必须属于该 Event 的快照）；independent/transferred/retained claim 缺 boundary 直接拒绝。
- **Contest Artifact**：`--artifact` 必须存在、普通文件、非空；复制到 `.omac/artifact/`，写 ArtifactRecord（event_id 关联），Event 保存 `artifact_ref`。
- **关闭门禁**：closed/cancelled/archived Event 拒绝普通 Evidence；correction 需 `--operation-id --supercedes <ids> --reason`，且被修正记录必须属于同一 Event。
- **Diagnose 门禁**：diagnose Event 的 claim 必须 `--student-confirmation confirmed`，否则 `diagnose_confirmation_required`；确认前不触碰 Learner State。
- **Claim 完整性**：evidence-ids 必须存在且属于当前 Learner + Event；rebuild --claim-set 引用未知 claim 显式报 `claim_set_error`。
- **Pack Loader**：manifest 支持 canonical（`source:{type,uri?,retrieved_at?}`、`license:{id,notice?}`、`schema_version`、`content_files`）与 legacy 平铺格式（`license` 字符串等），normalize 后统一消费；card 可单对象或 `{<kind>s:[...]}` 包装；安装校验 kind + content_files 存在。
- **迁移**：MIGRATIONS 注册表（0.9.0→1.0.0：事件 schema_version stamp + archive index backfill）；用 `readWorkspaceConfigLoose` 读取旧配置；config 写入先临时文件再原子 rename；失败保留原数据；迁移后跑 integrity。
- **Export/Import 保真**：export 含 event-extra（boundary/transfer-probes/event.jsonl）、artifacts.jsonl + artifact-files、views.jsonl、retention、learn-paths、packs 引用；import 按 archive_ref 恢复 archived 目录与 index，保留原始 ID（evidence/claim 不得重新生成 ID），冲突默认拒绝（reject/merge/new-learner），结束后跑 integrity。
- **Purge 全量**：profile/event(working+archive)/evidence/claims/views/reports/artifact index+文件/subflow/retention/learn-paths/contest 分析/index；完成后返回 integrity 结果。
- **V5 指标**：每个报告输出 `status(ok|insufficient_evidence)`、`sample_size`、`source`、`uncertainty`；无数据 = insufficient，不是 0 或 error。
- **Transfer Rate**：分母 = 确认 Target + Boundary 快照 + novelty 声明 + 独立模式（independent-success/fail）+ 完整结果的 probe；分子 = independent-success；< min_samples（默认 3）→ `insufficient_evidence` + value=null，附排除原因。
- **Pack 版本审计**：`.versions.jsonl` 每行 `{pack_id, from, to, operation_id, installed_at, result}`（result ∈ no-op|upgrade-available|upgraded|failed），可重放。

## 14. V5.2 追加（Acceptance Fixes）

### 归档事件统一读取

- `getBoundaries` / `getTransferProbes` / `eventLog`（`store/event_store.ts`）通过 `eventFileAnywhere` 同时解析工作目录与归档目录；`event boundary list` / `report` / transfer metrics 对已关闭事件保持可读。

### Purge 与 Integrity

- Purge 追加：`learner/profile/<id>*`、`learner/state/problem-status.jsonl`（按 event 归属过滤）、`report/event-<id>.md`、`artifact/contest/<contest_ref>.json`。
- `integrityCheck` 追加：event index 重复项与 archived 状态一致性、claim/evidence 的 boundary 引用存在性、artifact 索引事件引用 + 文件存在性（warning）、purge 残留（problem-status/learn-paths/subflows 的孤儿 event 引用，warning）。

### Target 一致性

- claim `--target-id`、transfer-probe `--target-id`、evidence `--target-ids` 必须 ⊆ event.target_ids，否则 `target_mismatch`（`misconception.*` scope 豁免；Explore 允许空 target）。

### V5 统一元数据

- retention list/schedule/recall/model-status、coach eval/policy、plan、pack update/versions 均输出 `meta: {status, sample_size, source, uncertainty?}`（或顶层同名字段）；无数据 → `insufficient_evidence`。

### 内置 Pack

- `installedPacks` 合并 builtin registry（`knowledge/packs/`，解析自模块路径，可用 `OMAC_BUILTIN_PACKS` 覆盖）与 `.omac/knowledge/packs/`，已安装优先；`pack list` 输出 `builtin` 标记；`pack install` 只与已安装（非 builtin）判重；`pack update` 拒绝 builtin 包。

### operation_id 幂等

- `event boundary set`（按 boundary_id 或 operation_id）、`transfer-probe add`、`subflow add`、`artifact add` 支持 `--operation-id` 幂等重试（返回原记录 + `resumed:true`）。

### 其余

- `target get <id>` 新命令（带 provenance）。
- `event create --type contest` 复用 `validateArtifact`（contest.id/platform/problems 非空/verdict 合法）。
- 迁移失败回滚：apply 前快照将修改的 event.json 与 index 文件，失败时恢复并报 `migration_failed ... rolled back`。
- import merge 写入归档索引前检查 index 中是否已存在（防重复）。
