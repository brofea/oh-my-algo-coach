# Oh My Algo Coach（OMAC）产品需求文档

**版本：** PRD v0.6
**产品代号：** Oh My Algo Coach / OMAC
**产品形态：** Agent Skill + TypeScript npm CLI + 项目级 `.omac` Runtime
**核心领域：** ICPC / Codeforces / AtCoder / LeetCode / 算法 / 数据结构 / 竞技编程训练

---

# 0. 文档结构与使用方式

本 PRD 保持为单一文件，便于早期人工通读、审阅和同步决策。章节按照以下四个章群组织；章群是阅读与评审边界，不额外拆分为多个 PRD 文件。

| 章群 | 章节 | 主要回答的问题 |
|---|---|---|
| Product Contract | 1–2、12–13 | OMAC 为谁解决什么问题，用户如何判断它是否有效 |
| Runtime Contract | 3、6、10、15 | Agent、CLI、`.omac`、Event 和数据如何协作 |
| Coaching Knowledge & Policy | 4–5、7–8 | Coach 知道什么，如何教学，如何理解 Learner |
| Ecosystem & Delivery | 9、11、14、16–17 | 外部生态、长期演进、交付边界和版本决策 |

本文件中：

* **必须**表示当前版本的产品或运行时契约；
* **应该**表示默认行为或推荐设计，可通过 RFC 调整；
* **可以**表示未来能力、实验方向或候选方案；
* 章节中的技术实现细节服务于产品契约，不替代后续 Technical Design / RFC。

OMAC 的通用性是 Harness 层的产品边界，不要求统一架构预置所有平台、题库和教学内容。平台、领域、训练目标和学生水平通过 Profile、Target、Knowledge Pack 与 Connector 组合表达；运行时协议、Evidence 语义和 Learner State 仍保持统一。

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

OMAC 是通用型 Harness，不预设单一 ICP，也不把某个平台、题型或学生水平作为产品边界。它应能够服务 ICPC、Codeforces、AtCoder、LeetCode 以及其他算法与数据结构训练场景，并通过可配置的 Platform Profile、Learner Profile、Target Contract 和 Coaching Mode 适配差异。

通用性必须体现在以下稳定能力上：

* 用统一 Event / Evidence / Evaluation 协议描述不同训练活动；
* 用 Target 表达不同平台和水平下的可观察训练目标；
* 用 Knowledge Pack 和 Connector 承载可替换的题目、算法和平台内容；
* 用同一套 Learner State 记录跨平台可迁移的学习证据；
* 允许某个平台或某一类知识暂时没有专用适配，而不破坏本地训练闭环。

OMAC 不承诺预置所有领域内容；产品架构应能够承载不同场景的长期教练闭环。

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

“Coach Intervention ↓”不是脱离上下文的越低越好。题目难度、Target、新颖度和允许的帮助边界都必须同时记录；合理的目标是让学生在相同或更高挑战下，以更少、更合适的干预完成更多独立行为，而不是机械地压低求助次数。

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

动态数据的物理存储明确位于项目级 `.omac`。`.omac` 是一个项目内的 Learner Workspace：它由项目负责承载和共享，但其中的 Learner State 逻辑上仍属于 Learner，而不是某个模型、Agent Host 或 IDE。未来用户即使更换模型、Agent Host 或训练项目，也应能够通过 `learner_id`、Schema、Export / Import 和 Migration 继续使用自己的学习历史。

项目级 `.omac` 不等于“每个项目拥有一个互不相干的学生”。它是当前 Workspace 的状态边界；跨项目使用时，Runtime 通过显式的 Learner Identity 和 Export / Import 连接多个 Workspace，避免隐式访问用户 Home 下的全局数据。

---

# 3. 产品系统组成

OMAC 由四类核心能力和一个可替换适配层构成：

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
* **`.omac`**：保存当前 Workspace 内可追溯的长期动态状态；
* **Platform / Domain Adapter**：以可替换方式提供平台、题目、知识包和外部 Artifact，不改变 OMAC 核心协议。

各能力职责必须清晰分离。

OMAC 的通用 Harness 层不依赖某一个平台或算法领域。Platform Profile、Domain Profile、Learner Profile、Target Contract 和 Coaching Mode 共同描述具体训练上下文；Event、Evidence、Evaluation、Reducer 和 Learner State 提供跨上下文的稳定运行时语义。

---

## 3.1 Skill

Skill 是 OMAC 的 Intelligence / Policy Layer。

Skill Package 中主要包含：

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

其中 Coaching Constitution、Event Protocol、Hint Policy 和 CLI 调用协议属于核心 Skill；静态算法、Pattern、Misconception 和 Pedagogy 内容可以作为可版本化的 Knowledge Pack 被 Skill 引用和加载。Knowledge Pack 是 Agent 可理解的声明式知识，不等于 Runtime Script。

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

CLI 是 Agent 与本地 OMAC Runtime 之间稳定的能力接口。面向 Agent 的命令必须支持结构化输入输出、稳定的退出状态、幂等调用和明确的错误信息；面向人的 Report、Doctor 和 Explain 命令可以提供更适合阅读的文本输出。

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
omac event create ...
omac event append ...
omac event close ...
omac learner create ...
omac learner list ...
omac learner get ...
omac learner update ...
omac learner delete ...
omac evidence append ...
omac import ...
omac recommend ...
omac report ...
omac rebuild ...
omac visualize ...
omac migrate ...
omac doctor
...
```

Event 命令在概念上提供 `create`、`append` 和 `close` 三种操作。`event create` 创建 draft Event，`event append` 向已创建的 Event 追加 Observation、Intervention 或其他记录；`event close` 负责完成校验、关闭并归档 Event，不再提供独立的 `archive` 命令。未来如果需要在不同 Agent Section 或不同会话中接续未完成任务，可以增加 `event continue`。

涉及 Learner 的命令遵循 CRUD 语义：`create`、`list`、`get`、`update`、`delete`。Learner 的解释、报告和状态重建属于 `report`、`rebuild` 或其他 Runtime Service，不扩展为非 CRUD 的 `learner` 子命令。

具体命令、参数和内部模块划分留给后续 Technical Design。

---

## 3.3 `.omac`

`.omac` 是项目级 Runtime State，也是当前 Learner Workspace 的完整持久化载体。所有具体学生的动态状态原则上都保存在当前项目的 `.omac` 中；项目级存储让同一项目中的 Agent Host、Skill 和 CLI 共享一份可追溯状态，跨项目使用则通过显式的 Learner Identity、Export / Import 和 Migration 连接。

`.omac` 使用一级子目录划分关键职责。已结束的 Event 进入 `event/archive`，其组织方式类似 Trellis 将已完成任务归档到任务目录的思路；但 OMAC 的 Event Record、Evidence 和 Claim 仍须保持可追溯和可 Replay。

逻辑上包括：

```text
.omac/
├── config/                 # Workspace、Learner Identity 和 Runtime 配置
├── learner/                # Learner Profile、Learner View 和长期状态摘要
│   ├── profile/
│   ├── state/
│   └── views/
├── event/                  # Event 工作目录和历史归档
│   ├── <event-id>/         # draft / active / paused / evaluating 状态的 Event 直接存放于此
│   ├── archive/            # closed / cancelled 的完整 Event 记录
│   └── index/              # Event ID、时间和状态索引
├── evidence/               # Observation、Intervention、Import、Correction
├── knowledge/              # 本地 Knowledge Pack、Target 和 Problem Manifest
├── artifact/               # 代码、题面、提交记录、比赛材料等外部 Artifact
├── report/                 # 人类可读的 Event Report 和 Learner Report
├── import/                 # 待校验或已导入的外部数据包
└── runtime/                # Schema、Reducer、Migration、Integrity 元数据
```

目录是物理组织方式，不改变逻辑关系：Learner View 必须引用 Claim，Claim 必须引用 Evidence，Evidence 必须能够追溯到 Event 或外部 Artifact。处于工作态的 Event 直接存放于 `event/<event-id>/`，与 `event/archive` 同级；关闭 Event 后，Runtime 将其迁移到 `event/archive/<event-id>/`，但不得静默重写事实记录。原始对话记录（如 Workspace 配置启用保存）属于对应 Event 的内容，保存在 `event/<event-id>/` 下并随 Event 一起归档，不设独立的会话目录。

`.omac` 可以被用户纳入私有版本库，但 OMAC 不自动创建或修改 `.gitignore`。`omac init` 和 `omac doctor` 必须提醒用户不要将其上传到公共仓库；平台 Token、API Key、密码等凭据不得写入 `.omac`。

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

* 幂等创建 `.omac` 目录、一级职责目录和 Schema Metadata；
* 初始化 `event/`（工作态 Event 目录）、`event/archive` 和 `event/index`，保证 Event 的工作态与归档态边界明确；
* 初始化 Workspace Identity，并允许显式绑定或创建 `learner_id`；
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

Knowledge Model 主要由 Skill 引用的、静态、版本化、可共享的 Knowledge Pack 构成；核心教学政策位于 Skill，具体算法、Pattern、Misconception 和 Pedagogy 内容可以按需加载，不要求每次会话完整注入。

Learner Model 的 Learner State / Learner View 位于 `.omac` 中，是针对具体学生动态产生的数据。

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

本 PRD 中三个相关术语按层面区分：**Learner Model** 是对学生当前状态的动态估计这一概念聚合体；**Learner View** 是 Learner Model 的可持久化 Materialized View，由 Runtime Reducer 从 Evidence 和 Assessment Claim 计算，可追溯、可 Replay、可重建；**Learner State** 指位于 `.omac` 下 Learner View、Learner Profile 等动态数据的物理存储集合。三者描述同一对象的概念、投影与存储三个层面；正文中在概念层面叙述时使用 Learner Model，涉及持久化格式、追溯、版本和重建时指的是 Learner View / Learner State。

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

Estimate: 1450–1750
Confidence: 0.32
Evidence Count: 3
```

与：

```text
DP State Design

Estimate: 1580–1660
Confidence: 0.88
Evidence Count: 26
```

含义完全不同。

`Estimate` 以区间表达：Evidence 越少、越旧或质量越低，区间应越宽；区间本身是 `Confidence` 的直观体现，不应在证据不足时收敛为点估计。

低 Confidence 甚至可以成为推荐训练的原因：

> Coach 需要先进一步了解学生，而不是立即优化训练难度。

这形成：

```text
Exploration
vs
Exploitation
```

Learner View 不要求所有能力都输出连续数值。对于证据不足的能力，Runtime 应明确保留 `unknown` 或 `insufficient_evidence`，而不是用低 Confidence 的精确分数制造伪精确。连续 Estimate、Rating 和 Solve Probability 属于后续校准能力。

建议的基础能力状态为：

```text
unknown
observed
assisted
independent
transferred
retained
```

这些状态不是互相排斥的全局标签，而是针对某个 `target_id`、Problem Context 和 Independence Boundary 的可追溯 View。

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

如果用户在 `Practice` 中直接给出一题而未声明 Target，Coach 应先基于题面和当前 Learner 状态形成候选 Target 建议（标记为 low-confidence / 待确认），并在 Event 过程中根据新产生的 Evidence 确认或修正；不得以 Target 缺失为由拒绝训练，也不得把未确认的候选 Target 静默写入 Learner View。

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

`archived` 不是独立状态。`close` 在 `closed` 或 `cancelled` 完成最终校验后一次性完成关闭与归档，将 Event 迁移到 `.omac/event/archive/<event-id>/`；不存在等待归档的中间状态，`archived` 只描述已结束 Event 的物理归档位置。归档动作不得改变 Event ID、原始 Observation、Intervention 或历史 Claim。

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
workspace_id
learner_id
platform_profile_ref
domain_profile_ref
target_ids / intent
problem_ref / contest_ref
mode
status
started_at
ended_at
provenance
independence_boundary_ref
archive_ref
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
domain / platform_scope
learner_profile_scope
prerequisites
observable_behaviors
success_criteria
failure_taxonomy
required_evidence
transfer_probe
evaluation_rubric
assessment_scale
independence_boundary_defaults
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

## 6.9 Independence Boundary

凡是要被计入 `Independent`、`Transferred` 或 `Retained` 的结果，Event 必须声明可复现的 Independence Boundary。它至少包括：

```text
problem_familiarity
prior_exposure
allowed_resources
editorial_exposure
algorithm_name_disclosed
hint_limit
code_assistance_allowed
external_help
time_limit
evaluation_context
```

Boundary 的作用不是给学生增加仪式性限制，而是让不同 Event 的结果可以比较，并让 Coach 知道某次成功到底证明了什么。用户主动改变 Boundary 时，Runtime 必须记录新的 Boundary Snapshot；改变后的结果不能静默覆盖原来的独立性判断。

推荐将结果按以下维度分别记录：

```text
independence_status
first_intervention_at
max_disclosure
independent_behavior_observed
transfer_observed
retention_observed
```

`Hint Level` 只是 Intervention 的一个摘要字段，不能独立代表帮助强度。完整 Intervention 还应记录 Intervention Type、Disclosure、是否由学生请求、针对的 Failure Cause 以及学生之后产生的可观察行为。

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

`Top-down First` 是默认教学策略，不是对所有学生、所有知识类型的硬性顺序。Coach 可以根据 Learner Profile、Target、Evidence 和教学效果选择 Bottom-up、先实现后抽象、先反例后定义或其他路径；策略选择和结果应作为 Intervention Evidence 记录，供后续评估。

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

Hint Level 本身也是重要 Evidence，但不等同于 Intervention 的完整信息泄露量。Coach 还必须记录 Intervention Type、Disclosure、是否由学生请求、对应的 Failure Cause 以及学生之后产生的 Response Evidence。

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

## 9.3 Editorial Building Fallback

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

Evidence 应带必要上下文。最小公共字段建议为：

```text
evidence_id
evidence_type
event_id
workspace_id
learner_id
actor
observed_at
target_ids
problem_ref / artifact_ref
source
content_ref / content_summary
provenance
evidence_quality
independence_boundary_ref
created_at
```

如果 Observation 由 LLM 从对话中提取，还应单独记录 `extraction_confidence`；它不等同于学生能力的 `confidence`，也不等同于 Evidence Quality。

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
- Intervention Goal / Failure Cause
- 后续 Response Evidence IDs

Assessment Claim
- 对哪些 Skill 做出什么判断
- 使用哪些 Evidence
- Evaluator / Model Version
- Confidence
- Assessment Scale / Target Version
- 是否需要用户确认

Learner View
- Reducer 计算出的当前状态
- View Version
- 可追溯的 Claim / Evidence IDs
- Workspace / Learner Identity
- 生成时间
```

Assessment Claim 至少应具备以下机器可校验字段：

```text
claim_id
workspace_id
learner_id
skill_id
target_id / claim_scope
assessment
assessment_scale
evidence_ids
evidence_quality
confidence
evaluator_version
model_provenance
created_at
unknown_reason
student_confirmation
supersedes / contradicted_by
```

`confidence` 只表示当前判断的不确定性，不等同于学生能力分数，也不等同于 Evidence Quality。三者必须分开存储。

Assessment Claim 必须允许表达“没有足够证据”或“存在相互冲突的证据”。`unknown`、`insufficient_evidence` 和 `conflicted` 是有效结果，不得强迫 Evaluator 输出正向或负向能力判断。

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

Local-first 不代表所有数据都永远不离开本机。使用外部模型、Web Connector 或平台 API 时，Runtime 和 Skill 必须明确提示数据边界、记录外部传输来源，并尽量对代码、账号、个人信息和训练对话进行脱敏。原始对话是否保存应由 Workspace 配置决定，默认不要求保存完整对话全文；如启用保存，对话记录属于对应 Event 的内容，存放在 `event/<event-id>/` 下并随 Event 归档（见 3.3）。

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

OMAC 的用户场景统一归属于六种 Event Type。这些场景可以逐步实现，但不得通过增加新的 Event Type 解决功能扩展问题。

---

## 12.1 Learn

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

只用于比赛或 Virtual Contest 结束后的复盘。

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

可以轻量运行。

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

用于没有预设单一 Target 的探索活动，例如：

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

核心 North Star Metric 是：

> **Novel Independent Transfer Rate**：在明确的 Target、Problem Context 和 Independence Boundary 下，学生在未见题目上的独立迁移成功率。

建议定义为：

```text
Novel Independent Transfer Rate
=
满足 Target Success Criteria 的 Novel Transfer Probe 数量
/
Novel Transfer Probe 总数量
```

该指标不要求所有 Event 都立即进行 Transfer Probe，但凡一次结果被标记为 `Independent`、`Transferred` 或 `Retained`，都必须能够指出对应的 Boundary、Target 和 Evidence。

一些可能的核心指标包括：

- Independent Solve Rate: 在同一 Target 和 Independence Boundary 下，独立解决概率是否提高。
- Intervention Efficiency: Intervention 之后是否产生新的独立行为，而不是简单追求 Hint 数量下降。
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

核心评估至少应同时观察三类指标：

* **学习结果**：Novel Independent Transfer Rate、Generation Success、Transfer Success；
* **教练行为**：Intervention Disclosure、首次求助时间、Intervention Efficiency、Assisted / Independent 比例；
* **系统可信度**：Evidence Traceability、Replay 一致性、用户纠正率、Learner View 解释完整度。

“Coach Intervention ↓”只能在题目难度、Target 和 Boundary 可比时解释；如果学生面对更难或更新颖的任务，绝对 Hint 数量增加不必然代表退步。

---

# 14. 产品边界与实现注意事项

OMAC 的完整愿景很大，因此采用 V0–V5 六个实现阶段。每个阶段都有清晰的目标和验收标准；阶段名称不是新的 Event Type。

V0–V5 共同围绕以下长期闭环演进：

| 类型 | 阶段 | 关系 |
|---|---|---|
| Core Path | `V0 → V1 → V2` | 通用 Harness、教练效果和长期 Learner Memory 的核心串行路径 |
| Extension | `V3` | 外部题目生态与推荐，可在核心路径具备后独立接入 |
| Optional Domain Pack | `V4` | Contest 专项能力，可与 V3 并行建设，不作为核心路径的前置条件 |
| Research & Ecosystem Track | `V5` | 自适应 Coach 与生态研究，不作为单一一次性交付物 |

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

## 14.1 V0：Core Harness & Local Coaching Loop

目标：在不依赖外部平台、不依赖复杂数学模型的前提下，以较大的实现粒度一次打通 OMAC 的主流程。V0 不是一个平台适配器、一个算法知识点或一个单独 Event Type 的 Demo，而是一个可以承载不同平台、领域、Target 和 Event Type 的通用 Local Coaching Loop。

V0 的实现原则是：

* 保留六种 Event Type 作为稳定的产品语义；
* 所有 Event 共用同一套 `Choose Target / Intent → Train / Explore → Evaluate → Update` 主循环；
* Event Type 的差异优先通过 Target、Coaching Mode、Artifact 和 Event Contract 表达；
* 直接删除不属于主流程的自动化、生态和高级模型能力，而不是把主流程拆成很多不可独立验证的碎片；
* 使用用户提供的本地 Problem Manifest、Knowledge Pack 或 Contest Artifact 验证跨平台和跨领域的 Harness 通用性。

交付内容：

* Agent Skill、TypeScript npm CLI 和项目级 Learner Workspace `.omac` 初始化；
* 六种 Event Type 的稳定公共 Schema、统一 Lifecycle、`active → archive` 归档流程；
* `Choose Target / Intent → Train / Explore → Evaluate → Update` 的完整通用主循环；
* Event、Evidence、Intervention、Assessment Claim 和 Learner View 的持久化与引用关系；
* Target Contract、Coaching Mode 和 Independence Boundary 的基础协议；
* 基础 Transfer Probe Contract，用于在新题或变体题中记录独立迁移结果；
* LLM 只能提交结构化 Assessment Claim，Runtime 负责校验、Reducer、Materialized View 和 Replay；
* V0 的 Evaluate 基线：Coach 在 `event close` 时基于 Event 过程记录生成结构化 Assessment Claim，不要求对完整对话逐句评估；Evaluator 升级后，历史 Event 可通过 Replay 重新生成 Claims；
* 用户纠正、Claim 冲突、`unknown / insufficient_evidence` 和重新评估流程；
* 本地 Problem Manifest、Knowledge Pack、代码或 Contest Artifact 的显式输入；
* `Explain Why`、Learner Summary、Event Report 和下一次 Event 的上下文读取；
* 基础 Schema Validation、Migration、Export、Import、Doctor 和 Integrity Check；
* Contest Lock 的手动声明与安全策略，不要求 V0 自动识别平台比赛状态；
* `.omac` 公共仓库风险提示、凭据禁止写入和原始对话保存策略。

V0 不实现以下非主流程能力：

* 自动搜索题目、Platform Connector 和 Web Recommendation；
* 完整 Algorithm / Pattern Knowledge Graph；
* 自动 Problem Recommendation、Solve Probability 和 Expected Learning Gain；
* 准确 Rating、复杂 Retention Model 和长期 Spaced Review 调度；
* Contest 时间线的自动采集与平台状态识别；
* Coach Intervention 的长期因果归因和自动 Teaching Policy Adaptation；
* Interactive Visualization、社区知识协作和多 Host 的深度适配。

V0 不要求六种 Event Type 都拥有完整的专用教学子流程。它要求六种 Event Type 都能被统一 Runtime 创建、运行、记录、评估、更新、解释和归档；类型专属的深度体验在后续阶段逐步增加。

V0 验收标准：

```text
Init
→ Select Workspace / Learner
→ Create Event Type
→ Choose Target / Intent
→ Declare Independence Boundary
→ Train / Explore
→ Record Evidence / Intervention
→ Evaluate into Assessment Claim
→ Update Learner View
→ Explain Why
→ Close and Archive Event
→ Rebuild from History
→ Start Next Event with Previous Context
```

V0 必须满足：

* 进程重启后 active 或 archived Event 不丢失；
* 每个 Learner View 都能追溯到 Claim、Evidence 和 Event；
* 修改或纠正 Assessment Claim 后可以 Replay；
* `unknown` 和证据不足可以正常结束 Event，不强迫 Coach 伪造判断；
* 相同 Runtime 可以承载至少两个不同 Platform / Domain Profile 和至少两个 Event Type，不需要改变核心 Schema；
* 下一次 Event 可以读取上一 Event 的 Learner View、Target History 和 Independence Boundary，但不会把 Assisted 结果误当成 Independent 结果。

## 14.2 V1：Coaching Effectiveness

目标：通过 Practice 与 Upsolve 的深度教学流程，验证 OMAC 最核心的教学差异——最小有效帮助能否提高独立解题能力。

交付内容：

* 完整 Hint Policy 和 Intervention Disclosure 记录；
* Practice 与 Upsolve 的 Target Contract、Target-specific Rubric 和 Transfer Probe；
* Teach-back、Postmortem 和迁移复盘；
* Practice 内的 Debug 子流程和 Upsolve Event 深度流程；
* 原始思路、失败原因、关键突破口和迁移准备度分析；
* 用户主动提供的题面、Problem Manifest 和本地题目 Artifact；
* Algorithm Ability、Problem-Solving Ability 和 Misconception 的基础 Materialized Views；
* Assisted / Independent 训练结果区分；
* 允许学生按模式选择帮助程度：Practice、Learn、Upsolve 或 Direct Explanation。

V1 验收重点：同类问题中，独立解决、首次提示时间、Hint Disclosure 和 Transfer Probe 结果能够被稳定记录，并影响后续 Target 或 Intervention 选择。V1 不改变 V0 的通用 Event 协议，而是增加教练策略和目标评估的有效性。

## 14.3 V2：Learner Memory & Curriculum

目标：把一次性做题训练扩展为知识建立、主动回忆、长期保持和训练路径规划。Learn 的通用 Event 语义由 V0 提供，V2 增加完整教学、复习和跨 Event Learner Memory 能力。

交付内容：

* Learn Event 的完整教学流程；
* Prerequisite、Algorithm Knowledge Pack 和 Pattern Card 基础版本；
* Review 作为 Learn / Practice 内场景的统一协议；
* Recall、Recognition、Generation、Transfer 的区分；
* 基础 Retention Schedule，不要求一开始使用复杂遗忘模型；
* Small Variation、Different Statement、Combined Technique 和 Novel Transfer；
* 教学 Intervention 的即时结果与延迟结果关联；
* 基于 Target History、Learner View 和 Retention 的基础 Curriculum Candidate。

V2 验收重点：学生在间隔一段时间后，仍能主动回忆、解释或迁移已训练内容；系统能区分“当时听懂”与“后来仍会”，并能用历史状态产生可解释的后续训练候选。

## 14.4 V3：External Problem Ecosystem & Recommendation

目标：在本地训练闭环之外接入可审计的外部题目生态和基础推荐。V3 是可替换的外部扩展，不应成为离线 Coaching Loop 的前置依赖。

交付内容：

* Codeforces、AtCoder 等 Platform Connector；
* Problem、Contest、Submission、Editorial 的来源、版本和缓存；
* 题目状态、已做记录、题面和 Editorial 使用政策；
* 基于过滤、Target Coverage、难度、Novelty 和历史的确定性推荐基线；
* Exploration 与 Exploitation 的基础分流；
* Web 失败、限流、题面缺失和 Editorial 不存在时的离线降级；
* Problem Pattern Card 与题目实例的关联；
* Connector Capability Manifest。

V3 验收重点：Connector 和推荐可解释、可复现、可排除已做题；网络不可用时不破坏已有训练；来源和内容政策可追溯。

## 14.5 V4：Contest Domain Pack

目标：把 Contest Event 做成严格的赛后复盘 Domain Pack，而不是实时解题助手。

交付内容：

* 比赛和 Virtual Contest Artifact 导入；
* 题目打开时间、思考时间、换题、放弃、提交和 Debug 时间线；
* Problem Selection、Strategic Switching、Time Management、Risk Management 分析；
* Contest Ability Materialized View；
* 赛后 Upsolve 的关联；
* Contest Lock 的平台状态识别、用户确认和审计日志；
* 赛后生成 Follow-up Practice / Learn Event 建议。

V4 验收重点：系统能够说明“比赛表现损失发生在哪里”，并区分算法不会、没有识别、实现慢、Debug 慢和止损过晚；Contest 期间仍严格遵守 Contest Lock。

## 14.6 V5：Adaptive Coaching Research & Ecosystem

目标：在 V0–V2 积累稳定 Evidence 后，发展更成熟的自适应 Coach 研究与生态能力。V5 不是单一一次性交付物，下面的能力应分别定义实验假设、数据要求和验收标准。

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

V5 不构建一个不可解释的“学生数字替身”，而是在 Evidence、Confidence、Traceability 和用户控制的前提下，逐步提高 Coach 的自适应能力。

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

### Concurrency

`.omac` 可能被同一项目中的多个 Agent Host 或会话并发访问。`event append`、`event close` 与 Learner View Rebuild 同时发生时，需要什么粒度的原子写、文件锁或冲突检测？V0 至少应保证并发 append 不静默丢失记录。

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

本节记录用户已经明确做出的关键产品、架构和文档决策。后续 AI 评审、需求分析、Technical Design 和实现检查都必须先读取本节，并将状态为 **Locked** 的决策视为当前约束。

评审规则：

* 不得将 Locked 决策再次作为“待确认问题”、风险结论或替代方案重新提出；
* 可以讨论 Locked 决策带来的实现影响、工程代价、验证方法和局部优化；
* 只有在用户明确要求重新讨论，或出现足以证明该决策无法满足产品目标的新证据时，才可以重新打开决策；
* 重新打开决策时，必须指出触发它的新证据或明确的目标冲突，并在本节追加新的决策记录，不得静默覆盖原决策；
* 如果某个设计问题已经被本节覆盖，AI 应引用对应的 Decision ID，而不是重复进行相同的立项质疑。

| Decision ID | 状态 | 已确定决策 | 评审含义 |
|---|---|---|---|
| D-001 | Locked | OMAC 是通用型 Algorithm Coaching Harness，不预设单一 ICP；应服务 ICPC、Codeforces、AtCoder、LeetCode 及其他算法训练场景。 | 不得再次建议先选择单一 ICP；可以讨论 Platform Profile、Domain Profile、Learner Profile、Target 和 Connector 的实现方式。 |
| D-002 | Locked | PRD 保持为单一文件，通过章群、规范性词汇和第 17 节决策记录支持人工审阅。 | 不得建议将 PRD 拆成多个产品文档；可以优化章节顺序、目录和交叉引用。 |
| D-003 | Locked | V0 不拆成单一算法或单一 Event Type，而是以较大的实现粒度打通统一主流程：`Choose Target / Intent → Train / Explore → Evaluate → Update`。 | 不得再次建议把 V0 收缩为单一算法或单一 Event；应删除非主流程能力，或在不破坏主流程的前提下调整实现粒度。 |
| D-004 | Locked | `.omac` 是项目级 Learner Workspace；动态数据全部位于 `.omac` 下，Learner State 的逻辑归属属于 Learner。 | 不得建议默认使用用户 Home 下的隐式全局状态；跨 Workspace 应通过 `learner_id`、Export / Import 和 Migration 处理。 |
| D-005 | Locked | `.omac/event/active` 与 `.omac/event/archive` 是同一级目录；已结束 Event 进入 `event/archive/<event-id>/`。 | 不得把 `archive` 设计为 `active` 的子目录；`close` 完成关闭和归档。 |
| D-006 | Locked | Event Type 固定为 `Learn`、`Practice`、`Upsolve`、`Contest`、`Diagnose`、`Explore`；Review、Debug、Teach-back、Postmortem、Visualization 等属于场景、子流程、Intervention 或 Runtime Service。 | 不得通过新增 Event Type 解决普通功能扩展；应优先使用 Target、Mode、Artifact、Sub-flow 或 Runtime Service。 |
| D-007 | Locked | `Contest` 只表示赛后复盘；Contest 专项能力归入可选的 V4 Domain Pack，比赛期间不提供解题 Coach。 | 不得把实时比赛辅助设计为 Contest Event；可以讨论赛后 Artifact、Contest Lock 和复盘分析。 |
| D-008 | Locked | OMAC 不自动创建或修改 `.gitignore`；`.omac` 可能包含敏感学习数据，平台 Token、API Key 和密码不得写入 `.omac`。 | 可以增加 Doctor、提示、脱敏和外部 Secret Store 支持，但不得改变上述默认安全边界。 |
| D-009 | Locked | PRD 顶部可以保留文档版本元数据；正文不使用 PRD 版本号。`V0–V5` 只表示项目实现阶段。 | 不得把 `v0.x` 混入产品、架构或验收要求；需要表达路线时使用 `V0–V5` 实现阶段。 |
| D-010 | Locked | 修订 D-005 的目录细节：废弃 `event/active` 目录，处于工作态的 Event 直接存放于 `event/<event-id>/`，与 `event/archive` 同级；`event close` 仍一次性完成关闭与归档。 | 不得恢复 `event/active` 目录，也不得把 `archive` 设计为 Event 工作目录的子目录；原始对话等记录（如启用）随 `event/<event-id>/` 归档。 |

D-010 是对 D-005 的部分修订。触发原因：用户明确要求简化 Event 物理目录结构，并将原始对话记录的存放位置明确在 `event/<event-id>/` 下；D-005 其余约束（`close` 完成关闭和归档、归档不改写事实记录）继续有效。
