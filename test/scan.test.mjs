import test from 'node:test'
import assert from 'node:assert/strict'
import { scanText, splitParagraphs, splitSentences, stripMarkdown } from '../src/core/scan.mjs'

const RISKY = [
  '近年来，随着人工智能技术的快速发展，其在教育领域的应用日益广泛。',
  '此外，值得注意的是，相关研究表明，智能教学系统能够显著提升学习效率。',
  '在数字化转型的背景下，学校对教学过程进行了系统的分析。',
  '综上所述，该技术具有广阔的应用前景，对教育现代化具有重要意义。',
].join('')

const CLEAN = [
  '上周我把三份简历投给了两家公司。',
  '第一家第二天就回了邮件，第二家到现在没动静。',
  '我翻了翻第二家的招聘页，发现岗位要求里写着“熟悉分布式系统”。',
  '这大概就是它没回我的原因。',
].join('')

test('三轴代理分都在 0..1', () => {
  const result = scanText(RISKY)
  for (const axis of ['aiRate', 'aiFlavor', 'machineFlavor']) {
    const score = result.axes[axis].score
    assert.ok(score >= 0 && score <= 1, `${axis} 越界：${score}`)
  }
})

test('高风险文本的 AI 味与机器味高于干净文本', () => {
  const risky = scanText(RISKY)
  const clean = scanText(CLEAN)
  assert.ok(risky.axes.aiFlavor.score > clean.axes.aiFlavor.score)
  assert.ok(risky.axes.machineFlavor.score > clean.axes.machineFlavor.score)
})

test('段落热点定位到问题段落', () => {
  const text = `${CLEAN}\n\n${RISKY}`
  const result = scanText(text)
  assert.ok(result.hotspots.length > 0)
  assert.ok(result.hotspots[0].signals.length > 0)
  assert.ok(result.hotspots[0].risk > 0.5)
})

test('规则命中：模板句、模糊归因、翻译腔', () => {
  const result = scanText(RISKY)
  assert.ok(result.dimensions.templatePhrases.count >= 3)
  assert.ok(result.dimensions.vagueAttribution.count >= 1)
  const quotes = result.hotspots.flatMap((h) => h.signals.map((s) => s.quote)).join(' ')
  assert.match(quotes, /在数字化转型的背景下/)
  assert.match(quotes, /相关研究表明/)
})

test('stripMarkdown 去掉标题、列表、代码块、表格分隔行', () => {
  const md = '# 标题\n\n- 列表项\n\n```js\nconst a = 1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'
  const clean = stripMarkdown(md)
  assert.doesNotMatch(clean, /^#/m)
  assert.doesNotMatch(clean, /```/)
  assert.doesNotMatch(clean, /const a/)
  assert.doesNotMatch(clean, /---/)
  assert.match(clean, /列表项/)
})

test('分段与分句', () => {
  assert.equal(splitParagraphs('a\n\nb\n\nc').length, 3)
  assert.equal(splitSentences('第一句。第二句！第三句？').length, 3)
})

test('搭配错位：值钱 + 抽象名词被标为 AI 味问题', () => {
  const result = scanText('更值钱的追问有两个。\n\n第二个问题更值钱。')
  const signals = result.hotspots.flatMap((h) => h.signals)
  const hit = signals.find((signal) => signal.quote.includes('值钱的追问'))
  assert.ok(hit, '应命中“值钱的追问”')
  assert.equal(hit.group, 'aiFlavor')
  assert.match(hit.advice, /搭配错位/)
})

test('扫描结果标注“线索不是结论”', () => {
  const result = scanText(RISKY)
  assert.match(result.note, /线索/)
})

test('AI 伪口语/伪对话腔进入屏蔽词表', () => {
  const text = `你说的对，但是

“这句话稳”“比之前的都重”“我记下了”“我记住了”“我记着”“这个账我记住了”“比之前的都轻”“睡吧，我守着”“你去，我跟”“问别人还是问自己”“行，xxx”“什么心思都写着xx上”“这句话接的漂亮”“行，我认”“这句话我不接”“xx比xx沉”“xx比xx重”“xx比xx稳”“xx比xx轻”“没接你的xxx”“比之前的都强”“他记得这事”“这话我留着”“很平”“稳”“我不拦”“我跟”“回去睡”“你这句话我记着”“认你”“我不催你”“这话是ta告诉你的，还是你自己想明白的”“认下来”“声音没抖，但比刚才稳”“比刚才轻”“比刚才重”“比刚才平”“很直”“这话我记下了”“这话我收下了”“说的比谁都响”“认这个”“收不回去”“认得实”“xx就是认了”“你自己掂量”“我不拦”“没接你那句xx”“不催”“你掂量”`
  const result = scanText(text)
  assert.ok(result.dimensions.aiColloquial.count >= 20)
  assert.ok(result.axes.aiFlavor.signals.some((signal) => signal.includes('伪口语')))
  const signals = result.hotspots.flatMap((hotspot) => hotspot.signals)
  const hit = signals.find(
    (signal) =>
      signal.group === 'aiColloquial' && /这句话稳|比之前的都重/.test(signal.quote),
  )
  assert.ok(hit, '应命中伪口语词表')
  assert.match(hit.advice, /伪口语|人味/)

  const normal = scanText('他性格很直，说话很稳。今天的箱子比昨天重。')
  assert.equal(normal.dimensions.aiColloquial.count, 0)
})

test('鱼八股模式进入扫描维度与 AI 味信号', () => {
  const result = scanText('我们要以数字赋能为抓手，构建闭环，形成组合拳，奔赴新征程。')
  assert.ok(result.dimensions.yuBagu.count >= 2)
  assert.ok(result.axes.aiFlavor.signals.some((signal) => signal.includes('鱼八股')))
  assert.ok(result.hotspots.some((hotspot) => hotspot.signals.some((signal) => signal.group === 'yuBagu')))
})
