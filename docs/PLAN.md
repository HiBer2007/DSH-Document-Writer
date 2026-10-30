# PLAN — 文档工坊（docwrite）v2

> 设计契约总纲。流程细则见 `WORKFLOW.md`，技能库与分派见 `SKILLS.md`。
> 三份文档不一致时，以 WORKFLOW / SKILLS 为准，并回头修本文件。

---

## 0. 一句话

旧版的问题不是功能少，是**没有流程、没人把关、什么都敢自动改**。
新版 = **12 阶段 + 模型亲手降重 + 用户确认点 + 受控循环 + 全程留痕 + 可插拔 skill**。

## 1. 六条硬规则（用户指定，优先级最高）

| # | 规则 |
| --- | --- |
| R1 | 降重必须由**模型亲手逐段 Edit**，绝对禁止脚本批量替换 |
| R2 | 全程用户深度参与，必须得到明确同意或清晰指示才继续 |
| R3 | Markdown 先降重、后转换；转换前保持 md |
| R4 | 原有 Python 工具全部废弃重写；唯一例外是第三方 ppt-master（子进程调用，不改源码） |
| R5 | S0 允许跳转到任何阶段（只查重、只改稿、只转格式等） |
| R6 | 素材允许后补，不阻塞写作 |
| R7 | 三味同除：AI 率、AI 味、机器味；禁止同义词机械替换；词表只作线索 |
| R8 | AI 率评审必须独立：由新上下文/子代理按 rubric 评，主代理不得自评 |

> R4 具体范围：`_shared/toolchain/*`、`_shared/scripts/*`、`projects/*/generate_*.py`、`reduce_workflow.py`、`workflow_adjust.py` 全部废弃；不复用其代码，只参考其意图。

## 2. 目标与非目标

**目标**

1. 12 阶段流水线，阶段完成由 CLI 检查决定。
2. 支持**受控循环与跳转**：评审不过 → 回退指定阶段 → 再审，直到通过或预算耗尽。
3. **三味同除**：AI 率、AI 味、机器味三轴同时达标；禁止用同义词替换冒充改写。
4. **独立评审**：AI 率与人味由子代理在新上下文按 `rules/human-rubric.md` 评，主代理不自评。
5. 8 个用户确认点（U0–U7），缺确认 `exit 6`。
6. 跳步只有两种合法形态：硬门禁（禁止）、软门禁（用户豁免 + 留痕）。
7. skill 按阶段切分，`dispatch` 按表分派，支持可插拔扩展；子代理只能做单元级扇出。
8. docx/pptx 读写、扫描、比对全部用 Node.js 重写，零 Python 依赖。
9. ppt-master 作为外部 skill 模块接入，网页预览由本工具链统一接管。
10. 打包成 DSH 预设「文档工坊」：TUI 用声明式 `preset-docwrite` 行，Desktop 用
    `harness/docwrite-desktop` bundle，一键切换。
11. Desktop 预设带 10 个封装工具、S8 硬门禁、只读流水线面板和
    `docwrite_visual_check` 人工验收工具。
12. 开源到 GitHub（`HiBer2007/DSH-Document-Writer`），加 `dsh-plugin` 等 topics，
    让 DSH 用户能搜索并安装。

**非目标**

- 不移植 ppt-master 内部实现（唯一 Python 例外，只做适配与预览接管）。
- 不做 Web 编辑器；只提供只读流水线面板与人工验收卡。
- 不提供任何"一键降重"脚本。
- 不自动提交到学习通等平台。

## 3. 文档三层

| 文件 | 作用 | 变更频率 |
| --- | --- | --- |
| `docs/PLAN.md` | 总纲：规则、架构、里程碑、风险 | 低 |
| `docs/WORKFLOW.md` | 阶段、门禁、确认点、循环、状态机、命令 | 中 |
| `docs/SKILLS.md` | 技能库、分派、亲手降重约束、扩展、PPT 适配器 | 中 |

## 4. 十二阶段一览

| 阶段 | 名称 | 门禁 | 产物 | 关键约束 |
| --- | --- | --- | --- | --- |
| S0 | 受理 intake | 软 | `brief.md`、`scope.json` | 可跳任意阶段 |
| S1 | 约束 constraints | **硬** | `constraints.json` | 需 U1 |
| S2 | 规格 spec | **硬** | `spec.md` | 需 U2 |
| S3 | 素材 source | 软 | `sources/index.json` | 可 partial、可后补 |
| S4 | 提纲 outline | 软 | `outline.md` | 需 U3 |
| S5 | 初稿 draft | 软 | `draft.md` | **只允许 md** |
| S6 | 内容评审 review-content | **硬** | `review-content.json` | 循环点，需 U4 |
| S7 | 降重 reduce | 软 | `draft_reduced.md`、`reduce-report.json`、`human-review.json` | **模型亲手 edit + 子代理三轴评审**，需 U5/U4 |
| S8 | 成型 compose | **硬** | `build/*.docx` | **唯一转换点**，需 U6 |
| S9 | 形式评审 review-form | **硬** | `review-form.json` | 循环点，需 U4 |
| S10 | 终检 verify | **硬** | `verify-report.md` | 循环点，需 U4 |
| S11 | 交付 deliver | **硬** | `deliver/*`、`delivery-manifest.json` | 需 U7 |

```
S0 → S1 → S2 → S3 → S4 → S5 → S6 ⇄(S4/S5) → S7(模型亲手 edit) → S8(转换) → S9 ⇄(S5/S8) → S10 ⇄(S5/S7/S8) → S11
```

## 5. 核心机制

### 5.1 门禁在 CLI

阶段完成 = 产物存在 + 哈希匹配 + 内容检查通过。`docwrite deliver` 内部先跑 `verify`。

### 5.2 用户确认点

| 确认点 | 时机 | 缺失时 |
| --- | --- | --- |
| U0 | S0 后 | exit 6 |
| U1 | S1 后 | exit 6 |
| U2 | S2 后 | exit 6 |
| U3 | S4 后 | exit 6 |
| U4 | 每次评审结论 | exit 6 |
| U5 | 进入 S7 前 | exit 6 |
| U6 | 进入 S8 前 | exit 6 |
| U7 | 进入 S11 前 | exit 6 |

模型不得自行 `approve`；`--by user --quote` 缺一不可。

Desktop 另提供 `docwrite_visual_check`：把阶段进度、产物清单、关键指标、正文预览做成
验收卡，问用户“合格 / 需要修改 / 暂不判断”。它只记录人工验收意见，不替代 U 确认，
也不替代 `stage done` 的 CLI 检查。

### 5.3 循环与跳转

- 评审 verdict：`pass | revise | reject`。
- `revise` 只能走守卫图允许的边；每条边 3 次、全局 8 次。
- 耗尽 → `blocked`，三选一：重置 / 降标准（仅软门禁）/ 归档。

### 5.4 跳步

- 硬门禁：S1、S2、S6、S8、S9、S10、S11 —— `waive` 拒绝。
- 软门禁：S0、S3、S4、S5、S7 —— 用户原话 + waiver。
- 合并：S0+S1、S3+S4、S4+S5、S6+S7；**S7 与 S8 不可合并**。

### 5.5 留痕与反作弊

产物 sha256、时间单调、转换顺序（docx 必须晚于 S7 done）、亲手降重检查点、单检查点改动占比、日志尾部比对。手改产物 → `stale`。

## 6. Node.js 架构

### 6.1 依赖策略

ESM，Node ≥ 20；运行时依赖 `fflate`（zip）与 `yaml`（清单校验）；测试 `node:test`；无 TS 编译。

### 6.2 目录树

```
K:\AI文档编写\
├── OLD\                       冻结存档（只读，不再引用）
├── vendor\ppt-master\         第三方工具（唯一 Python 例外，只读）
├── package.json               name: docwrite
├── bin\docwrite.mjs
├── src\
│   ├── cli.mjs                参数解析 / 命令注册 / 退出码
│   ├── commands\              docx / pptx / preview / scan / diff / project / stage / review / approve / verify / deliver / skills / ext / mode
│   └── core\
│       ├── zip.mjs            OOXML 包读写
│       ├── ooxml\             无损分词器 / docx / paragraph / table / pptx
│       ├── md.mjs             markdown 解析与结构比对
│       ├── scan.mjs           8 维扫描 + 段落热点（只读）
│       ├── suggest.mjs        替换建议（只读，不写文件）
│       ├── review.mjs         评审包生成 / 结论校验（独立子代理）
│       ├── diff.mjs           句子级 + 字符级修改率
│       ├── constraints.mjs    Markdown 表格 → 约束模型
│       ├── state.mjs          状态机 / 确认点 / 循环预算 / 事件日志
│       ├── registry.mjs       skill 注册表、dispatch、扩展加载
│       └── project.mjs        项目脚手架 / 作用域
├── rules\                     评审依据与只读建议（不参与写文件）
│   ├── human-rubric.md        三轴评分规则（AI 率 / AI 味 / 机器味 + 鱼八股）
│   ├── machine-flavor.md      机器味清单（翻译腔、名词化、连接词机械、鱼八股）
│   └── scan-rules.json        只读扫描规则（词表 + 鱼八股大词，线索不是结论）
├── harness\docwrite-desktop\  DSH Desktop bundle（预设/工具/门禁/GUI 面板）
├── scripts\sync-desktop-preset.mjs  从 agent.cordis.yml 生成内联 preset 行
├── test\                      node:test
├── .dsh\skills\               DSH 自动发现的核心 skill
├── skills\registry.json       分派表
├── extensions\                可插拔扩展
├── presets\docwrite\          工作模式源文件
├── docs\                      三份文档
├── README.md                  开源说明与安装
├── LICENSE                    MIT
└── projects\                  项目目录（本地个人文档，不进入开源仓库）
```

### 6.3 关键设计

- **无写回正文的命令**：降重阶段只读；`docx replace` 在 S8 前拒绝执行。
- **词表只作线索**：`scan`/`suggest` 的词表命中只用于定位；改写必须按句/段重写，
  禁止逐词替换。`suggest` 同时给结构线索（段落同构、句长整齐、鱼八股大词、金句结尾）。
- **鱼八股**：结构固化、正确的空话、内容同质化；命中 ≥2 类必须重写（见 `rules/machine-flavor.md` §10）。
- **转换闸门**：`compose` 要求 S7 done（或 S7 excluded）；docx mtime 校验。
- **确认闸门**：`stage enter` 检查所需 U-gate；`next` 返回 `pendingApproval`。
- **作用域**：`scope` 决定哪些阶段 `excluded`，硬门禁只作用于范围内阶段。
- **素材后补**：`partial` 允许；后补触发下游 `stale`。

### 6.4 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 用法错误 |
| 2 | 检查未通过 |
| 3 | 前置缺失 / 非法跳步 / 非法跳转 / 提前转换 |
| 4 | 不支持或 IO 错误 |
| 5 | 预算耗尽（blocked） |
| 6 | 等待用户确认（approval 缺失） |

## 7. DSH 工作模式

- 形态：目录预设 `$DSH_HOME/.agent-presets/docwrite/{preset.yml, agent.cordis.yml}`。
- persona 写死八条规则：第一动作 `status` → `next`；pendingApproval 非空先问用户；不许自称完成；S7 只许亲手 edit；三轴评审必须派子代理；S8 前不转格式；硬门禁不可跳；不许机械同义替换。
- skill：12 个 core + 工具类，放 `.dsh/skills/`。
- 扩展：`extensions/` 可插拔，`docwrite ext enable/disable`，按项目记录。
- PPT：`docwrite-pptx` 适配器调用 `vendor/ppt-master`；预览由 `docwrite preview` 统一管理。
- 安装：`docwrite mode install`（备份 + 复制 + YAML 校验）；卸载 `mode uninstall`；不动 profile patch。

## 8. 迁移与验收

| 项目 | 处理 |
| --- | --- |
| 职业生涯规划书 | 模板复制进新 `projects/`；md 写内容 → S7 模型亲手降重 → S8 填充；与 OLD 产物逐段对比 |
| 个人简历 | `from-md` 在 S8 生成，验证一页内、六章节齐全 |
| 英语学术演讲 | 迁移 md 与 pptx；PPT 走适配器 |

验收：

- `npm test` 全绿；
- 真实模板填充后 Word 可开、样式不变、占位符清零；
- 跳过硬门禁 → exit 3；
- 缺 U-gate → exit 6；
- 手改产物 → stale；
- 评审不过 → 正确回退并计次；
- 三轴评审由子代理完成；主代理自评 → exit 3；
- AI 率低但机器味超标 → 不允许 pass；
- 预算耗尽 → exit 5；
- 提前 `compose` → exit 3；
- `reduce` 无写回命令（命令表断言）；
- 端到端从 `init` 到 `deliver` 全 PASS。

## 9. 里程碑

| 里程碑 | 内容 | 完成标志 |
| --- | --- | --- |
| M0 | 归档到 `OLD/` | ✅ 已完成 |
| M1 | 三份文档定稿 | PLAN / WORKFLOW / SKILLS 通过评审 |
| M2 | 骨架 + zip + docx 读 + 测试 | `docwrite docx read` 可用 |
| M3 | docx 写 / 填充 / md 互转 | 格式不丢、占位符清零 |
| M4 | scan / suggest / diff + 三轴 rubric + 机器味清单 | 修改率可复现，只读；rubric 可被评审包引用 |
| M5 | 状态机 + 12 阶段 + 确认点 + 循环 + 独立评审协议 | 缺确认 exit 6，回退可复现，自评被拒 |
| M6 | 作用域入口 + 素材后补 | `--scope scan` 可单跑，partial 不阻塞 |
| M7 | registry + dispatch + 扩展 | 扩展可启停，越权被拒 |
| M8 | pptx 文本层 + preview 接管 | 预览可启停、端口可配、不弹浏览器 |
| M9 | 迁移三个存量项目 | 新旧产物文本一致 |
| M10 | DSH 模式安装 + 端到端验收 | `/preset docwrite` 可用，全程走通 |
| M11 | TUI / Desktop 声明式预设 | TUI `preset-docwrite` 行、Desktop bundle 均能挂载；预设 roster 无 broken |
| M12 | Desktop 工具 + 门禁 + GUI + 人工验收 | 10 个工具可用；S8 前 docx 被拒；面板/验收卡可用 |
| M13 | 降重 v2 + 开源发布 | 词表只作线索、鱼八股规则落地；GitHub 仓库带 `dsh-plugin` topics |

## 10. 风险与取舍

| 风险 | 应对 |
| --- | --- |
| OOXML 写回破坏 Word | 节点级最小改动 + LibreOffice 转 PDF 冒烟 + 真实模板回归 |
| 循环失控 | 每边 3 次、全局 8 次、耗尽即 blocked |
| 用户确认太频繁 | 按 scope 减少确认点；合并阶段只保留关键确认 |
| 亲手降重太慢 | `suggest` 给候选，但只读；可分多轮 edit，每轮留检查点 |
| 词表替换导致上下文割裂 | `suggest` 明确标注“线索不是替换表”；按句/段重写；改完读前后各一句 |
| 鱼八股/AI 新八股 | 扫描加 `yuBagu` 组；rubric 命中 ≥2 类必须 revise；skill 要求删结构、删大词、补事实 |
| 预设加载失败 | 安装前备份、YAML 校验、一键卸载；preset 组合内联而不是 include |
| 开源仓库泄露个人文档 | `.gitignore` 排除 `projects/`、`OLD/`、`vendor/`、`node_modules/`；只发布工具链 |
| ppt-master 版本漂移 | 适配器只依赖 CLI 入口与端口约定，不改源码 |

## 11. 交付物

1. `docs/PLAN.md`、`docs/WORKFLOW.md`、`docs/SKILLS.md`
2. 根目录 Node 工程（`package.json` / `bin/` / `src/` / `test/`）+ `npm test`
3. `.dsh/skills/*/SKILL.md` + `skills/registry.json` + `extensions/`
4. `presets/docwrite/` + `docwrite mode install`（TUI 声明式行）
5. `harness/docwrite-desktop/`（Desktop bundle：预设/10 工具/门禁/GUI/验收卡）
6. `README.md` + `LICENSE` + `.gitignore`；GitHub `HiBer2007/DSH-Document-Writer`，topics 含 `dsh-plugin`
7. `OLD/README.md`（已完成）
