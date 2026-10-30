import { readZip, readText } from '../zip.mjs'
import { CliError, EXIT } from '../errors.mjs'
import {
  attr,
  buildTree,
  child,
  children,
  descendants,
  isElement,
  localName,
  textOf,
  tokenize,
} from './xml.mjs'

/** 读取 docx 包并解析 document.xml / styles.xml */
export function loadDocx(filePath) {
  const files = readZip(filePath)
  const xml = readText(files, 'word/document.xml')
  if (!xml) {
    throw new CliError(`不是有效的 docx（缺少 word/document.xml）：${filePath}`, EXIT.IO)
  }
  const tree = buildTree(tokenize(xml))
  const docNode = child(tree, 'document') ?? tree
  const body = child(docNode, 'body')
  if (!body) throw new CliError(`docx 缺少 w:body：${filePath}`, EXIT.IO)
  return { filePath, files, xml, tree, body, styles: parseStyles(files) }
}

/** 解析 word/styles.xml，返回 Map<styleId, {id,type,name,basedOn}> */
export function parseStyles(files) {
  const map = new Map()
  const xml = readText(files, 'word/styles.xml')
  if (!xml) return map
  const tree = buildTree(tokenize(xml))
  for (const style of descendants(tree, 'style')) {
    const id = attr(style, 'w:styleId')
    if (!id) continue
    map.set(id, {
      id,
      type: attr(style, 'w:type') ?? 'paragraph',
      name: attr(child(style, 'name'), 'w:val') ?? id,
      basedOn: attr(child(style, 'basedOn'), 'w:val') ?? null,
    })
  }
  return map
}

function headingLevel(styleId, styleName) {
  const probe = `${styleId ?? ''} ${styleName ?? ''}`
  const m = /heading\s*([1-6])/i.exec(probe)
  if (m) return Number(m[1])
  if (/^title$/i.test((styleName ?? '').trim())) return 0
  return 0
}

function readFonts(rFonts) {
  if (!rFonts) return null
  return {
    ascii: attr(rFonts, 'w:ascii') ?? null,
    eastAsia: attr(rFonts, 'w:eastAsia') ?? null,
    hAnsi: attr(rFonts, 'w:hAnsi') ?? null,
  }
}

function parseRun(node) {
  const rPr = child(node, 'rPr')
  let text = ''
  for (const c of node.children ?? []) {
    if (!isElement(c)) continue
    const ln = localName(c.name)
    if (ln === 't') text += textOf(c)
    else if (ln === 'tab') text += '\t'
    else if (ln === 'br' || ln === 'cr') text += '\n'
    else if (ln === 'noBreakHyphen') text += '-'
  }
  return {
    text,
    bold: Boolean(child(rPr, 'b')),
    italic: Boolean(child(rPr, 'i')),
    fonts: readFonts(child(rPr, 'rFonts')),
    size: attr(child(rPr, 'sz'), 'w:val') ?? null,
  }
}

function parseParagraph(node) {
  const pPr = child(node, 'pPr')
  const styleId = attr(child(pPr, 'pStyle'), 'w:val') ?? null
  const alignment = attr(child(pPr, 'jc'), 'w:val') ?? null
  const runs = descendants(node, 'r').map(parseRun)
  const text = runs.map((r) => r.text).join('')
  return { styleId, alignment, text, runs }
}

function parseTable(node) {
  const rows = children(node, 'tr').map((tr) =>
    children(tr, 'tc').map((tc) => {
      const paragraphs = children(tc, 'p').map(parseParagraph)
      return { text: paragraphs.map((p) => p.text).join('\n'), paragraphCount: paragraphs.length }
    }),
  )
  return { rows, rowCount: rows.length, colCount: rows[0]?.length ?? 0 }
}

/** 读取整篇文档：blocks（段落/表格按出现顺序）、stylesUsed、placeholders */
export function readDocument(filePath) {
  const doc = loadDocx(filePath)
  const blocks = []
  let paragraphIndex = 0
  let tableIndex = 0

  for (const node of doc.body.children) {
    if (!isElement(node)) continue
    const ln = localName(node.name)
    if (ln === 'p') {
      const p = parseParagraph(node)
      const style = p.styleId ? doc.styles.get(p.styleId) : null
      blocks.push({
        kind: 'paragraph',
        index: paragraphIndex++,
        styleId: p.styleId,
        styleName: style?.name ?? p.styleId ?? 'Normal',
        heading: headingLevel(p.styleId, style?.name),
        alignment: p.alignment,
        text: p.text,
        runs: p.runs,
      })
      continue
    }
    if (ln === 'tbl') {
      const t = parseTable(node)
      blocks.push({ kind: 'table', index: tableIndex++, ...t })
    }
  }

  const paragraphs = blocks.filter((b) => b.kind === 'paragraph')
  const tables = blocks.filter((b) => b.kind === 'table')
  const stylesUsed = [...new Set(paragraphs.map((p) => p.styleName))]

  const placeholders = []
  const re = /\{\{([^{}]+)\}\}/g
  for (const p of paragraphs) {
    let m
    while ((m = re.exec(p.text)) !== null) {
      placeholders.push({ paragraph: p.index, token: m[0], key: m[1].trim() })
    }
  }

  return {
    filePath: doc.filePath,
    blocks,
    paragraphs,
    tables,
    stylesUsed,
    placeholders,
    sections: descendants(doc.body, 'sectPr').length,
    styleMap: doc.styles,
  }
}
