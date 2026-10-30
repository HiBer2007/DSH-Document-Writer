# DSH Document Writer（文档工坊）

> 给 DeepSeek Harness（DSH）用的 12 阶段文档写作流水线：
> 先写 Markdown，模型亲手降重，独立子代理评审，用户逐关确认，最后才转 docx/pptx。

- **不做**“一键降重”脚本：降重必须模型本人逐段 `edit`。
- **词表只作线索**：`scan` / `suggest` 的词表命中只用来定位可疑句，不是替换表。
- **避免鱼八股**：结构固化、正确的空话、内容同质化，命中 ≥2 类必须重写。
- **硬门禁在 CLI**：产物、哈希、评审、U 确认、回退预算都由 `stage done` 检查。
- **DSH 原生**：TUI 用声明式 preset 行；Desktop 用 bundle，带工具、门禁和只读面板。

## 12 阶段

| 阶段 | 名称 | 门禁 | 产物 |
| --- | --- | --- | --- |
| S0 | 受理 | 软 | `brief.md` |
| S1 | 约束 | 硬 | `constraints.json` |
| S2 | 规格 | 硬 | `spec.md` |
| S3 | 素材 | 软 | `sources/index.json` |
| S4 | 提纲 | 软 | `outline.md` |
| S5 | 初稿 | 软 | `draft.md` |
| S6 | 内容评审 | 硬 | `review-content.json` |
| S7 | 降重 | 软 | `draft_reduced.md`、`reduce-report.json`、`human-review.json` |
| S8 | 成型 | 硬 | `build/*.docx` |
| S9 | 形式评审 | 硬 | `review-form.json` |
| S10 | 终检 | 硬 | `verify-report.md` |
| S11 | 交付 | 硬 | `deliver/*`、`delivery-manifest.json` |

## 快速开始

```powershell
git clone git@github.com:HiBer2007/DSH-Document-Writer.git
cd DSH-Document-Writer
npm install
npm test
node bin/docwrite.mjs help
```

需要 Node.js ≥ 20。运行时依赖只有 `fflate` 与 `yaml`。

## 在 DSH TUI 里使用

```powershell
node bin/docwrite.mjs mode install --profile dsh-tui
```

重启 TUI，`/preset` 里选择「文档工坊」。
安装会把 `preset-docwrite` 行内联进 profile patch；组合来自
`presets/docwrite/agent.cordis.yml`，不再依赖 `$DSH_HOME/.agent-presets` 目录扫描。

卸载：

```powershell
node bin/docwrite.mjs mode uninstall --profile dsh-tui
```

## 在 DSH Desktop 里使用

Desktop 插件包在 `harness/docwrite-desktop`。安装前先把
`harness/docwrite-desktop/cordis.patch.yml` 里的 `docwrite-harness.config.root`
改成你的仓库路径（默认 `K:/AI文档编写`），然后：

```
plugin_manager  action: install_bundle
                target: <绝对路径>/harness/docwrite-desktop
```

刷新 Desktop 页面：

- 新建会话时选择「文档工坊」；
- 左侧栏出现「文档工坊」面板，显示阶段进度、待确认点、blocked 原因；
- 模型侧多出 10 个工具：`docwrite_status`、`docwrite_next`、`docwrite_stage_enter`、
  `docwrite_stage_done`、`docwrite_approve`、`docwrite_review_open`、
  `docwrite_review_submit`、`docwrite_visual_check`、`docwrite_verify`、`docwrite_deliver`；
- `docwrite_visual_check` 会把当前成果做成验收卡（阶段进度、产物、指标、正文预览），
  问用户“合格 / 需要修改 / 暂不判断”。

强制门禁：S8 成型前，`write` / `edit` 写
`projects/<name>/**/*.docx|pptx` 会被拒绝；`docwrite_stage_done` 只能完成当前阶段。

## 降重规则（重要）

- 词表只是线索，不是替换表。把“赋能”换成“帮助”不叫改写，模板和空逻辑还在。
- 按句/段重写：先读懂这一段在论证什么，再改句序、主语、信息密度，补具体事实。
- 改完读前后各一句，指代、术语、逻辑断裂就回滚重写。
- **鱼八股**：结构固化（总—分—总 / 现状—问题—对策 / 三段式）、正确的空话
  （赋能、抓手、闭环、底层逻辑、新篇章、答卷）、排比三连、金句结尾、情绪拔高。
  命中 ≥2 类必须 revise。详见 `rules/machine-flavor.md` §10。
- 降重执行者必须是模型本人；评审必须派新上下文子代理，主代理不得自评。
- **AI 率是代理分**：检测器在改写、跨模型、跨领域、中文语境下会误判；不唯分数，
  以三轴评审 + 独立子代理 + 人工确认为准。论文与机制见 `rules/ai-detection.md`。

## 目录

```
bin/                    CLI 入口
src/                    Node.js 实现（docx/pptx、状态机、扫描、评审、verify、deliver）
.dsh/skills/            DSH 自动发现的核心 skill
rules/                  评审 rubric、机器味清单、扫描规则
presets/docwrite/       「文档工坊」预设组合
harness/docwrite-desktop/  DSH Desktop bundle（预设/工具/门禁/GUI/验收卡）
test/                   node:test
docs/                   PLAN / WORKFLOW / SKILLS / STATUS / ACCEPTANCE
```

`projects/`、`OLD/`、`vendor/` 是本地个人文档、冻结存档与第三方工具，已在
`.gitignore` 中排除，不会进入仓库。

## 可选后端

- PDF：`npm i @deepseek-ai/libreoffice-kit` 或安装 LibreOffice；
- PPT：`vendor/ppt-master`（第三方，只读调用，不移植）。

## 话题

`dsh-plugin` · `deepseek-harness` · `cordis-plugin` · `document-automation` ·
`docx` · `pptx` · `ai-writing`

## License

MIT
