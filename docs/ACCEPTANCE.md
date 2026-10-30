# ACCEPTANCE — 验收报告

> 对应 `docs/PLAN.md` 的 M1–M10、追加的 PDF/ppt 包装，以及 R1–R8。

## 结论

**通过。** 114 项测试全绿；12 阶段端到端测试跑通并产出 `verify-report.md`（PASS）与 `deliver/`；三个存量项目已迁移并留下对比报告；DSH 工作模式已安装，skill 库已被 DSH 目录识别；ppt-master 包装在真实 12 页项目上跑通；PDF 导出完成可选后端接入与失败路径验证；TUI 与 Desktop 均通过声明式 `preset-docwrite` 注册「文档工坊」，Desktop 另带 10 个封装工具、S8 硬门禁、只读 GUI 面板与 `docwrite_visual_check` 人工验收工具；降重规则明确“词表只作线索”，并加入鱼八股扫描与规避要求。

## 里程碑证据

| 里程碑 | 证据 |
| --- | --- |
| M1 文档定稿 | `docs/PLAN.md`、`WORKFLOW.md`、`SKILLS.md`、`rules/human-rubric.md`、`rules/machine-flavor.md` |
| M2 docx 读 | `test/docx.test.mjs`、`test/real-template.test.mjs`；真实模板 50 段 / 1 表可读 |
| M3 docx 写 / 填充 | `test/docx-ops.test.mjs`；真实模板封面 7 字段与旧产物逐项一致 |
| M4 扫描 / 建议 / 比对 | `test/scan.test.mjs`、`test/suggest.test.mjs`、`test/diff.test.mjs` |
| M5 状态机 / 确认点 / 循环 / 评审 | `test/project.test.mjs`；缺 U0 → 6；硬门禁 waive → 3；第 4 次回退 → 5；自评 → 3 |
| M6 作用域 / 素材后补 | `test/scope.test.mjs`、`test/sources.test.mjs` |
| M7 扩展机制 | `test/extensions.test.mjs`、`test/verify.test.mjs` |
| M8 pptx / 预览 | `test/pptx.test.mjs`、`test/preview.test.mjs`；真实 12 页 deck 可读；预览启停 |
| M9 三个存量项目 | `projects/*/migration-report.md`：规划书 7/7、简历 5/5、演讲 12 页 |
| M10 DSH 模式 / 端到端 | `test/e2e.test.mjs` 12 阶段 + verify PASS + deliver；`mode status` 已安装 |
| 追加 PDF | `test/pdf.test.mjs`；kit 接口单测 + 无后端 exit 4；本机未装后端，真实转换待装 |
| 追加 ppt 包装 | `test/ppt.test.mjs`；真实项目 `ppt build` 12 页 → 52,183 字节 PPTX |
| 追加 TUI 注册 | `test/mode.test.mjs`；`dsh --profile dsh-tui --dump-config` 含 `preset-docwrite`；`@deepseek-ai/dsh-agent-preset` 与 include 包从 dsh 安装目录可解析 |
| 追加 Desktop | `test/desktop-plugin.test.mjs`、`test/desktop-plugin-runtime.test.mjs`；`/docwrite/presets` 返回 `docwrite resolved=true, broken=null`；`sidebar.panellist` 与 `main` 槽位 active；S8 前 docx 写入实测拒绝；`docwrite_visual_check` 验收结论实测 |
| 追加 降重 v2 | `test/scan.test.mjs`、`test/suggest.test.mjs`；鱼八股维度、结构线索、“词表只是线索”提示均有断言 |
| 追加 开源 | `README.md`、`LICENSE`、`.gitignore`；GitHub `HiBer2007/DSH-Document-Writer`，topics 含 `dsh-plugin` |

## R1–R8 对应

| 规则 | 落地 | 证据 |
| --- | --- | --- |
| R1 模型亲手 edit | CLI 无 `reduce --apply`；S7 要求检查点 ≥3、修改率 ≥40%、三轴评审 | `src/core/checks.mjs`、`test/project.test.mjs` |
| R2 用户深度参与 | 8 个 U 确认点；缺确认 exit 6；approve 必须 `--by user --quote` | `src/core/state.mjs` |
| R3 先降重后转换 | `compose` 要求 S7 done/waived/excluded；否则 exit 3 | `src/commands/misc.mjs`、`test/misc.test.mjs` |
| R4 废弃 Python | 新工具链零 Python 依赖；ppt-master 仅子进程调用 | `package.json` |
| R5 S0 可跳任意阶段 | `init --scope`、`scope set`；范围外标 excluded | `test/scope.test.mjs` |
| R6 素材后补 | `source declare/resolve/status`；后补标 stale | `test/sources.test.mjs` |
| R7 三味同除 | 三轴 rubric + 扫描代理分 + `human-review.json` 阈值检查 | `rules/human-rubric.md` |
| R8 独立评审 | `review open/submit`；reviewer 必须 subagent（S9 允许 cli）；自评 exit 3 | `src/core/review.mjs` |

## 命令清单（已实现）

```
init / status / next / approve / stage enter|done|waive|reopen|jump
review open|submit|status / verify / deliver / unblock
scope show|set / source add|declare|resolve|status
ext list|install|enable|disable / skills list|show / dispatch
docx read|inspect|fill|replace|md / pptx read|notes|fill / from-md
scan / suggest / diff / compose / constraints show|check
spec|outline|draft|reduce check / history / archive
ppt init|import|validate|info|build|check
pdf <docx> [out.pdf] [--backend auto|kit|soffice]
preview start|status|stop / mode install|status|uninstall [--profile dsh-tui]
```

## 遗留项（非本次目标或环境依赖）

1. PDF 实际转换需要装可选后端：`npm i @deepseek-ai/libreoffice-kit`（约 199MB 引擎）或 LibreOffice。本机未装，只验证了失败路径与 kit 接口单测。
2. 真实 Word 打开验证建议人工做一次（写入只改 `<w:t>`，风险低但未自动化）。
3. `OLD/` 保持冻结；`vendor/ppt-master` 只读使用。
4. TUI `/preset` 与 Desktop 左侧栏「文档工坊」的最终视觉确认需要重启 TUI / 刷新页面后人工看一眼；注册、解析、路由、门禁与验收工具均已实测。
5. 开源仓库已推送；`projects/`、`OLD/`、`vendor/` 未进入仓库。

## 复验命令

```
npm test
node bin/docwrite.mjs status --project 职业生涯规划书
node bin/docwrite.mjs mode status
node bin/docwrite.mjs mode status --profile dsh-tui
node bin/docwrite.mjs skills list
node bin/docwrite.mjs scan draft.md --json
node bin/docwrite.mjs suggest draft.md --json
node bin/docwrite.mjs ppt build <ppt-master 项目> --dry-run
node bin/docwrite.mjs pdf <docx> out.pdf
# Desktop：在会话里安装 harness/docwrite-desktop 后
#   GET http://127.0.0.1:<port>/docwrite/presets
#   GET http://127.0.0.1:<port>/docwrite/state
```
