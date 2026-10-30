---
name: docwrite-source
description: 素材阶段：资料入库、来源记账；允许后补。
whenToUse: 进入 S3，或写作中发现缺资料。
metadata:
  stage: S3
  kind: core
  gate: soft
  requires: [S1]
  produces: ["sources/index.json"]
  commands: ["docwrite source add", "docwrite source declare", "docwrite source status", "docwrite stage done"]
---
# S3 素材

## 输入

- 用户提供的文件
- 指导手册

## 命令

1. `docwrite source add <文件>` 入库
2. 缺的用 `docwrite source declare "名称"` 登记待补
3. `docwrite source status` 看 pending
4. `docwrite stage done S3`

## 完成判据

- index.json 有 entries
- pending 清单可见

## 失败怎么办

- 无法转换：标 unreadable，不静默丢

## 请求确认

- 待补清单给用户过目。
