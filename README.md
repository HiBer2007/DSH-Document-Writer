# DSH Document Writer（文档工坊）

> 给 DeepSeek Harness（DSH）用的 12 阶段文档写作流水线：
> 先写 Markdown，模型亲手降重，独立子代理评审，用户逐关确认，最后才转 docx/pptx。

- **不做**“一键降重”脚本：降重必须模型本人逐段 `edit`。
- **词表只作线索**：`scan` / `suggest` 的词表命中只用来定位可疑句，不是替换表。
- **避免鱼八股**：结构固化、正确的空话、内容同质化，命中 ≥2 类必须重写。
- **搭配要正常**：形容词的语义特征得落在名词上；“值钱的追问”应改成“有价值的追问 /
  更值得追问的问题”，不能用经济词硬贴抽象名词。
- **硬门禁在 CLI**：产物、哈希、评审、U 确认、回退预算都由 `stage done` 检查。
- **DSH 原生**：TUI 用声明式 preset 行；Desktop 用 bundle，带工具、门禁和只读面板。

## 声明

> 完整声明见 [DISCLAIMER.md](DISCLAIMER.md)。Desktop 插件首次加载会在 DSH 内弹窗，
> 需要点“我已知悉并同意”后才会记录已读；之后可从面板的「声明」按钮重开。

- 本项目**仅用于学习与交流**，不构成写作服务、学术成果、法律意见或任何形式的交付承诺。
- **请勿用于学术用途**：包括但不限于代写论文、课程作业、考试答卷、学位申请材料，
  以及任何违反学校、期刊、机构学术诚信规定的用途。
- 使用者应自行遵守所在国家/地区的法律法规、学校与机构规范、以及相关平台的服务条款；
  不得用本项目伪造数据、抄袭、规避审查或实施其他违法行为。
- 因使用或滥用本项目造成的任何后果，由使用者自行承担；作者与贡献者不承担责任。
- 本声明面向使用者，**不是模型的行为指令**，不会让模型拒绝正常的文档写作请求；
  是否合规由使用者判断。
- 软件按“现状”提供，不附带任何明示或暗示担保。详见
  [LICENSE](LICENSE)、[COPYING](COPYING)、[NOTICE](NOTICE)。

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

默认克隆的是 `main`（开发分支）；要用稳定版，见下面的「版本与发布」。

## 版本与发布

仓库用两个长期分支 + 版本标签：

| 引用 | 用途 |
| --- | --- |
| `main` | 开发分支，日常提交先到这里 |
| `release` | 稳定发布快照；当前指向 `v1.2.1` |
| `v1.2.1` | 当前 Release 标签，与 `package.json` 的 `version` 一致 |

- **用稳定版**：克隆 `release` 或检出标签：

  ```powershell
  git clone --branch release git@github.com:HiBer2007/DSH-Document-Writer.git
  # 或
  git clone git@github.com:HiBer2007/DSH-Document-Writer.git
  cd DSH-Document-Writer
  git checkout v1.2.1
  ```

- **跟进最新功能**：用 `main`。
- **发版流程**：

  ```powershell
  git switch main
  npm test
  git switch release
  git merge --ff-only main
  git tag -a v1.2.2 -m "文档工坊 v1.2.2"
  git push origin release v1.2.2
  git switch main
  ```

  如果 `main` 已经分叉、不能快进，用 `git merge --no-ff main`，或只 cherry-pick
  要发布的提交。

- `release` 只放可发布状态，不直接加功能提交；功能、重构、文档修改先走 `main`。
- 发布前把 `package.json` 的 `version` 与标签改成同一个版本号；当前是
  `1.2.1` / `v1.2.1`。
- **检查更新**：面板右上角「检查更新」按钮，或 CLI：

  ```powershell
  node bin/docwrite.mjs update [--json]
  ```

  打开面板后每 6 小时自动检查一次；有新版时右下角弹窗，显示 Release 说明和
  **立即更新 / 跳过此版本**。

  - **立即更新**只对 git 安装生效：工作区干净时把当前分支快进到最新 Release tag；
    非 git 安装、有未提交修改或不能快进时，会报错并给出 Release 链接；
  - **跳过此版本**只跳过当前 tag，下一版仍会提示；
  - 检查本身只读；只有点「立即更新」才会修改 git 工作区。

## 首次安装

### TUI

1. Node.js ≥ 20，先跑 `npm install`、`npm test`；
2. `node bin/docwrite.mjs mode install --profile dsh-tui`；
3. **重启 TUI**，`/preset` 里才会出现「文档工坊」；
4. 新建会话，先运行 `node bin/docwrite.mjs status`（或让模型调用 status 工具）。

### Desktop 插件

1. 用 `plugin_manager` 以**绝对路径**安装 `harness/docwrite-desktop`；
2. **刷新页面**，新建会话时选择「文档工坊」；
3. 左侧栏出现「文档工坊」面板；空工作区先让模型调用 `docwrite_init`；
4. 访问 `GET /docwrite/presets`，确认 `docwrite` 为 `resolved=true, broken=null`；
5. 工作模式菜单没有「文档工坊」时：重载 bundle → 刷新页面；仍不行就看
   `/docwrite/presets` 的 `resolveError` / `broken`；
6. 首次加载会在 DSH 内弹出使用声明；点“我已知悉并同意”后写入本地记录，之后不再自动弹。

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

Desktop 插件包在 `harness/docwrite-desktop`。插件**不绑定固定路径**：每次工具调用都解析
当前会话的工作区，GUI 面板汇总所有活会话工作区里的项目。直接安装：

```
plugin_manager  action: install_bundle
                target: <绝对路径>/harness/docwrite-desktop
```

刷新 Desktop 页面：

- 新建会话时选择「文档工坊」；
- 左侧栏出现「文档工坊」面板，显示阶段进度、待确认点、blocked 原因；
  项目卡片可手动**归档/恢复**，归档只写 `.run/panel.json`，数据和流程状态都不动；
  右上角有「检查更新」；有新版时右下角弹窗显示 Release 说明，可立即更新或跳过此版本；
- 模型侧多出 13 个工具：`docwrite_init`、`docwrite_constraints`、`docwrite_status`、`docwrite_next`、`docwrite_stage_enter`、
  `docwrite_stage_done`、`docwrite_approve`、`docwrite_review_open`、`docwrite_review_submit`、
  `docwrite_review_extend`、`docwrite_visual_check`、`docwrite_verify`、`docwrite_deliver`；
  **这些工具只在「文档工坊」预设内注册**，标准/极简等其他模式不会看到，也不会带进相关提示词；
- `docwrite_visual_check` 会把当前成果做成验收卡（阶段进度、产物、指标、正文预览），
  问用户“合格 / 需要修改 / 暂不判断”。

强制门禁：S8 成型前，`write` / `edit` 写
`projects/<name>/**/*.docx|pptx` 会被拒绝；`docwrite_stage_done` 只能完成当前阶段。
工具和门禁都以**当前会话工作区**为根；不再读取安装时写死的固定路径。

## 降重规则（重要）

- 词表只是线索，不是替换表。把“赋能”换成“帮助”不叫改写，模板和空逻辑还在。
- 按句/段重写：先读懂这一段在论证什么，再改句序、主语、信息密度，补具体事实。
- 改完读前后各一句，指代、术语、逻辑断裂就回滚重写。
- **鱼八股**：结构固化（总—分—总 / 现状—问题—对策 / 三段式）、正确的空话
  （赋能、抓手、闭环、底层逻辑、新篇章、答卷）、排比三连、金句结尾、情绪拔高。
  命中 ≥2 类必须 revise。详见 `rules/machine-flavor.md` §10。
- 降重执行者必须是模型本人；评审必须派新上下文子代理，主代理不得自评。
- **不设统一修改率门槛**：`modificationRateMin` / `minDiffCheckpoints` 默认 `0`；
  只有项目显式配置时才作为可选过程保底。初稿已经达标就保留原文或 `waive S7`，
  禁止为凑 40% 做同义改写、拆句凑数——那是做作，不是降重。
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

GNU Lesser General Public License v3.0（LGPL-3.0-only）。

- [LICENSE](LICENSE)：LGPL-3.0 全文
- [COPYING](COPYING)：LGPL-3.0 引入的 GPL-3.0 全文
- [NOTICE](NOTICE)：版权与许可声明

本项目按“现状”提供，不附带任何担保；使用前请阅读 [DISCLAIMER.md](DISCLAIMER.md)。
