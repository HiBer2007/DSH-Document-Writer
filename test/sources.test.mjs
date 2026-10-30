import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProject } from '../src/core/project.mjs'
import {
  addSource,
  declarePending,
  markDownstreamStale,
  resolvePending,
  sourceStatus,
} from '../src/core/sources.mjs'
import { nextPending } from '../src/core/state.mjs'

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-src-'))
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('素材加入后状态为 complete', () => {
  withRoot((root) => {
    const { dir } = initProject({ root, name: 'demo' })
    const file = join(root, 'notes.md')
    writeFileSync(file, '# 资料\n内容')

    const entry = addSource(dir, file)
    assert.equal(entry.file, 'notes.md')
    assert.match(entry.sha256, /^sha256:/)

    const status = sourceStatus(dir)
    assert.equal(status.status, 'complete')
    assert.equal(status.entries.length, 1)
  })
})

test('declare 后为 partial，resolve 后回到 complete', () => {
  withRoot((root) => {
    const { dir } = initProject({ root, name: 'demo' })
    const file = join(root, 'a.md')
    writeFileSync(file, 'a')
    addSource(dir, file)

    declarePending(dir, '老师给的指导手册')
    assert.equal(sourceStatus(dir).status, 'partial')
    assert.deepEqual(sourceStatus(dir).pending, ['老师给的指导手册'])

    resolvePending(dir, '老师给的指导手册')
    assert.equal(sourceStatus(dir).status, 'complete')
  })
})

test('后补素材把 S5 标 stale，next 先回到 S5', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    state.stages.S5 = { status: 'done', at: new Date().toISOString() }
    const marked = markDownstreamStale(state)
    assert.deepEqual(marked, ['S5'])
    assert.equal(state.stages.S5.stale, true)
    assert.equal(nextPending(state).id, 'S5')
  })
})

test('没有素材时状态为 pending', () => {
  withRoot((root) => {
    const { dir } = initProject({ root, name: 'demo' })
    assert.equal(sourceStatus(dir).status, 'pending')
  })
})
