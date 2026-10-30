---
name: docwrite-spec
description: 规格阶段：章节树、字数预算、格式、引用、评分点映射。
whenToUse: 进入 S2。
metadata:
  stage: S2
  kind: core
  gate: hard
  approval: U2
  requires: [S1]
  produces: ["spec.md"]
  commands: ["docwrite stage done"]
---
# S2 规格

## 输入

- constraints.json

## 命令

1. 用 edit 写 `spec.md`（章节树 + 每章字数预算 + 格式/引用）
2. `docwrite stage done S2`

## 完成判据

- 章节树非空
- 每章有字数预算
- 评分点至少映射 1 章

## 失败怎么办

- 章节与评分点对不上：回 S1 补约束

## 请求确认

- 方向给用户确认，`approve U2 --by user --quote "..."`
