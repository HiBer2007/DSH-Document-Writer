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

/** 约束条目的推荐类型；type 本身只要求非空字符串，便于项目自定义。 */
export const CONSTRAINT_TYPES = [
  'format',
  'content',
  'citation',
  'submission',
  'style',
  'platform',
  'other',
]

/** S1 的可复制骨架：模型先 init，再按真实材料改，不要凭记忆猜字段。 */
export function constraintTemplate(project = '') {
  return {
    version: 1,
    project,
    generatedAt: new Date().toISOString(),
    items: [
      {
        id: 'C-001',
        type: 'format',
        priority: 'hard',
        source: '模板/指导手册第 X 页',
        check: '正文 ≤ 8000 字；标题黑体三号；行距 1.5',
        value: '≤8000 字',
      },
      {
        id: 'C-002',
        type: 'citation',
        priority: 'hard',
        source: '指导手册 2.1',
        check: '参考文献 ≥ 15 篇，其中近 5 年 ≥ 8 篇；正文引用与文末一一对应',
        value: '≥15 篇',
      },
      {
        id: 'C-003',
        type: 'style',
        priority: 'soft',
        source: '老师口头/课程要求',
        check: '避免口语化网络用语；术语前后一致；不出现第一人称抒情',
        value: '',
      },
    ],
    conflicts: [],
    notes:
      '冲突示例：{"between":["C-001","C-002"],"resolution":"以最新模板为准","decidedBy":"user"}；没有冲突就留空数组。',
  }
}

/**
 * 校验 constraints.json。兼容 `{items:[...]}` 与顶层数组两种写法。
 * @returns {{ errors: string[], items: unknown[] }}
 */
export function validateConstraints(data) {
  const errors = []
  const items = Array.isArray(data) ? data : data?.items
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('constraints.json 里没有任何约束（items 为空）')
    return { errors, items: [] }
  }

  const ids = new Set()
  items.forEach((item, index) => {
    const label = `第 ${index + 1} 条${item && typeof item === 'object' && item.id ? `（${item.id}）` : ''}`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label}不是对象`)
      return
    }
    for (const key of ['id', 'type', 'priority', 'source', 'check']) {
      if (typeof item[key] !== 'string' || item[key].trim() === '') {
        errors.push(`${label}缺少 ${key}（必须是非空字符串）`)
      }
    }
    if (typeof item.id === 'string' && item.id.trim() !== '') {
      if (ids.has(item.id)) errors.push(`id 重复：${item.id}`)
      ids.add(item.id)
    }
    if (item.priority && !['hard', 'soft'].includes(item.priority)) {
      errors.push(`${label}的 priority 只能是 hard 或 soft`)
    }
  })

  if (!Array.isArray(data) && data?.conflicts !== undefined) {
    if (!Array.isArray(data.conflicts)) {
      errors.push('conflicts 必须是数组')
    } else {
      data.conflicts.forEach((conflict, index) => {
        const label = `conflicts 第 ${index + 1} 条`
        if (!Array.isArray(conflict?.between) || conflict.between.length < 2) {
          errors.push(`${label}需要 between 数组（至少两个 id）`)
        } else {
          for (const id of conflict.between) {
            if (!ids.has(id)) errors.push(`${label}引用了不存在的 id：${id}`)
          }
        }
        if (typeof conflict?.resolution !== 'string' || conflict.resolution.trim() === '') {
          errors.push(`${label}缺少 resolution（冲突怎么裁决）`)
        }
      })
    }
  }

  return { errors, items }
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
      errors.push(...validateConstraints(data).errors)
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
