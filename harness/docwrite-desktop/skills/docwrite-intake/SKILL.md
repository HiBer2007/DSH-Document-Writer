---
name: docwrite-intake
description: 受理阶段：把请求变成任务卡，确定交付物、截止、模板、提交方式与作用域。
whenToUse: 新任务开始，或任务卡字段不全。
metadata:
  stage: S0
  kind: core
  gate: soft
  approval: U0
  requires: []
  produces: ["brief.md"]
  commands: ["docwrite init", "docwrite status", "docwrite next"]
---
# S0 受理

## 输入

- 用户原话
- 附件与模板

## 命令

1. `docwrite init <项目> [--scope ...] [--deadline ...] [--template ...]`
2. 用 edit 补全 brief.md 的提交方式等字段
3. `docwrite status` 复核，`docwrite next` 看 U0

## 完成判据

- 交付物、截止、模板、提交方式 4 项齐全
- scope 与入口阶段符合用户意图

## 失败怎么办

- 信息缺失：问用户，不许编造截止时间与提交方式

## 请求确认

- 把任务卡念给用户，确认后 `docwrite approve U0 --by user --quote "..."`
