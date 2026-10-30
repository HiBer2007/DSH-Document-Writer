---
name: docwrite-outline
description: 提纲阶段：每节要点、论据、数据、引用占位。
whenToUse: 进入 S4。
metadata:
  stage: S4
  kind: core
  gate: soft
  approval: U3
  requires: [S2]
  produces: ["outline.md"]
  commands: ["docwrite stage done"]
---
# S4 提纲

## 输入

- spec.md
- sources/

## 命令

1. 用 edit 写 `outline.md`
2. `docwrite stage done S4`

## 完成判据

- 覆盖 spec 全部章节
- 每节 ≥1 论据

## 失败怎么办

- 覆盖不全：列缺口补

## 请求确认

- 提纲给用户确认，`approve U3 --by user --quote "..."`
