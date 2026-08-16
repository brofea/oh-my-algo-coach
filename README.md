# Oh My Algo Coach (OMAC)

个人自适应算法教练工作台：一个本地优先的 TypeScript CLI + Skill 协议层，用于 Learn / Practice / Upsolve / Contest / Diagnose / Explore 六类训练事件的长期闭环。优化学生未来独立解决陌生问题的能力，而不是只追求当前题目 AC。

- **产品契约**：[`docs/PRD.md`](docs/PRD.md)（含 D-001–D-014 锁定决策）
- **教练政策**：[`skill/omac/SKILL.md`](skill/omac/SKILL.md)（Coaching Constitution、Event Protocol、Hint Policy、CLI Protocol）
- **运行时**：`packages/cli`（`omac` 命令）

## 安装与初始化

要求 Node.js >= 22。

```bash
npm install
npm run build

# 初始化一个 Workspace 并绑定学习者
cd your-project/          # 在项目根目录（.omac 会建在这里）
node <repo>/packages/cli/dist/index.js init --learner-id <你的ID>
```

也可以全局链接后直接使用 `omac`：

```bash
cd packages/cli && npm link
omac init --learner-id alice
```

> `.omac/` 可能包含敏感学习数据（弱点、代码、对话、账户信息），**不要**上传到公共仓库；`.gitignore` 由你自行决定，CLI 不会自动修改。

## 一次完整训练闭环

```bash
# 1. 创建 Practice Event（Target 必须来自已注册契约；未知 Target 会被拒绝）
omac event create --type practice --target-ids algo.dp --problem-ref cf:2065C

# 2. 记录训练事实（observation / intervention，Hint 按 Ladder 记录 Disclosure）
omac event append --event-id <ev> --status active
omac evidence append --event-id <ev> --type observation --content "student states the dp state" --actor learner
omac evidence append --event-id <ev> --type intervention --intervention-type hint --hint-level L2 --content "what must the state retain?"

# 3. 独立/迁移结论必须声明 Independence Boundary（不可变快照）
omac event boundary set --event-id <ev> --target-id algo.dp

# 4. 进入评估并提交 Claim（唯一 Learner State 写入口；independent 需要 --boundary-id）
omac event append --event-id <ev> --status evaluating
omac learner claim submit --event-id <ev> --skill-id algo.dp --target-id algo.dp \
  --assessment independent --confidence 0.7 --evidence-ids <e1,e2> --boundary-id <bnd>

# 5. 关闭并读取 View / 追溯链
omac event close --event-id <ev>
omac rebuild
omac learner view get
omac explain-why --skill-id algo.dp
```

Diagnose Event 的 Claim 必须 `--student-confirmation confirmed` 才会进入 Reducer；Contest Event 要求非空 Artifact 文件与 `--confirm-ended`，且至少一个已确认 Target。

## 使用 Skill 作为教练

本仓库的 `skill/omac/` 是教练政策层，可被 Codex / Claude Code 等 Agent 加载：

- `SKILL.md` — 教练闭环、六类 Event 行为、V2–V5 行为规则、外部内容安全边界
- `references/coaching-constitution.md` — 产品目标与不可妥协原则
- `references/event-protocol.md` — Event 生命周期、Target、Boundary、Evidence、Claim
- `references/hint-policy.md` — Hint Ladder 与 Intervention 选择
- `references/cli-protocol.md` — 命令契约、写入门禁、幂等与 Replay

核心规则：**存在 `omac` 命令时不要直接写 `.omac` 文件**；提交 Assessment Claim，让 Runtime Reducer 更新 Learner View。

## 知识包（Knowledge Packs）

五类可版本化 Pack：`algorithm`、`pattern`、`misconception`、`pedagogy`、`target`。每个 Pack 含 `manifest.json`（`pack_id`、`schema_version`、`kind`、`source`、`license`、`content_files`、`dependencies`）和内容 Card。内置包在 `knowledge/packs/`；安装后的包在 `.omac/knowledge/packs/<pack_id>/`。

```bash
omac pack install --source ./my-pack        # 校验 manifest 后复制（可覆盖 builtin 同名包）
omac pack list                              # 列出内置 + 已安装包（含版本/来源/许可证/builtin 标记）
omac target get <id>   # 或: pattern/misconception/pedagogy/algorithm get <id>
omac targets                                # 查询全部 Target（builtin + 已安装包 + 本地 targets/）
```

内置包在 `knowledge/packs/`，**干净 Workspace 也会自动加载**：`pack list` / `pattern list` / `algorithm list` / `targets` 开箱即有 6 个内置包；`pack install` 同名包会覆盖 builtin 视图，`pack update` 不能原地修改 builtin 包（需先安装覆盖副本）。

安装成功的标准是 **list/get 和 Event target 校验都能看到该 Pack**；安装不会自动“可查询”，请用 `omac targets` 与 `event create --target-ids <包内ID>` 验证。

## 指标与数据治理

- `omac transfer-probe rate` — Novel Independent Transfer Rate 报告：分母只含确认 Target + Boundary + novelty 声明 + 独立模式 + 完整结果的记录；低于最小样本数输出 `insufficient_evidence`，不输出伪精确百分比。
- `omac rating` / `omac calibration` / `omac coach eval` / `omac coach gain-matrix` — 均带 `status` / `sample_size` / `source` / 不确定性说明；无数据 = `insufficient_evidence`，不是 0。
- `omac pack update <id> --source <dir> --apply` — Pack 版本升级写入 `.versions.jsonl`（`from` / `to` / `operation_id` / `result`，可重放）。
- `omac export` / `omac import` — 保留 archived Event 的目录、Event Index、Boundary 快照、Artifact（索引 + 文件）、View 与 Learner State；默认禁止静默覆盖（`reject` / `merge` / `new-learner` 策略）。
- `omac migrate` — Schema 迁移（0.9.0 → 1.0.0），迁移失败保留原数据并报告 from/to/reason。
- `omac learner purge --learner-id <id> --confirm` — 完整删除该学习者 Profile、Event、Evidence、Claim、View、Report、Artifact、State、索引与 Retention 数据，并运行 Integrity Check。
- `omac doctor` / `omac integrity` — Workspace 健康检查与完整性报告。

## 测试与质量

```bash
npm run build       # 编译 TypeScript
npm run typecheck   # tsc --noEmit
npm run lint        # typecheck + 静态检查（Pack schema / 无 console 残留）
npm test            # 全量测试（CLI 集成、Pack loader、Boundary/Event 门禁、迁移/导入导出/Purge、V5 指标、Skill Conformance Fixture）
```

测试在临时目录中运行，全部结束后清理。Skill 行为级验证见 `packages/cli/test/skill-conformance.test.ts`。

## 仓库结构

```text
docs/PRD.md                    # 产品契约（V0–V5 验收要求）
skill/omac/                    # 教练政策层（SKILL.md + references/）
knowledge/packs/               # 内置知识包（可版本化 Card）
packages/cli/src/              # omac CLI 运行时
packages/cli/test/             # 集成与 Conformance 测试
scripts/check-packs.mjs        # 静态检查（lint 用）
```
