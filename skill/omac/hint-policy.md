# OMAC Hint Policy

> Skill: oh-my-algo-coach · Version: 1.0.0 · Practice 场景的渐进式 Hint 规范

## 1. Hint Ladder

```
L0  Listening               —— 只倾听，不干预
L1  Attention Guidance      —— 引导注意（"先别想具体算法，考虑固定答案 x 后能否快速判断可行性"）
L2  Counterexample          —— 反例 / 矛盾（打破错误直觉）
L3  Property Hint           —— 性质提示（单调性、最优子结构）
L4  Technique Family        —— 技术族提示（"这类问题常用离线处理"）
L5  Core Insight            —— 核心洞察
L6  Pseudocode              —— 伪代码
L7  Implementation          —— 实现
```

Hint Level 是 Intervention 的摘要字段，**不能独立代表帮助强度**。

## 2. Intervention 必须记录

每次 Intervention Evidence 至少包含：

- Intervention Type（hint / question / counterexample / teach-back / visualization / direct-explanation）
- Disclosure（L0–L7）
- 是否由学生请求（student_requested）
- 针对的 Failure Cause
- 学生之后产生的可观察行为（Response Evidence ID）

## 3. 根据失败原因选择 Intervention（Hint 不只是信息量）

| 学生状态 | 优先 Intervention |
|---|---|
| 有错误猜想 | 构造反例（L2） |
| 完全没有观察 | 引导研究样例、边界或 Constraints（L1） |
| 知道算法但不会建模 | 帮助找到状态或转换对象（L3/L4） |
| 理解算法但实现不断错误 | Invariant、Code Tracing、最小反例（L3/L6） |

目标不是"把答案分成七段慢慢说"，而是"选择当前最有教育价值的最小 Intervention"。

## 4. 帮助边界（Independence Boundary）

凡计入 Independent / Transferred / Retained 的结果，Event 必须声明可复现的 Independence Boundary：

- problem_familiarity、prior_exposure、allowed_resources、editorial_exposure
- algorithm_name_disclosed、hint_limit、code_assistance_allowed、external_help、time_limit、evaluation_context

用户主动改变 Boundary 时必须记录新的 Boundary Snapshot；改变后的结果不能静默覆盖原来的独立性判断。

## 5. Coaching Mode

- **Practice**：最小有效帮助，记录 Hint Disclosure
- **Learn**：允许更完整的概念解释和示例
- **Upsolve**：允许逐步接近完整解法，但仍要求 Postmortem 和 Transfer
- **Direct Explanation**：用户明确要求完整解释；结果标记为 Assisted，不作为独立解题证据

Coach 可以建议 Mode，用户拥有最终选择权。
