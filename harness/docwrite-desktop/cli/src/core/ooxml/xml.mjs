// 无损 XML 分词器 + 轻量树。
// 每个 token 保留原文区间（start/end），写回时可以"只替换目标节点、其余字节原样输出"。

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return ENTITY_MAP[body] ?? match
  })
}

export function encodeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function encodeAttr(text) {
  return encodeText(text).replace(/"/g, '&quot;')
}

function findTagEnd(xml, start) {
  let quote = null
  for (let i = start + 1; i < xml.length; i++) {
    const ch = xml[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i
  }
  return -1
}

function parseTag(raw, start, end) {
  const inner = raw.slice(1, -1)
  if (inner.startsWith('/')) {
    return { type: 'close', name: inner.slice(1).trim(), start, end, raw }
  }
  const selfClosing = inner.endsWith('/')
  const body = selfClosing ? inner.slice(0, -1) : inner
  const nameMatch = /^([^\s/>]+)/.exec(body)
  if (!nameMatch) throw new Error(`无法解析标签名：${raw.slice(0, 40)}`)
  const attrs = {}
  const attrRe = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = attrRe.exec(body)) !== null) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '')
  }
  return {
    type: selfClosing ? 'self' : 'open',
    name: nameMatch[1],
    attrs,
    start,
    end,
    raw,
    openEnd: end,
  }
}

/** 分词；保证 tokens 首尾相接覆盖整段原文 */
export function tokenize(xml) {
  if (typeof xml !== 'string') throw new TypeError('tokenize 需要字符串')
  const tokens = []
  const total = xml.length
  let i = 0

  const pushText = (start, end) => {
    if (end <= start) return
    const raw = xml.slice(start, end)
    tokens.push({ type: 'text', start, end, raw, text: decodeEntities(raw) })
  }

  while (i < total) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      pushText(i, total)
      break
    }
    if (lt > i) pushText(i, lt)

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4)
      if (end === -1) throw new Error(`XML 注释未闭合（偏移 ${lt}）`)
      tokens.push({ type: 'comment', start: lt, end: end + 3, raw: xml.slice(lt, end + 3) })
      i = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9)
      if (end === -1) throw new Error(`CDATA 未闭合（偏移 ${lt}）`)
      tokens.push({
        type: 'cdata',
        start: lt,
        end: end + 3,
        raw: xml.slice(lt, end + 3),
        text: xml.slice(lt + 9, end),
      })
      i = end + 3
      continue
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2)
      if (end === -1) throw new Error(`处理指令未闭合（偏移 ${lt}）`)
      tokens.push({ type: 'pi', start: lt, end: end + 2, raw: xml.slice(lt, end + 2) })
      i = end + 2
      continue
    }
    if (xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt + 2)
      if (end === -1) throw new Error(`声明未闭合（偏移 ${lt}）`)
      tokens.push({ type: 'doctype', start: lt, end: end + 1, raw: xml.slice(lt, end + 1) })
      i = end + 1
      continue
    }

    const gt = findTagEnd(xml, lt)
    if (gt === -1) throw new Error(`标签未闭合（偏移 ${lt}）`)
    tokens.push(parseTag(xml.slice(lt, gt + 1), lt, gt + 1))
    i = gt + 1
  }

  return tokens
}

/** 构建树；节点保留 start/openEnd/closeStart/end 区间 */
export function buildTree(tokens) {
  const root = { type: 'root', name: '#root', children: [], start: 0, openEnd: 0, end: 0 }
  const stack = [root]

  for (const token of tokens) {
    const parent = stack[stack.length - 1]
    if (token.type === 'open') {
      const node = {
        type: 'element',
        name: token.name,
        attrs: token.attrs,
        start: token.start,
        openEnd: token.end,
        closeStart: token.end,
        end: token.end,
        children: [],
      }
      parent.children.push(node)
      stack.push(node)
      continue
    }
    if (token.type === 'self') {
      parent.children.push({
        type: 'element',
        name: token.name,
        attrs: token.attrs,
        start: token.start,
        openEnd: token.end,
        closeStart: token.end,
        end: token.end,
        children: [],
        selfClosing: true,
      })
      continue
    }
    if (token.type === 'close') {
      const node = stack.pop()
      if (!node || node.name !== token.name) {
        throw new Error(`标签不匹配：期望 </${node?.name ?? '?'}>，实际 </${token.name}>（偏移 ${token.start}）`)
      }
      node.closeStart = token.start
      node.end = token.end
      continue
    }
    parent.children.push({
      type: token.type,
      start: token.start,
      end: token.end,
      raw: token.raw,
      text: token.text ?? '',
    })
  }

  if (stack.length !== 1) {
    throw new Error(`XML 未闭合：<${stack[stack.length - 1].name}>`)
  }
  return root
}

export function localName(name) {
  const i = name.indexOf(':')
  return i === -1 ? name : name.slice(i + 1)
}

export function isElement(node) {
  return node?.type === 'element'
}

export function child(node, name) {
  if (!node?.children) return undefined
  return node.children.find((c) => isElement(c) && localName(c.name) === name)
}

export function children(node, name) {
  if (!node?.children) return []
  return node.children.filter((c) => isElement(c) && (name === undefined || localName(c.name) === name))
}

export function descendants(node, name) {
  const out = []
  const walk = (n) => {
    for (const c of n.children ?? []) {
      if (!isElement(c)) continue
      if (localName(c.name) === name) out.push(c)
      walk(c)
    }
  }
  walk(node)
  return out
}

export function textOf(node) {
  let out = ''
  for (const c of node.children ?? []) {
    if (c.type === 'text' || c.type === 'cdata') out += c.text
    else if (c.type === 'element') out += textOf(c)
  }
  return out
}

export function attr(node, name) {
  return node?.attrs?.[name]
}
