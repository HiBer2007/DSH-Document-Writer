# WORKFLOW — 强制流水线细则（v2）

> 定义 12 个阶段、门禁、用户确认点、循环跳转、作用域入口、状态机与跳步规则。
> 与 `PLAN.md` 冲突时以本文件为准；改流程先改这里。

---

## 0. 六条不可协商的规则

这六条来自用户，优先级高于本文件其余一切设计：

| # | 规则 | 落地方式 |
| --- | --- | --- |
| R1 | **降重必须由模型亲手逐段 Edit，绝对禁止脚本批量替换** | S7 只提供 scan / suggest / diff / check；CLI 不提供任何正文批量改写命令；改动必须由模型本人经 `edit` 工具逐段完成 |
| R2 | **全程用户深度参与，必须得到明确同意或清晰指示才继续** | 8 个用户确认点（U0–U7）；缺确认 `exit 6`，模型不得自行 approve |
| R3 | **Markdown 必须先降重，再转其他格式；转换前保持 md** | S5–S7 全程 md；S8 是唯一转换点，S7 未 done 时 `compose` 拒绝执行 |
| R4 | **原有 Python 工具全部废弃并重写** | 新工具链零 Python 依赖；唯一例外是第三方独立工具 ppt-master（只子进程调用，不改源码） |
| R5 | **S0 允许跳转到任何阶段** | `init --scope/--at` 指定入口；范围外阶段标 `excluded`，不参与硬门禁 |
| R6 | **素材允许后补** | S3 可为 `partial`，不阻塞 S4/S5；后补时下游阶段标 `stale` 重检 |
| R7 | **三味同除：AI 率、AI 味、机器味** | 评审按 `rules/human-rubric.md` 三轴打分，任一超标即 revise；禁止同义词机械替换 |
| R8 | **AI 率评审必须独立** | 由新上下文/子代理按 rubric 评；主代理不得自评，`review submit --reviewer main` 直接拒绝 |
| R9 | **评审轮次可追加但不可自批** | 每阶段默认 3 轮；用满后必须由用户确认才能 `review extend`，每阶段最多追加 2 轮；模型不能自己加轮次 |

---

## 1. 总览

```
S0 受理 ──(可跳任意阶段)──┐
   │                      │
   ▼                      │
S1 约束 → S2 规格 → S3 素材 → S4 提纲 → S5 初稿(md)
                                              │
                                        S6 内容评审(md) ──revise──→ S4 / S5
                                              │ pass
                                              ▼
                                        S7 降重(md, 模型亲手 edit) ──未达标──→ 继续 edit
                                              │ done
                                              ▼
                                        S8 成型（唯一转换点：md → docx/pptx）
                                              │
                                        S9 形式评审 ──revise──→ S8 / S5
                                              │ pass
                                              ▼
                                        S10 终检 ──revise──→ S5 / S7 / S8
                                              │ pass
                                              ▼
                                        S11 交付
```

四条铁规：

1. **没有 `stage done` 的阶段等于没做**，模型口头说"已完成"无效。
2. **没有用户确认的阶段不许推进**，`exit 6` 是常态不是异常。
3. **评审不过必须回退**，不许原地"再想想"然后直接往下走。
4. **回退有预算**，耗尽就停，交用户决策（`blocked`）。

---

## 2. 阶段定义

### S0 受理 intake ｜ 软 · 允许跳转任意阶段

| 项 | 内容 |
| --- | --- |
| 目的 | 把一句话需求变成任务卡，并确定**作用域**与**入口** |
| 产物 | `brief.md`、`scope.json` |
| 检查 | 交付物类型、截止、模板、提交方式 4 项；`scope` 合法；入口阶段合法 |
| 命令 | `docwrite init <项目> [--scope full\|scan\|reduce\|revise\|verify\|compose] [--from <文件>] [--at S7]` |
| 跳转 | **S0 → 任意阶段**。跳转后，中间阶段标 `excluded`，不算跳步 |
| 确认 | U0（任务卡 + 作用域） |
| 失败 | 信息缺失 → 问用户；**禁止编造截止时间与提交方式** |

### S1 约束 constraints ｜ 硬

| 项 | 内容 |
| --- | --- |
| 产物 | `constraints.json`、`约束快照.md` |
| 检查 | ≥1 条；每条含 `source/type/priority/check`；冲突必须有 `resolution` |
| 命令 | `docwrite constraints sync\|show\|check` |
| 确认 | U1（约束有没有漏、有没有错） |
| 失败 | 冲突无法裁决 → 列选项问用户 |

### S2 规格 spec ｜ 硬

| 项 | 内容 |
| --- | --- |
| 产物 | `spec.md`（章节树、字数预算、格式、引用、图表、禁项、评分点映射） |
| 检查 | 章节树非空；每章有字数预算；评分点至少映射 1 章 |
| 命令 | `docwrite spec check` |
| 确认 | U2（方向对不对） |
| 失败 | 章节与评分点无法映射 → 回 S1 |

### S3 素材 source ｜ 软 · 可后补

| 项 | 内容 |
| --- | --- |
| 产物 | `sources/*.md`、`sources/index.json` |
| 状态 | `pending / partial / complete`；**`partial` 不阻塞 S4/S5** |
| 检查 | 每个文件有来源与 sha256；`unreadable` 单独记录 |
| 命令 | `docwrite source add <文件>`、`docwrite source convert`、`docwrite source status` |
| 后补 | S5 之后补素材 → S4/S5/S6 标 `stale`，需重检对应部分 |
| 失败 | 无法转换 → 标 `unreadable`，verify 提示，不静默丢 |

### S4 提纲 outline ｜ 软

| 项 | 内容 |
| --- | --- |
| 产物 | `outline.md`（每节要点、论据、数据、引用占位） |
| 检查 | 覆盖 spec 全部章节；每节 ≥1 论据；篇幅预算之和 ≈ 总字数 |
| 命令 | `docwrite outline check` |
| 确认 | U3（提纲可以吗） |

### S5 初稿 draft ｜ 软 · 纯 Markdown

| 项 | 内容 |
| --- | --- |
| 产物 | `draft.md`（**只允许 md，不许此时转 docx**） |
| 检查 | 标题集合 = outline 章节集合；字数在预算 ±20%；无 `TODO`/`待补` |
| 命令 | `docwrite draft check` |
| 失败 | 缺章/超字数 → 定位到具体章节 |

### S6 内容评审 review-content ｜ 硬 · 循环点（md 上评审）

| 项 | 内容 |
| --- | --- |
| 评审维度 | 覆盖度、逻辑链、事实与数据、引用合规、语体、禁项 |
| 执行者 | 独立子代理（新上下文）；主代理不得自评 |
| 产物 | `review-content.json`（`verdict` + `issues[]`） |
| 检查 | `pass` 才可 done；`revise` 必须带合法回退目标；`reject` → blocked |
| 轮次超限 | 先 submit 上一轮；向用户说明后 `review extend`（Desktop 用 `docwrite_review_extend`）；每阶段最多 +2 |
| 命令 | `docwrite review open --stage S6 --doc draft.md`、`docwrite review submit --id <id>`、`docwrite review extend ...` |
| 确认 | U4（评审结论是否认可） |

### S7 降重 reduce ｜ 软 · **模型亲手 edit + 独立子代理评审**

| 项 | 内容 |
| --- | --- |
| 目的 | 在 **Markdown** 上同时压 AI 率、去 AI 味、去机器味 |
| 产物 | `draft_reduced.md`、`reduce-report.json`、`human-review.json` |
| 方式 | 改写由**模型本人逐段 `edit`**；评审由**独立子代理（新上下文）**按 `rules/human-rubric.md` 打分；CLI 只提供扫描、建议、比对、判据 |
| 执行者 | 改写 = 模型本人；评审 = 子代理；脚本、扩展、子代理代写一律禁止 |
| 步骤 | ① `cp draft.md draft_reduced.md` ② `scan` 出热点 ③ 逐段 `edit`（禁同义词机械替换）④ 每批 `diff` ⑤ `review open` ⑥ 派子代理评审 ⑦ revise → 回 ③；pass → `reduce check` |
| 检查 | 修改率 ≥ 阈值；保护区改动 = 0；检查点 ≥ 3；单检查点改动 ≤ 30%；三轴均 ≤ 阈值；`reviewer=subagent` |
| 命令 | `docwrite scan`、`docwrite suggest`、`docwrite diff`、`docwrite review open --stage S7`、`docwrite review submit --id <reviewId>`、`docwrite review extend --stage S7 ...`、`docwrite reduce check` |
| 确认 | U5（进入前确认范围与目标）、U4（评审结论） |
| 失败 | 三轴任一超标 → 继续 edit；主代理自评 → `exit 3`；不许改阈值、不许换脚本 |

> `scan` 只是线索，不是结论；AI 率与三味的最终判定由评审子代理按 `rules/human-rubric.md` 做出。

> 技术强制：CLI 命令表里不存在 `reduce --apply`；`docx replace` 在 S8 之前一律拒绝；S7 的每次 `diff` 写入事件日志，`check` 统计检查点数量。

### S8 成型 compose ｜ 硬 · **唯一格式转换点**

| 项 | 内容 |
| --- | --- |
| 目的 | 把降重后的 md 转成交付格式：docx 套模板 / pptx 生成 |
| 前提 | **S7 必须 done**（或用户明确 scope 不含 S7）；转换前 md 定稿哈希已记录；**S8 之前不得生成任何 docx/pptx（含预览用）** |
| 产物 | `build/<名称>.docx`（或 `.pptx`） |
| 检查 | 占位符 = 0；段落数与样式数不低于模板；可被解析；字数/页数符合 spec |
| 命令 | `docwrite compose --from draft_reduced.md --template <docx>`、`docwrite docx fill` |
| 确认 | U6（确认转换） |
| 失败 | 占位符残留 → 输出清单；模板问题 → 升级用户 |

### S9 形式评审 review-form ｜ 硬 · 循环点

| 项 | 内容 |
| --- | --- |
| 评审项 | 字号、行距、页边距、标题层级、页码、图表编号、命名、页数 |
| 执行者 | CLI 机器检查（`docwrite check form`），结论经 U4 确认 |
| 产物 | `review-form.json` |
| 检查 | `pass` → done；`revise` → 回 S8（排版）或 S5（内容，需重走 S6/S7/S8） |
| 轮次超限 | 先 submit 上一轮；用户确认后用 `review extend` 或 Desktop `docwrite_review_extend`；每阶段最多 +2 |
| 命令 | `docwrite review submit --stage S9 ...`、`docwrite review extend --stage S9 ...` |
| 确认 | U4 |

### S10 终检 verify ｜ 硬 · 循环点

| 项 | 内容 |
| --- | --- |
| 检查 | 硬约束全 PASS；无 `stale`；扩展检查；AI 风险 ≤ 阈值或有豁免；术语/编号/引用一致；**转换发生在降重之后** |
| 产物 | `verify-report.md` |
| 命令 | `docwrite verify [--json]` |
| 失败 | `revise` → S5 / S7 / S8；`reject` → blocked |
| 确认 | U4 |

### S11 交付 deliver ｜ 硬

| 项 | 内容 |
| --- | --- |
| 产物 | `deliver/<名称>.<ext>`、`delivery-manifest.json` |
| 检查 | S10 PASS；命名合规；格式正确；manifest 完整；预览已关闭 |
| 命令 | `docwrite deliver --to pdf`、`docwrite export` |
| 确认 | U7（确认交付） |

---

## 3. 用户确认点（U-gates）

| 确认点 | 时机 | 必须问清的问题 | 缺失时 |
| --- | --- | --- | --- |
| U0 | S0 完成后 | 交付物、截止、模板、提交方式、**作用域**对不对？ | `exit 6` |
| U1 | S1 完成后 | 约束有没有漏、有没有冲突没裁决？ | `exit 6` |
| U2 | S2 完成后 | 规格与大纲方向对不对？ | `exit 6` |
| U3 | S4 完成后 | 提纲可以进入写作吗？ | `exit 6` |
| U5 | 进入 S7 前 | 要不要降重？降哪些部分？目标是什么？ | `exit 6` |
| U6 | 进入 S8 前 | 确认把 md 转成 docx/pptx？ | `exit 6` |
| U7 | 进入 S11 前 | 确认交付这些文件？ | `exit 6` |
| U4 | 每次评审 verdict 后 | pass / revise / reject 是否认可？ | `exit 6` |

规则：

- `docwrite approve U1 --by user --quote "约束没问题"` 记录确认。
- **模型不得自行 approve**；`--by` 必须是 `user`，且必须有用户原话。
- `docwrite next --json` 返回 `pendingApproval`；非空时不许开工，先把问题抛给用户。
- 用户给出清晰指令（如"只查重，别改正文"）也算确认，但必须落成 `approve` + 原话。
- U4 的 verdict 必须来自独立子代理（`subagent`，新上下文）；`subagent_fork` 继承写作上下文，视为自评，`exit 3`。

---

## 4. 门禁矩阵

| 阶段 | 硬/软 | 可豁免 | 可合并 | 合法回退目标 |
| --- | --- | --- | --- | --- |
| S0 受理 | 软 | ✅（scope 指定时） | 与 S1 | —（可跳任意阶段） |
| S1 约束 | **硬** | ❌ | 与 S0 | — |
| S2 规格 | **硬** | ❌ | — | S1 |
| S3 素材 | 软 | ✅（可 partial） | 与 S4 | — |
| S4 提纲 | 软 | ✅ | 与 S3 / S5 | S2 |
| S5 初稿 | 软 | ✅ | 与 S4 | S4 |
| S6 内容评审 | **硬** | ❌ | — | S4、S5 |
| S7 降重 | 软 | ✅（用户明确不降） | 与 S6 | S5 |
| S8 成型 | **硬** | ❌ | — | S5、S7 |
| S9 形式评审 | **硬** | ❌ | — | S5、S8 |
| S10 终检 | **硬** | ❌ | 与 S7 | S5、S7、S8 |
| S11 交付 | **硬** | ❌ | — | — |

---

## 5. 循环与跳转

### 5.1 守卫图（只允许这些边）

```
S0  → 任意阶段        作用域入口，不算跳步
S6  revise → S4       结构问题
S6  revise → S5       文字问题
S9  revise → S5       内容问题（必须重走 S6→S7→S8）
S9  revise → S8       纯排版问题
S10 revise → S5       内容问题
S10 revise → S7       降重不足
S10 revise → S8       格式问题
S10 reject  → blocked
```

未列出的边一律 `exit 3`。

### 5.2 S7 内部循环（不是阶段跳转）

```
scan → edit 一段 → diff → … → 自查达标 → review open → 子代理评审
   ├─ revise → 回 edit（带 issue）
   └─ pass   → reduce check → done
```

- 每次 `diff` 记一个检查点，`reduce check` 要求 ≥ 3 个检查点。
- 修改率不足时**继续 edit**，不许调阈值、不许换脚本。

### 5.3 预算

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| `maxLoopsPerEdge` | 3 | 同一条边最多回退 3 次 |
| `maxTotalRevisions` | 8 | 整个项目累计回退上限 |
| `maxRoundsPerReview` | 3 | 同一评审最多出 3 次 verdict |
| `maxReviewExtraRounds` | 2 | 用户确认后每阶段最多追加的评审轮次 |
| `minDiffCheckpoints` | 3 | S7 至少 3 个检查点 |
| `maxChangedRatioPerCheckpoint` | 0.30 | 单检查点改动段落占比上限（防批量替换） |

耗尽 → `blocked`，三选一：`unblock --reset-edge` / 降标准（仅软门禁）/ `archive`。

### 5.4 跳转记录

```json
{"type":"jump","from":"S6","to":"S5","edge":"S6->S5","round":2,
 "issues":"review-content.json","reason":"第二章论据与数据不匹配","at":"2026-07-04T11:20:00+08:00"}
```

---

## 6. 作用域与任意入口（R5）

### 6.1 作用域

`scope.json`：

```json
{
  "scope": "scan",
  "entry": "S7",
  "excluded": ["S1","S2","S3","S4","S5","S6","S8","S9","S10","S11"],
  "reason": "用户只要查重",
  "files": { "input": "draft.md" }
}
```

| scope | 入口 | 说明 |
| --- | --- | --- |
| `full` | S0 | 完整流程 |
| `scan` | S7 | 只扫描出报告，不要求修改率 |
| `reduce` | S7 | 只做降重，交付 md |
| `revise` | S5 | 已有稿，只改指定部分 |
| `compose` | S8 | 已有降重后 md，只转格式 |
| `verify` | S10 | 已有成品，只校验 |

### 6.2 规则

- `excluded` 阶段不参与硬门禁与 verify 硬判定，报告单独列出。
- 进入某阶段时，若前置 `excluded`，视为满足（用户已明确只要这一步）。
- 但 **S8 永远要求 S7 done 或 S7 excluded**：不允许"跳过降重直接转换"的默认路径。
- scope 一旦确定，改 scope 需要 `docwrite scope set --by user --quote "..."`。

---

## 7. 素材后补（R6）

- S3 状态：`pending / partial / complete`。
- `partial` 不阻塞 S4/S5；`index.json` 记录 `pending[]` 清单。
- S5 之后 `source add` → 把 S4/S5/S6 标 `stale`，并在 `next` 里提示重检相关章节。
- `verify` 遇 `partial` → ⚠️ + 待补清单；用户可 `approve U-verify-partial --quote "接受现有素材"` 放行。

---

## 8. 状态与事件

### 8.1 状态文件

`projects/<项目>/.run/state.json`

```json
{
  "project": "职业生涯规划书",
  "current": "S7",
  "scope": { "mode": "full", "entry": "S0", "excluded": [] },
  "approvals": {
    "U0": {"at":"...","by":"user","quote":"就按这个做"},
    "U1": {"at":"...","by":"user","quote":"约束没问题"}
  },
  "reviews": {
    "S7": {"id":"S7-8f3a","reviewer":"subagent","verdict":"revise",
           "axes":{"aiRate":0.28,"aiFlavor":0.22,"machineFlavor":0.41}}
  },
  "stages": {
    "S5": {"status":"done","attempt":2,"at":"...","artifacts":["draft.md"],"hash":"sha256:..."},
    "S7": {"status":"active","attempt":1,"checkpoints":2,"rate":0.28}
  },
  "edges": [{"from":"S6","to":"S5","round":1,"reason":"论据不足","at":"..."}],
  "loops": {"S6->S5": 1},
  "revisions": 1,
  "blocked": null
}
```

状态值：`pending | active | done | waived | excluded | failed | blocked`。
`done` 必须带 `artifacts` 与 `hash`；`waived` 必须带 `waiver`；`excluded` 必须带 `reason`；`blocked` 必须带 `blockedReason`。

### 8.2 事件日志

`.run/events.jsonl`，只追加：

```
{"type":"approve","gate":"U1","quote":"约束没问题","at":"..."}
{"type":"stage.enter","stage":"S7","at":"..."}
{"type":"reduce.checkpoint","stage":"S7","index":2,"rate":0.31,"changedParas":4,"at":"..."}
{"type":"jump","from":"S6","to":"S5","round":1,"at":"..."}
{"type":"stage.done","stage":"S7","hash":"sha256:...","at":"..."}
{"type":"artifact.stale","stage":"S8","expected":"sha256:...","actual":"sha256:...","at":"..."}
```

`verify` 校验：日志尾部与 state 一致、时间单调、跳转边合法、S7 检查点数量达标。

---

## 9. 跳步规则

### 9.1 合法跳步只有一种：软门禁豁免

```bash
docwrite stage waive S7 --by user --quote "这篇不用降重，我自己改"
```

拒绝条件（任一命中 → `exit 3`）：

| 条件 | 原因 |
| --- | --- |
| 阶段是硬门禁 | 流程底线 |
| `--by` 不是 `user` | 模型不能给自己发豁免 |
| 缺 `--quote` | 必须留用户原话 |
| 前置阶段未完成（且非 excluded） | 跳过未完成的前置等于造假 |
| 已存在同阶段 waiver | 防止反复覆盖 |

### 9.2 常见豁免

| 阶段 | 典型理由 | 记录后表现 |
| --- | --- | --- |
| S0 | 用户已给全信息 | brief 由 S1 生成 |
| S3 | 内容用户直接贴进来 | index 标 `inline` |
| S4 | 短文（<800 字） | 提纲并入初稿 |
| S5 | 纯模板填充 | 内容在 md 里由模板字段生成 |
| S7 | 扫描低风险且用户明确不降 | verify 标 ⚠️ 不判失败 |

### 9.3 合并执行（不算跳步）

| 合并 | 条件 |
| --- | --- |
| S0+S1 | `init --quick` |
| S3+S4 | 素材本身就是提纲 |
| S4+S5 | 短文或熟悉题材 |
| S6+S7 | 内容评审后立即亲手降重 |

> 注意：**S7 与 S8 不可合并**，转换必须在降重之后单独成阶段。

---

## 10. 反作弊

| 手段 | 实现 |
| --- | --- |
| 产物哈希 | `done` 记录 sha256；`verify` 重算，不符标 `stale` |
| 时间单调 | 阶段完成时间必须递增 |
| 转换顺序 | docx mtime 必须晚于 S7 done 时间；否则 `wrong-order` |
| 亲手降重 | 检查点 ≥3；单检查点改动段落 ≤30%；无 `reduce --apply` 命令可调 |
| 自评无效 | `review submit` 要求 `reviewer=subagent` + 合法 `reviewId`；主代理提交直接拒绝 |
| 三轴留痕 | `human-review.json` 记录三轴分数与命中信号；verify 核对阈值 |
| 交叉引用 | S6 比对 spec 章节 vs draft 标题；S10 比对 constraints vs 产物 |
| 空产物 | 产物非空 + schema 校验 |
| 日志一致性 | `events.jsonl` 尾部必须与 state 对应 |
| 评审留痕 | verdict 必须带 issues 文件；`pass` 无 issues 视为无效 |

---

## 11. 典型场景

| 场景 | 路径 |
| --- | --- |
| 新论文/规划书 | S0→S1→S2→S3→S4→S5→S6→S7→S8→S9→S10→S11 |
| 只查重 | `init --scope scan --from draft.md` → S7 scan → 报告 → 结束 |
| 只改一段 | `init --scope revise --from draft.md` → S5 → S6 → 结束 |
| 模板填充 | S0+S1 → S2 → S5 → S6 → S7 → S8 → S9 → S10 → S11 |
| 只转格式 | `init --scope compose --from draft_reduced.md --template x.docx` → S8 → S9 |
| 只校验 | `init --scope verify --from final.docx` → S10 |
| 做 PPT | S1 → S2 → S5 → S6 → S7 → S8(pptx) → S9 → S10 → S11 |

---

## 12. 命令速查

```bash
# 项目与作用域
docwrite init <项目> [--scope full|scan|reduce|revise|verify|compose] [--from <f>] [--at S7]
docwrite status [--json]
docwrite next [--json]
docwrite history [--json]
docwrite scope show|set --by user --quote "..."
docwrite archive --reason "..."

# 用户确认
docwrite approve <U0..U7> --by user --quote "..."

# 阶段
docwrite stage enter <S>
docwrite stage done <S>
docwrite stage waive <S> --by user --quote "..."
docwrite stage reopen <S> --reason "..."
docwrite unblock --reset-edge|--reset-all

# 评审（独立子代理）
docwrite review open --stage S6|S7|S9 --doc <文件>    # 生成评审包：prompt/rubric/doc/template
docwrite review submit --id <reviewId>                 # 收子代理结论，校验 reviewer=subagent
docwrite review extend --stage S6 --add 1 --by user --quote "用户原话" --reason "..."
docwrite review status

# 形式评审（S9，机器检查后可人工确认结论）
docwrite review submit --stage S9 --verdict pass|revise [--jump S8|S5] [--issues f.json]

# 各阶段
docwrite constraints sync|show|check
docwrite spec check
docwrite source add <f>|convert|status
docwrite outline check
docwrite draft check

# 降重（只读工具，无写回命令）
docwrite scan <md> [--json]
docwrite suggest <段落id> [--json]
docwrite diff <a.md> <b.md> [--json]
docwrite reduce check|report

# 成型与文档操作（S8 起才允许）
docwrite compose --from draft_reduced.md [--template f.docx]
docwrite docx read|md|fill|inspect|create|from-md
docwrite pptx read|fill|notes
docwrite ppt init|import|validate|info|build|check
docwrite pdf <docx> [out.pdf] [--backend auto|kit|soffice]
docwrite preview start|status|stop

# 交付
docwrite verify [--json]
docwrite deliver [--to pdf]

# 技能与扩展
docwrite skills list|show <id>
docwrite ext list|enable <name>|disable <name>|install <path>
docwrite dispatch <stage> [--json]

# 模式
docwrite mode install|status|uninstall
```

---

## 13. 配置

`docwrite.config.json`：

```json
{
  "workflow": {
    "maxLoopsPerEdge": 3,
    "maxTotalRevisions": 8,
    "maxRoundsPerReview": 3,
    "minDiffCheckpoints": 3,
    "maxChangedRatioPerCheckpoint": 0.30,
    "requireApprovals": true
  },
  "thresholds": {
    "aiRiskMax": 0.35,
    "modificationRateMin": 0.40,
    "wordBudgetTolerance": 0.20
  },
  "humanLikeness": {
    "aiRateMax": 0.35,
    "aiFlavorMax": 0.30,
    "machineFlavorMax": 0.30,
    "requireIndependentReview": true
  },
  "pptMaster": {
    "root": "vendor/ppt-master",
    "previewPort": 5050,
    "autoOpenBrowser": false
  }
}
```
