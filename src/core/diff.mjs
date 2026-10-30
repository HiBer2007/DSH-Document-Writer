import { splitParagraphs, splitSentences } from './scan.mjs'

function normalize(text) {
  return String(text).replace(/\s+/g, '')
}

function bigrams(text) {
  const map = new Map()
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2)
    map.set(gram, (map.get(gram) ?? 0) + 1)
  }
  return map
}

/** 字符二元组 Dice 相似度（0..1），用于快速估算修改率 */
export function diceSimilarity(a, b) {
  const A = normalize(a)
  const B = normalize(b)
  if (!A && !B) return 1
  if (!A || !B) return 0
  const ga = bigrams(A)
  const gb = bigrams(B)
  let overlap = 0
  let totalA = 0
  let totalB = 0
  for (const n of ga.values()) totalA += n
  for (const n of gb.values()) totalB += n
  for (const [gram, n] of ga) overlap += Math.min(n, gb.get(gram) ?? 0)
  return (2 * overlap) / (totalA + totalB)
}

/** 句子级 LCS 匹配数 */
export function sentenceLCS(a, b) {
  const A = splitSentences(a)
  const B = splitSentences(b)
  if (!A.length || !B.length) return 0
  if (A.length * B.length > 4_000_000) {
    const setB = new Set(B)
    return A.filter((s) => setB.has(s)).length
  }
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0))
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[A.length][B.length]
}

function paragraphDiffs(a, b) {
  const A = splitParagraphs(a)
  const B = splitParagraphs(b)
  const total = Math.max(A.length, B.length)
  const rows = []
  for (let i = 0; i < total; i++) {
    const left = A[i] ?? ''
    const right = B[i] ?? ''
    const similarity = diceSimilarity(left, right)
    rows.push({
      index: i,
      changed: similarity < 0.95,
      similarity: Number(similarity.toFixed(3)),
      rate: Number((1 - similarity).toFixed(3)),
      before: left.slice(0, 40),
      after: right.slice(0, 40),
    })
  }
  return rows
}

/** 文本修改率：句子级 LCS + 字符二元组相似度 */
export function diffTexts(a, b) {
  const sim = diceSimilarity(a, b)
  const sentencesA = splitSentences(a)
  const sentencesB = splitSentences(b)
  const matched = sentenceLCS(a, b)
  const paragraphs = paragraphDiffs(a, b)
  return {
    charsA: normalize(a).length,
    charsB: normalize(b).length,
    similarity: Number(sim.toFixed(4)),
    modificationRate: Number((1 - sim).toFixed(4)),
    sentences: {
      totalA: sentencesA.length,
      totalB: sentencesB.length,
      matched,
      changed: Math.max(sentencesA.length, sentencesB.length) - matched,
    },
    paragraphs: {
      totalA: paragraphs.length,
      changed: paragraphs.filter((p) => p.changed).length,
    },
    detail: paragraphs.filter((p) => p.changed),
  }
}

export function formatDiffReport(result, labelA = 'a', labelB = 'b') {
  const lines = []
  lines.push(`修改率：${(result.modificationRate * 100).toFixed(1)}%（相似度 ${(result.similarity * 100).toFixed(1)}%）`)
  lines.push(`字符：${result.charsA} → ${result.charsB}`)
  lines.push(
    `句子：${result.sentences.totalA} → ${result.sentences.totalB}，匹配 ${result.sentences.matched}，变化 ${result.sentences.changed}`,
  )
  lines.push(`段落：${result.paragraphs.totalA} 段，变化 ${result.paragraphs.changed} 段`)
  if (result.detail.length) {
    lines.push('')
    lines.push(`变化段落（${labelA} → ${labelB}）：`)
    for (const row of result.detail.slice(0, 10)) {
      lines.push(`  #${row.index} 改动 ${(row.rate * 100).toFixed(0)}%`)
      lines.push(`    前：${row.before}`)
      lines.push(`    后：${row.after}`)
    }
  }
  return lines.join('\n')
}
