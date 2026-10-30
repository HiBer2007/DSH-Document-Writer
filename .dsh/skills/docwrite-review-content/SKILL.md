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
3. Desktop 用 `docwrite_review_extend`（会弹验收卡，必须用户点“允许”）；
   TUI/CLI 用
   `docwrite review extend --stage S6 --add 1 --by user --quote "用户原话" --reason "..."`。
4. 追加只影响本阶段，默认最多追加 2 轮；用尽后只能回退或接受现有结论，不许绕过。

## 请求确认

- 把评审结论与 issue 给用户，确认 U4。
