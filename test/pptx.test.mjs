import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPptx } from './helpers/build-pptx.mjs'
import { fillPptx, readPptx } from '../src/core/ooxml/pptx.mjs'

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-pptx-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const DECK = {
  slides: ['Agentic AI 简介\n{{副标题}}', '能力对比\nTalkers vs Doers'],
  notes: ['开场：帮我去比价订机票'],
}

test('pptx read：幻灯片与备注', () => {
  withTemp((dir) => {
    const file = join(dir, 'deck.pptx')
    writeFileSync(file, buildPptx(DECK))
    const deck = readPptx(file)
    assert.equal(deck.slideCount, 2)
    assert.equal(deck.notesCount, 1)
    assert.match(deck.slides[0].text, /Agentic AI 简介/)
    assert.match(deck.slides[1].text, /Talkers vs Doers/)
    assert.match(deck.notes[0].text, /比价订机票/)
  })
})

test('pptx fill：跨页替换占位符', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.pptx')
    const output = join(dir, 'out.pptx')
    writeFileSync(input, buildPptx(DECK))

    const report = fillPptx(input, output, { '{{副标题}}': '从会说到会做' })
    assert.deepEqual(report.missing, [])
    assert.equal(report.applied[0].count, 1)

    const deck = readPptx(output)
    assert.match(deck.slides[0].text, /从会说到会做/)
    assert.doesNotMatch(deck.slides[0].text, /\{\{/)
  })
})

test('pptx fill：未命中进入 missing，dry-run 不写文件', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.pptx')
    const output = join(dir, 'out.pptx')
    writeFileSync(input, buildPptx(DECK))

    const report = fillPptx(input, output, { '{{不存在}}': 'x' }, { dryRun: true })
    assert.deepEqual(report.missing, ['{{不存在}}'])
    assert.equal(report.changed, false)
  })
})

test('pptx fill --notes：备注也能替换', () => {
  withTemp((dir) => {
    const input = join(dir, 'in.pptx')
    const output = join(dir, 'out.pptx')
    writeFileSync(input, buildPptx(DECK))

    fillPptx(input, output, { 开场: '开头' }, { notes: true })
    const deck = readPptx(output)
    assert.match(deck.notes[0].text, /开头/)
  })
})
