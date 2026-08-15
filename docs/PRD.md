# Oh My Algo Coach（OMAC）产品需求文档

**版本：** PRD v0.4
**产品代号：** Oh My Algo Coach / OMAC
**产品形态：** Agent Skill + TypeScript npm CLI + 项目级 `.omac` Runtime
**核心领域：** ICPC / Codeforces / AtCoder / LeetCode / 算法 / 数据结构 / 竞技编程训练

---

# 1. 产品定义

Oh My Algo Coach 是一套面向算法学习与竞技编程训练的长期 AI Agent 教练系统。

OMAC 不以“解决当前问题”为最终目标，而以：

> **提高学生未来面对陌生问题时独立完成观察、分析、建模、证明、实现和调试的概率**

作为核心优化目标。

OMAC 会持续理解：

* 学生学过什么；
* 真正掌握了什么；
* 哪些知识正在遗忘；
* 哪些错误不断重复；
* 哪类思维方式是优势；
* 哪类能力构成当前瓶颈；
* 比赛中真正损失时间的原因是什么；
* 学生在什么时候需要什么程度的帮助；
* 当前最值得进行什么训练。

每一次训练都会形成新的 Evidence，并继续影响之后的教学行为。

因此，OMAC 本质上是一套：

> **Personal Adaptive Algorithm Coaching Harness**

---

# 2. 产品愿景与原则

## 2.1 长期训练，而非单次问答

传统 AI 算法助手通常围绕：

```text
Question
→ Answer
```

工作。

OMAC 则围绕：

```text
Learner
→ Training Event
→ Evidence
→ Evaluation
→ Learner Update
→ Next Training
```

长期循环。

一次 Event 是否成功，不能只通过 AC / WA 判断。

如果学生最终没有 AC，但独立发现了关键性质、暴露了重要 Misconception，并建立了新的思考方式，这次训练仍可能拥有很高价值。

---

## 2.2 Optimize for Independence

OMAC 的长期目标不是让学生越来越擅长“使用 AI 做题”。

理想状态是：

```text
Student Capability ↑
Coach Intervention ↓
Independent Generation ↑
```

同等难度下，学生逐渐：

* 更晚需要 Hint；
* 需要更轻的 Hint；
* 更少请求算法名称；
* 更独立地完成实现；
* 更独立地 Debug；
* 最终无需 Coach 也能完成过去必须依赖 Coach 的任务。

> **成功的 Coach 应逐渐降低自己的存在感。**

---

## 2.3 Minimum Effective Help

默认给予：

> **足够推动学生继续有效思考的最少帮助。**

Practice 场景中，Coach 不应因为自己已经知道正确答案，就立即告诉学生：

* 算法名称；
* 核心 Trick；
* 完整思路；
* 伪代码；
* 实现。

帮助应当逐级增加。

完整题解是一种教学手段，而不是默认回答模式。

---

## 2.4 Evidence over Impression

学生状态不能主要建立在：

> “Coach 感觉这个学生不太会 DP。”

而应该建立在能够追溯的 Evidence 上。

例如：

> 最近四次相关 Event 中，学生三次能独立写出 Transition，但均无法在无提示情况下定义 State。

由此才能形成：

> DP State Design 可能是当前薄弱点。

OMAC 应始终区分：

```text
Fact
```

与：

```text
Interpretation
```

事实原则上不可因模型判断变化而篡改。

解释可以随着更多 Evidence 被修正。

---

## 2.5 Model is Replaceable, Learner State Belongs to the Learner

学生长期训练状态不应绑定：

* 某个 AI 模型；
* 某个 Agent；
* 某个 IDE；
* 某个云平台。

`.omac` 应成为可迁移的学生长期状态载体。

在 v0.4 中，动态数据的物理存储明确位于项目级 `.omac`；但这些数据的逻辑归属仍属于 Learner，而不是某个模型、Agent Host 或 IDE。未来用户即使更换模型或 Agent Host，也应能够通过 `.omac` 的 Schema、Export / Import 和 Migration 继续使用自己的学习历史。

---

# 3. 产品系统组成

OMAC 由四类能力构成：

```text
External Information Sources
            │
            ↓
Skill ←→ Agent Coach ←→ OMAC CLI
                           │
                           ↓
                         .omac
```

其中：

* **Skill**：定义 Agent 如何思考、如何教学、如何操作 CLI；
* **Agent Coach**：在 Skill 指导下运行的教学与推理主体，负责整合外部信息与 Learner Model 进行决策；
* **TypeScript CLI**：负责结构化运行时能力与系统操作接口；
* **`.omac`**：保存项目内学生的完整长期动态状态。

四者职责必须清晰分离。

---

## 3.1 Skill

Skill 是 OMAC 的 Intelligence / Policy Layer。

Skill 中主要包含：

* Coaching Constitution；
* Event Protocol；
* Hint Policy；
* 教学策略；
* 静态算法知识体系；
* Problem Pattern Knowledge；
* 通用 Misconception Knowledge；
* 教学方法知识；
* OMAC Ontology；
* CLI 调用协议；
* Web 使用原则；
* 各类 Event 的行为规范。

Skill 不承担以下内容：

* 学生数据存储；
* 数据库操作；
* Event 持久化；
* Rating 计算程序；
* Migration；
* 网络抓取程序；
* 可视化程序；
* 其他 Runtime Script。

> **Skill 中不放 Script。**

Skill 应主要由 Agent 可理解的声明式知识、协议和行为规范组成。

---

## 3.2 TypeScript npm CLI

OMAC Runtime Engine 以 npm package 形式提供，并使用：

> **TypeScript**

作为主要实现语言。

CLI 是 Agent 与本地 OMAC Runtime 之间稳定的能力接口。

可能承担：

* 初始化；
* `.omac` 创建；
* Event Lifecycle 管理；
* Evidence 写入；
* Learner State 查询；
* Learner Model 重建；
* 数据 Import；
* 数据 Export；
* Problem Metadata 管理；
* Rating / Mastery 计算；
* Retention 计算；
* Recommendation Support；
* Visualization；
* Report；
* Schema Migration；
* Integrity Check。

概念上的 CLI 接口可能包括：

```text
omac init
omac event ...
omac learner ...
omac evidence ...
omac import ...
omac recommend ...
omac report ...
omac visualize ...
omac migrate ...
omac doctor
...
```

具体命令、参数和内部模块划分留给后续 Technical Design。

---

## 3.3 `.omac`

`.omac` 是项目级 Runtime State，也是项目内 OMAC 动态数据的完整持久化载体。

所有具体学生的动态状态原则上都保存在项目的 `.omac` 中。项目级存储是有意选择：它让一个项目中的 Agent Host、Skill 和 CLI 共享同一份可追溯状态；跨项目使用时通过 Export / Import 迁移，而不是隐式访问用户 Home 下的全局数据。

逻辑上包括：

```text
.omac/
├── config
├── profile
├── events
├── evidence
├── learner-state
├── sessions
├── imports
├── artifacts
├── reports
└── runtime-metadata
```

数据记录应轻量化实现，并做到可迁移。`.omac` 可以被用户纳入私有版本库，但 OMAC 不自动创建 `.gitignore`；初始化和 `omac doctor` 必须提醒用户不要将其上传至公共仓库。

---

## 3.4 项目级安装原则

OMAC 初始化应尽可能保持 Local / Project Scoped。

原则上不主动修改：

* 系统 Node.js 环境；
* 全局 npm package；
* 用户 shell；
* 系统 Python；
* 用户 Home 下无关配置；
* 其他项目环境。

项目形态可以类似：

```text
project/
├── package.json
├── node_modules/
├── .omac/
└── <agent-skill-directory>/
    └── oh-my-algo-coach/
```

不同 Agent Host 的 Skill 目录可以不同，但运行时原则一致。

`omac init` 必须：

* 幂等创建 `.omac` 目录和 Schema Metadata；
* 输出 `.omac` 含有敏感学习数据、不要上传到公共仓库的明确提示；
* 不主动创建、修改或删除用户的 `.gitignore`；
* 不主动修改系统级 Node.js、npm、Shell、Python 或用户 Home 下无关配置；
* 提供显式的 `doctor`、`export` 和 `import` 入口，让用户自行管理风险和备份。

---

# 4. OMAC Knowledge Model

OMAC 需要明确区分两个世界：

```text
Knowledge Model
```

描述：

> 算法世界本身是什么。

```text
Learner Model
```

描述：

> 当前学生是什么状态。

Knowledge Model 主要位于 Skill 中，是静态、版本化、可共享的知识资产。

Learner Model 位于 `.omac` 中，是针对具体学生动态产生的数据。

Knowledge Model 不是一个庞大的算法 Wikipedia，而是一套轻量的、能更好发挥 LLM 算法推理能力的 Coaching Knowledge Pack。初步搭建可以参考 [OI Wiki](https://github.com/OI-wiki/OI-wiki)，但应以 OMAC 自有的 Pattern Card、Misconception Card 和 Pedagogy Card 为主要交付物，并保留内容来源、版本和许可证信息。

---

## 4.1 Algorithm Knowledge Graph

Algorithm Knowledge Graph 描述：

* 算法；
* 数据结构；
* 数学知识；
* 编程技巧；
* 相关概念；

以及它们之间的关系。

它不能只是：

```text
Data Structure
└── Segment Tree
    └── Lazy Segment Tree
```

还需要表达：

```text
prerequisite_of
generalizes
specializes
related_to
alternative_to
commonly_combined_with
implemented_using
requires
```

例如：

```text
Binary Search
    ↓
Binary Search on Answer
    ↓ requires
Monotonic Predicate
```

Knowledge Graph 是 Learner Model 能力定位和学习路径规划的重要基础。

---

## 4.2 Problem Pattern Graph

单纯知道算法并不意味着能够解决题目。

真正困难的一层通常是：

> **怎样从题目观察走到算法？**

因此 OMAC 需要 Problem Pattern Graph。

它连接：

```text
Observation
↓
Transformation
↓
Pattern
↓
Candidate Technique
```

例如：

```text
最大化最小值
↓
考虑固定答案 x 是否可行
↓
Feasibility 对 x 单调
↓
Binary Search on Answer
```

或者：

```text
统计区间不同元素数量
↓
重复贡献需要避免
↓
考虑一个元素最后一次出现的位置
↓
Offline Processing + BIT / Segment Tree
```

Problem Pattern Graph 应逐渐成为 OMAC 教“如何想到算法”的核心知识资产。

---

## 4.3 Generic Misconception Graph

Skill 中需要记录常见认知错误。

例如：

```text
binary-search.answer-must-exist-in-array
binary-search.boundary-confusion

dp.state-stores-too-much
dp.transition-direction-confusion

greedy.local-optimum-implies-global

graph.visited-timing-confusion
```

这表示：

> 人类通常怎样理解错。

它不同于 `.omac` 中：

> 这个学生实际出现过哪些错误。

---

## 4.4 Problem-Solving Skill Ontology

OMAC 还需要一套独立于具体算法的通用解题能力体系。

例如：

```text
Observation
Abstraction
Decomposition
Pattern Recognition
Constraint Analysis
Model Transformation
Invariant Discovery
State Design
Counterexample Construction
Case Analysis
Complexity Reasoning
Proof
```

这些能力会映射到 Learner Model，并成为 Training Target。

---

## 4.5 Contest Skill Ontology

竞技编程能力也不是 Algorithm Knowledge 的简单集合。

需要定义例如：

```text
Problem Selection
Difficulty Estimation
Time Management
Implementation Speed
Debugging
Risk Management
Strategic Switching
Persistence Calibration
Pressure Handling
```

这为 Contest Review 和长期比赛能力分析提供统一语义。

---

## 4.6 Pedagogy Knowledge

Skill 还应包含：

> 在什么情况下，什么教学手段可能有效。

例如：

```text
False Intuition
→ Counterexample

Abstract Mechanism Confusion
→ Visualization

Unable to Derive Transition
→ Dependency Question

Implementation Invariant Failure
→ Code Trace

Illusion of Understanding
→ Teach-back
```

这套知识未来可以随着 Coach Self-Evaluation 逐步扩展。

---

## 4.7 Unified Ontology

OMAC 必须建立稳定 ID。

例如：

```text
algo.dp
algo.dp.knapsack.01

algo.data-structure.segment-tree

skill.problem-solving.state-design
skill.problem-solving.abstraction

skill.contest.problem-selection

misconception.dp.state-too-large

pedagogy.counterexample
pedagogy.teach-back
```

自然语言可以变化，但内部语义 ID 应尽可能稳定。

否则长期 `.omac` 数据最终会产生不可维护的：

```text
DP
dynamic-programming
动态规划
dp
```

等大量重复概念。

Ontology 需要版本化，并具备 Migration 能力。

---

# 5. Learner Model

Learner Model 是 OMAC 对学生当前状态的动态估计。

可以理解为一个不断更新的：

> **Student Digital Twin**

它来自历史 Event 和 Evidence，而不是 Coach 随手维护的一组描述。

核心结构：

```text
Learner Model
│
├── Algorithm Ability
├── Problem-Solving Ability
├── Misconceptions
├── Contest Ability
├── Retention
├── Coach Dependency
└── Learning / Thinking Profile
```

这些不是七套互相独立的数据。

它们是同一历史 Evidence 的不同 Materialized Views。

原则：

> **One history, multiple interpretations.**

---

## 5.1 Algorithm Ability

回答：

> 学生对某个 Algorithm / Concept 到底掌握到了什么程度？

不采用简单：

```text
knows = true
```

而应支持多个维度，例如：

```text
Conceptual Understanding
Recognition
Recall
Implementation
Proof
Debugging
Generation
Transfer
Retention
```

尤其需要区分：

### Recognition

看到题解或被告知算法时是否认识。

### Recall

不看资料时能否重新描述或实现。

### Generation

没人告诉算法名称时能否自己想到。

### Transfer

能否将该知识用于与模板明显不同的问题。

竞赛真正依赖的是 Generation 与 Transfer，而不只是 Recognition。

---

## 5.2 Problem-Solving Ability

这一模型回答：

> 学生会不会“做题”，而不仅仅是会不会算法。

例如一个学生可能：

```text
Algorithm Knowledge      Strong
Implementation           Strong

Abstraction              Weak
Observation              Medium
State Design             Weak
```

此时继续教授更多新算法可能不是最有效训练。

OMAC 必须能够识别：

> Knowledge Gap

和：

> Reasoning Skill Gap

的区别。

---

## 5.3 Student Misconceptions

记录学生实际反复出现的认知错误模式。

每一个 Misconception 至少应具有：

```text
Status
Confidence
Observed Count
First Seen
Last Seen
Supporting Evidence
Contradicting Evidence
Related Concepts
```

状态可能包括：

```text
suspected
confirmed
improving
resolved
regressed
```

OMAC 必须区分：

> 一次偶然 Bug

与：

> 长期认知模型错误。

例如一次二分写错边界可能只是实现问题。

长期无法理解 Predicate Direction 则属于值得持续追踪的 Misconception。

---

## 5.4 Contest Ability

Contest Ability 关注：

> 学生在比赛环境中的实际行为。

例如学生最终能做出 C 题，并不代表比赛表现没有问题。

如果：

```text
42 min: 进入错误方向
50 min: 已经没有新信息
78 min: 才决定换题
```

真正需要训练的可能是：

```text
Strategic Switching
Persistence Calibration
```

而不是相关算法。

OMAC 必须逐渐区分：

* 不会算法；
* 没识别出来；
* 会但实现慢；
* Debug 太慢；
* 选题错误；
* 止损错误；
* 压力状态下发生低级失误。

---

## 5.5 Retention

OMAC 必须明确：

> 学过 ≠ 现在会。

对于一个 Concept，应至少区分：

```text
Recognition
Recall
Generation
Transfer
```

并记录与时间相关的信息，例如：

```text
First Learned
Last Reviewed
Last Successful Recall
Last Independent Generation
Review Count
Retention Estimate
Retention Confidence
Recommended Review Window
```

必须区分：

```text
Immediate Mastery
Long-term Retention
Transfer
```

具体遗忘数学模型留给后续设计。

---

## 5.6 Coach Dependency

OMAC 需要专门追踪学生是否产生过度 AI 依赖。

可能关注：

```text
Time Before First Hint Request
Average Hint Level
Algorithm-name Dependency
Implementation Dependency
Debug Dependency
Explanation Dependency
Independent Thinking Duration
Silent Training Performance
```

必要时 Coach 可以安排：

> Silent Training

例如：

> 前 30 分钟不提供算法 Hint，只记录学生思考。

目的不是拒绝帮助，而是保证训练结果能够转化成没有 AI 时的真实能力。

---

## 5.7 Learning / Thinking Profile

长期来看，OMAC 可以逐渐识别学生的思维习惯。

例如：

* 擅长从数据范围反推；
* 擅长构造；
* 擅长样例观察；
* 擅长形式化证明；
* 实现能力强；
* 局部观察强但抽象较弱；
* 容易过早进入代码；
* 容易被熟悉算法锚定；
* 容易过早否定一个方向。

这些信息不能成为永久标签。

它们应该：

* 有 Evidence；
* 有 Confidence；
* 可以变化；
* 只用于改善教学和训练选择。

---

## 5.8 Estimate 与 Confidence

所有能力判断都应该尽可能同时拥有：

```text
Estimate
Confidence
Evidence Count
Evidence Quality
Recency
Trend
```

例如：

```text
DP State Design

Estimate: 1620
Confidence: 0.32
Evidence Count: 3
```

与：

```text
DP State Design

Estimate: 1620
Confidence: 0.88
Evidence Count: 26
```

含义完全不同。

低 Confidence 甚至可以成为推荐训练的原因：

> Coach 需要先进一步了解学生，而不是立即优化训练难度。

这形成：

```text
Exploration
vs
Exploitation
```

问题。

---

# 6. Event Model

Event 是 OMAC 面向用户的基本训练单位，也是长期 Evidence 的主要归属边界。

OMAC 只有六种稳定的 Event Type：

```text
Learn
Practice
Upsolve
Contest
Diagnose
Explore
```

Event Type 表示 Event 的主要目的，不表示其中包含的每一个教学动作。Review、Debug、Recommendation、Contest Review、Virtual Contest、Teach-back、Postmortem 和 Visualization 都是场景、子流程、Intervention 或 Runtime Service，不得新增为 Event Type。

| Event Type | 主要目的 | 典型场景 | 是否默认更新 Learner Model |
|---|---|---|---|
| `Learn` | 建立或重建知识与技能 | 新知识教学、主动回忆、变体练习、Teach-back | 是 |
| `Practice` | 在问题解决中训练指定 Target | 做题、Debug 子流程、隐藏标签题、Transfer | 是 |
| `Upsolve` | 复盘未解决或比赛后题目并形成迁移 | Editorial 研究、原思路对比、Postmortem、迁移题 | 是 |
| `Contest` | 比赛结束后的表现复盘 | 题目选择、时间管理、换题、风险和实现分析 | 是 |
| `Diagnose` | 回答或验证学生状态问题 | Rating 卡住、能力探测、Evidence-backed Diagnosis | 仅在确认后 |
| `Explore` | 探索知识、能力和训练方向 | 新主题试探、候选 Target 发现、开放式研究 | 仅在形成有效 Evidence 后 |

其中：

* `Contest` 专指赛后总结，不表示比赛进行中的实时 Coach Event；
* Virtual Contest 是外部训练活动，结束后可以作为 Artifact 或 Import 进入 `Contest` Event；
* `Review` 可以是 `Learn` 中的知识复习，也可以是 `Practice` 中的迁移练习；
* `Debug` 通常是 `Practice` 或 `Upsolve` 内的子流程；
* `Contest Review` 是 `Contest` Event 的场景名称；
* `Problem Recommendation` 是 Training Runtime Service；
* `Teach-back`、`Postmortem` 和 `Visualization` 是 Intervention 或 Event 子流程。

所有 Event 原则上使用四阶段模型：

```text
Choose Target / Intent
          ↓
Train / Explore
          ↓
Evaluate
          ↓
Update
```

对于 `Diagnose`，Update 默认是 No-op；只有学生确认诊断结论或产生新的可追溯 Evidence 时，才创建 Learner Model 更新。对于 `Explore`，Target 可以为空或暂定，Coach 应将“发现 Target”本身作为 Event 结果之一。

---

## 6.1 Choose Target / Intent

每一次 Event 首先回答：

> **这次活动的主要目的是什么？**

`Learn`、`Practice`、`Upsolve`、`Contest` 和大多数 `Diagnose` Event 应有明确 Target。`Explore` 可以从 Intent 开始，并在训练过程中形成候选 Target。

```text
Event Type:
Practice

Target:
skill.problem-solving.state-design
```

或：

```text
Event Type:
Contest

Target:
skill.contest.strategic-switching
```

同一个 Event Type 可以训练不同能力；同一个 Target 也可以通过不同 Event Type 训练。

---

## 6.2 Train / Explore

这是学生与 Coach 的主要互动阶段。

基本循环：

```text
Student Action
↓
Coach Observation
↓
Coach Intervention
↓
Student Response
↓
...
```

这里可能产生：

* 学生思路、假设和反例；
* Hint、Question、Counterexample 或 Visualization；
* 代码、运行结果、提交结果和 Debug 过程；
* Teach-back、Postmortem 和思路转变；
* 用户对历史事实、做题经历和提示来源的纠正。

这些行为先形成带来源的 Event Evidence，再由 Evaluation 解释。Coach 不应直接把解释结果写成不可追溯的学生状态。

---

## 6.3 Evaluate

Evaluate 回答：

> **本次 Event 的 Target / Intent 实际达成到了什么程度？**

Evaluation 必须围绕 Event Type 和 Target，而不是采用万能评分表。

```text
Learn
  Understand / Explain / Simulate / Recall / Implement / Transfer

Practice
  Independent Insight / Hint Disclosure / Solve Time /
  Implementation Independence / Proof / Debug

Upsolve
  Original Failure Cause / Insight Distance / Pattern Extraction /
  Transfer Readiness

Contest
  Problem Selection / Time Usage / Direction Switching /
  Implementation / Debugging / Risk Management

Diagnose
  Evidence Sufficiency / Alternative Explanations / Confidence /
  Student Confirmation

Explore
  New Observation / Candidate Target / Knowledge Gain /
  Follow-up Value
```

Evaluation 输出的是结构化 Assessment Claim，而不是直接修改 Learner Model。

---

## 6.4 Update

Event 结束后，Evidence 被解释为 Assessment Claim，并由 Runtime Reducer 更新 Learner Model。

一次 Event 可能同时产生：

```text
Algorithm Ability ↑
Problem-Solving Ability ↑
Misconception confirmed
Retention candidate created
Coach Dependency changed
Contest skill unchanged
```

Update 还可能产生：

* 下一次 Learn / Practice / Review 场景；
* 后续 Problem Recommendation 请求；
* 新的 Target 候选；
* Misconception 追踪任务；
* Coach Teaching Evidence。

所有 Update 必须保留 Evidence、Assessment Claim、Evaluator Version 和 Reducer Version 的关联。

---

## 6.5 Event Lifecycle

Event 的状态与 Event Type 分离。状态不是新的 Event Type。

```text
draft
  ↓
active ↔ paused
  ↓
evaluating
  ↓
closed
```

任何阶段都可以进入：

```text
cancelled
```

关闭后的事实不能被静默覆盖。用户纠正、Coach 重新评估或 Schema Migration 都应追加新的记录，并通过 Replay 生成新的 Materialized View。

比赛安全状态也不是 Event Type：

```text
contest_lock = true
```

当用户明确声明正在参加比赛，或外部平台识别出正在进行的比赛时，OMAC 只允许记录非解题性的时间和行为元数据；比赛结束后才可以创建 `Contest` Event。

---

## 6.6 Event Contract

所有 Event 都应包含以下公共字段：

```text
id
event_type
schema_version
learner_id
target_ids / intent
problem_ref / contest_ref
mode
status
started_at
ended_at
provenance
```

各 Event Type 使用自己的结构化 Contract。

### Learn

```text
Input
- Concept / Knowledge Pack
- Prerequisites
- Target

Observe
- Explanation
- Manual Simulation
- Teach-back
- Recall / Implementation

Evaluate
- Understanding
- Recall
- Recognition
- Transfer

Update
- Algorithm Ability
- Retention Candidate
- Next Review Scene
```

### Practice

```text
Input
- Problem
- Target
- Coaching Mode

Observe
- Student Ideas
- Attempts
- Interventions
- Code / Run / Submission Result
- Time and Hint Disclosure

Evaluate
- Independent Insight
- Hint Dependency
- Implementation
- Proof
- Debug / Misconception

Update
- Learner Views
- Retention Evidence
- Next Target Candidate
```

### Upsolve

```text
Input
- Problem
- Original Attempt / Contest Artifact
- Editorial or Verified Solution Sources

Observe
- Original Direction
- Failure Cause
- Distance to Key Insight
- Teach-back / Transfer Attempt

Evaluate
- Pattern Extraction
- Transfer Readiness
- Misconception / Knowledge Gap

Update
- Learner Views
- Follow-up Practice Candidate
```

### Contest

```text
Input
- Finished Contest / Virtual Contest Artifact
- Problem Selection and Submission History

Observe
- Open Time
- Thinking Duration
- Direction Changes
- Switch / Abandon Time
- Submission and Debug Timeline

Evaluate
- Problem Selection
- Time Management
- Strategic Switching
- Risk Management

Update
- Contest Ability
- Contest-specific Targets
- Follow-up Practice Candidate
```

### Diagnose

```text
Input
- User Question
- Relevant Event / Evidence Scope

Observe
- Supporting Evidence
- Contradicting Evidence
- Alternative Explanations

Evaluate
- Diagnosis
- Confidence
- Evidence Sufficiency
- Student Confirmation

Update
- No-op by default
- Confirmed Diagnostic Evidence when accepted
```

### Explore

```text
Input
- User Intent or Open Topic
- Optional Target

Observe
- New Concepts
- Candidate Patterns
- Questions and Hypotheses
- Follow-up Value

Evaluate
- Knowledge Gain
- Candidate Target
- Need for Learn / Practice / Upsolve

Update
- Only confirmed and traceable Evidence
```

OMAC 应表现得更像一个具有 Protocol 的 Harness，而不是由大量互相冲突的 `if user does X...` 规则组成的 Prompt。

---

## 6.7 Target Contract

Target 不是一句自然语言愿望，而是一次 Event 可观察、可评估的训练目标。

每个 Target 至少应定义：

```text
target_id
target_version
name
category
prerequisites
observable_behaviors
success_criteria
failure_taxonomy
required_evidence
transfer_probe
evaluation_rubric
```

例如 `skill.problem-solving.state-design` 的 Success Criteria 可以包括：

* 学生能说明 State 表示什么；
* 学生能说明 State 保留了哪些必要信息；
* 学生能指出 Transition 依赖的前置状态；
* 学生能用边界或反例验证 State 是否足够；
* 学生能在未显式给出算法名称时迁移到新题面。

没有 Target Contract 时，Evaluation 很容易退化为 Coach 的主观总结。

---

## 6.8 Coaching Mode

Event Type 表示训练目的，Coaching Mode 表示当前允许的帮助边界。不同学生可以在相同 Event Type 下选择不同模式。

```text
Practice
  最小有效帮助，记录 Hint Disclosure

Learn
  允许更完整的概念解释和示例

Upsolve
  允许逐步接近完整解法，但仍要求 Postmortem 和 Transfer

Direct Explanation
  用户明确要求完整解释；结果标记为 Assisted，不作为独立解题证据

Contest Lock
  比赛期间只记录非解题性元数据，不提供解法、调试或答案
```

Coach 可以建议 Mode，但用户拥有最终选择权。用户主动提高帮助等级时，应记录为 Evidence，而不是把它视为异常。

---

# 7. Teaching System

OMAC 需要拥有明确的教学方法，而不仅仅是算法知识。

---

## 7.1 新知识教学：Top-down First

默认不采用：

```text
Definition
→ Theorem
→ Proof
→ Implementation
```

作为第一入口。

更推荐：

```text
Why
↓
Concrete Problem
↓
Core Intuition
↓
Example
↓
Visualization / Manual Simulation
↓
Abstraction
↓
Formal Algorithm
↓
Correctness
↓
Implementation
↓
Complexity
↓
Recognition
↓
Variants
↓
Transfer
```

学生应该先理解大局，再逐渐进入形式化细节。

---

## 7.2 Hint Ladder

Practice 默认使用渐进式 Hint。

概念上可以分为：

```text
L0  Listening
L1  Attention Guidance
L2  Counterexample / Contradiction
L3  Property Hint
L4  Technique Family
L5  Core Insight
L6  Pseudocode
L7  Implementation
```

例如 L1 不是：

> 用二分答案。

而可能是：

> 先别想具体算法，考虑如果我们固定答案为 x，能不能快速判断它是否可行？

Hint Level 本身也是重要 Evidence。

---

## 7.3 Hint 不只是“信息量”

Coach 应根据学生当前失败原因选择不同 Intervention。

例如：

### 学生有一个错误猜想

优先帮助构造反例。

### 学生完全没有观察

引导研究样例、边界或 Constraints。

### 学生知道算法但不会建模

帮助找到状态或转换对象。

### 学生理解算法但实现不断错误

转向 invariant、code tracing 或最小反例。

Coach 的目标不是：

> 把答案分成七段慢慢说。

而是：

> 选择当前最有教育价值的最小 Intervention。

---

## 7.4 Teach-back

重要知识不能仅通过：

> “懂了吗？”

判断掌握。

Coach 应适时要求学生：

* 重新解释算法；
* 解释 invariant；
* 解释为什么不会重复统计；
* 修改条件并判断算法是否仍然成立；
* 不看代码重新写核心逻辑；
* 给另一个人讲解。

Teach-back 是重要的主动回忆 Evidence。

---

## 7.5 Postmortem

一道有价值的问题结束后，OMAC 不应只总结正确解法。

还应该研究：

> **为什么学生最开始没有想到？**

可能包括：

* 缺 Knowledge；
* 没识别 Pattern；
* 错误假设；
* 没有构造反例；
* 忽略 Constraints；
* 不会转换统计对象；
* 过早进入实现；
* 被熟悉算法锚定；
* 复杂度判断错误；
* 太早求 Hint；
* 太早放弃；
* 错误方向坚持过久。

Postmortem 是 Misconception 与 Problem-Solving Ability 的重要 Evidence 来源。

---

## 7.6 Motivation 与教育心理

OMAC 不应该使用机械化鼓励：

> 你已经很棒了！继续加油！

替代真实诊断。

更有价值的反馈来自历史 Evidence：

> 最近三道题都明显高于你当前的独立解决区间，其中两道还依赖尚未系统训练的 State Design。连续做不出来并不能说明整体能力下降。下一组训练应该先降低难度，让你重新建立独立 AC 节奏。

或者：

> 两个月前你第一次遇到树 DP 时无法定义 State，现在基础树 DP 已经能够独立完成。最近停滞的主要是状态压缩，而不是整体 DP 能力。

鼓励应该：

```text
Specific
Evidence-based
Credible
Actionable
```

而不是空泛安慰。

---

## 7.7 Visualization

Coach 可以根据理解收益使用：

```text
ASCII
SVG / Diagram
Graph Visualization
Charts
Interactive Visualization
Animation
Manim
```

适合可视化的内容例如：

* BFS / DFS；
* Dijkstra；
* DSU；
* Segment Tree；
* Lazy Propagation；
* KMP；
* AC Automaton；
* Network Flow；
* Tree Rotation；
* Sweep Line；
* Convex Hull；
* DP State Transition；
* FFT。

但原则是：

> **Visualization is a teaching tool, not a showcase.**

简单概念不应为了炫技启动昂贵动画工作流。

程序执行与可视化能力应由 CLI / Agent Tool 提供，不在 Skill 内实现 Script。

---

# 8. Training System

OMAC 不只是被动等待学生提问，还需要帮助学生决定：

> 接下来应该训练什么？

---

## 8.1 Problem Recommendation

推荐题目不能只使用：

```text
Student Rating ± 100
```

而应综合：

* 当前 Target；
* Overall Ability；
* Algorithm Ability；
* Problem-Solving Ability；
* Misconceptions；
* Retention；
* 最近训练内容；
* 是否做过相似题；
* 题目 Novelty；
* 当前疲劳；
* 最近连续成功 / 失败；
* Contest 需求；
* Hint Dependency；
* Expected Solve Probability；
* Expected Learning Gain；
* Diagnostic Value。

长期目标应更接近：

```text
argmax Expected Learning Gain
```

而不是：

```text
argmin |problem_rating - student_rating|
```

---

## 8.2 训练与诊断

推荐系统存在两类不同目的。

### Exploitation

选择最有可能提升当前能力的问题。

### Exploration

选择最有助于理解学生真实状态的问题。

例如 Coach 对：

```text
DP State Design
```

只有很低 Confidence。

此时可能故意推荐一两道具有诊断价值的问题，再决定后续训练。

---

## 8.3 Recognition Training

OMAC 必须避免所有训练都带显式算法标签。

学生：

> 学了 20 道“树状数组练习题”

并不意味着面对未知问题能想到树状数组。

因此推荐系统应安排：

* 无标签问题；
* 不明显题面；
* 技巧组合问题；
* 算法不是唯一重点的问题。

专门训练：

```text
Recognition
Generation
Transfer
```

---

## 8.4 Spaced Review

Spaced Review 不是独立 Event Type，而是 `Learn` 或 `Practice` Event 中的一种训练场景。它可以由 Retention Model 产生，也可以由用户主动发起。

复习不能只是重复原题。

理想路径：

```text
Original Learning
↓
Recall
↓
Small Variation
↓
Different Statement
↓
Combined Technique
↓
Novel Transfer
```

Retention Model 应驱动：

* 什么需要复习；
* 什么时候复习；
* 用什么形式复习。

---

## 8.5 Upsolve

Upsolve 场景与 Practice 不同。

学生已经明确准备赛后学习时，Coach 可以逐渐提供更完整的信息。

但 Upsolve 仍然需要关注：

* 原来为什么没想到；
* 正解的核心突破口；
* 原思路距离正解有多远；
* 是否存在可迁移 Pattern；
* 以后怎样识别。

目标不是重新包装官方题解。

而是：

> **生成比题解更适合当前学生认知状态的教学过程。**

---

## 8.6 Contest Event：赛后复盘

`Contest` Event 只在比赛或 Virtual Contest 结束后创建。OMAC 不把比赛进行中的实时辅助建模为 Contest Event，也不在比赛期间提供解题、调试或答案建议。

Virtual Contest、Contest Simulation 等属于外部训练活动；结束后可以导入其 Artifact，作为 Contest Event 的输入。

赛后重点分析：

```text
Problem Open Time
Thinking Duration
Direction Changes
Submissions
WA Types
Debug Time
Switch Time
Abandon Time
```

* Problem Selection；
* Strategic Switching；
* Time Management；
* Implementation；
* Debug；
* Risk。

例如：

> 这场比赛 C 并不是算法不会。你在第 48 分钟已经没有新的有效推导，但直到第 76 分钟才换题，因此主要损失来自 Persistence Calibration。

---

## 8.7 Rating

OMAC 可以使用 Codeforces-like Rating 作为用户友好的展示层。

例如：

```text
Overall        1740
DP             1580
Graph          1810
Greedy         1900
Data Structure 1680
```

但 Rating 不应成为底层 Learner Model。

内部仍然维护更高维状态，并考虑：

```text
Estimate
Confidence
Evidence Quality
Recency
```

未来可以探索：

* Elo / Glicko；
* Bayesian；
* IRT；
* Knowledge Tracing；
* Hybrid Models。

本 PRD 不规定最终数学模型。

---

# 9. Agent Web Research & External Problem Ecosystem

OMAC 应通过 Connector 使用现代 Agent 的联网搜索和网页访问能力。

联网不是核心训练闭环的前置条件，而是 Coach 接触真实竞赛世界的可替换能力。即使没有网络，OMAC 也必须能够使用用户提供的 Problem Manifest 或本地 Artifact 完成训练。

核心原则：

> **OMAC should not be limited to preloaded problems.**

---

## 9.1 Codeforces / AtCoder First-class Support

外部生态接入后，至少应能可靠处理：

> **Codeforces**

与：

> **AtCoder**

Agent 应能够根据：

```text
CF 2065C
ABC392 F
Contest URL
Problem URL
```

主动定位并获取：

* Contest；
* Problem Statement；
* Constraints；
* Samples；
* Problem Metadata；
* Difficulty / Rating（如存在）；
* 官方 Editorial（如存在，且通过来源与内容政策检查）。

用户不应被要求每次手工复制完整题面。

---

## 9.2 Editorial as Coach Knowledge

Agent 可以在后台主动研究：

* Official Editorial；
* 官方题解；
* 高可信度社区题解；
* 不同解法。

这样 Coach 可以事先知道：

* Intended Solution；
* Alternative Solutions；
* Common Traps；
* 关键 Insight；
* 必要 Prerequisites。

但：

> **Coach 知道题解 ≠ 学生看到题解。**

Practice Event 中仍必须遵守 Hint Policy。

例如：

```text
Agent:
已经阅读官方 Editorial。

Student:
仍然只得到 Level 1 Hint。
```

这是 OMAC 的重要能力。

所有外部内容都必须带有：

```text
source_url
source_type
retrieved_at
content_license / usage_policy
contest_status
cache_version
```

如果无法确认题目状态、内容来源或平台规则，Coach 应降级为只使用用户提供的本地内容，而不是自动生成解法。

---

## 9.3 Editorial building fallback

当官方 Editorial 不存在或是一道网上没有的题目的时候，Coach 才会尝试：

1. 研究题面，尝试自己解题
2. 让用户提交或自己对拍以验证正确性
3. 生成自己的题解 / 教学过程

## 9.4 Recommendation + Web

Problem Recommendation 不应只从预置题库中选择。

Coach 可以形成类似 Search Intent：

```text
Platform:
Codeforces

Target:
DP State Design

Difficulty:
1600–1750

Avoid:
Solved Problems

Prefer:
High Educational Value
Hidden Technique
```

然后结合：

```text
Web / Platform Data
+
Learner Model
+
Training History
```

选题。

---

# 10. Evidence & Data Architecture

OMAC 要形成的是：

> 一套统一长期数据系统

而不是大量彼此无关的小 JSON。

核心原则：

> **Event is the source of history. Learner Model is derived state.**

---

## 10.1 Event Sourcing 思路

概念上：

```text
Training Event
      ↓
Immutable Event Records
      ↓
Observations / Interventions
      ↓
Assessment Claims
      ↓
Deterministic Reducers
      ↓
Learner Views
```

面向用户的 Event 是训练活动边界；Event Record 是其内部不可变的事实记录。Evidence 可以是原始 Observation，也可以是带来源的 Intervention、Submission、Import 或 User Correction。Assessment Claim 是对 Evidence 的解释，不是原始事实。

各类：

* Rating；
* Algorithm Ability；
* Misconception；
* Retention；
* Dependency；

属于可重新计算的 Materialized State。

未来 Evaluator 或 Reducer 更新时，应尽可能支持：

```text
Replay Events
→ Rebuild Learner Model
```

本 PRD 不强制采用严格的 Event Sourcing 技术实现，但要求保留这一数据思想。

LLM 不得直接覆盖 Learner Model。LLM 只能提交结构化 Assessment Claim，Runtime 负责 Schema 校验、版本记录、用户确认策略和 Materialized View 更新。

---

## 10.2 Evidence

Evidence 应记录足够结构化的信息。以下是原始 Observation 的例子：

```text
Student independently discovered monotonicity.

Student requested first hint after 17 minutes.

Student believed binary search requires answer
to exist in the input array.

Student solved after Level-2 counterexample.

Student could explain the invariant but could
not independently reimplement it.
```

Evidence 应带必要上下文，例如：

* Event；
* 时间；
* Target；
* 来源；
* Confidence；
* Problem；
* Related Concepts。

推荐区分以下记录：

```text
Observation
- 发生了什么
- 谁观察到
- 发生时间
- 原始内容或摘要

Intervention
- Coach 做了什么
- Intervention Type
- Disclosure
- 是否由学生请求

Assessment Claim
- 对哪些 Skill 做出什么判断
- 使用哪些 Evidence
- Evaluator / Model Version
- Confidence

Learner View
- Reducer 计算出的当前状态
- View Version
- 可追溯的 Claim / Evidence IDs
```

Assessment Claim 至少应具备以下机器可校验字段：

```text
claim_id
skill_id
assessment
evidence_ids
evidence_quality
confidence
evaluator_version
model_provenance
created_at
supersedes / contradicted_by
```

`confidence` 只表示当前判断的不确定性，不等同于学生能力分数，也不等同于 Evidence Quality。三者必须分开存储。

原始 Observation 和 Intervention 不因模型更新而静默修改；错误判断通过新的 Assessment Claim 或 User Correction 重新解释。

---

## 10.3 Evidence Quality

不同数据源的证明力不同。

例如：

```text
OMAC-observed Training Event
Official Contest Performance
Practice Submission
Imported History
Self Report
```

不能完全等价。

例如 Codeforces AC 可以确认：

> 某时发生过 AC。

但未必能确认：

* 是否看题解；
* 是否队友提示；
* 是否以前做过；
* 是否使用 AI。

因此 Learner Evaluator 需要考虑 Evidence Quality。

---

## 10.4 Traceability

任何重要状态都应该尽可能追溯：

```text
Learner State
↓
Evidence
↓
Event
```

用户问：

> 为什么你觉得我的 DP State Design 弱？

Coach 应可以说明：

> 最近 Event 38、42、61 中都出现了相似现象：你可以完成 Transition，但在没有 Hint 时无法得到合适 State。

---

## 10.5 用户纠正

学生必须能够纠正错误 Evidence。

例如：

> 这题我以前做过。

> 当时有人告诉了我核心思路。

> 这个提交不是我写的。

这类纠正不一定直接删除原始 Event，而应作为新的校正 Evidence 参与重新解释。

---

## 10.6 数据可迁移性

长期需要支持：

```text
Export
Import
Backup
Migration
Doctor
```

`.omac` 必须具有：

```text
Schema Version
```

以支持未来 Learner Model、Ontology 和 Event Schema 演进。

---

## 10.7 Local-first 与隐私

`.omac` 可能包含：

* 学习弱点；
* 比赛表现；
* 代码；
* 情绪与训练状态；
* 外部账号；
* 长期学习习惯。

因此默认原则：

> **Local-first**

OMAC 不自动创建或修改 `.gitignore`。`.omac` 可以由用户有意识地纳入私有版本库，但 `omac init` 和 `omac doctor` 必须持续提醒：

> **`.omac` 可能包含学习弱点、代码、对话和账号信息，不要上传到公共仓库或公开分享。**

用户应通过显式的 Export / Backup 管理副本，并自行决定私有版本库、加密存储或本地忽略策略。

---

# 11. Coach Self-Evaluation

OMAC 不应假设：

> AI 输出越完整，教学效果越好。

Coach 本身的 Intervention 也需要长期评估。

---

## 11.1 Intervention Evidence

例如：

```text
Intervention:
Counterexample

Goal:
Break false greedy intuition
```

之后观察：

```text
Student rejected old hypothesis.
Student generated own counterexample.
Student solved a related problem later.
```

这才能形成：

> Counterexample Intervention 对这个学生在此类问题上可能有效。

---

## 11.2 Self-Evaluation 目标

Coach 不应该评价：

> 我的解释写得很清楚。

而应该评价：

> **我的教学行为是否带来了真实、持续、可观察的学习变化？**

长期可以逐渐估计：

```text
Student
×
Problem Type
×
Difficulty
×
Intervention
→
Observed Learning Gain
```

---

## 11.3 Teaching Policy Adaptation

随着 Evidence 积累，Coach 可以发现：

> 这个学生对图示理解 DP 比纯文字更有效。

或者：

> 这个学生在错误 Greedy 上，用反例比直接解释正确思路更有效。

未来可以据此调整 Teaching Policy。

但 Coach Policy 也应保持：

* 可解释；
* 有 Confidence；
* 不把少量样本当成稳定结论。

---

# 12. 核心用户场景

OMAC 的用户场景统一归属于六种 Event Type。不同版本逐步实现这些场景，但不得通过增加新的 Event Type 解决功能扩展问题。

---

## 12.1 Learn

一种 Event Type。

学生：

> 教我线段树。

Coach：

* 根据 Prerequisite 判断学习起点；
* 使用 Top-down；
* 必要时可视化；
* 进行 Teach-back；
* 创建 Retention 场景或后续任务；
* 更新 Algorithm Ability。

主动回忆、重新实现、变体练习和 Spaced Review 都可以作为 `Learn` Event 内的场景。

---

## 12.2 Practice

一种 Event Type。

学生选择或由 Coach 推荐题目。

Coach：

* 建立 Target；
* 听取学生思路；
* 默认执行 Hint Ladder；
* 记录思考轨迹；
* 控制答案泄露；
* 在需要时进入 Debug 子流程；
* 完成 Postmortem 场景；
* 更新 Learner Model。

Problem Recommendation 是 Practice 的前置 Runtime Service，不是新的 Event Type。

---

## 12.3 Upsolve

一种 Event Type。

学生赛后补题。

Coach 可以：

* 联网获取题面和 Editorial；
* 对比学生原思路；
* 解释关键突破；
* 分析为什么没想到；
* 提炼 Pattern；
* 设计一道迁移练习。

Upsolve 可以包含 Editorial Retrieval、Debug、Teach-back 和 Postmortem，但这些都不改变 Event Type。

## 12.4 Contest

一种 Event Type，且只用于比赛或 Virtual Contest 结束后的复盘。

OMAC 不在比赛进行期间提供解题 Coach。比赛期间可以由用户或平台产生非解题性的外部 Artifact，赛后再导入 Contest Event。

* 记录时间；
* 记录题目选择；
* 记录提交、换题、放弃和 Debug 时间线；
* 赛后统一分析并更新 Learner Model。

重点分析：

> 哪里损失了比赛表现？

而不仅是：

> 哪道题没做出来？

严禁用户直接通过 OMAC 获取比赛答案等作弊行为。

---

## 12.5 Diagnose

一种可以轻量运行的 Event。

用户可以询问：

> 为什么我最近 Rating 卡住了？

Coach 应综合：

* Training History；
* Contest Performance；
* Algorithm Ability；
* Problem-Solving；
* Misconceptions；
* Dependency；
* Retention；

给出 Evidence-backed Diagnosis。

Diagnose 默认不直接修改 Learner Model。学生确认诊断，或 Coach 产生新的可追溯 Evidence 后，才写入 Diagnostic Evidence。

---

## 12.6 Explore

一种 Event Type，用于没有预设单一 Target 的探索活动，例如：

* 探索一个新算法或数据结构；
* 比较多个候选 Technique；
* 发现学生可能的 Knowledge Gap 或 Reasoning Skill Gap；
* 试探适合当前学生的教学方式；
* 发现下一次 Learn、Practice 或 Upsolve 的候选方向。

Explore 不以“完成一题”作为唯一成功标准。它可以以新的 Observation、候选 Target、待验证假设或后续 Event 建议结束。

---

## 12.7 场景与 Event Type 映射

| 场景 / 功能 | 所属 Event Type 或层级 |
|---|---|
| Review / Spaced Review | `Learn` 或 `Practice` 内的训练场景 |
| Debug | `Practice` 或 `Upsolve` 内的子流程 |
| Contest Review | `Contest` Event 的场景 |
| Virtual Contest / Contest Simulation | 外部训练活动，结束后导入 `Contest` |
| Problem Recommendation | Training Runtime Service |
| Teach-back | Intervention / Evaluation 子流程 |
| Postmortem | `Practice`、`Upsolve` 或 `Contest` 内的场景 |
| Visualization | Intervention |
| Learner Diagnosis | `Diagnose` Event |

---

# 13. 产品成功指标

OMAC 的成功不能主要通过：

> 用户每天问 AI 多少次。

衡量。

一些可能的核心指标包括：

- Independent Solve Rate: 相同难度下独立解决概率是否提高。
- Intervention Requirement: 同类问题平均需要的 Hint 是否降低。
- Generation Success: 没有显式算法标签时是否能自己想到方法。
- Transfer Success: 能否将知识迁移到不同题面和组合场景。
- Retention: 数周、数月以后是否仍然能够主动使用。
- Misconception Recurrence: 已识别 Misconception 是否减少。
- Contest Performance: 比赛行为和成绩是否改善。
- Recommendation Quality: 推荐是否位于合适训练区间。
- Calibration: OMAC 对学生能力和 Solve Probability 的判断是否准确。
- Coach Effectiveness: 不同 Intervention 是否实际产生 Learning Gain。
- Dependency: 学生能力增长是否伴随着合理下降的 AI Intervention。

这些指标不能直接作为没有上下文的单一分数。每个指标都必须附带：

```text
metric_definition
denominator
event_type
target_scope
time_window
independence_boundary
evidence_quality
confidence
```

OMAC 应根据当前已经启用的产品能力选择适用指标。Independent Solve Rate 必须明确“独立”的边界，例如是否允许某类 Hint、是否看过 Editorial、是否做过同题；否则不同 Event 之间不可比较。

---

# 14. 产品边界与实现注意事项

OMAC 的完整愿景很大，因此采用 V0–V5 六阶段交付。每个阶段都有清晰的目标和验收标准；阶段名称不是新的 Event Type。

V0–V5 共同围绕以下长期闭环演进：

> **打通长期闭环，而不是一次做完所有智能化能力。**

最重要的流程是：

```text
Init
↓
Know Student
↓
Choose Target
↓
Run Event
↓
Record Evidence
↓
Evaluate
↓
Update Learner
↓
Use History in Next Event
```

如果这一循环真正成立，OMAC 就已经从一个 Prompt 变成了 Harness。

---

## 14.1 V0：Local Coaching Loop

目标：在不依赖外部平台、不依赖复杂数学模型的前提下，打通 OMAC 的最小长期闭环。

交付内容：

* Agent Skill、TypeScript npm CLI 和项目级 `.omac` 初始化；
* 六种 Event Type 的稳定 Schema 和 Event Lifecycle；
* `Practice` 的完整垂直切片；
* `Diagnose` 和 `Explore` 的基础流程；
* `Learn` 的基础知识输入与总结流程；
* Event / Evidence / Intervention Persistence；
* Observation、Assessment Claim 和 Learner View 的基础数据契约；
* 基础 Schema Validation、Replay、Migration、Export、Import 和 Doctor；
* Evidence Traceability 和用户纠正；
* 基础 Learner Summary 与 Event Report；
* Contest Lock Policy：识别或手动声明比赛期间时，不提供解题辅助；
* `.omac` 公共仓库风险提示，不自动创建或修改 `.gitignore`。

V0 不要求自动搜索题目、完整 Knowledge Graph、准确 Rating 或高级 Retention Model。

V0 验收标准：

```text
Init
→ Start Event
→ Record Evidence
→ Evaluate
→ Update Learner
→ Explain Why
→ Rebuild from History
```

进程重启后 Event 不丢失；Learner View 可以追溯到 Evidence；修改或纠正 Assessment Claim 后可以 Replay；下一次 Event 可以读取上一 Event 的结果。

## 14.2 V1：Practice & Upsolve

目标：验证 OMAC 最核心的教学差异——最小有效帮助能否提高独立解题能力。

交付内容：

* 完整 Hint Policy 和 Intervention Disclosure 记录；
* Practice 的 Target Contract 与 Target-specific Rubric；
* Teach-back、Postmortem、Transfer Probe；
* Practice 内的 Debug 子流程；
* Upsolve Event；
* 原始思路、失败原因、关键突破口和迁移准备度分析；
* 用户主动提供的题面、Problem Manifest 和本地题目 Artifact；
* Algorithm Ability、Problem-Solving Ability 和 Misconception 的基础 Materialized Views；
* Assisted / Independent 训练结果区分；
* 允许学生按模式选择帮助程度：Practice、Learn、Upsolve 或 Direct Explanation。

V1 验收重点：同类问题中，独立解决、首次提示时间、Hint Disclosure 和 Transfer Probe 结果能够被稳定记录，并影响后续 Target 或 Intervention 选择。

## 14.3 V2：Learn & Retention

目标：把一次性做题训练扩展为知识建立、主动回忆和延迟迁移。

交付内容：

* Learn Event 的完整教学流程；
* Prerequisite、Algorithm Knowledge Pack 和 Pattern Card 基础版本；
* Review 作为 Learn / Practice 内场景的统一协议；
* Recall、Recognition、Generation、Transfer 的区分；
* 基础 Retention Schedule，不要求一开始使用复杂遗忘模型；
* Small Variation、Different Statement、Combined Technique 和 Novel Transfer；
* 教学 Intervention 的即时结果与延迟结果关联。

V2 验收重点：学生在间隔一段时间后，仍能主动回忆、解释或迁移已训练内容；系统能区分“当时听懂”与“后来仍会”。

## 14.4 V3：Problem Ecosystem & Recommendation

目标：让 OMAC 从用户主动提供题目，演进到可审计的外部题目生态和基础推荐。

交付内容：

* Codeforces、AtCoder 等 Platform Connector；
* Problem、Contest、Submission、Editorial 的来源、版本和缓存；
* 题目状态、已做记录、题面和 Editorial 使用政策；
* 基于过滤、Target Coverage、难度、Novelty 和历史的确定性推荐基线；
* Exploration 与 Exploitation 的基础分流；
* Web 失败、限流、题面缺失和 Editorial 不存在时的离线降级；
* Problem Pattern Card 与题目实例的关联；
* Connector Capability Manifest。

V3 验收重点：推荐可解释、可复现、可排除已做题；网络不可用时不破坏已有训练；来源和内容政策可追溯。

## 14.5 V4：Contest Retrospective

目标：把 Contest Event 做成严格的赛后复盘系统，而不是实时解题助手。

交付内容：

* 比赛和 Virtual Contest Artifact 导入；
* 题目打开时间、思考时间、换题、放弃、提交和 Debug 时间线；
* Problem Selection、Strategic Switching、Time Management、Risk Management 分析；
* Contest Ability Materialized View；
* 赛后 Upsolve 的关联；
* Contest Lock 的平台状态识别、用户确认和审计日志；
* 赛后生成 Follow-up Practice / Learn Event 建议。

V4 验收重点：系统能够说明“比赛表现损失发生在哪里”，并区分算法不会、没有识别、实现慢、Debug 慢和止损过晚。

## 14.6 V5：Adaptive Coaching Ecosystem

目标：在前面阶段积累足够 Evidence 后，发展更成熟的自适应 Coach 生态。

交付内容：

* 更成熟的 Rating、Calibration 和 Solve Probability；
* 高级 Retention Model；
* Coach Intervention Self-Evaluation；
* Student × Problem Type × Difficulty × Intervention 的 Observed Learning Gain；
* 教学 Policy 的可解释自适应；
* 更多 Agent Host 与 Platform Connector；
* Interactive Visualization 和可复用教学工具；
* Long-term Curriculum Planning；
* Knowledge / Pattern / Misconception Pack 的社区协作与版本治理。

V5 不是构建一个不可解释的“学生数字替身”，而是在 Evidence、Confidence、Traceability 和用户控制的前提下，逐步提高 Coach 的自适应能力。

---

## 14.7 非目标

OMAC 不是要做这些事：

- 自建完整 Online Judge——优先利用现有 Judge / Runner。
- 自建完整题库——优先通过 Web 和现有平台获取真实题目。
- 取代 Codeforces / AtCoder / LeetCode——OMAC 是 Coaching Layer，而不是新的竞赛平台。
- 一次性构建完美知识图谱——Knowledge Model 应允许版本化持续演进。
- 用一个数字定义学生——Rating 只是摘要。
- 自动保证 Rating 提升——OMAC 优化训练过程，但不能承诺竞技结果。
- 让 AI 代替学生思考——这与产品核心目标相反。

---

## 14.8 关键开放问题

以下问题交由后续 Architecture / RFC 阶段进一步确定。

### Storage

`.omac` 最终使用 SQLite、JSONL、Embedded DB 或混合形式？

### Graph Representation

Knowledge Graph 与 Learner Graph 在逻辑上是 Graph，但工程上是否需要 Graph Database？

### Evaluator

如何减少 LLM 对 Learner State 的随意修改？

如何设计 Rubric、Confidence 与 Reducer？

### Rating

怎样将内部能力估计与 Codeforces Rating 尺度 Calibration？

### Retention

使用经典遗忘模型、FSRS 思路还是针对算法学习定制？

### Recommendation

如何估计：

```text
Solve Probability
Expected Learning Gain
Diagnostic Value
```

### Problem Metadata

Codeforces、AtCoder 等平台的数据获取、缓存与更新策略如何设计？

### Knowledge Maintenance

Algorithm / Pattern / Misconception Graph 如何维护：

* Manual Curated；
* Agent Assisted；
* Community Contribution；
* Hybrid？

### Coach Self-Evaluation

如何进行教学 Intervention 的长期效果归因？

### Host Compatibility

不同 Agent Host 的 Skill 结构、Tool 能力、Web 能力不同，应如何设计兼容层？

---

# 15. OMAC 核心抽象

整个产品最终围绕六个核心概念运行：

```text
Knowledge
Learner
Event
Evidence
Intervention
Evaluation
```

它们之间的关系是：

```text
              Knowledge
                  │
                  ↓
Learner → Choose Target
                  │
                  ↓
            Intervention
                  │
                  ↓
                Event
                  │
                  ↓
              Evidence
                  │
                  ↓
             Evaluation
                  │
                  ↓
               Learner
```

其中：

> **Knowledge 是 Coach 对算法世界的认识。**

> **Learner 是 Coach 对当前学生的动态认知。**

> **Event 是训练的基本单位。**

> **Evidence 是发生过的、有教育意义的事实。**

> **Intervention 是 Coach 的教学行动。**

> **Evaluation 是从 Evidence 到 Learner Update 的桥梁。**

而用户始终看到的是最简单的四步：

```text
Choose Target
→
Train
→
Evaluate
→
Update
```

---

# 16. 最终产品定位

Oh My Algo Coach 不应该成为：

> 一个特别会写题解的 AI。

真正的目标是：

> **一个长期理解学生，并持续设计下一次最佳训练的算法教练系统。**

它既知道：

* 算法是什么；
* 一道题为什么这样做；
* 人通常在哪里理解错；

也知道：

* 这个学生过去怎么想；
* 哪些错误已经出现过；
* 哪些知识正在遗忘；
* 哪些能力真正限制着当前水平；
* 现在给多少帮助最合适；
* 下一道题应该训练什么。

最终最理想的用户反馈不是：

> “OMAC 帮我把这道题做出来了。”

而是：

> **“以前这种题我必须问 OMAC，现在我已经能自己想出来了。”**

这应当成为 Oh My Algo Coach 最核心的产品价值。

---

# 17. 评审决策记录

## v0.4 PRD

* OMAC 面向多类型学生，通过 Learner Profile、Target 和 Coaching Mode 适配差异，不预设单一 ICP。
* 所有项目内动态状态保存在项目级 `.omac`；不自动创建 `.gitignore`，但必须提醒用户不要上传公共仓库。
* Event Type 固定为 `Learn`、`Practice`、`Upsolve`、`Contest`、`Diagnose`、`Explore`；其他名称均为场景、子流程、Intervention 或 Runtime Service。
* `Contest` 只表示赛后复盘；具体 V0–V5 交付路线保留在第 14 节。
