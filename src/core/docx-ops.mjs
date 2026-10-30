import { loadDocx } from './ooxml/docx.mjs'
import { descendants } from './ooxml/xml.mjs'
import {
  applyEdits,
  computeParagraphTextEdits,
  computeTextEdits,
  plainText,
  saveDocument,
} from './ooxml/write.mjs'

function stripSpaces(text) {
  return text.replace(/\s+/g, '')
}

/** 封面字段填充：按“去空白前缀”匹配整段，整段替换为新值（保留首个 run 的格式） */
export function fillFields(inputPath, outputPath, fieldMap, { dryRun = false } = {}) {
  const doc = loadDocx(inputPath)
  const entries = Object.entries(fieldMap)
  const missing = new Set(entries.map(([k]) => k))
  const applied = []
  const edits = []
  let index = 0

  for (const p of descendants(doc.body, 'p')) {
    const text = stripSpaces(plainText(p))
    if (!text) continue
    for (const [prefix, value] of entries) {
      const key = stripSpaces(prefix)
      if (!key || !text.startsWith(key)) continue
      const newText = String(value)
      if (plainText(p) !== newText) {
        edits.push(...computeParagraphTextEdits(p, doc.xml, newText))
      }
      applied.push({ paragraph: index, prefix, value: newText })
      missing.delete(prefix)
      break
    }
    index++
  }

  if (!dryRun && edits.length) {
    saveDocument(doc, outputPath, applyEdits(doc.xml, edits))
  }

  return {
    file: inputPath,
    output: outputPath,
    dryRun,
    changed: edits.length > 0,
    applied,
    missing: [...missing],
  }
}

/** 文本替换：在段落纯文本上查找，跨 run 也安全（保留首个命中 run 的格式） */
export function replaceText(inputPath, outputPath, map, { dryRun = false } = {}) {
  const doc = loadDocx(inputPath)
  const entries = Object.entries(map).filter(([find]) => find)
  const counts = new Map(entries.map(([find]) => [find, 0]))
  const edits = []

  for (const p of descendants(doc.body, 'p')) {
    const text = plainText(p)
    if (!text) continue
    const hits = []
    for (const [find, value] of entries) {
      let from = 0
      while (true) {
        const at = text.indexOf(find, from)
        if (at === -1) break
        hits.push({ start: at, end: at + find.length, text: String(value), find })
        from = at + find.length
      }
    }
    if (!hits.length) continue
    hits.sort((a, b) => a.start - b.start)
    const accepted = []
    for (const hit of hits) {
      const prev = accepted[accepted.length - 1]
      if (prev && hit.start < prev.end) continue
      accepted.push(hit)
    }
    for (const hit of accepted) counts.set(hit.find, counts.get(hit.find) + 1)
    edits.push(...computeTextEdits(p, doc.xml, accepted))
  }

  if (!dryRun && edits.length) {
    saveDocument(doc, outputPath, applyEdits(doc.xml, edits))
  }

  const applied = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .map(([find, count]) => ({ find, count }))
  const missing = [...counts.entries()].filter(([, n]) => n === 0).map(([find]) => find)

  return {
    file: inputPath,
    output: outputPath,
    dryRun,
    changed: edits.length > 0,
    applied,
    missing,
  }
}
