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
  commands: ["docwrite review open", "docwrite review submit", "docwrite review extend", "docwrite stage done"]
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

## 轮次超限

`review open` 报“评审轮次超限”时，不要重复 open 撞 exit 5：

1. 先 `review submit` 上一轮；还有 open 的评审时不能追加。
2. 向用户说明还需要复核哪些形式项。
3. Desktop 用 `docwrite_review_extend`（必须用户点“允许”）；
   TUI/CLI 用
   `docwrite review extend --stage S9 --add 1 --by user --quote "用户原话" --reason "..."`。
4. 默认最多追加 2 轮；用尽后回退或接受现有结论。

## 请求确认

- 形式问题清单给用户。
