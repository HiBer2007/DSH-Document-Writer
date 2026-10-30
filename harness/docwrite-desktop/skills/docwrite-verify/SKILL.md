---
name: docwrite-verify
description: 终检：全部硬约束、哈希、扩展检查，出 PASS/FAIL 报告。
whenToUse: 进入 S10。
metadata:
  stage: S10
  kind: core
  gate: hard
  approval: U4
  requires: [S9]
  produces: ["verify-report.md"]
  commands: ["docwrite verify", "docwrite stage done"]
---
# S10 终检

## 输入

- 全部已完成阶段的产物

## 命令

1. `docwrite verify`
2. 报告 PASS 后 `docwrite approve U4`
3. `docwrite stage done S10`

## 完成判据

- verify 返回 PASS
- 无 stale
- 扩展 blocking 检查通过

## 失败怎么办

- FAIL：按报告回 S5/S7/S8；reject：blocked

## 请求确认

- 报告给用户，确认 U4。
