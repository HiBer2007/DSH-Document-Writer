import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { loadConfig } from '../core/state.mjs'
import { listReviews, openReview, submitReview, extendReview } from '../core/review.mjs'
import { projectFromFlags } from './common.mjs'

export async function reviewCommand(argv) {
  const [sub, ...rest] = argv
  const { flags } = parseArgs(rest)
  const { root, dir, state } = projectFromFlags(flags)
  const config = loadConfig(root)

  switch (sub) {
    case 'open': {
      const stage = typeof flags.stage === 'string' ? flags.stage : null
      const doc = typeof flags.doc === 'string' ? flags.doc : null
      if (!stage || !doc) {
        throw new CliError('用法：docwrite review open --stage S7 --doc draft_reduced.md', EXIT.USAGE)
      }
      const result = openReview(dir, state, { stage, doc, config })
      if (flags.json) {
        console.log(JSON.stringify(result, null, 2))
        return EXIT.OK
      }
      console.log(`📝 评审包已生成：${result.dir}`)
      console.log(`   交给子代理的 prompt：${result.promptPath}`)
      console.log(`   子代理写结论到：${result.outputPath}`)
      console.log(`   收结论：docwrite review submit --id ${result.id}`)
      return EXIT.OK
    }
    case 'submit': {
      const id = typeof flags.id === 'string' ? flags.id : null
      if (!id) throw new CliError('用法：docwrite review submit --id <reviewId>', EXIT.USAGE)
      const review = submitReview(dir, state, id)
      if (flags.json) {
        console.log(JSON.stringify(review, null, 2))
      } else {
        console.log(`✅ 评审已记录：${review.stage} → ${review.verdict}`)
        if (review.verdict !== 'pass') {
          console.log('   需要回退时：docwrite stage jump <from> <to> --reason "..."')
        }
      }
      return review.verdict === 'pass' ? EXIT.OK : EXIT.CHECK
    }
    case 'extend': {
      const stage = typeof flags.stage === 'string' ? flags.stage : null
      const add = flags.add === undefined ? 1 : Number(flags.add)
      const by = typeof flags.by === 'string' ? flags.by : null
      const quote = typeof flags.quote === 'string' ? flags.quote : ''
      const reason = typeof flags.reason === 'string' ? flags.reason : ''
      if (!stage) {
        throw new CliError(
          '用法：docwrite review extend --stage S6 --add 1 --by user --quote "用户原话"',
          EXIT.USAGE,
        )
      }
      const result = extendReview(dir, state, { stage, add, by, quote, reason, config })
      if (flags.json) {
        console.log(JSON.stringify(result, null, 2))
        return EXIT.OK
      }
      console.log(
        `✅ ${stage} 评审上限已追加 ${result.extension.add} 轮：` +
          `${result.extension.previousLimit} → ${result.extension.newLimit}`,
      )
      console.log(`   用户原话：${result.extension.quote}`)
      return EXIT.OK
    }
    case 'status': {
      const rows = listReviews(state)
      if (flags.json) {
        console.log(JSON.stringify(rows, null, 2))
        return EXIT.OK
      }
      if (!rows.length) {
        console.log('还没有评审记录。')
        return EXIT.OK
      }
      for (const row of rows) {
        const extra = row.extraRounds ? ` +${row.extraRounds}` : ''
        console.log(
          `  ${row.stage} ${row.status} ${row.verdict ?? ''} ${row.reviewer ?? ''} ` +
            `round=${row.round ?? 0}${extra} ${row.id}`,
        )
      }
      return EXIT.OK
    }
    default:
      throw new CliError(
        `review 子命令未知：${sub ?? '(空)'}。可用：open、submit、extend、status`,
        EXIT.USAGE,
      )
  }
}
