# Oh My Algo Coach（OMAC）产品需求文档

**版本：** PRD v0.3
**产品代号：** Oh My Algo Coach / OMAC
**产品形态：** Agent Skill + TypeScript npm CLI + 项目级 `\.omac` Runtime
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

未来用户即使更换模型或 Agent Host，也应能够继续使用自己的学习历史。

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
                        \.omac
```

其中：

* **Skill**：定义 Agent 如何思考、如何教学、如何操作 CLI；
* **Agent Coach**：在 Skill 指导下运行的教学与推理主体，负责整合外部信息与 Learner Model 进行决策；
* **TypeScript CLI**：负责结构化运行时能力与系统操作接口；
* **`\.omac`**：保存学生长期动态状态。

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
* `\.omac` 创建；
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

## 3.3 `\.omac`

`\.omac` 是项目级 Runtime State。

所有具体学生的动态状态原则上都保存在 `\.omac` 中。

逻辑上包括：

```text
\.omac/
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

数据记录应轻量化实现，并做到可迁移。

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
├── \.omac/
└── <agent-skill-directory>/
    └── oh-my-algo-coach/
```

不同 Agent Host 的 Skill 目录可以不同，但运行时原则一致。

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

Knowledge Model 不是一个庞大的算法 Wikipedia，而是一套轻量的，能更好发挥出 LLM 在算法上的推理能力的指导书，初步搭建可以克隆仓库 [OI Wiki](https://github.com/OI-wiki/OI-wiki) 并参考

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

Event 是 OMAC 的基本训练单位。

所有有意义的训练活动，都应当归属某一个 Event。

例如：

* 学习新算法；
* 做一道题；
* 补题；
* Debug；
* 复习；
* Virtual Contest；
* Contest Review；
* 学习路线诊断；
* 赛前准备。

所有 Event 统一使用四阶段模型：

```text
Choose Target
      ↓
Train
      ↓
Evaluate
      ↓
Update
```

---

## 6.1 Choose Target

每一次 Event 首先回答：

> **这次训练到底为了什么？**

需要区分：

### Event Type

学生现在正在进行什么活动。

例如：

```text
Learn
Practice
Upsolve
Review
Debug
Contest
Contest Review
Diagnose
Explore
```

### Target

这次真正训练什么能力。

例如：

```text
Event Type:
Practice

Target:
DP State Design
```

或：

```text
Event Type:
Contest Review

Target:
Strategic Switching
```

又或者：

```text
Event Type:
Learn

Target:
Fenwick Tree
```

同一个 Event Type 可以训练不同能力。

同一个能力也可以通过不同 Event Type 训练。

---

## 6.2 Train

Train 是学生与 Coach 的主要互动阶段。

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

* 学生思路；
* 假设；
* 反例；
* Hint；
* 实现；
* Debug；
* 可视化；
* Teach-back；
* 提交结果；
* 思路转变。

这些行为形成 Event Evidence。

---

## 6.3 Evaluate

Evaluate 回答：

> **本次 Target 实际达成到了什么程度？**

Evaluation 必须围绕 Target，而不是采用万能评分表。

例如 Learn Event 可能检查：

```text
Understand
Explain
Simulate
Recall
Implement
Recognize
Transfer
```

Practice Event 可能检查：

```text
Independent Insight
Hint Level
Solve Time
Implementation Independence
Proof
Debug
```

Contest Event 可能检查：

```text
Problem Selection
Time Usage
Direction Switching
Implementation
Debugging
Risk Management
```

---

## 6.4 Update

Event 结束后，Evidence 被解释并用于更新 Learner Model。

一次 Event 可能同时更新：

```text
Algorithm Ability ↑
Problem-Solving Ability ↑
Misconception confirmed
Retention schedule created
Dependency slightly ↑
Contest skill unchanged
```

Update 还可能产生：

* 下一次 Review；
* 后续 Problem Recommendation；
* 新的 Target 候选；
* Misconception 追踪任务；
* Coach Teaching Evidence。

---

## 6.5 Event Contract

不同 Event Type 应拥有自己的结构化 Contract。

例如 Practice Event：

```text
Input
- Problem
- Target

Observe
- Student Ideas
- Attempts
- Hints
- Code
- Result

Evaluate
- Insight Independence
- Hint Dependency
- Implementation
- Mistakes

Update
- Learner State
- Retention
- Next Training
```

Learn / Review / Contest 等拥有自己的 Contract。

这样可以避免 Skill 最终演化为数百条互相冲突的：

```text
if user does X...
if user says Y...
```

OMAC 应表现得更像一个具有 Protocol 的 Harness。

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

## 8.6 Contest Training

OMAC 应支持：

* Virtual Contest；
* Contest Simulation；
* Contest Review。

比赛中重点记录：

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

赛后再结合结果分析：

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

OMAC 必须会用现代 Agent 的联网搜索和网页访问能力。

联网不是附加功能，它是 Coach 接触真实竞赛世界的基础能力。

核心原则：

> **OMAC should not be limited to preloaded problems.**

---

## 9.1 Codeforces / AtCoder First-class Support

第一阶段至少应能可靠处理：

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
* 官方 Editorial（如存在）。

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
Evidence
      ↓
Evaluators / Reducers
      ↓
Learner Model
```

Event 和 Evidence 是长期历史。

各类：

* Rating；
* Algorithm Ability；
* Misconception；
* Retention；
* Dependency；

属于可重新计算的 Materialized State。

未来 Evaluator 更新时，应尽可能支持：

```text
Replay Events
→ Rebuild Learner Model
```

本 PRD 不强制采用严格的 Event Sourcing 技术实现，但要求保留这一数据思想。

---

## 10.2 Evidence

Evidence 应记录足够结构化的信息，例如：

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

`\.omac` 目录里应该有一份写着一个 `*` 的 `.gitignore`。

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

OMAC 第一阶段至少需要覆盖以下场景。

---

## 12.1 Learn

一种主要的 Event Type。

学生：

> 教我线段树。

Coach：

* 根据 Prerequisite 判断学习起点；
* 使用 Top-down；
* 必要时可视化；
* 进行 Teach-back；
* 创建 Retention 后续任务；
* 更新 Algorithm Ability。

---

## 12.2 Practice

一种主要的 Event Type。

学生选择或由 Coach 推荐题目。

Coach：

* 建立 Target；
* 听取学生思路；
* 默认执行 Hint Ladder；
* 记录思考轨迹；
* 控制答案泄露；
* 完成 Postmortem；
* 更新 Learner Model。

---

## 12.3 Upsolve

一种主要的 Event Type。

学生赛后补题。

Coach 可以：

* 联网获取题面和 Editorial；
* 对比学生原思路；
* 解释关键突破；
* 分析为什么没想到；
* 提炼 Pattern；
* 设计一道迁移练习。

---

## 12.4 Review

一种主要的 Event Type。

根据 Retention Model：

* 主动回忆；
* 重新实现；
* 做变体；
* 做隐藏标签问题；
* 测试 Transfer。

---

## 12.5 Debug

一般是 Practice Event 的一部分。

Coach 不只找 Bug。

还需要判断：

```text
Implementation Error
vs
Conceptual Error
vs
Invariant Error
```

若属于纯实现错误，避免重新讲完整算法。

若反复出现，则可能形成 Debug / Misconception Evidence。

---

## 12.6 Problem Recommendation

一般是 Practice Event 的一部分。

学生：

> 我不知道今天做什么。

Coach 根据 Learner Model 和 Web：

* Choose Target；
* 搜索候选题；
* 排除已做题；
* 考虑 Learning Gain；
* 给出少量解释；
* 创建 Event。

---

## 12.7 Contest

一种主要的 Event Type。

OMAC 主要进行赛后 Review

* 记录时间；
* 记录题目选择；
* 赛后统一分析，更新 Learner Model。

重点分析：

> 哪里损失了比赛表现？

而不仅是：

> 哪道题没做出来？

严禁用户直接通过 OMAC 获取比赛答案等作弊行为。

---

## 12.8 Diagnose

一种轻量的 Event，不需要记录在案

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
  
---

# 14. 产品边界与实现注意事项

OMAC 的完整愿景很大。

V1 的目标应该是：

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

## 14.1 V1 建议核心能力

V1 优先完成：

* Skill；
* TypeScript npm CLI；
* 项目级初始化；
* `.omac`；
* Stable Ontology 基础；
* Event Protocol；
* Learn Event；
* Practice Event；
* Upsolve Event；
* Review Event；
* Hint Ladder；
* Teach-back；
* Event / Evidence Persistence；
* Algorithm Ability 基础模型；
* Problem-Solving Ability 基础模型；
* Misconception 基础模型；
* Retention 基础模型；
* Evidence Traceability；
* Codeforces 数据导入基础；
* Codeforces / AtCoder Web Retrieval；
* Editorial Retrieval；
* Problem Recommendation 基础；
* Learner Summary；
* Event Report；
* Schema Version / Migration 基础；
* Export / Import 基础。

---

## 14.2 后续演进

后续可以逐渐增加：

* 更高级 Rating；
* 完整 Contest Digital Twin；
* Virtual Contest 自动分析；
* 高级 Problem Recommendation；
* Expected Learning Gain 模型；
* Coach Teaching Policy Learning；
* 更成熟的 Retention Model；
* 更多平台；
* Interactive Visualization；
* Manim Pipeline；
* Thinking Style 建模；
* 长期 Curriculum Planning；
* 更成熟的 Student Digital Twin。

---

## 14.3 非目标

OMAC 不是要做这些事：

- 自建完整 Online Judge——优先利用现有 Judge / Runner。
- 自建完整题库——优先通过 Web 和现有平台获取真实题目。
- 取代 Codeforces / AtCoder / LeetCode——OMAC 是 Coaching Layer，而不是新的竞赛平台。
- 一次性构建完美知识图谱——Knowledge Model 应允许版本化持续演进。
- 用一个数字定义学生——Rating 只是摘要。
- 自动保证 Rating 提升——OMAC 优化训练过程，但不能承诺竞技结果。
- 让 AI 代替学生思考——这与产品核心目标相反。
- 
---

## 14.4 关键开放问题

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

# 17. OMAC 核心抽象

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

# 18. 最终产品定位

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
