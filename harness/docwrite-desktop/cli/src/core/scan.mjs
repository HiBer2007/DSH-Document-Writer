import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CliError, EXIT } from './errors.mjs'

const RULES_URL = new URL('../../rules/scan-rules.json', import.meta.url)

let cachedRules = null

export function loadRules(rulesPath) {
  if (!rulesPath && cachedRules) return cachedRules
  const path = rulesPath ?? fileURLToPath(RULES_URL)
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    throw new CliError(`读不到扫描规则：${path}（${err.code ?? err.message}）`, EXIT.IO)
  }
  const rules = JSON.parse(raw)
  const compiled = {}
  for (const [group, list] of Object.entries(rules.groups)) {
    compiled[group] = list.map((rule) => ({ ...rule, regex: new RegExp(rule.re, 'g') }))
  }
  const result = { ...rules, compiled }
  if (!rulesPath) cachedRules = result
  return result
}

export function loadText(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
  } catch (err) {
    throw new CliError(`读不到文件：${filePath}（${err.code ?? err.message}）`, EXIT.IO)
  }
}

/** 去掉 Markdown 结构标记，避免标题/表格/代码块干扰统计 */
export function stripMarkdown(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inCode = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^```/.test(trimmed)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(trimmed)) continue
    if (/^\|.*\|$/.test(trimmed)) {
      out.push(trimmed.replace(/^\||\|$/g, '').replace(/\|/g, ' '))
      continue
    }
    out.push(
      trimmed
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^\d+[.)]\s+/, ''),
    )
  }
  return out.join('\n')
}

export function splitParagraphs(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function splitSentences(text) {
  return String(text)
    .split(/[。！？!?；;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function collectHits(text, rules) {
  const hits = []
  for (const [group, list] of Object.entries(rules.compiled)) {
    for (const rule of list) {
      rule.regex.lastIndex = 0
      let m
      while ((m = rule.regex.exec(text)) !== null) {
        hits.push({
          group,
          ruleId: rule.id,
          quote: m[0],
          advice: rule.advice,
          start: m.index,
          end: m.index + m[0].length,
        })
        if (m[0].length === 0) break
      }
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

function stats(values) {
  if (!values.length) return { avg: 0, std: 0, cv: 0 }
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  const std = Math.sqrt(variance)
  return { avg, std, cv: avg ? std / avg : 0 }
}

function symmetryRuns(paragraphs) {
  const lengths = paragraphs.map((p) => p.length)
  const runs = []
  let current = 0
  for (let i = 1; i < lengths.length; i++) {
    const prev = Math.max(lengths[i - 1], 1)
    const deviation = Math.abs(lengths[i] - lengths[i - 1]) / prev
    if (deviation < 0.2) current++
    else {
      if (current >= 2) runs.push(current + 1)
      current = 0
    }
  }
  if (current >= 2) runs.push(current + 1)
  return runs
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))))
}

/** 扫描文本，返回维度统计、三轴代理分、段落热点 */
export function scanText(text, { file = null, rules = loadRules() } = {}) {
  const clean = stripMarkdown(text)
  const paragraphs = splitParagraphs(clean)
  const sentences = splitSentences(clean)
  const chars = clean.length || 1
  const weights = rules.weights

  const byGroup = { template: 0, aiFlavor: 0, machineFlavor: 0, passive: 0, vague: 0, yuBagu: 0 }
  const paragraphHits = paragraphs.map((paragraph) => {
    const hits = collectHits(paragraph, rules)
    for (const hit of hits) byGroup[hit.group] = (byGroup[hit.group] ?? 0) + 1
    return { paragraph, hits }
  })

  const sentenceLengths = sentences.map((s) => s.length).filter((n) => n > 5)
  const burst = stats(sentenceLengths)
  const symmetry = symmetryRuns(paragraphs)

  const commaCount = (clean.match(/[，,]/g) ?? []).length
  const commasPerSentence = sentences.length ? commaCount / sentences.length : 0
  const fullwidth = (clean.match(/[，。！？；：、（）【】《》“”‘’]/g) ?? []).length

  const nested = (clean.match(/[（(]\d+[）)]/g) ?? []).length
  const colonLists = (clean.match(/[：:][^；;。\n]{2,}[；;][^；;。\n]{2,}[；;]/g) ?? []).length

  const per1000 = (n) => (n / chars) * 1000

  const aiRateSignals = []
  let aiRate = 0
  if (sentenceLengths.length >= 5) {
    if (burst.cv < 0.25) {
      aiRate += 0.35
      aiRateSignals.push(`句长 CV ${burst.cv.toFixed(2)} < 0.25，过于均匀`)
    } else if (burst.cv < 0.35) {
      aiRate += 0.25
      aiRateSignals.push(`句长 CV ${burst.cv.toFixed(2)} < 0.35，偏均匀`)
    }
  }
  const templateDensity = per1000(byGroup.template)
  if (templateDensity > 0) {
    aiRate += Math.min(0.25, templateDensity * 0.15)
    aiRateSignals.push(`模板句 ${byGroup.template} 处（${templateDensity.toFixed(1)}/千字）`)
  }
  if (symmetry.length) {
    aiRate += Math.min(0.2, symmetry.length * 0.1)
    aiRateSignals.push(`对称段落组 ${symmetry.length} 处`)
  }
  if (commasPerSentence > 2.5) {
    aiRate += 0.15
    aiRateSignals.push(`每句逗号 ${commasPerSentence.toFixed(1)} 个，密度偏高`)
  }
  if (byGroup.vague) {
    aiRate += Math.min(0.2, byGroup.vague * 0.1)
    aiRateSignals.push(`模糊归因 ${byGroup.vague} 处`)
  }

  const aiFlavor = clamp(byGroup.aiFlavor * 0.12 + byGroup.template * 0.05 + byGroup.yuBagu * 0.1)
  const machineFlavor = clamp(byGroup.machineFlavor * 0.1 + byGroup.passive * 0.05)

  const hotspots = paragraphHits
    .map(({ paragraph, hits }, index) => {
      const risk = clamp(
        hits.reduce((sum, hit) => sum + (weights[hit.group] ?? 0.2), 0),
      )
      return {
        index,
        risk,
        excerpt: paragraph.length > 60 ? `${paragraph.slice(0, 60)}…` : paragraph,
        signals: hits.map((h) => ({ group: h.group, quote: h.quote, advice: h.advice })),
      }
    })
    .filter((h) => h.risk > 0)
    .sort((a, b) => b.risk - a.risk)

  return {
    file,
    chars: clean.length,
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    axes: {
      aiRate: {
        score: clamp(aiRate),
        signals: aiRateSignals,
        note: '代理分：句长、模板句、段落对称、标点、模糊归因',
      },
      aiFlavor: {
        score: aiFlavor,
        signals: [`AI 味模式 ${byGroup.aiFlavor} 处`, `鱼八股模式 ${byGroup.yuBagu} 处`],
        note: '代理分：重要性膨胀、空洞结论、三板斧、鱼八股大词等',
      },
      machineFlavor: {
        score: machineFlavor,
        signals: [`机器味模式 ${byGroup.machineFlavor} 处`, `被动标记 ${byGroup.passive} 处`],
        note: '代理分：翻译腔、名词化、连接词机械等',
      },
    },
    dimensions: {
      templatePhrases: {
        count: byGroup.template,
        densityPer1000: Number(templateDensity.toFixed(2)),
        quotes: paragraphHits.flatMap(({ hits }) =>
          hits.filter((h) => h.group === 'template').map((h) => h.quote),
        ).slice(0, 10),
      },
      passiveVoice: {
        count: byGroup.passive,
        perSentence: sentences.length ? Number((byGroup.passive / sentences.length).toFixed(3)) : 0,
      },
      burstiness: {
        avgLength: Number(burst.avg.toFixed(1)),
        stdLength: Number(burst.std.toFixed(1)),
        cv: Number(burst.cv.toFixed(3)),
      },
      paragraphSymmetry: { runs: symmetry },
      nestedNumbers: { count: nested },
      colonLists: { count: colonLists },
      punctuation: {
        commasPerSentence: Number(commasPerSentence.toFixed(2)),
        fullwidthRatio: Number(((fullwidth / chars) * 100).toFixed(2)),
      },
      vagueAttribution: { count: byGroup.vague },
      yuBagu: {
        count: byGroup.yuBagu,
        quotes: paragraphHits.flatMap(({ hits }) =>
          hits.filter((h) => h.group === 'yuBagu').map((h) => h.quote),
        ).slice(0, 10),
      },
    },
    hotspots: hotspots.slice(0, 20),
    note: rules.note,
  }
}

export function formatScanReport(result) {
  const lines = []
  lines.push('='.repeat(56))
  lines.push('  AIGC 扫描报告（线索，不是结论）')
  lines.push('='.repeat(56))
  lines.push(
    `文本：${result.chars} 字符 ｜ ${result.paragraphCount} 段 ｜ ${result.sentenceCount} 句`,
  )
  lines.push('')
  lines.push('三轴代理分（0 低风险 → 1 高风险）：')
  for (const [axis, data] of Object.entries(result.axes)) {
    const label = axis === 'aiRate' ? 'AI 率' : axis === 'aiFlavor' ? 'AI 味' : '机器味'
    lines.push(`  ${label.padEnd(5)} ${data.score.toFixed(2)}  ${data.signals.join('；') || '无信号'}`)
  }
  lines.push('')
  const d = result.dimensions
  lines.push(`模板句：${d.templatePhrases.count} 处（${d.templatePhrases.densityPer1000}/千字）`)
  lines.push(`被动标记：${d.passiveVoice.count} 处（${d.passiveVoice.perSentence}/句）`)
  lines.push(`句长：均值 ${d.burstiness.avgLength}，CV ${d.burstiness.cv}`)
  lines.push(`段落对称组：${d.paragraphSymmetry.runs.length} 处`)
  lines.push(`嵌套编号：${d.nestedNumbers.count} 处 ｜ 冒号并列：${d.colonLists.count} 处`)
  lines.push(`每句逗号：${d.punctuation.commasPerSentence} 个 ｜ 模糊归因：${d.vagueAttribution.count} 处`)
  lines.push(`鱼八股模式：${d.yuBagu.count} 处${d.yuBagu.quotes.length ? `（${d.yuBagu.quotes.join('、')}）` : ''}`)
  lines.push('')
  if (result.hotspots.length) {
    lines.push('段落热点（按风险排序，最多 20 条）：')
    for (const h of result.hotspots) {
      lines.push(`  #${h.index} 风险 ${h.risk.toFixed(2)}  ${h.excerpt}`)
      for (const s of h.signals.slice(0, 3)) {
        lines.push(`      · [${s.group}] “${s.quote}” → ${s.advice}`)
      }
    }
  } else {
    lines.push('未发现明显热点。')
  }
  lines.push('')
  lines.push(`注：${result.note}`)
  return lines.join('\n')
}
