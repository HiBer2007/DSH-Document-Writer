import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CliError, EXIT } from './errors.mjs'
import { REVIEW_STAGES, STAGE_MAP } from './stages.mjs'
import { appendEvent, now, saveState, sha256File } from './state.mjs'

const RUBRIC_PATH = fileURLToPath(new URL('../../rules/human-rubric.md', import.meta.url))

const FOCUS = {
  S6: '内容评审：覆盖度、逻辑链、事实与数据、引用合规、语体、禁项。',
  S7: '人味评审：AI 率、AI 味、机器味三轴；重点看翻译腔、名词化、连接词机械、无细节。',
  S9: '形式评审：字号、行距、页边距、标题层级、页码、图表编号、命名、页数。',
  S10: '终检：全部硬约束、术语一致、引用一致、是否在降重之后才转换格式。',
}

function reviewTemplate(id, stage) {
  return {
    reviewId: id,
    stage,
    reviewer: 'subagent',
    axes: {
      aiRate: { score: 0, signals: [] },
      aiFlavor: { score: 0, signals: [] },
      machineFlavor: { score: 0, signals: [] },
    },
    verdict: 'revise',
    summary: '',
    issues: [],
  }
}

export function reviewsRoot(projectDir) {
  return join(projectDir, '.run', 'reviews')
}

export function openReview(projectDir, state, { stage, doc, config }) {
  if (!REVIEW_STAGES.includes(stage)) {
    throw new CliError(`不是评审阶段：${stage}（可用：${REVIEW_STAGES.join('、')}）`, EXIT.USAGE)
  }
  if (!doc) throw new CliError('缺少 --doc（待评审文本）', EXIT.USAGE)
  const docPath = resolve(projectDir, doc)
  if (!existsSync(docPath)) throw new CliError(`待评审文件不存在：${doc}`, EXIT.PREREQ)

  const previous = state.reviews?.[stage]
  if (previous?.status === 'open') {
    throw new CliError(
      `还有未提交的评审：${previous.id}；先运行 docwrite review submit --id ${previous.id}，再开下一轮`,
      EXIT.PREREQ,
    )
  }

  const extraRounds = previous?.extraRounds ?? 0
  const round = (previous?.round ?? 0) + 1
  const limit = config.maxRoundsPerReview + extraRounds
  if (round > limit) {
    throw new CliError(
      `评审轮次超限：${stage} 第 ${round} 轮（基础上限 ${config.maxRoundsPerReview}，已追加 ${extraRounds} 轮）。` +
        `如用户同意继续，运行 docwrite review extend --stage ${stage} --add 1 --by user --quote "用户原话"`,
      EXIT.BUDGET,
    )
  }

  const id = `${stage}-${randomBytes(3).toString('hex')}`
  const dir = join(reviewsRoot(projectDir), id)
  mkdirSync(join(dir, 'refs'), { recursive: true })

  if (existsSync(RUBRIC_PATH)) copyFileSync(RUBRIC_PATH, join(dir, 'rubric.md'))
  copyFileSync(docPath, join(dir, 'doc.md'))

  for (const rel of ['spec.md', 'constraints.json', 'sources/index.json']) {
    const source = join(projectDir, rel)
    if (existsSync(source)) copyFileSync(source, join(dir, 'refs', basename(rel)))
  }

  const outputPath = join(dir, 'review.json')
  writeFileSync(join(dir, 'template.json'), `${JSON.stringify(reviewTemplate(id, stage), null, 2)}\n`, 'utf8')

  const prompt = `# 独立评审任务（${stage} ${STAGE_MAP[stage].name}）

你是独立评审子代理。只能依据本目录文件评审，不要参考写作过程、对话历史或主代理的自我评价。

## 步骤

1. 读 \`rubric.md\`（三轴评分规则）
2. 读 \`doc.md\`（待评审文本）
3. 读 \`refs/\`（spec / constraints，作为依据）
4. 按 rubric 给三轴打分，把结论写入 \`${outputPath}\`

## 输出要求

- 只写 JSON，字段见 \`template.json\`
- reviewId 必须是 \`${id}\`
- reviewer 必须是 \`subagent\`
- issues 每条必须带 quote（原文 ≤30 字）与 fix
- 不许写"整体不错"这类空结论

## 本次重点

${FOCUS[stage] ?? '按 rubric 评审。'}
`
  writeFileSync(join(dir, 'prompt.md'), prompt, 'utf8')

  state.reviews = state.reviews ?? {}
  state.reviews[stage] = {
    extraRounds,
    extensions: previous?.extensions ?? [],
    id,
    stage,
    status: 'open',
    round,
    at: now(),
    doc: docPath.slice(projectDir.length + 1),
    hash: sha256File(docPath),
  }
  appendEvent(projectDir, { type: 'review.open', stage, id, round })
  saveState(projectDir, state)

  return { id, dir, promptPath: join(dir, 'prompt.md'), outputPath, docPath, round, limit }
}

/**
 * 用户确认后追加评审轮次。只加预算，不自动开评审；开下一轮仍走 review open。
 * 必须在上一轮已提交、且已到当前上限时才能追加。
 */
export function extendReview(
  projectDir,
  state,
  { stage, add = 1, by, quote, reason = '', config = {} } = {},
) {
  if (!REVIEW_STAGES.includes(stage)) {
    throw new CliError(`不是评审阶段：${stage}（可用：${REVIEW_STAGES.join('、')}）`, EXIT.USAGE)
  }
  if (by !== 'user') {
    throw new CliError('追加评审轮次必须由用户确认：--by user', EXIT.PREREQ)
  }
  if (typeof quote !== 'string' || quote.trim() === '') {
    throw new CliError('缺少用户原话：--quote "用户同意追加的原话"', EXIT.USAGE)
  }
  const amount = Number(add)
  if (!Number.isInteger(amount) || amount < 1) {
    throw new CliError('--add 必须是正整数', EXIT.USAGE)
  }

  const previous = state.reviews?.[stage]
  if (previous?.status === 'open') {
    throw new CliError(
      `还有未提交的评审：${previous.id}；先运行 docwrite review submit --id ${previous.id}，再追加轮次`,
      EXIT.PREREQ,
    )
  }

  const base = config.maxRoundsPerReview ?? 3
  const maxExtra = config.maxReviewExtraRounds ?? 2
  const used = previous?.extraRounds ?? 0
  if (used + amount > maxExtra) {
    throw new CliError(
      `评审追加轮次超限：${stage} 已追加 ${used} 轮（上限 ${maxExtra}）；` +
        `如仍需继续，只能由用户决定回退或接受现有评审结论`,
      EXIT.BUDGET,
    )
  }

  const round = previous?.round ?? 0
  const currentLimit = base + used
  if (round < currentLimit) {
    throw new CliError(
      `还没到评审轮次上限：${stage} 已开 ${round} 轮（当前上限 ${currentLimit}），直接 review open 即可`,
      EXIT.PREREQ,
    )
  }

  const extension = {
    at: now(),
    add: amount,
    by,
    quote,
    reason,
    previousLimit: currentLimit,
    newLimit: currentLimit + amount,
  }
  state.reviews = state.reviews ?? {}
  state.reviews[stage] = {
    ...(previous ?? {}),
    stage,
    extraRounds: used + amount,
    extensions: [...(previous?.extensions ?? []), extension],
  }
  appendEvent(projectDir, {
    type: 'review.extend',
    stage,
    add: amount,
    by,
    quote,
    reason,
    extraRounds: used + amount,
  })
  saveState(projectDir, state)
  return {
    stage,
    extraRounds: used + amount,
    limit: currentLimit + amount,
    maxExtra,
    extension,
  }
}

export function submitReview(projectDir, state, id) {
  const dir = join(reviewsRoot(projectDir), id)
  const reviewPath = join(dir, 'review.json')
  if (!existsSync(reviewPath)) {
    throw new CliError(`评审结论不存在：${reviewPath}`, EXIT.PREREQ)
  }

  let review
  try {
    review = JSON.parse(readFileSync(reviewPath, 'utf8'))
  } catch (err) {
    throw new CliError(`review.json 不是合法 JSON：${err.message}`, EXIT.CHECK)
  }

  if (review.reviewId !== id) {
    throw new CliError(`reviewId 不匹配：期望 ${id}，实际 ${review.reviewId}`, EXIT.CHECK)
  }
  const stage = review.stage
  if (!REVIEW_STAGES.includes(stage)) {
    throw new CliError(`stage 不合法：${stage}`, EXIT.CHECK)
  }
  if (!['pass', 'revise', 'reject'].includes(review.verdict)) {
    throw new CliError(`verdict 不合法：${review.verdict}`, EXIT.CHECK)
  }
  const reviewer = review.reviewer
  const allowCli = stage === 'S9'
  if (reviewer !== 'subagent' && !(allowCli && reviewer === 'cli')) {
    throw new CliError(`reviewer 必须是 subagent（S9 允许 cli），实际：${reviewer}`, EXIT.PREREQ)
  }
  if (review.verdict === 'pass' && !Array.isArray(review.issues)) {
    throw new CliError('pass 必须带 issues 数组（可为空）', EXIT.CHECK)
  }

  state.reviews = state.reviews ?? {}
  state.reviews[stage] = {
    ...(state.reviews[stage] ?? {}),
    id,
    stage,
    status: 'submitted',
    verdict: review.verdict,
    reviewer,
    axes: review.axes ?? null,
    at: now(),
  }

  const artifactName = { S6: 'review-content.json', S7: 'human-review.json', S9: 'review-form.json' }[stage]
  if (artifactName) {
    writeFileSync(join(projectDir, artifactName), `${JSON.stringify(review, null, 2)}\n`, 'utf8')
  }

  appendEvent(projectDir, { type: 'review.submit', stage, id, verdict: review.verdict, reviewer })
  saveState(projectDir, state)
  return review
}

export function listReviews(state) {
  return Object.entries(state.reviews ?? {}).map(([stage, data]) => ({ stage, ...data }))
}
