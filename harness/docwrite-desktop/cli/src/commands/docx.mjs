import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import { readDocument } from '../core/ooxml/docx.mjs'
import { fillFields, replaceText } from '../core/docx-ops.mjs'
import { docxToMarkdown } from '../core/md.mjs'

export async function docxCommand(argv) {
  const [sub, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  switch (sub) {
    case 'read':
      return read(positional, flags)
    case 'inspect':
      return inspect(positional, flags)
    case 'fill':
      return fill(positional, flags)
    case 'replace':
      return replace(positional, flags)
    case 'md':
      return toMarkdown(positional, flags)
    default:
      throw new CliError(
        `docx 子命令未知：${sub ?? '(空)'}。可用：read、inspect、fill、replace、md`,
        EXIT.USAGE,
      )
  }
}

function readJsonFlag(flags, name) {
  const inline = flags[name]
  const file = flags[`${name}-file`]
  let raw
  if (typeof inline === 'string') raw = inline
  else if (typeof file === 'string') raw = readFileSync(resolve(file), 'utf8')
  else {
    throw new CliError(
      `缺少 --${name}（JSON 字符串）或 --${name}-file（JSON 文件）`,
      EXIT.USAGE,
    )
  }
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('需要 JSON 对象')
    }
    return value
  } catch (err) {
    throw new CliError(`--${name} 不是合法 JSON 对象：${err.message}`, EXIT.USAGE)
  }
}

function printReport(label, report, flags) {
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  if (report.dryRun) console.log(`🔎 ${label}预演（未写文件）`)
  const parts = report.applied.map((x) =>
    x.prefix !== undefined ? `${x.prefix} → ${x.value}` : `${x.find} × ${x.count}`,
  )
  console.log(
    `✅ ${label}：${parts.length ? parts.join('；') : '无命中'}${report.dryRun ? '' : ` → ${report.output}`}`,
  )
  if (report.missing.length) console.log(`⚠️ 未匹配：${report.missing.join('、')}`)
}

function serialize(doc) {
  return {
    file: doc.filePath,
    sections: doc.sections,
    counts: { paragraphs: doc.paragraphs.length, tables: doc.tables.length },
    stylesUsed: doc.stylesUsed,
    placeholders: doc.placeholders,
    paragraphs: doc.paragraphs.map((p) => ({
      index: p.index,
      styleId: p.styleId,
      styleName: p.styleName,
      heading: p.heading,
      alignment: p.alignment,
      text: p.text,
      runs: p.runs.length,
    })),
    tables: doc.tables.map((t) => ({
      index: t.index,
      rows: t.rowCount,
      cols: t.colCount,
      cells: t.rows.map((row) => row.map((c) => c.text)),
    })),
  }
}

function truncate(text, max = 120) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function read(positional, flags) {
  const file = requirePositional(positional, 0, '用法：docwrite docx read <文件.docx> [--json]')
  const doc = readDocument(resolve(file))

  if (flags.json) {
    console.log(JSON.stringify(serialize(doc), null, 2))
    return EXIT.OK
  }

  const chars = doc.paragraphs.reduce((sum, p) => sum + p.text.length, 0)
  console.log(`📄 文档：${doc.filePath}`)
  console.log(
    `   段落 ${doc.paragraphs.length} ｜ 表格 ${doc.tables.length} ｜ 字符 ${chars} ｜ 分节 ${doc.sections}`,
  )
  console.log(`   样式：${doc.stylesUsed.join('、') || '(无)'}`)
  if (doc.placeholders.length) {
    console.log(
      `   占位符：${doc.placeholders.length} 处（${[...new Set(doc.placeholders.map((p) => p.token))].join('、')}）`,
    )
  }
  console.log('')

  for (const block of doc.blocks) {
    if (block.kind === 'paragraph') {
      if (!block.text.trim()) continue
      const tag = block.heading ? `H${block.heading}` : block.styleName
      console.log(`[${String(block.index).padStart(3, '0')}] (${tag}) ${truncate(block.text)}`)
      continue
    }
    console.log(`\n表格 ${block.index + 1}：${block.rowCount} 行 × ${block.colCount} 列`)
    block.rows.forEach((row, r) => {
      console.log(`  行${r}: ${row.map((c) => c.text.replace(/\n/g, ' / ')).join(' | ')}`)
    })
    console.log('')
  }

  return EXIT.OK
}

function inspect(positional, flags) {
  const file = requirePositional(positional, 0, '用法：docwrite docx inspect <文件.docx> [--json]')
  const doc = readDocument(resolve(file))

  const headings = doc.paragraphs
    .filter((p) => p.heading > 0 || /title/i.test(p.styleName))
    .map((p) => ({ index: p.index, level: p.heading, text: p.text }))

  const fonts = [
    ...new Set(
      doc.paragraphs.flatMap((p) =>
        p.runs.flatMap((r) => (r.fonts ? [r.fonts.eastAsia ?? r.fonts.ascii] : [])).filter(Boolean),
      ),
    ),
  ]

  const result = {
    file: doc.filePath,
    sections: doc.sections,
    counts: { paragraphs: doc.paragraphs.length, tables: doc.tables.length },
    stylesUsed: doc.stylesUsed,
    headings,
    fonts,
    placeholders: doc.placeholders,
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    return EXIT.OK
  }

  console.log(`🔍 ${doc.filePath}`)
  console.log(`   分节 ${doc.sections} ｜ 段落 ${doc.paragraphs.length} ｜ 表格 ${doc.tables.length}`)
  console.log(`   样式：${doc.stylesUsed.join('、') || '(无)'}`)
  console.log(`   字体：${fonts.join('、') || '(未显式设置)'}`)
  console.log('')
  console.log('📋 结构：')
  if (!headings.length) console.log('   (未发现标题样式段落)')
  for (const h of headings) {
    console.log(`   ${'  '.repeat(Math.max(h.level - 1, 0))}${h.level ? `H${h.level}` : 'T'} ${h.text}`)
  }
  console.log('')
  console.log(`🧩 占位符：${doc.placeholders.length} 处`)
  for (const p of doc.placeholders) {
    console.log(`   段落 ${p.index}：${p.token}`)
  }
  return EXIT.OK
}

function fill(positional, flags) {
  const input = requirePositional(
    positional,
    0,
    '用法：docwrite docx fill <输入.docx> <输出.docx> --fields \'{"前缀":"值"}\' [--dry-run] [--json]',
  )
  const output = requirePositional(
    positional,
    1,
    '用法：docwrite docx fill <输入.docx> <输出.docx> --fields \'{"前缀":"值"}\'',
  )
  const map = readJsonFlag(flags, 'fields')
  const report = fillFields(resolve(input), resolve(output), map, {
    dryRun: Boolean(flags['dry-run']),
  })
  printReport('字段填充', report, flags)
  return report.missing.length && !flags['allow-missing'] ? EXIT.CHECK : EXIT.OK
}

function replace(positional, flags) {
  const input = requirePositional(
    positional,
    0,
    '用法：docwrite docx replace <输入.docx> <输出.docx> --map \'{"原文":"替换"}\' [--dry-run] [--json]',
  )
  const output = requirePositional(
    positional,
    1,
    '用法：docwrite docx replace <输入.docx> <输出.docx> --map \'{"原文":"替换"}\'',
  )
  const map = readJsonFlag(flags, 'map')
  const report = replaceText(resolve(input), resolve(output), map, {
    dryRun: Boolean(flags['dry-run']),
  })
  printReport('文本替换', report, flags)
  return report.missing.length && !flags['allow-missing'] ? EXIT.CHECK : EXIT.OK
}

function toMarkdown(positional, flags) {
  const input = requirePositional(positional, 0, '用法：docwrite docx md <输入.docx> [输出.md]')
  const doc = readDocument(resolve(input))
  const markdown = docxToMarkdown(doc)
  const output = positional[1]
  if (output) {
    writeFileSync(resolve(output), markdown, 'utf8')
    console.log(`✅ 已转换：${resolve(output)}`)
  } else {
    process.stdout.write(markdown)
  }
  return EXIT.OK
}
