import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { initProject } from '../src/core/project.mjs'
import { appendEvent, approve, enterStage, loadConfig, markDone } from '../src/core/state.mjs'
import { checkStage, hashArtifacts } from '../src/core/checks.mjs'
import { ARTIFACTS } from '../src/core/stages.mjs'
import { openReview, submitReview } from '../src/core/review.mjs'
import { verifyProject, writeVerifyReport } from '../src/core/verify.mjs'
import { deliverProject } from '../src/core/deliver.mjs'
import { buildDocx } from './helpers/build-docx.mjs'

function write(projectDir, rel, content) {
  const path = join(projectDir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function writeJson(projectDir, rel, value) {
  write(projectDir, rel, `${JSON.stringify(value, null, 2)}\n`)
}

test('端到端：12 阶段跑通、终检 PASS、交付', () => {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-e2e-'))
  try {
    const { dir, state } = initProject({ root, name: 'e2e' })
    const config = loadConfig(root)
    const done = (id) => {
      const check = checkStage(dir, state, id, config)
      assert.equal(check.ok, true, `${id} 检查失败：${check.errors.join('; ')}`)
      markDone(dir, state, id, { artifacts: ARTIFACTS[id], hashes: hashArtifacts(dir, id) })
    }

    markDone(dir, state, 'S0', { artifacts: ['brief.md'], hashes: hashArtifacts(dir, 'S0') })
    approve(dir, state, 'U0', { by: 'user', quote: '任务卡没问题' })

    enterStage(dir, state, 'S1')
    writeJson(dir, 'constraints.json', { items: [{ id: 'c1', type: 'format' }] })
    done('S1')
    approve(dir, state, 'U1', { by: 'user', quote: '约束没问题' })

    enterStage(dir, state, 'S2')
    write(dir, 'spec.md', '# 规格\n\n## 一、引言\n\n## 二、正文\n')
    done('S2')
    approve(dir, state, 'U2', { by: 'user', quote: '方向对' })

    enterStage(dir, state, 'S3')
    writeJson(dir, 'sources/index.json', {
      entries: [{ file: 'a.md', sha256: 'sha256:x' }],
      pending: [],
    })
    done('S3')

    enterStage(dir, state, 'S4')
    write(dir, 'outline.md', '# 提纲\n\n## 一、引言\n- 要点\n')
    done('S4')
    approve(dir, state, 'U3', { by: 'user', quote: '提纲可以' })

    enterStage(dir, state, 'S5')
    write(dir, 'draft.md', '这是原始初稿内容，比较规整。\n\n第二段也是原始内容。')
    done('S5')

    enterStage(dir, state, 'S6')
    const r6 = openReview(dir, state, { stage: 'S6', doc: 'draft.md', config })
    writeJson(dir, `.run/reviews/${r6.id}/review.json`, {
      reviewId: r6.id,
      stage: 'S6',
      reviewer: 'subagent',
      verdict: 'pass',
      issues: [],
    })
    submitReview(dir, state, r6.id)
    approve(dir, state, 'U4', { by: 'user', quote: '评审通过' })
    done('S6')

    approve(dir, state, 'U5', { by: 'user', quote: '降重' })
    enterStage(dir, state, 'S7')
    write(dir, 'draft_reduced.md', '换了一种写法，读起来更像人。\n\n另一段也重写了。')
    writeJson(dir, 'reduce-report.json', { method: 'manual-edit' })
    writeJson(dir, 'human-review.json', {
      reviewer: 'subagent',
      verdict: 'pass',
      axes: {
        aiRate: { score: 0.2 },
        aiFlavor: { score: 0.2 },
        machineFlavor: { score: 0.2 },
      },
    })
    appendEvent(dir, { type: 'reduce.checkpoint', rate: 0.5 })
    appendEvent(dir, { type: 'reduce.checkpoint', rate: 0.6 })
    appendEvent(dir, { type: 'reduce.checkpoint', rate: 0.7 })
    done('S7')

    approve(dir, state, 'U6', { by: 'user', quote: '转格式' })
    enterStage(dir, state, 'S8')
    write(dir, 'build/final.docx', buildDocx({ bodyXml: '<w:p><w:r><w:t>成品正文</w:t></w:r></w:p>' }))
    done('S8')

    enterStage(dir, state, 'S9')
    const r9 = openReview(dir, state, { stage: 'S9', doc: 'build/final.docx', config })
    writeJson(dir, `.run/reviews/${r9.id}/review.json`, {
      reviewId: r9.id,
      stage: 'S9',
      reviewer: 'cli',
      verdict: 'pass',
      issues: [],
    })
    submitReview(dir, state, r9.id)
    approve(dir, state, 'U4', { by: 'user', quote: '形式没问题' })
    done('S9')

    enterStage(dir, state, 'S10')
    const verified = verifyProject(dir, state, config, { root })
    assert.equal(
      verified.ok,
      true,
      verified.results
        .filter((row) => row.status === 'FAIL')
        .map((row) => `${row.id}: ${row.errors.join('; ')}`)
        .join(' | '),
    )
    writeVerifyReport(dir, state.project, verified)
    approve(dir, state, 'U4', { by: 'user', quote: '终检通过' })
    done('S10')

    approve(dir, state, 'U7', { by: 'user', quote: '交付' })
    enterStage(dir, state, 'S11')
    const delivered = deliverProject(dir, state)
    assert.ok(existsSync(delivered.target))
    done('S11')

    assert.ok(existsSync(join(dir, 'deliver', 'delivery-manifest.json')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
