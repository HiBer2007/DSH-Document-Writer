import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import { fillPptx, readPptx } from '../core/ooxml/pptx.mjs'

export async function pptxCommand(argv) {
  const [sub, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  switch (sub) {
    case 'read':
      return read(positional, flags)
    case 'notes':
      return notes(positional, flags)
    case 'fill':
      return fill(positional, flags)
    default:
      throw new CliError(`pptx 子命令未知：${sub ?? '(空)'}。可用：read、notes、fill`, EXIT.USAGE)
  }
}

function truncate(text, max = 100) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function read(positional, flags) {
  const file = requirePositional(positional, 0, '用法：docwrite pptx read <文件.pptx> [--json]')
  const deck = readPptx(resolve(file))
  if (flags.json) {
    console.log(JSON.stringify(deck, null, 2))
    return EXIT.OK
  }
  console.log(`📊 ${deck.filePath}`)
  console.log(`   幻灯片 ${deck.slideCount} 页 ｜ 备注 ${deck.notesCount} 条`)
  for (const slide of deck.slides) {
    console.log(`[${String(slide.index + 1).padStart(2, '0')}] ${truncate(slide.text.replace(/\n/g, ' / '))}`)
  }
  return EXIT.OK
}

function notes(positional, flags) {
  const file = requirePositional(positional, 0, '用法：docwrite pptx notes <文件.pptx> [--json]')
  const deck = readPptx(resolve(file))
  if (flags.json) {
    console.log(JSON.stringify(deck.notes, null, 2))
    return EXIT.OK
  }
  if (!deck.notes.length) {
    console.log('这份 pptx 没有备注页。')
    return EXIT.OK
  }
  for (const note of deck.notes) {
    console.log(`--- 备注 ${note.index + 1} ---`)
    console.log(note.text)
  }
  return EXIT.OK
}

function readJsonFlag(flags, name) {
  const inline = flags[name]
  const file = flags[`${name}-file`]
  let raw
  if (typeof inline === 'string') raw = inline
  else if (typeof file === 'string') raw = readFileSync(resolve(file), 'utf8')
  else throw new CliError(`缺少 --${name}（JSON 字符串）或 --${name}-file`, EXIT.USAGE)
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 JSON 对象')
    return value
  } catch (err) {
    throw new CliError(`--${name} 不是合法 JSON 对象：${err.message}`, EXIT.USAGE)
  }
}

function fill(positional, flags) {
  const input = requirePositional(
    positional,
    0,
    '用法：docwrite pptx fill <入.pptx> <出.pptx> --map \'{"{{x}}":"y"}\' [--notes] [--dry-run]',
  )
  const output = requirePositional(positional, 1, '用法：docwrite pptx fill <入.pptx> <出.pptx> --map ...')
  const map = readJsonFlag(flags, 'map')
  const report = fillPptx(resolve(input), resolve(output), map, {
    dryRun: Boolean(flags['dry-run']),
    notes: Boolean(flags.notes),
  })

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    const parts = report.applied.map((x) => `${x.find} × ${x.count}`)
    console.log(`✅ 幻灯片替换：${parts.length ? parts.join('；') : '无命中'}`)
    if (report.missing.length) console.log(`⚠️ 未匹配：${report.missing.join('、')}`)
  }
  return report.missing.length && !flags['allow-missing'] ? EXIT.CHECK : EXIT.OK
}
