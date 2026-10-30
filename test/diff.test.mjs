import test from 'node:test'
import assert from 'node:assert/strict'
import { diffTexts, diceSimilarity, sentenceLCS } from '../src/core/diff.mjs'

test('相同文本修改率为 0', () => {
  const a = '第一段内容。\n\n第二段内容。'
  const result = diffTexts(a, a)
  assert.equal(result.similarity, 1)
  assert.equal(result.modificationRate, 0)
  assert.equal(result.paragraphs.changed, 0)
})

test('完全不同文本修改率接近 1', () => {
  const result = diffTexts('今天天气很好。', '量子力学的基本假设。')
  assert.ok(result.modificationRate > 0.8)
  assert.equal(result.sentences.matched, 0)
})

test('部分修改落在 0 与 1 之间', () => {
  const a = '第一段内容。\n\n第二段内容。'
  const b = '第一段内容。\n\n第二段改过的内容。'
  const result = diffTexts(a, b)
  assert.ok(result.modificationRate > 0 && result.modificationRate < 0.5)
  assert.equal(result.sentences.matched, 1)
  assert.equal(result.paragraphs.changed, 1)
})

test('Dice 相似度对称', () => {
  const a = '人工智能技术发展迅速'
  const b = '人工智能技术发展很快'
  assert.ok(Math.abs(diceSimilarity(a, b) - diceSimilarity(b, a)) < 1e-9)
})

test('句子 LCS 计数', () => {
  assert.equal(sentenceLCS('甲。乙。丙。', '甲。丙。'), 2)
  assert.equal(sentenceLCS('甲。', '乙。'), 0)
})

test('空白差异不影响修改率', () => {
  const result = diffTexts('第一句。第二句。', '第一句。\n\n第二句。')
  assert.equal(result.modificationRate, 0)
})
