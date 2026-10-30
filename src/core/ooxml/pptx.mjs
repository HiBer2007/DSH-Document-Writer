import { CliError, EXIT } from '../errors.mjs'
import { readText, readZip, writeText, writeZip } from '../zip.mjs'
import { buildTree, descendants, tokenize } from './xml.mjs'
import { applyEdits, computeTextEdits, plainText } from './write.mjs'

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/
const NOTES_RE = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/

function byNumber(re) {
  return (a, b) => {
    const na = Number(re.exec(a)?.[1] ?? 0)
    const nb = Number(re.exec(b)?.[1] ?? 0)
    return na - nb
  }
}

function loadParts(files, re) {
  return Object.keys(files)
    .filter((name) => re.test(name))
    .sort(byNumber(re))
    .map((name, index) => {
      const xml = readText(files, name)
      return { name, index, xml, tree: buildTree(tokenize(xml)) }
    })
}

export function loadPptx(filePath) {
  const files = readZip(filePath)
  const slides = loadParts(files, SLIDE_RE)
  if (!slides.length) {
    throw new CliError(`不是有效的 pptx（找不到 ppt/slides/slideN.xml）：${filePath}`, EXIT.IO)
  }
  const notes = loadParts(files, NOTES_RE)
  return { filePath, files, slides, notes }
}

/** 一页幻灯片的文本（按段落换行） */
export function slideText(part) {
  const paragraphs = descendants(part.tree, 'p')
  return paragraphs
    .map((paragraph) => plainText(paragraph))
    .filter((text) => text.length > 0)
    .join('\n')
}

export function readPptx(filePath) {
  const deck = loadPptx(filePath)
  const slides = deck.slides.map((part) => ({
    index: part.index,
    name: part.name,
    text: slideText(part),
  }))
  const notes = deck.notes.map((part) => ({
    index: part.index,
    name: part.name,
    text: slideText(part),
  }))
  return {
    filePath,
    slideCount: slides.length,
    notesCount: notes.length,
    slides,
    notes,
  }
}

/** 在 pptx 里替换文本（跨 run 安全，只改 a:t） */
export function fillPptx(inputPath, outputPath, map, { dryRun = false, notes = false } = {}) {
  const deck = loadPptx(inputPath)
  const entries = Object.entries(map).filter(([find]) => find)
  const counts = new Map(entries.map(([find]) => [find, 0]))
  const parts = notes ? [...deck.slides, ...deck.notes] : deck.slides
  const editsByPart = new Map()

  for (const part of parts) {
    const edits = []
    for (const paragraph of descendants(part.tree, 'p')) {
      const text = plainText(paragraph)
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
      edits.push(...computeTextEdits(paragraph, part.xml, accepted))
    }
    if (edits.length) editsByPart.set(part, edits)
  }

  if (!dryRun && editsByPart.size) {
    for (const [part, edits] of editsByPart) {
      writeText(deck.files, part.name, applyEdits(part.xml, edits))
    }
    writeZip(outputPath, deck.files)
  }

  const applied = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([find, count]) => ({ find, count }))
  const missing = [...counts.entries()].filter(([, count]) => count === 0).map(([find]) => find)

  return {
    file: inputPath,
    output: outputPath,
    dryRun,
    changed: editsByPart.size > 0,
    applied,
    missing,
    slides: deck.slides.length,
  }
}
