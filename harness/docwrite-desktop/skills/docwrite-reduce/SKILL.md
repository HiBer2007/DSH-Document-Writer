---
name: docwrite-reduce
description: 降重阶段：模型亲手逐段 edit，三轴（AI 率 / AI 味 / 机器味）同时达标。
whenToUse: 进入 S7，或用户要求降 AI 味。
metadata:
  stage: S7
  kind: core
  gate: soft
  approval: U5
  requires: [S6]
  produces: ["draft_reduced.md", "reduce-report.json", "human-review.json"]
  commands: ["docwrite scan", "docwrite suggest", "docwrite diff", "docwrite review open", "docwrite review submit", "docwrite stage done"]
---
# S7 降重

## 输入

- draft.md
- review-content.json

## 命令

1. `docwrite scan draft.md --json` 看热点
2. `docwrite suggest draft.md --json`：**只看线索，不照着替换**
3. 复制 draft.md 为 draft_reduced.md
4. **用 edit 工具逐段重写**（不是逐词替换），禁止脚本批量替换
5. 每批 `docwrite diff draft.md draft_reduced.md --checkpoint`
6. `docwrite review open --stage S7 --doc draft_reduced.md`，派 subagent 评审
7. `docwrite review submit --id <id>`
8. `docwrite approve U4` 后 `docwrite stage done S7`

## 改写原则（先读再改）

- **词表只是线索，不是替换表**：`suggest` 的 `[词表/...]` 只用来定位可疑句；
  禁止把 A 词机械换成 B 词，禁止按词表逐条“消词”。
- **按句/段重写**：先读懂这一段在论证什么，再决定删、并、换序、补事实；
  改的是句子结构和信息，不是词面。
- **上下文优先**：每次 edit 后读前后各一句，检查指代、术语、逻辑是否断裂；
  断裂就回滚该段，按句重写。
- **鱼八股必删**：总—分—总 / 现状—问题—对策 / 三段式、赋能/抓手/闭环/底层逻辑/
  新篇章/答卷等大词、排比三连、金句结尾、情绪拔高。
- **补事实**：时间、地点、人物、数字、失败/异常；不知道就不写。
- **节奏**：长句拆短、短句接长；一段最多一个连接词。

## 完成判据

- 修改率 ≥ 40%
- 检查点 ≥3
- 三轴 ≤ 阈值
- reviewer=subagent
- 上下文衔接：相邻段落指代/逻辑不断裂；无鱼八股结构

## 失败怎么办

- 词表替换导致上下文割裂：回滚该段，按句重写；不许继续替换
- 三轴超标：继续 edit；不许改阈值、不许换脚本

## 请求确认

- 降重前后对比、三轴分数、鱼八股清理清单给用户，确认 U4。
