# 文档工坊 for DSH Desktop

> 仅用于学习与交流，请勿用于学术用途；请遵守有关法律法规。完整声明见
> [DISCLAIMER.md](../../DISCLAIMER.md)。本声明面向使用者，不是模型拒答规则；
> 正常文档写作请求照常执行。

这个 bundle 把文档工坊接进 DSH Desktop（`desktop` profile），并按**当前会话工作区**运行：

1. **预设**：注册 `docwrite`（显示名「文档工坊」），组合来自
   `presets/docwrite/agent.cordis.yml`，与 TUI 共用同一份 12 阶段契约。
2. **封装工具**（13 个）：`docwrite_init`、`docwrite_constraints`、`docwrite_status`、
   `docwrite_next`、`docwrite_stage_enter`、`docwrite_stage_done`、`docwrite_approve`、
   `docwrite_review_open`、`docwrite_review_submit`、`docwrite_review_extend`、
   `docwrite_visual_check`、`docwrite_verify`、`docwrite_deliver`。
   工具和门禁作为「文档工坊」预设的子插件（`preset.js`）注册，只在该预设的 agent scope 内可见；
   标准/极简等其他模式不会看到，也不会把工具描述带进提示词。全局 `docwrite-harness` 只保留面板路由。
   工具不依赖安装机上的固定路径：CLI 代码在插件包的 `cli/` 里，`cwd` 是当前会话工作区；
   工作区若自带 `bin/docwrite.mjs`，优先用工作区那份。
3. **强制流程机**：`ctx.tools.guard()` 在 S8 成型前拒绝 `write` / `edit` 产出
   `<workspace>/projects/<name>/**/*.docx|pptx`；`docwrite_stage_done` 只能完成当前阶段。
   CLI 侧的门禁（哈希、评审、U 确认、回退预算）仍然是唯一判据。
4. **GUI 区**：左侧栏「文档工坊」面板 + `main` 键控页面。面板读取
   `GET /docwrite/state`，汇总所有活会话工作区里的项目，展示每个项目的 12 阶段进度、
   待确认点、blocked 原因，并标注所属工作区。每张卡片可以手动**归档/恢复**：
   归档只写 `.run/panel.json`，不删数据、不改流程状态；右上角可切换显示已归档项目。

## 安装

在 DSH Desktop 会话里用 `plugin_manager` 安装本目录（绝对路径）：

```
action: install_bundle
target: <绝对路径>\harness\docwrite-desktop
```

安装后确认：

- `list_plugins` 出现 `preset-docwrite` 与 `docwrite-harness`；
- `GET /docwrite/presets` 里 `docwrite` 为 `resolved=true, broken=null`；
- 左侧栏出现「文档工坊」图标；新会话的预设菜单出现「文档工坊」。

**首次加载**会在 DSH 内弹出使用声明与首次安装提示；点“我已知悉并同意”后写入
本地记录，不再自动弹。之后可从面板右上角「声明」按钮重开。

## 工作区与 CLI

- **工作区**只放文档：`projects/<name>/`、模板、素材、交付物。
- **CLI 与 skill 库**在插件包内（`cli/`、`skills/`），不读取其他工作区。
- 空工作区运行 `docwrite_init` 时，会把插件 `skills/` 里缺失的 skill 复制到
  `<workspace>/.dsh/skills`，模型随后能看到 S1 的约束 schema。
- 工具执行时用 `ctx.workingDirectory.ensure(agent)` 解析会话目录，并以它为 `cwd` 调 CLI。
- GUI 面板不依赖 `useWorkspaces` 的当前项：它请求不带 `root` 的 `/docwrite/state`，
  Host 汇总所有**活会话**里已初始化项目的工作区；显式 `?root=` 时只看那一个工作区。
- 归档走 `POST /docwrite/archive`（`{root, project, archived}`），和 CLI
  `docwrite archive|unarchive` 共用 `.run/panel.json`。

如果确实需要一个没有会话时的回退根，可以在 `cordis.patch.yml` 的
`docwrite-harness` 行加 `config.root`；正常安装不需要。

修改 `presets/docwrite/agent.cordis.yml` 后，运行
`node scripts/sync-desktop-preset.mjs`；修改 CLI 后，运行
`node scripts/sync-desktop-cli.mjs`。测试会校验 preset 与 `agent.cordis.yml` 一致。

## 验证

```powershell
# 预设已注册且可解析
Invoke-RestMethod http://127.0.0.1:<port>/docwrite/presets

# 所有活会话工作区的流水线快照（面板用的就是这个）
Invoke-RestMethod http://127.0.0.1:<port>/docwrite/state

# 只看一个工作区
$root = 'F:\你的文档工作区'
Invoke-RestMethod ("http://127.0.0.1:<port>/docwrite/state?root=" + [uri]::EscapeDataString($root))

# 工具已挂载（在会话里）
#   docwrite_init / docwrite_constraints / docwrite_status / docwrite_next
#   docwrite_stage_enter / docwrite_stage_done / docwrite_approve
#   docwrite_review_open / docwrite_review_submit / docwrite_review_extend
#   docwrite_visual_check / docwrite_verify / docwrite_deliver

# 门禁：S8 前写 <workspace>/projects/<name>/**/*.docx 应被拒绝
```

## 与 TUI 的关系

TUI 的注册由 `docwrite mode install --profile dsh-tui` 写入声明式
`preset-docwrite` 行，指向同一份 `presets/docwrite/agent.cordis.yml`；本 bundle
是 Desktop 侧的另一份声明，两者互不依赖。
