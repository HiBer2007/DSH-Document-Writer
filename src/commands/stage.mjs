import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import { checkStage, hashArtifacts } from '../core/checks.mjs'
import {
  enterStage,
  jumpStage,
  loadConfig,
  markDone,
  reopenStage,
  waiveStage,
} from '../core/state.mjs'
import { ARTIFACTS, REVIEW_STAGES, STAGE_MAP } from '../core/stages.mjs'
import { projectFromFlags } from './common.mjs'

export async function stageCommand(argv) {
  const [sub, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  const { root, dir, state } = projectFromFlags(flags)
  const config = loadConfig(root)

  switch (sub) {
    case 'enter': {
      const id = requirePositional(positional, 0, '用法：docwrite stage enter S1')
      enterStage(dir, state, id)
      console.log(`▶️ 已进入 ${id} ${STAGE_MAP[id].name}（第 ${state.stages[id].attempt} 次）`)
      return EXIT.OK
    }
    case 'done': {
      const id = requirePositional(positional, 0, '用法：docwrite stage done S1')
      if (!STAGE_MAP[id]) throw new CliError(`未知阶段：${id}`, EXIT.USAGE)
      if (REVIEW_STAGES.includes(id)) {
        if (id === 'S10') {
          const reportPath = join(dir, 'verify-report.md')
          const report = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : ''
          if (!/PASS/.test(report)) {
            throw new CliError('S10 需要先运行 verify 并得到 PASS', EXIT.PREREQ)
          }
        } else {
          const review = state.reviews?.[id]
          if (!review || review.status !== 'submitted') {
            throw new CliError(`${id} 还没有评审结论，先 review submit`, EXIT.PREREQ)
          }
        }
        if (!state.approvals?.U4) {
          throw new CliError('评审阶段完成前需要 U4 确认', EXIT.APPROVAL)
        }
      }
      const result = checkStage(dir, state, id, config)
      if (!result.ok) {
        console.error(`❌ ${id} ${STAGE_MAP[id].name} 检查未通过：`)
        for (const error of result.errors) console.error(`   · ${error}`)
        return EXIT.CHECK
      }
      markDone(dir, state, id, {
        artifacts: ARTIFACTS[id] ?? [],
        hashes: hashArtifacts(dir, id),
      })
      console.log(`✅ ${id} ${STAGE_MAP[id].name} 已完成`)
      return EXIT.OK
    }
    case 'waive': {
      const id = requirePositional(
        positional,
        0,
        '用法：docwrite stage waive S7 --by user --quote "用户原话"',
      )
      waiveStage(dir, state, id, { by: flags.by, quote: flags.quote })
      console.log(`⏭️ ${id} 已豁免：${flags.quote}`)
      return EXIT.OK
    }
    case 'reopen': {
      const id = requirePositional(positional, 0, '用法：docwrite stage reopen S5 --reason "..."')
      reopenStage(dir, state, id, flags.reason)
      console.log(`↩️ ${id} 已重新打开`)
      return EXIT.OK
    }
    case 'jump': {
      const from = requirePositional(
        positional,
        0,
        '用法：docwrite stage jump S6 S5 --reason "..."',
      )
      const to = requirePositional(
        positional,
        1,
        '用法：docwrite stage jump S6 S5 --reason "..."',
      )
      jumpStage(dir, state, from, to, { reason: flags.reason ?? '', config })
      console.log(`↩️ 已回退 ${from} → ${to}（第 ${state.loops[`${from}->${to}`]} 次）`)
      return EXIT.OK
    }
    default:
      throw new CliError(
        `stage 子命令未知：${sub ?? '(空)'}。可用：enter、done、waive、reopen、jump`,
        EXIT.USAGE,
      )
  }
}
