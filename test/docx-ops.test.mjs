import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDocx } from './helpers/build-docx.mjs'
import { readDocument } from '../src/core/ooxml/docx.mjs'
import { fillFields, replaceText } from '../src/core/docx-ops.mjs'

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-ops-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const COVER_BODY =
  '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">姓    名          </w:t></w:r><w:r><w:t>旧值</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>其他段落</w:t></w:r></w:p>'

test('fillFields：去空白前缀匹配，保留首 run 格式', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.docx')
    const output = join(dir, 'out.docx')
    writeFileSync(input, buildDocx({ bodyXml: COVER_BODY }))

    const report = fillFields(input, output, { '姓    名': '姓    名          张三' })
    assert.equal(report.applied.length, 1)
    assert.deepEqual(report.missing, [])

    const doc = readDocument(output)
    assert.equal(doc.paragraphs[0].text, '姓    名          张三')
    assert.equal(doc.paragraphs[0].runs[0].bold, true)
    assert.equal(doc.paragraphs[1].text, '其他段落')
  })
})

test('fillFields：未匹配字段进入 missing', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.docx')
    const output = join(dir, 'out.docx')
    writeFileSync(input, buildDocx({ bodyXml: COVER_BODY }))

    const report = fillFields(input, output, { 不存在的字段: 'x' })
    assert.deepEqual(report.missing, ['不存在的字段'])
    assert.equal(report.changed, false)
  })
})

test('fillFields：dry-run 不写文件', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.docx')
    const output = join(dir, 'out.docx')
    writeFileSync(input, buildDocx({ bodyXml: COVER_BODY }))

    const report = fillFields(input, output, { '姓    名': '姓    名  李四' }, { dryRun: true })
    assert.equal(report.dryRun, true)
    assert.equal(report.applied.length, 1)
    assert.equal(existsSync(output), false)
  })
})

const PLACEHOLDER_BODY =
  '<w:p><w:r><w:t>我叫{{姓</w:t></w:r><w:r><w:t>名}}，今年{{年龄}}岁</w:t></w:r></w:p>'

test('replaceText：跨 run 替换占位符', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.docx')
    const output = join(dir, 'out.docx')
    writeFileSync(input, buildDocx({ bodyXml: PLACEHOLDER_BODY }))

    const report = replaceText(input, output, { '{{姓名}}': '张三', '{{年龄}}': '20' })
    assert.deepEqual(report.missing, [])
    assert.equal(readDocument(output).paragraphs[0].text, '我叫张三，今年20岁')
  })
})

test('replaceText：重叠规则只应用靠前的一处', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.docx')
    const output = join(dir, 'out.docx')
    writeFileSync(input, buildDocx({ bodyXml: PLACEHOLDER_BODY }))

    const report = replaceText(input, output, { '{{姓名}}': 'A', 姓名: 'B' })
    const applied = Object.fromEntries(report.applied.map((x) => [x.find, x.count]))
    assert.equal(applied['{{姓名}}'], 1)
    assert.equal(applied['姓名'], undefined)
    assert.equal(readDocument(output).paragraphs[0].text, '我叫A，今年{{年龄}}岁')
  })
})

test('replaceText：未命中的 key 进入 missing', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.docx')
    const output = join(dir, 'out.docx')
    writeFileSync(input, buildDocx({ bodyXml: PLACEHOLDER_BODY }))

    const report = replaceText(input, output, { '{{不存在}}': 'x' })
    assert.deepEqual(report.missing, ['{{不存在}}'])
    assert.equal(report.changed, false)
  })
})

test('replaceText：同段多处替换保持顺序', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.docx')
    const output = join(dir, 'out.docx')
    writeFileSync(input, buildDocx({ bodyXml: '<w:p><w:r><w:t>A-1，B-2，A-3</w:t></w:r></w:p>' }))

    replaceText(input, output, { 'A-': '甲', 'B-': '乙' })
    assert.equal(readDocument(output).paragraphs[0].text, '甲1，乙2，甲3')
  })
})
