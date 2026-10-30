---
name: docwrite-compose
description: 成型阶段：唯一允许把 Markdown 转成 docx/pptx 的地方。
whenToUse: S7 完成且用户确认转换。
metadata:
  stage: S8
  kind: core
  gate: hard
  approval: U6
  requires: [S7]
  produces: ["build"]
  commands: ["docwrite docx fill", "docwrite docx md", "docwrite from-md", "docwrite pptx fill", "docwrite ppt build", "docwrite stage done"]
---
# S8 成型

## 输入

- draft_reduced.md
- 模板

## 命令

1. `docwrite approve U6 --by user --quote "..."`
2. `docwrite docx fill <模板> build/x.docx --fields-file cover.json`
3. 或 `docwrite from-md draft_reduced.md build/x.docx`
4. 或 `docwrite ppt build <ppt-master 项目> --out build/x.pptx`
5. `docwrite stage done S8`

## 完成判据

- 占位符 = 0
- 样式未破坏
- 字数/页数符合 spec

## 失败怎么办

- 占位符残留：列清单修完重跑

## 请求确认

- 转换前必须 U6 确认。
