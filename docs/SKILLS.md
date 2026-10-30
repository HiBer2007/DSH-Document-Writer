# SKILLS — 技能库与分派（v2）

> 定义 skill 的形态、注册表、分派协议、用户确认、子代理扇出、可插拔扩展，以及 ppt-master 适配器。
> 与 `WORKFLOW.md` 的阶段 ID、命令保持一致。

---

## 1. 设计原则

1. **一阶段一主 skill**：加载哪个 skill 由 `docwrite next` 决定，模型不凭记忆挑。
2. **按需加载**：skill 只写本阶段做什么、跑什么命令、什么算通过；背景知识放 `references/`。
3. **可插拔**：核心 skill 固定 12 个；额外能力走 `extensions/`，启停按项目记录。
4. **skill 不判完成**：`stage done` 由 CLI 检查。
5. **skill 不代用户拍板**：每个阶段 skill 结尾必须是"向用户确认"，不许自行推进。
6. **三味同除、独立评审**：降重 skill 必须三轴打分，且由子代理评审。
7. **正文 ≤ 8KB**（DSH 工具结果修剪阈值 8192），超出拆 `references/`。

---

## 2. 核心 skill 清单

| id | 阶段 | 类型 | 产出 | 依赖 | 需确认 |
| --- | --- | --- | --- | --- | --- |
| `docwrite` | — | 入口 | — | — | — |
| `docwrite-intake` | S0 | core | `brief.md`、`scope.json` | — | U0 |
| `docwrite-constraints` | S1 | core | `constraints.json` | S0 | U1 |
| `docwrite-spec` | S2 | core | `spec.md` | S1 | U2 |
| `docwrite-source` | S3 | core | `sources/index.json` | S1 | — |
| `docwrite-outline` | S4 | core | `outline.md` | S2 | U3 |
| `docwrite-draft` | S5 | core | `draft.md` | S4 | — |
| `docwrite-review-content` | S6 | core | `review-content.json` | S5 | U4 |
| `docwrite-reduce` | S7 | core | `draft_reduced.md`、`reduce-report.json` | S6 | U5 |
| `docwrite-human-review` | S7 | utility | `human-review.json` | S7 | U4 |
| `docwrite-compose` | S8 | core | `build/*.docx` | S7 | U6 |
| `docwrite-review-form` | S9 | core | `review-form.json` | S8 | U4 |
| `docwrite-verify` | S10 | core | `verify-report.md` | S8 | U4 |
| `docwrite-deliver` | S11 | core | `deliver/*` | S10 | U7 |
| `docwrite-docx` | 多阶段 | utility | — | — | — |
| `docwrite-pptx` | S8 | adapter | `build/*.pptx` | S7 | U6 |
| `docwrite-preview` | 多阶段 | utility | — | — | — |
| `docwrite-scan` | S7 | utility | — | — | — |

- **core**：阶段绑定，由 dispatch 选中。
- **utility**：被 core 引用（"用 docwrite-scan 出热点"），不单独 dispatch。
- **adapter**：包装外部工具（ppt-master），遵守同一套产物与门禁。

---

## 3. SKILL.md 契约

### 3.1 位置

```
.dsh/skills/<id>/SKILL.md          # DSH 自动发现（项目根，只扫一层）
.dsh/skills/<id>/references/*.md   # 按需读取，不参与发现
.dsh/skills/<id>/scripts/*.mjs     # 可选，只读工具
```

### 3.2 frontmatter

```yaml
---
name: docwrite-reduce
description: 亲手降重阶段。用于 S7：模型自己逐段用 edit 工具改写，扫描出热点 → diff 校验修改率，禁止脚本批量替换。
whenToUse: 当前阶段为 S7，或用户要求降 AI 味、降重、过 AIGC 检测。
metadata:
  stage: S7
  kind: core
  requires: [S6]
  produces: ["draft_reduced.md", "reduce-report.json", "human-review.json"]
  commands: ["docwrite scan", "docwrite suggest", "docwrite diff", "docwrite review open", "docwrite review submit", "docwrite reduce check"]
  gate: soft
  approval: U5
  editOnly: true
---
```

字段规则：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `name` | ✅ | kebab-case，与目录名一致 |
| `description` | ✅ | 一句话说清"什么时候用" |
| `whenToUse` | 建议 | 触发条件 |
| `metadata.stage` | core 必填 | S0–S11 |
| `metadata.produces` | ✅ | 相对项目根 glob，越界即违规 |
| `metadata.commands` | ✅ | 必须存在于 CLI（`skills lint` 校验） |
| `metadata.gate` | ✅ | `hard` / `soft` |
| `metadata.approval` | 有确认点的阶段必填 | U0–U7 |
| `metadata.editOnly` | 降重阶段必填 | 声明"只许 edit 工具改" |

### 3.3 正文只写五块

```markdown
## 输入
- `draft.md`（S5 产物，哈希已记录）
- `review-content.json`（S6 通过）

## 命令
1. `docwrite scan draft.md --json`
2. `docwrite suggest P12 --json`（只给建议，不写文件）
3. 用 **edit 工具**逐段修改 `draft_reduced.md`
4. `docwrite diff draft.md draft_reduced.md --json`
5. `docwrite review open --stage S7 --doc draft_reduced.md`
6. 派**子代理**（`subagent`，新上下文）读评审包并写结论
7. `docwrite review submit --id <reviewId>`
8. `docwrite reduce check --json`

## 完成判据
- 三轴 ≤ 阈值（主门禁）
- reviewer=subagent
- 保护区改动 = 0
- 上下文衔接；无鱼八股
- 仅当项目在 `docwrite.config.json` 显式配置时，才检查修改率/检查点下限

## 失败怎么办
- 修改率低：**不是失败**；先看三轴和热点，只有项目显式设了下限才继续 edit
- 三轴超标：继续 edit；不许改阈值、不许写脚本
- 保护区被改：回滚该段，重读规则

## 请求确认
- 汇总三轴、热点与剩余风险；初稿已达标时，向用户确认是否直接 waive S7
```

不写：检测原理、AI 痕迹分类、替换表全文（放 `references/`）。

---

## 4. 注册表

`skills/registry.json`（分派唯一真源）：

```json
{
  "version": 2,
  "skills": [
    {
      "id": "docwrite-reduce",
      "stage": "S7",
      "kind": "core",
      "path": ".dsh/skills/docwrite-reduce/SKILL.md",
      "requires": ["S6"],
      "produces": ["draft_reduced.md", "reduce-report.json"],
      "commands": ["docwrite scan", "docwrite suggest", "docwrite diff", "docwrite reduce check"],
      "gate": "soft",
      "approval": "U5",
      "editOnly": true,
      "fanout": null
    }
  ],
  "routes": [
    { "when": "新文档", "entry": "S0", "skill": "docwrite-intake" },
    { "when": "只查重", "entry": "S7", "skill": "docwrite-reduce", "scope": "scan" },
    { "when": "只改一段", "entry": "S5", "skill": "docwrite-draft", "scope": "revise" },
    { "when": "只转格式", "entry": "S8", "skill": "docwrite-compose", "scope": "compose" },
    { "when": "只校验", "entry": "S10", "skill": "docwrite-verify", "scope": "verify" },
    { "when": "做 PPT", "entry": "S8", "skill": "docwrite-pptx", "scope": "compose" }
  ]
}
```

校验（`docwrite skills lint`）：

- id 唯一、kebab-case、目录存在；
- stage 在 S0–S11；
- produces 不越出项目根、不与别的 skill 重叠（utility 只读）；
- commands 前缀在 CLI 命令表内；
- 正文 ≤ 8KB；
- `editOnly` 的 skill 不得出现任何"批量替换/写回正文"命令；
- 有确认点的阶段必须有"请求确认"一节。

---

## 5. 分派协议

### 5.1 时序

```
模型                      CLI                         状态
 │  docwrite status ──────→ 读 state.json              │
 │  docwrite next   ──────→ 算阶段 + skill + 确认点     │
 │  ← {stage, skill, inputs, commands, pendingApproval}
 │  pendingApproval 非空 → 问用户，不得开工
 │  加载 SKILL.md（DSH skill 工具或直接读）             │
 │  按 commands 执行 ─────→ 各命令写产物/只读            │
 │  docwrite approve U5 ──→ 记录用户原话                │
 │  docwrite stage done S7 → 跑检查                     │
 │  ← pass / fail（exit 2/3/6）                        │
```

### 5.2 `next` 返回

```json
{
  "project": "职业生涯规划书",
  "stage": "S7",
  "status": "active",
  "skill": { "id": "docwrite-reduce", "path": ".dsh/skills/docwrite-reduce/SKILL.md" },
  "inputs": ["draft.md", "review-content.json"],
  "commands": ["docwrite scan", "docwrite suggest", "docwrite diff", "docwrite reduce check"],
  "pendingApproval": { "gate": "U5", "question": "要降重吗？降哪些部分？目标是什么？" },
  "blockers": [],
  "budget": { "edge": null, "used": 0, "max": 3 }
}
```

`pendingApproval` 非空时**不许开工**；`blockers` 非空时**不许开工**（缺前置产物、预算耗尽、stale）。

### 5.3 分派日志

`.run/dispatch.log`，JSONL：

```json
{"at":"...","stage":"S7","skill":"docwrite-reduce","command":"docwrite scan","result":"ok"}
{"at":"...","stage":"S7","skill":"docwrite-reduce","command":"docwrite diff","result":"rate=0.28"}
```

`verify` 检查：有产物但无分派记录的阶段 → 标 `unlogged`（警告）。

---

## 6. 亲手降重 skill 的硬约束（R1）

`docwrite-reduce` 是全库唯一带 `editOnly: true` 的 skill，必须遵守：

| 要求 | 说明 |
| --- | --- |
| 改写执行者 | **模型本人**：不许交给脚本、子代理或扩展代劳 |
| 评审执行者 | 独立子代理（新上下文）；主代理不得自评 |
| 三味目标 | AI 率 / AI 味 / 机器味 三轴均 ≤ 阈值（`rules/human-rubric.md`） |
| 词表定位 | `suggest` 只给线索，不是替换表；禁止按词表逐条“消词” |
| 鱼八股 | 结构固化 / 正确的空话 / 内容同质化；命中 ≥2 类必须重写 |
| 禁止替换腔 | 不许把 A 词机械换成 B 词；每处改动必须是句子级重构或信息补充 |
| 只读命令 | scan / suggest / diff / check，均不写正文 |
| 逐段 edit | 每段用 `edit` 工具改，改完立即 `diff` |
| 上下文 | 改完读前后各一句，指代/术语/逻辑断裂就回滚重写 |
| 检查点 | 至少 3 次 `diff`，写入事件日志 |
| 禁止 | 写脚本、跑批量替换、调 `docx replace`、改阈值 |
| 失败处理 | 继续 edit，不换方法 |

CLI 侧配合：

- 命令表不存在 `reduce --apply`；
- `docx replace` 在 S8 之前拒绝执行（`exit 3`）；
- `reduce check` 校验检查点数量与单检查点改动占比；
- `verify` 校验 docx 生成时间晚于 S7 done 时间。

---

## 7. 评审 skill 的额外契约

S6 / S7 / S9 / S10 的评审产物统一 schema（S7 额外要求三轴）：

```json
{
  "reviewId": "S7-8f3a",
  "stage": "S7",
  "reviewer": "subagent",
  "axes": {
    "aiRate":        { "score": 0.28, "signals": ["模板句 2 处", "句长 CV 0.31"] },
    "aiFlavor":      { "score": 0.22, "signals": ["重要性膨胀 1 处", "空洞结论 1 处"] },
    "machineFlavor": { "score": 0.41, "signals": ["翻译腔 5 处", "名词化 3 处", "连接词机械 2 处"] }
  },
  "verdict": "revise",
  "summary": "翻译腔偏多，第三章最重",
  "issues": [
    { "id": "H1", "axis": "machineFlavor", "severity": "major", "location": "3.2",
      "quote": "在数字化转型的背景下", "fix": "改成具体时间与场景" }
  ]
}
```

规则：

- `reviewer` 为 `subagent` 或 `cli`；S6 / S7 / S10 必须 `subagent`，S9 允许 `cli`；
- `reviewId` 必须来自 `review open`；
- `verdict=pass` 且 `issues=[]` 才允许 `stage done`；
- `revise` 至少 1 条 issue，`axis` 与 `location` 必填；
- `reject` 直接进 `blocked`；
- 三轴任一 > 阈值 → 不允许 pass；
- 评审结论必须经 U4 用户确认才算数。

### 7.1 独立评审协议

```
主代理                          CLI                         子代理（新上下文）
  │ review open --stage S7 ───→ 生成评审包
  │ ← {reviewId, promptPath, rubricPath, docPath, templatePath}
  │ subagent("读 <promptPath>，按 rubric 评，结果写 <outPath>")
  │                                                          │ 只读包内文件
  │                                                          │ 写 review.json
  │ review submit --id <reviewId> ─→ 校验 schema / reviewer
  │ ← verdict / axes / issues
```

- 评审包在 `.run/reviews/<reviewId>/`，含 `prompt.md`、`rubric.md`、`doc.md`、`refs/`（spec、constraints）、`template.json`；
- 必须用 `subagent`（新上下文）；**禁止 `subagent_fork`**（会继承写作上下文，等于自评）；
- 子代理**不接触**写作过程、对话历史、主代理的自我评价；
- 主代理只能转述结论，不能改分；
- `review submit --reviewer main` → `exit 3`。

---

## 8. 子代理扇出

### 8.1 允许与禁止

| 允许 | 禁止 |
| --- | --- |
| 阶段内按单元并行（章/节/页/文件） | 子代理改 state、发 waiver、approve、跨阶段 |
| 子代理只读输入、只写自己的输出路径 | 子代理直接调 `stage done` |
| 主代理汇总后统一 `done` | 子代理之间互相写同一文件 |

### 8.2 扇出契约

`docwrite dispatch fanout S5 --json`：

```json
{
  "stage": "S5",
  "unit": "chapter",
  "items": [
    { "id": "3.1", "input": "outline.md#3.1", "output": "draft/3.1.md" },
    { "id": "3.2", "input": "outline.md#3.2", "output": "draft/3.2.md" }
  ],
  "merge": "docwrite draft merge --from draft/ --to draft.md",
  "constraints": { "wordsPerChapter": "±20%", "register": "academic" }
}
```

### 8.3 限制

- 单单元失败不阻塞其他单元；汇总列失败清单。
- 合并后必须重跑 S5 检查。
- 同一阶段最多 2 轮扇出。
- **S7 禁止扇出**：降重必须主代理逐段 edit，保证人（和用户）能看清每一处改动。

---

## 9. 所有权与冲突

| 规则 | 检查点 |
| --- | --- |
| 一阶段一主 skill | dispatch 时校验 |
| 只能写 `produces` | `verify` 比对产物清单 |
| 前阶段只读 | 后阶段写前阶段产物 → `verify` 报 `overwrite` |
| utility 只读 | utility 声明 produces 视为非法 |
| 评审不产出正文 | 评审 skill 只能写 review JSON |
| S8 前不产 docx | 任何 docx/pptx 写入命令要求 S8 已进入 |

---

## 10. 可插拔扩展

### 10.1 目录

```
extensions/<name>/
├── extension.json      清单
├── SKILL.md            给模型看的用法（不自动发现，由 dispatch 返回路径）
└── run.mjs / check.mjs 可选脚本（只读检查）
```

### 10.2 清单

```json
{
  "name": "citation-check",
  "version": "1.0.0",
  "description": "检查 APA 引用与正文引用一一对应",
  "kind": "check",
  "entry": "SKILL.md",
  "hooks": { "beforeStage": ["S10"], "afterStage": ["S6"], "onVerdict": ["revise"] },
  "commands": [
    { "name": "cite-check", "run": "node run.mjs", "args": "<docx>" }
  ],
  "produces": ["reports/citation.json"],
  "blocking": false,
  "requires": ["S8"]
}
```

| 字段 | 说明 |
| --- | --- |
| `kind` | `check` / `tool` / `content` |
| `hooks` | `beforeStage` / `afterStage` / `onVerdict` |
| `blocking` | `true` 时检查失败阻断 S10；默认 `false` 只告警 |
| `produces` | 只允许写 `reports/`、`extensions/<name>/` 下 |

### 10.3 启停

```bash
docwrite ext install ./my-ext        # 复制 + 校验 + 默认 disabled
docwrite ext enable citation-check
docwrite ext disable citation-check
docwrite ext list
```

- 启用状态写进项目 `state.extensions`。
- 扩展不得占用核心 stage、不得写核心产物、不得修改 state、不得 approve。
- `verify` 先跑核心检查，再按 hooks 跑扩展检查，最后合并报告。

### 10.4 冲突

- 同名扩展：后装覆盖，旧版备份到 `extensions/.backup/<name>-<时间>/`。
- 两个扩展写同一 `produces`：启用时报错。
- 扩展崩溃：不阻断主流程（除非 `blocking:true`），报告记 `extension-error`。

---

## 11. ppt-master 适配器

### 11.1 定位

ppt-master 是**第三方独立工具**，是 R4（废弃全部 Python 工具）的唯一例外：不移植、不改源码、不 import，只做子进程调用与预览接管。

```json
{ "pptMaster": { "root": "vendor/ppt-master", "previewPort": 5050, "autoOpenBrowser": false } }
```

### 11.2 适配命令

```bash
docwrite ppt init <项目> [--format ppt169] [--dir <目录>]   # 包装 project_manager.py init
docwrite ppt import <项目> <源文件...> [--move|--copy]      # 包装 import-sources
docwrite ppt validate|info <项目>                          # 包装 validate / info
docwrite ppt build <项目> [--out x.pptx]                   # finalize_svg.py + svg_to_pptx.py
docwrite ppt check <项目> [--format ppt169]                # svg_quality_checker.py
docwrite pdf <docx> [out.pdf] [--backend auto|kit|soffice]  # PDF 导出（可选后端）
```

失败时原样回传 stderr 摘要，不吞错。`--dry-run` 只打印将要执行的命令，不实际运行。

### 11.3 预览接管

| 能力 | 行为 |
| --- | --- |
| 启动 | `docwrite preview start`，端口取配置；占用则 +1 并记录实际端口 |
| 状态 | `docwrite preview status` 返回 URL、PID、端口、健康检查结果 |
| 健康检查 | 启动后 10 秒内轮询，失败则报错并清理进程 |
| 日志 | `.run/preview.log`，只追加 |
| PID | `.run/preview.pid`，退出/交付时清理 |
| 浏览器 | 默认**不自动打开**；`--open` 才开 |
| 关闭 | `docwrite preview stop`；`deliver` 成功后自动关闭 |
| 崩溃恢复 | `status` 发现 PID 不存在但 pid 文件在 → 标 `stale` 并清理 |

**禁止**：直接跑它的 `server.py`、在它目录写产物、让预览常驻到交付后、多项目抢同一端口。

### 11.4 与阶段的关系

- S8（成型）调用 `ppt build`，产出 `build/*.pptx`；
- S9 形式评审读 `ppt check` 结果；
- S11 交付前 `preview stop`；
- 预览 URL 写进 `verify-report.md` 的"人工复核"一节。

---

## 12. Skill 质量门

`docwrite skills lint` 必过：

1. frontmatter 完整，`name` 与目录一致；
2. `metadata.commands` 全部能在 CLI 命令表里找到；
3. `produces` 在项目根内，且不与核心产物冲突；
4. 正文 ≤ 8KB，包含"输入/命令/完成判据/失败怎么办"四块；
5. 有 `approval` 的 skill 必须包含"请求确认"一节；
6. `editOnly` 的 skill 不得引用任何写正文的命令；
7. 降重 skill 必须包含 `review open` / `review submit` 步骤，并声明 `reviewer=subagent`；
8. 任何 skill 不得出现同义词批量替换指令；
9. 引用的 `references/` 文件真实存在；
10. 声明的阶段与 registry 一致。

---

## 13. 路由表（用户意图 → 入口）

| 用户说 | 入口 | 首个 skill | 说明 |
| --- | --- | --- | --- |
| "写一份…" | S0 | `docwrite-intake` | 走完整流程 |
| "按这个模板填…" | S0+S1 → S5 | `docwrite-draft` | 内容仍先落 md，S8 才转 docx |
| "把这份改一改" | S5 | `docwrite-draft` | 只改指定部分，scope=revise |
| "降 AI 味" | S7 | `docwrite-reduce` | 模型亲手 edit，需 U5 |
| "只查重" | S7 | `docwrite-reduce` | scope=scan，只出报告 |
| "做 PPT" | S8 | `docwrite-pptx` | 需先有降重后 md，预览接管 |
| "看看有什么约束" | S1 | `docwrite-constraints` | 单跑，不建 run |
| "能不能交了" | S10 | `docwrite-verify` | scope=verify，只验不导出 |
