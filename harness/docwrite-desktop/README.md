# 文档工坊 for DSH Desktop

这个 bundle 把 `K:\AI文档编写` 的文档工坊接进 DSH Desktop（`desktop` profile）：

1. **预设**：注册 `docwrite`（显示名「文档工坊」），组合来自
   `presets/docwrite/agent.cordis.yml`，与 TUI 共用同一份 12 阶段契约。
2. **封装工具**：`docwrite_status`、`docwrite_next`、`docwrite_stage_enter`、
   `docwrite_stage_done`、`docwrite_approve`、`docwrite_review_open`、
   `docwrite_review_submit`、`docwrite_verify`、`docwrite_deliver`。
   工具直接调用 `node bin/docwrite.mjs`，模型不再手拼 PowerShell。
3. **强制流程机**：`ctx.tools.guard()` 在 S8 成型前拒绝 `write` / `edit` 产出
   `projects/<name>/**/*.docx|pptx`；`docwrite_stage_done` 只能完成当前阶段。
   CLI 侧的门禁（哈希、评审、U 确认、回退预算）仍然是唯一判据。
4. **GUI 区**：左侧栏「文档工坊」面板 + `main` 键控页面，读取
   `GET /docwrite/state`，展示每个项目的 12 阶段进度、待确认点、blocked 原因。

## 安装

在 DSH Desktop 会话里用 `plugin_manager` 安装本目录（绝对路径）：

```
action: install_bundle
target: K:\AI文档编写\harness\docwrite-desktop
```

安装后确认：

- `list_plugins` 出现 `preset-docwrite` 与 `docwrite-harness`；
- `GET http://127.0.0.1:<port>/docwrite/state` 返回 `{ ok: true, projects: [...] }`；
- 左侧栏出现「文档工坊」图标；新会话的预设菜单出现「文档工坊」。

## 配置

`cordis.patch.yml` 里有两处绝对路径，移动仓库时要一起改：

- `preset-docwrite.config.plugins[0].config.path`：指向
  `presets/docwrite/agent.cordis.yml` 的 `file://` URL；
- `docwrite-harness.config.root`：项目根。

TUI 侧由 `docwrite mode install --profile dsh-tui` 自动生成 include 路径，不需要手改。

## 验证

```powershell
# 预设已注册且可解析
Invoke-RestMethod http://127.0.0.1:14558/docwrite/presets

# 流水线快照
Invoke-RestMethod http://127.0.0.1:14558/docwrite/state

# 工具已挂载（在会话里）
#   docwrite_status / docwrite_next / docwrite_stage_enter / docwrite_stage_done
#   docwrite_approve / docwrite_review_open / docwrite_review_submit
#   docwrite_verify / docwrite_deliver

# 门禁：S8 前写 projects/<name>/**/*.docx 应被拒绝
```

## 与 TUI 的关系

TUI 的注册由 `docwrite mode install --profile dsh-tui` 写入声明式
`preset-docwrite` 行，指向同一份 `presets/docwrite/agent.cordis.yml`；本 bundle
是 Desktop 侧的另一份声明，两者互不依赖。
