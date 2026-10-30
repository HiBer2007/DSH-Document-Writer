import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import {
  addSource,
  declarePending,
  markDownstreamStale,
  resolvePending,
  sourceStatus,
} from '../core/sources.mjs'
import { appendEvent, saveState } from '../core/state.mjs'
import { projectFromFlags } from './common.mjs'

export async function sourceCommand(argv) {
  const [sub, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  const { dir, state } = projectFromFlags(flags)

  switch (sub) {
    case 'add': {
      const file = requirePositional(positional, 0, '用法：docwrite source add <文件>')
      const entry = addSource(dir, file)
      const stale = markDownstreamStale(state)
      if (state.stages.S3?.status !== 'done') {
        state.stages.S3 = { ...(state.stages.S3 ?? {}), status: 'active', at: new Date().toISOString() }
      }
      saveState(dir, state)
      appendEvent(dir, { type: 'source.add', file: entry.file, sha256: entry.sha256, stale })
      if (flags.json) {
        console.log(JSON.stringify({ entry, stale }, null, 2))
      } else {
        console.log(`✅ 素材已加入：${entry.file}`)
        if (stale.length) console.log(`⚠️ 已标 stale（需重检）：${stale.join('、')}`)
      }
      return EXIT.OK
    }
    case 'declare': {
      const label = requirePositional(positional, 0, '用法：docwrite source declare "素材名称"')
      declarePending(dir, label)
      appendEvent(dir, { type: 'source.declare', label })
      console.log(`📌 已登记待补素材：${label}`)
      return EXIT.OK
    }
    case 'resolve': {
      const label = requirePositional(positional, 0, '用法：docwrite source resolve "素材名称"')
      resolvePending(dir, label)
      appendEvent(dir, { type: 'source.resolve', label })
      console.log(`✅ 已标记素材补齐：${label}`)
      return EXIT.OK
    }
    case 'status': {
      const result = sourceStatus(dir)
      if (flags.json) {
        console.log(JSON.stringify(result, null, 2))
        return EXIT.OK
      }
      console.log(`素材状态：${result.status}（${result.entries.length} 个文件，${result.pending.length} 个待补）`)
      for (const entry of result.entries) console.log(`  ✅ ${entry.file}`)
      for (const label of result.pending) console.log(`  ⬜ ${label}（待补）`)
      return EXIT.OK
    }
    default:
      throw new CliError(
        `source 子命令未知：${sub ?? '(空)'}。可用：add、declare、resolve、status`,
        EXIT.USAGE,
      )
  }
}
