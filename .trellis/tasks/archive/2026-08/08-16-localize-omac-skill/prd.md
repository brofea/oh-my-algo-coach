# 将 OMAC Skill 中文化

## Goal

将 `skill/omac/SKILL.md` 的面向 Agent 的正文与触发描述改为中文，使项目 Skill 与 PRD/参考协议的中文语境一致，同时保留 OMAC Event、CLI 命令、字段名和引用路径等机器可识别术语。

## Requirements

- [ ] 将 `SKILL.md` frontmatter 的 description 改为中文，保留完整触发范围。
- [ ] 将正文说明、流程、表格、检查清单和引用说明改为中文。
- [ ] 保留 `Learn`、`Practice`、`Upsolve`、`Contest`、`Diagnose`、`Explore`、`Direct Explanation`、`Independent`、`Assisted`、CLI 命令及字段名等协议术语。
- [ ] 不改动 `references/` 的既有协议内容、CLI 实现或 `agents/openai.yaml` 的有效结构。
- [ ] 通过 Skill Creator 校验和 `git diff --check`。

## Out of Scope

- 不翻译或重命名机器协议标识符。
- 不调整 PRD、Runtime 行为或其他 Skill 资源。
