import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTree,
  child,
  decodeEntities,
  descendants,
  localName,
  textOf,
  tokenize,
} from '../src/core/ooxml/xml.mjs'

const SAMPLE =
  '<?xml version="1.0"?><w:document xmlns:w="ns"><w:body><w:p a="1"><w:r><w:t>Hello &amp; 世界</w:t></w:r></w:p><!-- c --><w:tbl/></w:body></w:document>'

test('token 首尾相接覆盖整段原文', () => {
  const tokens = tokenize(SAMPLE)
  const rebuilt = tokens.map((t) => SAMPLE.slice(t.start, t.end)).join('')
  assert.equal(rebuilt, SAMPLE)
})

test('构建树并能取文本', () => {
  const tree = buildTree(tokenize(SAMPLE))
  const doc = child(tree, 'document')
  assert.ok(doc)
  const body = child(doc, 'body')
  const p = child(body, 'p')
  assert.equal(p.attrs.a, '1')
  assert.equal(textOf(p), 'Hello & 世界')
  assert.equal(descendants(body, 'tbl').length, 1)
})

test('自闭合标签与注释不进入元素文本', () => {
  const tree = buildTree(tokenize(SAMPLE))
  const body = child(child(tree, 'document'), 'body')
  const kinds = body.children.map((c) => c.type)
  assert.ok(kinds.includes('comment'))
  const tbl = descendants(body, 'tbl')[0]
  assert.equal(tbl.selfClosing, true)
  assert.equal(textOf(tbl), '')
})

test('实体解码', () => {
  assert.equal(decodeEntities('&lt;x&gt; &amp; &#65; &#x4e2d;'), '<x> & A 中')
  assert.equal(decodeEntities('&unknown;'), '&unknown;')
})

test('属性值中的 > 不会截断标签', () => {
  const xml = '<w:t a="1>2">x</w:t>'
  const tree = buildTree(tokenize(xml))
  assert.equal(tree.children[0].attrs.a, '1>2')
  assert.equal(textOf(tree.children[0]), 'x')
})

test('单引号属性', () => {
  const tree = buildTree(tokenize("<w:t a='v'/>"))
  assert.equal(tree.children[0].attrs.a, 'v')
})

test('标签不匹配会报错', () => {
  assert.throws(() => buildTree(tokenize('<a><b></a>')), /标签不匹配/)
})

test('localName 去前缀', () => {
  assert.equal(localName('w:p'), 'p')
  assert.equal(localName('p'), 'p')
})
