import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDocx, p, table } from './helpers/build-docx.mjs'
import { readDocument } from '../src/core/ooxml/docx.mjs'

function withDocx(bodyXml, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-'))
  const file = join(dir, 'test.docx')
  writeFileSync(file, buildDocx({ bodyXml }))
  try {
    return fn(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const BODY =
  p('职业生涯规划书', { style: 'Title' }) +
  p('一、引言', { style: 'Heading1' }) +
  '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">正文</w:t></w:r><w:r><w:t>内容</w:t></w:r></w:p>' +
  p('占位 {{姓名}} 与 {{学号}}') +
  table([
    ['列1', '列2'],
    ['a', 'b'],
  ])

test('读取段落、标题层级与样式名', () => {
  withDocx(BODY, (file) => {
    const doc = readDocument(file)
    assert.equal(doc.paragraphs.length, 4)
    assert.equal(doc.paragraphs[0].styleName, 'Title')
    assert.equal(doc.paragraphs[1].styleName, 'heading 1')
    assert.equal(doc.paragraphs[1].heading, 1)
    assert.equal(doc.paragraphs[2].text, '正文内容')
    assert.equal(doc.paragraphs[2].runs.length, 2)
    assert.equal(doc.paragraphs[2].runs[0].bold, true)
    assert.equal(doc.paragraphs[2].runs[1].bold, false)
  })
})

test('读取表格', () => {
  withDocx(BODY, (file) => {
    const doc = readDocument(file)
    assert.equal(doc.tables.length, 1)
    const t = doc.tables[0]
    assert.equal(t.rowCount, 2)
    assert.equal(t.colCount, 2)
    assert.equal(t.rows[0][0].text, '列1')
    assert.equal(t.rows[1][1].text, 'b')
  })
})

test('占位符识别', () => {
  withDocx(BODY, (file) => {
    const doc = readDocument(file)
    assert.deepEqual(
      doc.placeholders.map((x) => x.key),
      ['姓名', '学号'],
    )
    assert.equal(doc.placeholders[0].paragraph, 3)
  })
})

test('样式集合与分节', () => {
  withDocx(BODY, (file) => {
    const doc = readDocument(file)
    assert.ok(doc.stylesUsed.includes('Title'))
    assert.ok(doc.stylesUsed.includes('heading 1'))
    assert.ok(doc.stylesUsed.includes('Normal'))
    assert.equal(doc.sections, 1)
  })
})

test('blocks 保持段落与表格的先后顺序', () => {
  withDocx(BODY, (file) => {
    const doc = readDocument(file)
    const kinds = doc.blocks.map((b) => b.kind)
    assert.deepEqual(kinds, ['paragraph', 'paragraph', 'paragraph', 'paragraph', 'table'])
  })
})

test('空文档也能读', () => {
  withDocx('', (file) => {
    const doc = readDocument(file)
    assert.equal(doc.paragraphs.length, 0)
    assert.equal(doc.tables.length, 0)
  })
})

test('非 docx 文件报 IO 错误', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-'))
  const file = join(dir, 'bad.docx')
  writeFileSync(file, 'not a zip')
  try {
    assert.throws(() => readDocument(file), /不是有效的 zip\/docx/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
