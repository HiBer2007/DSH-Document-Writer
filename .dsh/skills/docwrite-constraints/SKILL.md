---
name: docwrite-constraints
description: 约束阶段：把考试说明、模板、平台限制合并成 constraints.json。
whenToUse: 进入 S1，或发现约束有遗漏。
metadata:
  stage: S1
  kind: core
  gate: hard
  approval: U1
  requires: [S0]
  produces: ["constraints.json"]
  commands: ["docwrite stage done"]
---
# S1 约束

## 输入

- brief.md
- 模板
- 指导手册
- 全局约束

## 命令

1. 用 edit 写 `constraints.json`：`{"items":[{"id","type","priority","source","check"}]}`
2. 冲突必须写 `resolution` 字段
3. `docwrite stage done S1`

## 完成判据

- items 非空
- 每条有 source/type/priority
- 冲突有裁决记录

## 失败怎么办

- 冲突无法裁决：列选项问用户

## 请求确认

- 把约束清单给用户确认，`approve U1 --by user --quote "..."`
