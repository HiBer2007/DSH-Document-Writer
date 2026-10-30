import { buildDocxBytes, paragraphXml, tableXml } from './ooxml/build.mjs'

const HEADING_PATTERNS = [
  [/^[一二三四五六七八九十百]+、/, 2],
  [/^（[一二三四五六七八九十]+）/, 3],
  [/^\d+、/, 3],
  [/^\d+\.\d+\s/, 4],
]

export function guessHeadingLevel(text) {
  const trimmed = text.trim()
  for (const [re, level] of HEADING_PATTERNS) {
    if (re.test(trimmed)) return level
  }
  return 0
}

function inlineFromRuns(runs) {
  const groups = []
  for (const run of runs) {
    if (!run.text) continue
    const style = `${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}`
    const last = groups[groups.length - 1]
    if (last && last.style === style) last.text += run.text
    else groups.push({ style, text: run.text })
  }
  return groups
    .map((group) => {
      if (group.style === 'b') return `**${group.text}**`
      if (group.style === 'i') return `*${group.text}*`
      return group.text
    })
    .join('')
}

/** docx → markdown（标题优先用样式，样式缺失时用“一、”“1、”等文本启发式） */
export function docxToMarkdown(doc) {
  const lines = []
  for (const block of doc.blocks) {
    if (block.kind === 'paragraph') {
      if (!block.text.trim()) {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('')
        continue
      }
      const level =
        block.heading ||
        (/title/i.test(block.styleName ?? '') ? 1 : guessHeadingLevel(block.text))
      const content = level > 0 ? block.text : inlineFromRuns(block.runs)
      lines.push(level ? `${'#'.repeat(Math.min(level, 6))} ${content}` : content)
      continue
    }

    lines.push('')
    const rows = block.rows.map((row) => row.map((cell) => cell.text.replace(/\n/g, ' ').trim()))
    if (rows.length) {
      lines.push(`| ${rows[0].join(' | ')} |`)
      lines.push(`| ${rows[0].map(() => '---').join(' | ')} |`)
      for (const row of rows.slice(1)) lines.push(`| ${row.join(' | ')} |`)
    }
    lines.push('')
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

function isTableLine(line) {
  return /^\|.*\|$/.test(line)
}

function parseTableRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/** markdown → docx 字节 */
export function markdownToDocxBytes(markdown, { title } = {}) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n')
  const body = []
  let inCode = false
  let tableBuffer = []

  const flushTable = () => {
    if (!tableBuffer.length) return
    body.push(tableXml(tableBuffer))
    tableBuffer = []
  }

  if (title) body.push(paragraphXml(title, { style: 'Title' }))

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (/^```/.test(trimmed)) {
      inCode = !inCode
      continue
    }
    if (inCode) {
      if (trimmed) body.push(paragraphXml(trimmed))
      continue
    }
    if (!trimmed) {
      flushTable()
      continue
    }
    if (isTableLine(trimmed)) {
      const cells = parseTableRow(trimmed)
      if (!isSeparatorRow(cells)) tableBuffer.push(cells)
      continue
    }

    flushTable()

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      body.push(paragraphXml(heading[2], { style: `Heading${level}` }))
      continue
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      body.push(paragraphXml(`• ${trimmed.replace(/^[-*+]\s+/, '')}`))
      continue
    }
    if (/^>\s?/.test(trimmed)) {
      body.push(paragraphXml(trimmed.replace(/^>\s?/, '')))
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) continue
    body.push(paragraphXml(trimmed))
  }

  flushTable()
  return buildDocxBytes({ bodyXml: body.join('') })
}
