import {
  collectHits,
  loadRules,
  splitParagraphs,
  splitSentences,
  stripMarkdown,
} from './scan.mjs'

/**
 * 词表只是线索，不是替换表。
 * 这里额外给出“结构线索”，让模型按句/段重写，而不是逐词替换。
 */
const YU_BAGU_WORDS = [
  '赋能', '抓手', '闭环', '底层逻辑', '顶层设计', '认知维度', '颗粒度', '组合拳',
  '新范式', '新篇章', '新画卷', '时代浪潮', '时代洪流', '行稳致远', '久久为功',
  '润物无声', '向新而行', '奔赴', '答卷', '底色', '成色', '亮色',
]

const TEMPLATE_START =
  /^(首先|其次|再次|最后|一方面|另一方面|综上所述|总而言之|由此可见|值得注意的是|需要指出的是)/
const CALL_END = /(让我们一起|愿我们|相信在|未来可期|新征程|时代答卷)/
const SUMMARY_END = /(综上所述|总而言之|一言以蔽之)[。！!]?$/

function sentenceCv(paragraph) {
  const lengths = splitSentences(paragraph)
    .map((sentence) => sentence.length)
    .filter((length) => length > 5)
  if (lengths.length < 4) return null
  const avg = lengths.reduce((sum, value) => sum + value, 0) / lengths.length
  if (!avg) return null
  const variance =
    lengths.reduce((sum, value) => sum + (value - avg) ** 2, 0) / lengths.length
  return Math.sqrt(variance) / avg
}

/** 与具体词无关的结构线索：段落同构、句长整齐、金句结尾、鱼八股大词密集。 */
function structuralHints(paragraph, index, paragraphs) {
  const hints = []

  const cv = sentenceCv(paragraph)
  if (cv !== null && cv < 0.35) {
    hints.push({ kind: '结构', advice: '句长过于整齐：插入短句或长句，改变节奏' })
  }
  if (TEMPLATE_START.test(paragraph)) {
    hints.push({ kind: '结构', advice: '段首序号词/总结套话：删掉，用语义衔接' })
  }
  if (CALL_END.test(paragraph) || SUMMARY_END.test(paragraph)) {
    hints.push({ kind: '结构', advice: '金句/号召式结尾：删掉，落到具体判断或行动' })
  }
  if (index >= 2) {
    const recent = paragraphs.slice(index - 2, index + 1).map((item) => item.length)
    const min = Math.min(...recent)
    const max = Math.max(...recent)
    if (min > 0 && (max - min) / min < 0.2) {
      hints.push({ kind: '结构', advice: '连续三段长度相近：换一种展开方式，不要每段同构' })
    }
  }

  const bigWords = YU_BAGU_WORDS.filter((word) => paragraph.includes(word))
  if (bigWords.length >= 2) {
    hints.push({
      kind: '鱼八股',
      advice: `大词密集（${bigWords.join('、')}）：删掉大词，换成具体对象、动作或数字`,
    })
  }

  const commas = (paragraph.match(/[，,]/g) ?? []).length
  if (commas >= 8 && !/[。！？]/.test(paragraph.slice(0, 60))) {
    hints.push({ kind: '结构', advice: '长句一逗到底：拆成两句' })
  }

  return hints
}

/** 逐段给出只读建议（不写任何文件）；词表命中 + 结构线索 */
export function suggestForText(text, { rules = loadRules(), paragraph } = {}) {
  const paragraphs = splitParagraphs(stripMarkdown(text))
  return paragraphs
    .map((content, index) => ({
      index,
      text: content,
      suggestions: collectHits(content, rules),
      structure: structuralHints(content, index, paragraphs),
    }))
    .filter((item) => item.suggestions.length > 0 || item.structure.length > 0)
    .filter((item) => paragraph === undefined || item.index === paragraph)
}

const HEADER = [
  '⚠️ 词表只是线索，不是替换表。',
  '   只把 A 词换成 B 词会割裂上下文，也会被评审判为机器味。',
  '   正确做法：按句/段重写——先读懂这一段在论证什么，再改句序、主语、信息密度，补具体事实。',
  '',
]

export function formatSuggestReport(items) {
  if (!items.length) {
    return [...HEADER, '未发现词表或结构线索；这不等于没问题，仍需通读检查上下文衔接。'].join('\n')
  }
  const lines = [...HEADER]
  for (const item of items) {
    lines.push(`#${item.index} ${item.text.slice(0, 60)}${item.text.length > 60 ? '…' : ''}`)
    for (const suggestion of item.suggestions) {
      lines.push(`   · [词表/${suggestion.group}] “${suggestion.quote}” → 参考改法：${suggestion.advice}`)
    }
    for (const hint of item.structure) {
      lines.push(`   · [${hint.kind}] ${hint.advice}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
