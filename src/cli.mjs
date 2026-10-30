import { CliError, EXIT } from './core/errors.mjs'
import { docxCommand } from './commands/docx.mjs'
import { fromMdCommand } from './commands/convert.mjs'
import { diffCommand, scanCommand, suggestCommand } from './commands/analysis.mjs'
import {
  approveCommand,
  initCommand,
  nextCommand,
  scopeCommand,
  statusCommand,
  unblockCommand,
} from './commands/project.mjs'
import { stageCommand } from './commands/stage.mjs'
import { reviewCommand } from './commands/review.mjs'
import { sourceCommand } from './commands/source.mjs'
import { extCommand } from './commands/ext.mjs'
import { pptxCommand } from './commands/pptx.mjs'
import { previewCommand } from './commands/preview.mjs'
import { verifyCommand } from './commands/verify.mjs'
import { deliverCommand } from './commands/deliver.mjs'
import { modeCommand } from './commands/mode.mjs'
import { dispatchCommand, skillsCommand } from './commands/skills.mjs'
import { pdfCommand } from './commands/pdf.mjs'
import { pptCommand } from './commands/ppt.mjs'
import {
  archiveCommand,
  composeCommand,
  constraintsCommand,
  draftCommand,
  historyCommand,
  outlineCommand,
  reduceCommand,
  specCommand,
} from './commands/misc.mjs'

const COMMANDS = {
  docx: docxCommand,
  'from-md': fromMdCommand,
  scan: scanCommand,
  suggest: suggestCommand,
  diff: diffCommand,
  init: initCommand,
  status: statusCommand,
  next: nextCommand,
  approve: approveCommand,
  stage: stageCommand,
  review: reviewCommand,
  unblock: unblockCommand,
  scope: scopeCommand,
  source: sourceCommand,
  ext: extCommand,
  pptx: pptxCommand,
  preview: previewCommand,
  verify: verifyCommand,
  deliver: deliverCommand,
  mode: modeCommand,
  skills: skillsCommand,
  dispatch: dispatchCommand,
  constraints: constraintsCommand,
  spec: specCommand,
  outline: outlineCommand,
  draft: draftCommand,
  reduce: reduceCommand,
  compose: composeCommand,
  history: historyCommand,
  archive: archiveCommand,
  pdf: pdfCommand,
  ppt: pptCommand,
}

const HELP = `docwrite — 文档工坊

用法：docwrite <命令> [参数]

项目与流程：
  init <项目名> [--template f.docx] [--deadline ...] [--scope ...] [--at S7]
  status [--project 名称] [--json]        流水线视图
  next [--project 名称] [--json]          下一阶段 + skill + 待确认
  approve <U0..U7> --by user --quote "..." 记录用户确认
  stage enter|done|waive|reopen|jump ...   阶段操作（done 会跑检查）
  review open --stage S7 --doc <文件>      生成独立评审包
  review submit --id <reviewId>            收评审结论
  review extend --stage S6 --by user --quote "..."  用户同意后追加评审轮次
  review status
  verify [--json]                          终检：done 阶段哈希 + 检查 + 扩展
  deliver [--to docx|pptx|md]              交付到 deliver/ 并写清单
  mode install|status|uninstall            安装/查看/卸载「文档工坊」预设
  skills list|show <id>                    skill 库
  dispatch <S0..S11> [--json]              查某阶段该用哪个 skill
  constraints show|template|init|check        约束查看/模板/初始化/检查
  spec check | outline check | draft check | reduce check
  compose [--from draft_reduced.md] [--template f.docx --fields-file f.json]
  pdf <docx> [out.pdf] [--backend auto|kit|soffice] [--soffice 路径]
  ppt init|import|validate|info|build|check ... [--dry-run]
  history | archive --reason "..."
  unblock [--reset-all]                    解除 blocked
  scope show | set --mode scan --by user --quote "..."
  source add <文件> | declare "名称" | resolve "名称" | status
  ext list | install <目录> | enable <名称> | disable <名称>

文档操作：
  docx read|inspect|fill|replace|md
  pptx read|notes|fill <入.pptx> <出.pptx> --map '{...}' [--notes]
  from-md <md> <docx> [--title "..."]

预览（接管 ppt-master 网页预览）：
  preview start [--cmd "python ..."] [--port 5050]
  preview status | stop

分析（只读）：
  scan <文件.md> [--json] [--fail-over 0.35]
  suggest <文件.md> [--para N] [--json]
  diff <a.md> <b.md> [--json] [--checkpoint]

退出码：0 成功｜1 用法｜2 检查未过｜3 前置缺失｜4 IO｜5 预算耗尽｜6 待用户确认
`

export async function main(argv) {
  const [cmd, ...rest] = argv
  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      process.stdout.write(HELP)
      return EXIT.OK
    }
    if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
      console.log('docwrite 0.1.0')
      return EXIT.OK
    }
    const handler = COMMANDS[cmd]
    if (!handler) {
      throw new CliError(`未知命令：${cmd}（docwrite help 查看可用命令）`, EXIT.USAGE)
    }
    return await handler(rest)
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`❌ ${err.message}`)
      return err.code
    }
    console.error(err?.stack ?? String(err))
    return EXIT.IO
  }
}
