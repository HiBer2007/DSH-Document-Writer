import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProject } from '../src/core/project.mjs'
import {
  appendEvent,
  approve,
  computeStatus,
  enterStage,
  jumpStage,
  loadConfig,
  loadState,
  markDone,
  waiveStage,
} from '../src/core/state.mjs'
import { checkStage } from '../src/core/checks.mjs'
import { CliError } from '../src/core/errors.mjs'
import { openReview, submitReview } from '../src/core/review.mjs'
import { buildDocx } from './helpers/build-docx.mjs'

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-proj-'))
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function codeOf(fn) {
  try {
    fn()
    return 0
  } catch (err) {
    if (err instanceof CliError) return err.code
    throw err
  }
}

test('init：创建目录、brief、state，S0 激活', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    assert.equal(state.current, 'S0')
    assert.equal(state.stages.S0.status, 'active')
    assert.ok(existsSync(join(dir, 'brief.md')))
    assert.ok(existsSync(join(dir, '.run', 'state.json')))
  })
})

test('缺少用户确认时不能进入下一阶段（exit 6）', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    markDone(dir, state, 'S0', { artifacts: ['brief.md'] })
    assert.equal(codeOf(() => enterStage(dir, state, 'S1')), 6)

    approve(dir, state, 'U0', { by: 'user', quote: '就按这个做' })
    enterStage(dir, state, 'S1')
    assert.equal(state.stages.S1.status, 'active')
  })
})

test('approve 必须 --by user 且带原话', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    assert.equal(codeOf(() => approve(dir, state, 'U0', { by: 'agent', quote: 'x' })), 3)
    assert.equal(codeOf(() => approve(dir, state, 'U0', { by: 'user' })), 3)
  })
})

test('S1 检查：缺 constraints.json 失败，补齐后通过', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    markDone(dir, state, 'S0', { artifacts: ['brief.md'] })
    approve(dir, state, 'U0', { by: 'user', quote: 'ok' })
    enterStage(dir, state, 'S1')

    const config = loadConfig(root)
    assert.equal(checkStage(dir, state, 'S1', config).ok, false)

    writeFileSync(
      join(dir, 'constraints.json'),
      JSON.stringify({
        items: [{ id: 'c1', type: 'format', priority: 'hard', source: '模板', check: '≤8000 字' }],
      }),
    )
    const check = checkStage(dir, state, 'S1', config)
    assert.equal(check.ok, true, check.errors.join(';'))
  })
})

test('硬门禁不可豁免，软门禁可豁免', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    writeFileSync(
      join(dir, 'constraints.json'),
      JSON.stringify({
        items: [{ id: 'c1', type: 'format', priority: 'hard', source: '模板', check: '≤8000 字' }],
      }),
    )
    markDone(dir, state, 'S1', { artifacts: ['constraints.json'] })

    assert.equal(codeOf(() => waiveStage(dir, state, 'S1', { by: 'user', quote: 'x' })), 3)
    waiveStage(dir, state, 'S3', { by: 'user', quote: '素材后补' })
    assert.equal(state.stages.S3.status, 'waived')
    assert.equal(state.stages.S3.waiver.quote, '素材后补')
  })
})

test('回退只允许守卫边，预算耗尽进入 blocked（exit 5）', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    const config = { maxLoopsPerEdge: 3, maxTotalRevisions: 8 }

    assert.equal(codeOf(() => jumpStage(dir, state, 'S6', 'S3', { config })), 3)
    jumpStage(dir, state, 'S6', 'S5', { config })
    jumpStage(dir, state, 'S6', 'S5', { config })
    jumpStage(dir, state, 'S6', 'S5', { config })
    assert.equal(codeOf(() => jumpStage(dir, state, 'S6', 'S5', { config })), 5)
    assert.ok(loadState(dir).blocked)
  })
})

test('computeStatus 给出下一阶段与待确认点', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    markDone(dir, state, 'S0', { artifacts: ['brief.md'] })
    const view = computeStatus(state)
    assert.equal(view.next, 'S1')
    assert.equal(view.pendingApproval.gate, 'U0')
    assert.ok(view.stages.some((s) => s.id === 'S1' && s.gate === 'hard'))
  })
})

test('review：open 生成评审包，主代理自评被拒，subagent 结论落盘', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    writeFileSync(join(dir, 'draft_reduced.md'), '这是待评审文本。')
    const opened = openReview(dir, state, {
      stage: 'S7',
      doc: 'draft_reduced.md',
      config: loadConfig(root),
    })
    assert.ok(existsSync(opened.promptPath))
    assert.ok(existsSync(join(opened.dir, 'rubric.md')))
    assert.ok(existsSync(join(opened.dir, 'template.json')))

    writeFileSync(
      join(opened.dir, 'review.json'),
      JSON.stringify({ reviewId: opened.id, stage: 'S7', reviewer: 'main', verdict: 'pass', issues: [] }),
    )
    assert.equal(codeOf(() => submitReview(dir, state, opened.id)), 3)

    writeFileSync(
      join(opened.dir, 'review.json'),
      JSON.stringify({
        reviewId: opened.id,
        stage: 'S7',
        reviewer: 'subagent',
        verdict: 'pass',
        axes: {
          aiRate: { score: 0.2 },
          aiFlavor: { score: 0.2 },
          machineFlavor: { score: 0.2 },
        },
        issues: [],
      }),
    )
    const review = submitReview(dir, state, opened.id)
    assert.equal(review.verdict, 'pass')
    assert.ok(existsSync(join(dir, 'human-review.json')))
    assert.equal(loadState(dir).reviews.S7.verdict, 'pass')
  })
})

test('S7 检查：修改率、检查点、三轴评审缺一不可', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    writeFileSync(join(dir, 'draft.md'), '第一段内容。\n\n第二段内容。')
    writeFileSync(join(dir, 'draft_reduced.md'), '完全不同的写法。\n\n换了一种表达方式。')
    writeFileSync(join(dir, 'reduce-report.json'), '{}')
    writeFileSync(
      join(dir, 'human-review.json'),
      JSON.stringify({
        reviewer: 'subagent',
        verdict: 'pass',
        axes: { aiRate: { score: 0.2 }, aiFlavor: { score: 0.2 }, machineFlavor: { score: 0.2 } },
      }),
    )
    const config = loadConfig(root)

    const before = checkStage(dir, state, 'S7', config)
    assert.equal(before.ok, false)
    assert.ok(before.errors.some((e) => e.includes('检查点')))

    appendEvent(dir, { type: 'reduce.checkpoint', rate: 0.5 })
    appendEvent(dir, { type: 'reduce.checkpoint', rate: 0.55 })
    appendEvent(dir, { type: 'reduce.checkpoint', rate: 0.6 })
    const after = checkStage(dir, state, 'S7', config)
    assert.equal(after.ok, true, after.errors.join(';'))
  })
})

test('S8 检查：成品有占位符则失败', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    writeFileSync(join(dir, 'build', 'x.docx'), buildDocx({ bodyXml: '<w:p><w:r><w:t>{{姓名}}</w:t></w:r></w:p>' }))
    const check = checkStage(dir, state, 'S8', loadConfig(root))
    assert.equal(check.ok, false)
    assert.ok(check.errors.some((e) => e.includes('占位符')))
  })
})
