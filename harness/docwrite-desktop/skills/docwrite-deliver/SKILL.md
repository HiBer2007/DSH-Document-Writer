---
name: docwrite-deliver
description: 交付：复制成品到 deliver/，写 delivery-manifest.json。
whenToUse: S10 完成且用户确认交付。
metadata:
  stage: S11
  kind: core
  gate: hard
  approval: U7
  requires: [S10]
  produces: ["deliver"]
  commands: ["docwrite deliver", "docwrite stage done"]
---
# S11 交付

## 输入

- build/ 成品
- verify-report.md

## 命令

1. `docwrite approve U7 --by user --quote "..."`
2. `docwrite deliver`
3. `docwrite stage done S11`

## 完成判据

- deliver/ 有文件
- manifest 有哈希
- S10 PASS

## 失败怎么办

- 导出失败：报错并保留中间产物

## 请求确认

- 交付清单给用户，确认 U7。
