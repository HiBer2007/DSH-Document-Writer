import test from 'node:test'
import assert from 'node:assert/strict'
import { formatSuggestReport, suggestForText } from '../src/core/suggest.mjs'

test('翻译腔与名词化能给出建议', () => {
  const text = '在数字化转型的背景下，我们对数据进行了分析。'
  const items = suggestForText(text)
  assert.equal(items.length, 1)
  const ids = items[0].suggestions.map((s) => s.ruleId)
  assert.ok(ids.includes('mf-background'))
  assert.ok(ids.includes('mf-conduct'))
})

test('干净文本不给建议', () => {
  const items = suggestForText('上周我把简历投给了两家公司。')
  assert.equal(items.length, 0)
})

test('--para 过滤只返回指定段落', () => {
  const text = '干净段落。\n\n在数字化转型的背景下，我们做了分析。'
  const all = suggestForText(text)
  assert.equal(all.length, 1)
  assert.equal(all[0].index, 1)
  assert.equal(suggestForText(text, { paragraph: 0 }).length, 0)
  assert.equal(suggestForText(text, { paragraph: 1 }).length, 1)
})

test('词表建议明确标注为参考，不是替换表', () => {
  const items = suggestForText('在数字化转型的背景下，我们对数据进行了分析。')
  const report = formatSuggestReport(items)
  assert.match(report, /词表只是线索，不是替换表/)
  assert.match(report, /参考改法/)
  assert.match(report, /按句\/段重写/)
})

test('没有词表命中时也能给出结构线索', () => {
  const text = [
    '三份简历投给两家公司。第一家第二天回了邮件。',
    '第二家到现在没有动静。我翻了翻它的招聘页面。',
    '岗位要求写着熟悉分布式系统。这大概就是原因。',
  ].join('\n\n')
  const items = suggestForText(text)
  assert.ok(items.length >= 1)
  assert.ok(items.some((item) => item.structure.some((hint) => hint.kind === '结构')))
})

test('鱼八股大词密集时给出结构线索', () => {
  const text = '我们要以数字赋能为抓手，构建闭环，形成组合拳，奔赴新征程。'
  const items = suggestForText(text)
  assert.equal(items.length, 1)
  assert.ok(items[0].structure.some((hint) => hint.kind === '鱼八股'))
  assert.match(items[0].structure.find((hint) => hint.kind === '鱼八股').advice, /具体对象/)
})
