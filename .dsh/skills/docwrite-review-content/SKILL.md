---
name: docwrite-review-content
description: 内容评审：独立子代理按 rubric 评覆盖度、逻辑、事实、引用、语体。
whenToUse: 进入 S6。
metadata:
  stage: S6
  kind: core
  gate: hard
  approval: U4
  requires: [S5]
  produces: ["review-content.json"]
  commands: ["docwrite review open", "docwrite review submit", "docwrite review extend", "docwrite stage done"]
---
# S6 内容评审

## 输入

- draft.md
- spec.md
- constraints.json

## 命令

1. `docwrite review open --stage S6 --doc draft.md`
2. 派 subagent（新上下文）读 prompt，写 review.json
3. `docwrite review submit --id <id>`
4. `docwrite approve U4 --by user --quote "..."`
5. `docwrite stage done S6`

## 语言逻辑（必查）

- **搭配错位**：形容词的语义特征必须能落在名词上，且上下文要建立隐喻框架。
  例：“更值钱的追问”——追问没有价格，应改为“更有价值的追问 / 更值得追问的问题 /
  更关键的追问”。不要用“值钱/昂贵/廉价”这类经济词硬贴抽象名词。
- **AI 伪口语/伪对话腔**：用“这句话稳”“比之前的都重”“我记下了”“我不拦”
  “你自己掂量”“你说的对，但是”这类短对白金句冒充人味。它们看似口语，实则
  没有人物、场景、动作和信息，是模型对“人味”的二阶模仿。完整词表见
  `scan-rules.json` 的 `aiColloquial` 组；命中一处即 issue，同段 ≥2 句或全文
  反复出现必须 revise。正常口语引用、真实对话、方言词不在屏蔽范围。
- 指代是否有明确先行词；范畴是否偷换；句间逻辑连接是否成立。
- 命中一处明确搭配错位或伪口语：记 issue（quote + fix），`aiFlavor` 至少上调；多处推高。

## 完成判据

- verdict=pass
- reviewer=subagent
- issues 可执行

## 失败怎么办

- revise：按 issues 回 S4/S5；reject：blocked

## 轮次超限

`review open` 报“评审轮次超限”时，不要重复 open 撞 exit 5，也不要自己加轮次：

1. 先确认上一轮已 `review submit`；还有 open 的评审时不能追加。
2. 向用户说明为什么还需要一轮（这一轮改了什么、要复核什么）。
3. Desktop 用 `docwrite_review_extend`（模式 1 会弹验收卡；模式 2+ 按文档修改模式
   自动许可，仍受硬上限）；
   TUI/CLI 用
   `docwrite review extend --stage S6 --add 1 --by user --quote "用户原话" --reason "..."`。
4. 追加只影响本阶段，默认最多追加 2 轮；用尽后只能回退或接受现有结论，不许绕过。

## 请求确认

- 把评审结论与 issue 给用户，确认 U4。
