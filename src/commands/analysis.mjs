import { resolve } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import { formatScanReport, loadRules, loadText, scanText } from '../core/scan.mjs'
import { formatSuggestReport, suggestForText } from '../core/suggest.mjs'
import { diffTexts, formatDiffReport } from '../core/diff.mjs'
import { appendEvent } from '../core/state.mjs'
import { projectFromFlags } from './common.mjs'

export async function scanCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const file = requirePositional(
    positional,
    0,
    '用法：docwrite scan <文件.md> [--json] [--rules <规则.json>] [--fail-over 0.35]',
  )
  const path = resolve(file)
  const text = loadText(path)
  const rules = typeof flags.rules === 'string' ? loadRules(resolve(flags.rules)) : loadRules()
  const result = scanText(text, { file: path, rules })

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(formatScanReport(result))
  }

  if (flags['fail-over'] !== undefined) {
    const limit = Number(flags['fail-over'])
    const max = Math.max(...Object.values(result.axes).map((a) => a.score))
    if (Number.isFinite(limit) && max > limit) return EXIT.CHECK
  }
  return EXIT.OK
}

export async function suggestCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const inline = typeof flags.text === 'string' ? flags.text : null
  const file = positional[0]
  if (!inline && !file) {
    throw new CliError(
      '用法：docwrite suggest <文件.md> [--para N] [--json] 或 docwrite suggest --text "段落"',
      EXIT.USAGE,
    )
  }
  const text = inline ?? loadText(resolve(file))
  const paragraph =
    flags.para !== undefined && flags.para !== true ? Number(flags.para) : undefined
  if (paragraph !== undefined && !Number.isInteger(paragraph)) {
    throw new CliError('--para 需要整数段落号', EXIT.USAGE)
  }

  const items = suggestForText(text, { paragraph })
  if (flags.json) {
    console.log(JSON.stringify({ items }, null, 2))
  } else {
    console.log(formatSuggestReport(items))
  }
  return EXIT.OK
}

export async function diffCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const a = requirePositional(positional, 0, '用法：docwrite diff <a.md> <b.md> [--json]')
  const b = requirePositional(positional, 1, '用法：docwrite diff <a.md> <b.md> [--json]')
  const result = diffTexts(loadText(resolve(a)), loadText(resolve(b)))
  if (flags.checkpoint) {
    const { dir } = projectFromFlags(flags)
    appendEvent(dir, {
      type: 'reduce.checkpoint',
      rate: result.modificationRate,
      changedParas: result.paragraphs.changed,
    })
  }
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(formatDiffReport(result, a, b))
  }
  return EXIT.OK
}
