import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { loadConfig } from '../core/state.mjs'
import { listReviews, openReview, submitReview } from '../core/review.mjs'
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
        console.log(`  ${row.stage} ${row.status} ${row.verdict ?? ''} ${row.reviewer ?? ''} ${row.id}`)
      }
      return EXIT.OK
    }
    default:
      throw new CliError(
        `review 子命令未知：${sub ?? '(空)'}。可用：open、submit、status`,
        EXIT.USAGE,
      )
  }
}
