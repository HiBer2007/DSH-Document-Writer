// 无损写回：只改目标 <w:t> 的内容（必要时补 xml:space），其余字节原样保留。
import { encodeText, isElement, localName, textOf } from './xml.mjs'
import { writeText, writeZip } from '../zip.mjs'

/** 段落内所有 <w:t> 节点（按文档顺序） */
export function textNodes(pNode) {
  const out = []
  const walk = (n) => {
    for (const c of n.children ?? []) {
      if (!isElement(c)) continue
      if (localName(c.name) === 't') out.push(c)
      else walk(c)
    }
  }
  walk(pNode)
  return out
}

/** 段落纯文本（只取 w:t，与写回坐标一致） */
export function plainText(pNode) {
  return textNodes(pNode)
    .map((n) => textOf(n))
    .join('')
}

/** 段落文本坐标：每个 t 节点的 [start, end) */
export function paragraphTextMap(pNode) {
  let offset = 0
  return textNodes(pNode).map((node) => {
    const text = textOf(node)
    const item = { node, text, start: offset, end: offset + text.length }
    offset += text.length
    return item
  })
}

function ensurePreserve(openTag) {
  if (/xml:space\s*=/.test(openTag)) return openTag
  return openTag.replace(/>$/, ' xml:space="preserve">')
}

/**
 * 在段落上计算替换编辑。
 * replacements: [{ start, end, text }]（段落纯文本坐标，互不重叠）
 * 返回 xml 编辑列表 [{ start, end, text }]
 */
export function computeTextEdits(pNode, xml, replacements) {
  const map = paragraphTextMap(pNode)
  if (!map.length) return []

  const updates = new Map()
  const sorted = [...replacements].sort((a, b) => b.start - a.start)

  for (const r of sorted) {
    const first = map.findIndex((m) => r.start >= m.start && r.start < m.end)
    const last = map.findIndex((m) => r.end - 1 >= m.start && r.end - 1 < m.end)
    if (first === -1 || last === -1) continue
    for (let i = first; i <= last; i++) {
      const m = map[i]
      const current = updates.get(m.node) ?? m.text
      const localStart = Math.max(r.start, m.start) - m.start
      const localEnd = Math.min(r.end, m.end) - m.start
      const insert = i === first ? r.text : ''
      updates.set(m.node, current.slice(0, localStart) + insert + current.slice(localEnd))
    }
  }

  const edits = []
  for (const [node, text] of updates) {
    if (text === textOf(node)) continue
    const openTag = xml.slice(node.start, node.openEnd)
    if (/^\s|\s$/.test(text) && !/xml:space\s*=/.test(openTag)) {
      edits.push({ start: node.start, end: node.openEnd, text: ensurePreserve(openTag) })
    }
    edits.push({ start: node.openEnd, end: node.closeStart, text: encodeText(text) })
  }
  return edits
}

/** 整段替换：新文本写入第一个 t，其余清空；空段落则插入新 run */
export function computeParagraphTextEdits(pNode, xml, newText) {
  const map = paragraphTextMap(pNode)
  if (!map.length) {
    return [
      {
        start: pNode.closeStart,
        end: pNode.closeStart,
        text: `<w:r><w:t xml:space="preserve">${encodeText(newText)}</w:t></w:r>`,
      },
    ]
  }
  const total = map.reduce((sum, m) => sum + m.text.length, 0)
  if (total === 0) {
    const node = map[0].node
    const openTag = xml.slice(node.start, node.openEnd)
    const edits = []
    if (!/xml:space\s*=/.test(openTag)) {
      edits.push({ start: node.start, end: node.openEnd, text: ensurePreserve(openTag) })
    }
    edits.push({ start: node.openEnd, end: node.closeStart, text: encodeText(newText) })
    return edits
  }
  return computeTextEdits(pNode, xml, [{ start: 0, end: total, text: newText }])
}

/** 应用编辑（从后往前，避免偏移失效） */
export function applyEdits(xml, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = xml
  for (const edit of sorted) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}

/** 把新 document.xml 写回 docx */
export function saveDocument(doc, outputPath, newXml) {
  writeText(doc.files, 'word/document.xml', newXml)
  writeZip(outputPath, doc.files)
}
