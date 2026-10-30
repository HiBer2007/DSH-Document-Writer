# STATUS — 实施进度

> 每个里程碑完成后更新；与 `docs/PLAN.md` 的里程碑编号对应。验收结论见 `docs/ACCEPTANCE.md`。

## 全部里程碑

- **M1 文档定稿** ✅
- **M2 骨架 + zip + docx 读** ✅
- **M3 docx 写 / 填充 / 替换 / md 互转** ✅
- **M4 扫描 / 建议 / 比对** ✅
- **M5 12 阶段状态机 + 确认点 + 循环 + 独立评审** ✅
- **M6 作用域与素材后补** ✅
- **M7 扩展机制** ✅
- **M8 pptx 文本层 + 预览接管** ✅
- **M9 三个存量项目迁移** ✅
  - 职业生涯规划书：封面 7 项与旧产物逐项一致
  - 个人简历：章节 5/5，md → docx 重建
  - 英语学术演讲：12 页 deck 可读
- **M10 verify + deliver + DSH 模式 + 端到端** ✅
  - `verify` 哈希/检查/扩展三合一，出 PASS/FAIL 报告
  - `deliver` 复制成品 + `delivery-manifest.json`
  - 13 个 skill + `skills/registry.json` + `dispatch`
  - 全局预设目录保留给旧版；TUI 0.14 走声明式 `preset-docwrite` 行
  - 端到端测试跑通 12 阶段 → verify PASS → deliver
- **追加：TUI 声明式预设注册** ✅
  - TUI 0.14 的 `agentPresets` 只认 `@deepseek-ai/dsh-agent-preset` 行，不再扫描 `$DSH_HOME/.agent-presets`
  - `docwrite mode install --profile dsh-tui` 写入 `preset-docwrite` 行；旧动态 `.mjs` 自动清理
  - `dsh --profile dsh-tui --dump-config` 组合通过；预设包与 include 包从 dsh 安装目录可解析
- **追加：DSH Desktop 集成** ✅
  - bundle `harness/docwrite-desktop`：声明式预设 + 13 个封装工具 + S8 硬门禁 + `/docwrite/state`、`/docwrite/presets` 两条只读路由 + 左侧栏「文档工坊」面板
  - 工具与门禁按**当前会话工作区**运行（`ctx.workingDirectory.ensure`）；CLI 打包在插件的 `cli/`，不再读安装时的固定路径
  - 已安装到 `desktop` profile；`/docwrite/presets` 返回 `docwrite` 且 `resolved: true`、`broken: null`
  - `sidebar.panellist` 与 `main` 槽位均已注册并 active；S8 前写 docx 被实测拒绝
  - 预设组合内联而不是 include：include 的子行在启动期 audit 成 “never started”，预设会进不了工作模式选择器
  - persona suffix 只写静态文本：DSH prompt 变量只注册 `provider` / `model`，`{{cwd}}` 会报 unknown prompt variable
- **追加：约束 JSON 契约** ✅
  - `constraints init` 生成合法骨架，`constraints template` 打印可复制 JSON，`constraints check` 校验
  - S1 检查器校验 `id/type/priority/source/check` 必填、id 唯一、priority 只能是 hard/soft、冲突必须有 resolution
  - `docwrite-constraints` skill 给出完整 schema 表与可复制示例，模型不再靠猜
  - bundle 内置 `skills/`；`docwrite_init` 把缺失的 skill 复制到工作区 `.dsh/skills`，空工作区也能看到 S1 规范
  - `docwrite_constraints` 工具提供 template/init/check 三个动作
- **追加：评审轮次追加机制** ✅
  - `review extend` 必须 `--by user` + 用户原话；每阶段默认最多追加 2 轮，状态与 `review.extend` 事件留痕
  - 有 open 评审时必须先 `review submit`；未到上限不能预买轮次；用尽后只能回退或接受现有结论
  - Desktop 新增 `docwrite_review_extend`：弹验收卡，用户点“允许”才追加，模型不能自批
- **追加：Desktop 人工验收工具** ✅
  - `docwrite_visual_check`：阶段进度、产物清单、关键指标、正文预览做成验收卡
  - 三选一：合格 / 需要修改 / 暂不判断；不合格时收集需要修改的地方
  - 只记录人工验收意见，不替代 U 确认，也不替代 `stage done` 的 CLI 检查
- **追加：取消 S7 统一 40% 门槛** ✅
  - `modificationRateMin` / `minDiffCheckpoints` 默认 0；只有项目显式配置时才检查
  - S7 的主门禁改为独立子代理三轴评审；初稿已达标可保留原文，或由用户确认 `waive S7`
  - 不再为了凑修改率做同义改写/拆句；错误信息明确写“项目配置下限”，不冒充通用规则
- **追加：降重 v2（词表只作线索）** ✅
  - `suggest` 明确标注“词表只是线索，不是替换表”，新增结构线索（段落同构、句长整齐、鱼八股大词、金句结尾）
  - `scan` 增加 `yuBagu` 维度；`rules/machine-flavor.md` §10 定义鱼八股；rubric 命中 ≥2 类必须 revise
  - `docwrite-reduce` skill 要求按句/段重写、改完读前后各一句、禁止逐词替换
  - 新增 `rules/ai-detection.md`：GLTR / DetectGPT / Fast-DetectGPT / Binoculars / 水印 / RAID / M4 等论文与机制，明确 AI 率是代理分
- **追加：开源发布** ✅
  - GitHub `HiBer2007/DSH-Document-Writer`，topics 含 `dsh-plugin`、`deepseek-harness`、`cordis-plugin`
  - `.gitignore` 排除 `projects/`、`OLD/`、`vendor/`、`node_modules/`；只发布工具链
- **追加：PDF 导出（可选后端）** ✅
  - `docwrite pdf <docx> [out.pdf] [--backend auto|kit|soffice]`
  - 后端链：`@deepseek-ai/libreoffice-kit`（可选）→ `soffice`（可选外部程序）→ 明确报错
  - 本机两个后端都未安装，失败路径已验证（exit 4，提示安装方式）
- **追加：ppt-master 包装** ✅
  - `ppt init|import|validate|info|build|check`
  - 默认用 `OLD/.venv/Scripts/python.exe`（依赖已装：python-pptx 1.0.2）
  - 真实跑通：12 页 SVG → PPTX（52,183 字节）
  - `--dry-run` 只打印命令，不执行

## 测试

```
npm test  →  126 tests, 0 fail
```

覆盖：XML/zip/docx/pptx、填充/替换/md、扫描/建议/比对、状态机/确认点/循环/评审、作用域/素材/扩展、verify/deliver、模式安装（含声明式 preset 行迁移）、12 阶段端到端、PDF 后端选择、ppt 命令映射、Desktop 插件 manifest/路由/门禁/真实 CLI 调用、人工验收工具、鱼八股扫描与结构线索、按会话工作区运行与内置 CLI。

## 当前可用命令

```
init / status / next / approve
stage enter|done|waive|reopen|jump
review open|submit|status / verify / deliver / unblock
scope show|set / source add|declare|resolve|status
ext list|install|enable|disable / skills list|show / dispatch
docx read|inspect|fill|replace|md / pptx read|notes|fill / from-md
scan / suggest / diff / compose / constraints show|template|init|check
spec|outline|draft|reduce check / history / archive
ppt init|import|validate|info|build|check
pdf <docx> [out.pdf] [--backend auto|kit|soffice]
preview start|status|stop / mode install|status|uninstall [--profile dsh-tui]
```

## 切换工作模式

```
TUI：新会话里 /preset docwrite
或：DSH_TUI_PRESET=docwrite dsh tui

Desktop：新建会话时选择「文档工坊」预设
（bundle 已装到 desktop profile；见 harness/docwrite-desktop/README.md）
```

## 遗留项

1. PDF 实际转换需要装可选后端（`npm i @deepseek-ai/libreoffice-kit` 或 LibreOffice）；本机未装，只验证了失败路径与 kit 接口的单测。
2. 真实 Word 打开验证建议人工做一次（写入只改 `<w:t>`，风险低）。
3. `OLD/` 保持冻结；`vendor/ppt-master` 只读使用。
4. TUI 的 `/preset` 需要重启 TUI 后做一次人工确认；组合、内联 preset 与包解析已通过 `--dump-config` 验证。
5. Desktop 面板的视觉确认需要刷新页面后点左侧栏「文档工坊」；槽位注册、数据路由与预设 `broken: null` 已实测。
6. 开源仓库：`git@github.com:HiBer2007/DSH-Document-Writer.git`；`projects/`、`OLD/`、`vendor/` 不进仓库。
