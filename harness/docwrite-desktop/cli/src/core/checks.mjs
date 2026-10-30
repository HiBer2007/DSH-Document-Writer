import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS, REVIEW_STAGES } from './stages.mjs'
import { eventsPath, sha256File } from './state.mjs'
import { diffTexts } from './diff.mjs'
import { readDocument } from './ooxml/docx.mjs'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function countCheckpoints(projectDir) {
  const path = eventsPath(projectDir)
  if (!existsSync(path)) return 0
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter((event) => event?.type === 'reduce.checkpoint').length
}

function findBuildFile(projectDir, ext) {
  const dir = join(projectDir, 'build')
  if (!existsSync(dir)) return null
  const name = readdirSync(dir).find((file) => file.toLowerCase().endsWith(ext))
  return name ? join(dir, name) : null
}

/** 返回 { ok, errors[] }，不修改状态 */
export function checkStage(projectDir, state, id, config) {
  const errors = []

  for (const rel of ARTIFACTS[id] ?? []) {
    const path = join(projectDir, rel)
    if (!existsSync(path)) {
      errors.push(`缺少产物：${rel}`)
      continue
    }
    const stat = statSync(path)
    if (stat.isFile() && stat.size === 0) errors.push(`产物为空：${rel}`)
    if (stat.isDirectory() && readdirSync(path).length === 0) errors.push(`目录为空：${rel}`)
  }

  if (id === 'S1' && existsSync(join(projectDir, 'constraints.json'))) {
    try {
      const data = readJson(join(projectDir, 'constraints.json'))
      const items = Array.isArray(data) ? data : data.items
      if (!Array.isArray(items) || items.length === 0) {
        errors.push('constraints.json 里没有任何约束（items 为空）')
      }
    } catch (err) {
      errors.push(`constraints.json 不是合法 JSON：${err.message}`)
    }
  }

  if (id === 'S7') {
    const draft = join(projectDir, 'draft.md')
    const reduced = join(projectDir, 'draft_reduced.md')
    if (existsSync(draft) && existsSync(reduced)) {
      const result = diffTexts(readFileSync(draft, 'utf8'), readFileSync(reduced, 'utf8'))
      if (result.modificationRate < config.modificationRateMin) {
        errors.push(
          `修改率 ${(result.modificationRate * 100).toFixed(1)}% < ${(config.modificationRateMin * 100).toFixed(0)}%`,
        )
      }
    }
    const checkpoints = countCheckpoints(projectDir)
    if (checkpoints < config.minDiffCheckpoints) {
      errors.push(`diff 检查点 ${checkpoints} < ${config.minDiffCheckpoints}（需逐段改、逐批比对）`)
    }
    const reviewPath = join(projectDir, 'human-review.json')
    if (existsSync(reviewPath)) {
      try {
        const review = readJson(reviewPath)
        if (review.reviewer !== 'subagent') errors.push('human-review.json 的 reviewer 必须是 subagent')
        if (review.verdict !== 'pass') errors.push(`人味评审未通过：${review.verdict}`)
        for (const [axis, limit] of [
          ['aiRate', config.aiRateMax],
          ['aiFlavor', config.aiFlavorMax],
          ['machineFlavor', config.machineFlavorMax],
        ]) {
          const score = review.axes?.[axis]?.score
          if (typeof score !== 'number') errors.push(`human-review.json 缺少 ${axis}.score`)
          else if (score > limit) errors.push(`${axis} ${score} > 阈值 ${limit}`)
        }
      } catch (err) {
        errors.push(`human-review.json 解析失败：${err.message}`)
      }
    }
  }

  if (id === 'S8') {
    const docx = findBuildFile(projectDir, '.docx')
    if (!docx) errors.push('build/ 下没有 docx')
    else {
      try {
        const doc = readDocument(docx)
        if (doc.placeholders.length) {
          errors.push(`成品还有 ${doc.placeholders.length} 个占位符：${doc.placeholders[0].token}`)
        }
      } catch (err) {
        errors.push(`成品 docx 无法解析：${err.message}`)
      }
    }
  }

  if (id === 'S6' && existsSync(join(projectDir, 'review-content.json'))) {
    try {
      const review = readJson(join(projectDir, 'review-content.json'))
      if (review.verdict !== 'pass') errors.push(`内容评审未通过：${review.verdict}`)
      if (review.reviewer !== 'subagent') errors.push('内容评审的 reviewer 必须是 subagent')
    } catch (err) {
      errors.push(`review-content.json 解析失败：${err.message}`)
    }
  }

  if (id === 'S9' && existsSync(join(projectDir, 'review-form.json'))) {
    try {
      const review = readJson(join(projectDir, 'review-form.json'))
      if (review.verdict !== 'pass') errors.push(`形式评审未通过：${review.verdict}`)
    } catch (err) {
      errors.push(`review-form.json 解析失败：${err.message}`)
    }
  }

  if (id === 'S10' && existsSync(join(projectDir, 'verify-report.md'))) {
    const report = readFileSync(join(projectDir, 'verify-report.md'), 'utf8')
    if (!/- 结论：PASS/.test(report)) errors.push('verify-report.md 结论不是 PASS')
    if (/\| FAIL \|/.test(report)) errors.push('verify-report.md 里仍有 FAIL 阶段')
  }

  return { ok: errors.length === 0, errors }
}

export function hashArtifacts(projectDir, id) {
  const hashes = {}
  for (const rel of ARTIFACTS[id] ?? []) {
    const path = join(projectDir, rel)
    if (!existsSync(path)) continue
    if (statSync(path).isFile()) hashes[rel] = sha256File(path)
  }
  return hashes
}

export function isReviewStage(id) {
  return REVIEW_STAGES.includes(id)
}
