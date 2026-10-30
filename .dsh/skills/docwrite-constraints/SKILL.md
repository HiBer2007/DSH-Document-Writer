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
  commands: ["docwrite constraints init", "docwrite constraints check", "docwrite stage done"]
---
# S1 约束

## 输入

- brief.md
- 模板 / 指导手册 / 平台限制
- 全局约束（rules/、docwrite.config.json）

## 命令

1. `docwrite constraints init`：生成合法骨架 `constraints.json`（已存在要覆盖时加 `--force`）
2. 用 **edit** 把 items 改成真实约束；不要删字段
3. `docwrite constraints check`：校验字段、重复 id、冲突裁决
4. `docwrite stage done S1`

## constraints.json 结构（照这个写）

```json
{
  "version": 1,
  "project": "项目名",
  "generatedAt": "2026-10-30T00:00:00.000Z",
  "items": [
    {
      "id": "C-001",
      "type": "format",
      "priority": "hard",
      "source": "模板第 3 页 / 指导手册 2.1 / 老师口头",
      "check": "正文 ≤ 8000 字；标题黑体三号；行距 1.5",
      "value": "≤8000 字"
    },
    {
      "id": "C-002",
      "type": "citation",
      "priority": "hard",
      "source": "指导手册 2.1",
      "check": "参考文献 ≥ 15 篇，近 5 年 ≥ 8 篇；正文引用与文末一一对应",
      "value": "≥15 篇"
    }
  ],
  "conflicts": [
    {
      "between": ["C-001", "C-002"],
      "resolution": "以最新模板为准；字数不含参考文献",
      "decidedBy": "user"
    }
  ],
  "notes": "可选"
}
```

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `id` | ✅ | 唯一，建议 `C-001` 递增 |
| `type` | ✅ | `format` / `content` / `citation` / `submission` / `style` / `platform` / `other` |
| `priority` | ✅ | 只能是 `hard` 或 `soft` |
| `source` | ✅ | 可追溯：模板页码、手册条目、老师原话 |
| `check` | ✅ | 可执行、可验证的一句话；不写“注意格式”这种空话 |
| `value` | ⬜ | 具体阈值或取值 |
| `resolution` | ⬜ | 单条冲突时的裁决；也可写进顶层 `conflicts` |
| `conflicts[].between` | ✅ | 两个及以上已存在的 `id` |
| `conflicts[].resolution` | ✅ | 冲突怎么裁决；不许留空 |

也兼容顶层直接是数组的旧写法；新项目请用 `{ "items": [...] }`。

## 完成判据

- items 非空
- 每条 `id/type/priority/source/check` 齐全，`id` 不重复
- `priority` 只能是 `hard` / `soft`
- 所有冲突都有 `resolution`，`conflicts` 引用的 `id` 存在
- `docwrite constraints check` 通过

## 失败怎么办

- 字段缺失 / id 重复：按报错补，不要改检查器
- 冲突无法裁决：列选项问用户，不要自己选
- `init` 生成的 `C-001/002/003` 是占位，必须替换成真实约束

## 请求确认

- 把约束清单（含 hard/soft 与冲突裁决）给用户确认，`approve U1 --by user --quote "..."`。
