---
name: docwrite
description: 文档工坊总入口：12 阶段流水线、硬门禁、用户确认点、人工降重与独立评审。
whenToUse: 用户提出任何文档任务（论文、作业、简历、报告、演示文稿）时先读本 skill。
metadata:
  kind: entry
  requires: []
  produces: []
  commands: ["docwrite status", "docwrite next", "docwrite dispatch"]
---
# 文档工坊入口

## 输入

- 用户任务描述
- 项目目录

## 命令

1. `docwrite status` 看当前阶段；没有项目就先 `docwrite init`
2. `docwrite next` 拿下一阶段、skill、待确认点
3. 按 `dispatch <stage>` 返回的 skill 工作，不许跳阶段

## 完成判据

- 每步都有 CLI 记录
- 阶段完成由 `stage done` 判定

## 失败怎么办

- pendingApproval 非空：先问用户
- blocked：先 unblock 或问用户

## 请求确认

- 任何阶段推进前，先确认 pendingApproval。
