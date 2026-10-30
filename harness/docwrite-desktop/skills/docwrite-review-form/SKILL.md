---
name: docwrite-review-form
description: 形式评审：字号、行距、页边距、标题层级、页码、图表编号、命名。
whenToUse: 进入 S9。
metadata:
  stage: S9
  kind: core
  gate: hard
  approval: U4
  requires: [S8]
  produces: ["review-form.json"]
  commands: ["docwrite review open", "docwrite review submit", "docwrite stage done"]
---
# S9 形式评审

## 输入

- build/*.docx|pptx

## 命令

1. `docwrite review open --stage S9 --doc build/x.docx`
2. 按 rubric 检查（可用 reviewer=cli）
3. `docwrite review submit --id <id>`
4. `docwrite approve U4` 后 `docwrite stage done S9`

## 完成判据

- verdict=pass
- 命名合规
- 页数/字号符合 spec

## 失败怎么办

- revise：回 S8（排版）或 S5（内容）

## 请求确认

- 形式问题清单给用户。
