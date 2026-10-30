import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDocx, p, table } from './helpers/build-docx.mjs'
import { readDocument } from '../src/core/ooxml/docx.mjs'
import { docxToMarkdown, guessHeadingLevel, markdownToDocxBytes } from '../src/core/md.mjs'

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-md-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('标题启发式', () => {
  assert.equal(guessHeadingLevel('一、引言'), 2)
  assert.equal(guessHeadingLevel('1、职业兴趣'), 3)
  assert.equal(guessHeadingLevel('（一）背景'), 3)
  assert.equal(guessHeadingLevel('普通正文'), 0)
})

test('docx → md：样式标题、文本标题、表格', () => {
  withTemp((dir) => {
    const file = join(dir, 'a.docx')
    const body =
      p('第一章 概述', { style: 'Heading1' }) +
      p('1.1 背景', { style: 'Heading2' }) +
      p('一、引言') +
      p('正文**加粗**内容') +
      table([
        ['列1', '列2'],
        ['a', 'b'],
      ])
    writeFileSync(file, buildDocx({ bodyXml: body }))

    const md = docxToMarkdown(readDocument(file))
    assert.match(md, /^# 第一章 概述/m)
    assert.match(md, /^## 1\.1 背景/m)
    assert.match(md, /^## 一、引言/m)
    assert.match(md, /\| 列1 \| 列2 \|/)
    assert.match(md, /\| a \| b \|/)
  })
})

test('docx → md：相邻同样式 run 合并，标题不重复加粗', () => {
  withTemp((dir) => {
    const file = join(dir, 'd.docx')
    const body =
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>加</w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>粗</w:t></w:r>' +
      '<w:r><w:t>普通</w:t></w:r></w:p>' +
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>一、引言</w:t></w:r></w:p>'
    writeFileSync(file, buildDocx({ bodyXml: body }))

    const md = docxToMarkdown(readDocument(file))
    assert.match(md, /^\*\*加粗\*\*普通$/m)
    assert.match(md, /^## 一、引言$/m)
  })
})

test('md → docx：标题、列表、表格可读回', () => {
  withTemp((dir) => {
    const md = [
      '# 总标题',
      '',
      '## 一、引言',
      '',
      '这是正文。',
      '',
      '- 要点一',
      '- 要点二',
      '',
      '| 列1 | 列2 |',
      '| --- | --- |',
      '| a | b |',
      '',
    ].join('\n')

    const bytes = markdownToDocxBytes(md, { title: '封面标题' })
    const file = join(dir, 'b.docx')
    writeFileSync(file, bytes)

    const doc = readDocument(file)
    assert.equal(doc.paragraphs[0].text, '封面标题')
    assert.equal(doc.paragraphs[0].styleName, 'Title')
    assert.ok(doc.paragraphs.some((x) => x.text === '总标题' && x.heading === 1))
    assert.ok(doc.paragraphs.some((x) => x.text === '一、引言' && x.heading === 2))
    assert.ok(doc.paragraphs.some((x) => x.text === '• 要点一'))
    assert.equal(doc.tables.length, 1)
    assert.equal(doc.tables[0].rows[1][0].text, 'a')
  })
})

test('md → docx → md 往返保持章节结构', () => {
  withTemp((dir) => {
    const md = '# 标题\n\n## 一、引言\n\n正文\n'
    const file = join(dir, 'c.docx')
    writeFileSync(file, markdownToDocxBytes(md))
    const back = docxToMarkdown(readDocument(file))
    assert.match(back, /^# 标题/m)
    assert.match(back, /^## 一、引言/m)
    assert.match(back, /正文/)
  })
})
