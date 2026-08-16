# 重写 OMAC Codex Skill

## Goal

对照 `docs/PRD.md` 重写 `skill/omac`，把现有散落且触发与执行边界不清的协议文档整理为符合 Codex Skill Creator 规范的可发现 Skill 包。Skill 负责 OMAC Coach 的声明式政策、Event/Evidence/Hint/CLI 协议和行为流程；继续保持 Runtime、`.omac` 数据和脚本实现属于 CLI，不把实现逻辑塞回 Skill。

## What I already know

- 用户要求“对照 PRD 重新撰写 skill”，并明确要求使用 Codex `skill-creator`。
- 当前 `skill/omac` 只有 `cli-protocol.md`、`coaching-constitution.md`、`event-protocol.md`、`hint-policy.md`，没有 `SKILL.md` 或 `agents/openai.yaml`。
- PRD §3.1 将 Skill 定义为 Intelligence / Policy Layer；禁止在 Skill 中存储学生数据、持久化 Event、计算 Rating、Migration、网络抓取、可视化程序和其他 Runtime Script。
- PRD §6 规定只有六种 Event Type：Learn、Practice、Upsolve、Contest、Diagnose、Explore；统一主循环为 Choose Target / Intent → Train / Explore → Evaluate → Update。
- PRD §6.5、§6.8、§6.9 规定 Event lifecycle、Coaching Mode 和 Independence Boundary；PRD §7 规定 Top-down First、Hint Ladder、Teach-back、Postmortem 和 evidence-based feedback。
- CLI Core Spec 规定所有面向 Agent 的命令使用单 JSON 输出；Claim 只能在 evaluating 阶段提交；`rebuild` 不调用 LLM，`reevaluate` 只追加 Claim；写操作使用 `operation_id` 幂等重试。

## Requirements

- [ ] 提供符合 Skill Creator 规范的 `skill/omac/SKILL.md`，包含仅有 `name` 和 `description` 的 YAML frontmatter。
- [ ] 在 frontmatter description 中写清 OMAC Skill 的职责和触发场景，而不是把触发条件只写在正文。
- [ ] 保留并重写 Constitution、Event Protocol、Hint Policy、CLI Protocol 四类内容；消除互相重复、与 PRD 冲突或容易误导 Agent 的规则。
- [ ] 明确 Skill 的运行流程：读取 Workspace/Learner Context → 选择 Event/Target/Mode/Boundary → 训练并记录 Evidence → evaluating 阶段提交 Claim → close/archive → 读取 View/Explain → 规划下一 Event。
- [ ] 明确六种 Event Type、状态生命周期、Contest 赛后门槛、Direct Explanation 不计 Independent、unknown/insufficient_evidence 合法，以及 active/paused 禁止写 Claim。
- [ ] 将 CLI 命令按初始化、Event、Evidence/Intervention、Learner/Claims、Replay/Explain、迁移/健康检查、V1/V2/V3/V4/V5 扩展组织；只引用已在项目 CLI/规范中存在的命令。
- [ ] 明确不可信外部内容、隐私、凭据、外发同意和 `.omac` 公共仓库风险边界。
- [ ] 提供 `skill/omac/agents/openai.yaml`，其 UI 元数据与 `SKILL.md` 一致；不添加未经用户提供的品牌字段。
- [ ] 不在 `skill/omac` 添加 Script；详细协议可以作为一层 references，但保持入口 Skill 简洁且总正文低于 Skill Creator 建议上限。

## Acceptance Criteria

- [ ] `SKILL.md` 与 `agents/openai.yaml` 通过 Skill Creator `quick_validate.py`。
- [ ] 文档中的六种 Event、状态、Hint L0–L7、Claim 写入门禁、Contest 门槛和 Replay 规则与 PRD/CLI Spec 一致。
- [ ] `rg` 检查不存在把 Review、Debug、Teach-back、Postmortem、Recommendation 或 Visualization 写成第七种 Event Type 的表述。
- [ ] `git diff --check` 通过。
- [ ] 项目 TypeScript build/typecheck/test 不因本次 Skill 文档改动回归；至少运行与文档/协议相关的现有验证命令并记录结果。

## Definition of Done

- Skill 入口、元数据、协议引用结构完成。
- 所有变更可从 PRD 条款或 CLI Core Spec 追溯。
- Skill Creator 校验和项目验证完成。

## Out of Scope

- 不修改 `packages/cli` 的 Runtime 实现、数据 Schema 或测试行为。
- 不创建新的 Event Type，不实现网络 Connector、Rating、Retention、Visualization 或其他 Runtime Script。
- 不把 Skill 安装到用户 Home 或全局 Codex 目录；本任务只更新仓库内交付的 `skill/omac` 包。

## Technical Notes

- Skill Creator 规范：`/Users/brofea/.codex/skills/.system/skill-creator/SKILL.md`。
- 产品规范：`docs/PRD.md`，重点章节 §3.1、§6、§7、§10、§14.1–14.3、§15。
- 项目规范：`.trellis/spec/cli/core/omac-cli-core-spec.md` 与 `.trellis/spec/guides/`。
