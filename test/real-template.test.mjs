import test from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDocument } from '../src/core/ooxml/docx.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, 'fixtures', 'plan-template.docx')

test('真实模板：段落、表格、封面字段可读', () => {
  const doc = readDocument(FIXTURE)
  assert.equal(doc.sections, 1)
  assert.equal(doc.tables.length, 1)
  assert.ok(doc.paragraphs.length >= 45, `段落数偏少：${doc.paragraphs.length}`)

  const texts = doc.paragraphs.map((p) => p.text)
  const joined = texts.join('').replace(/\s+/g, '')
  assert.ok(texts.some((t) => t.startsWith('姓    名')), '缺少姓名封面字段')
  assert.ok(joined.includes('一、引言'), '缺少正文章节')
  assert.ok(joined.includes('职业生涯规划书'), '缺少标题')
})

test('真实模板：段落索引连续', () => {
  const doc = readDocument(FIXTURE)
  doc.paragraphs.forEach((p, i) => assert.equal(p.index, i))
})

test('真实模板：模板用纯文本标题（无 Heading 样式）', () => {
  const doc = readDocument(FIXTURE)
  const headingStyled = doc.paragraphs.filter((p) => p.heading > 0)
  assert.equal(headingStyled.length, 0)
  // 说明：该模板靠“一、引言”这类文本编号充当标题，后续需要文本启发式
})
