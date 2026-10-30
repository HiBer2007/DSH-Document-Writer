---
name: docwrite-draft
description: 初稿阶段：只写 Markdown，不转 docx。
whenToUse: 进入 S5，或需要改稿。
metadata:
  stage: S5
  kind: core
  gate: soft
  requires: [S4]
  produces: ["draft.md"]
  commands: ["docwrite stage done"]
---
# S5 初稿

## 输入

- outline.md
- sources/

## 命令

1. 用 edit 写 `draft.md`（纯 md）
2. `docwrite stage done S5`

## 完成判据

- 标题集合 = outline 章节
- 字数在预算 ±20%
- 无 TODO 占位

## 失败怎么办

- 缺章/超字数：定位到章节补

## 请求确认

- 初稿完成告诉用户，不自行转格式。
