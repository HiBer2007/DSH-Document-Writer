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
  commands: ["docwrite review open", "docwrite review submit", "docwrite stage done"]
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

## 请求确认

- 把评审结论与 issue 给用户，确认 U4。
