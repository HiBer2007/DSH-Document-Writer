import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProject } from '../src/core/project.mjs'
import { loadState, setScope } from '../src/core/state.mjs'
import { CliError } from '../src/core/errors.mjs'

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-scope-'))
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

test('scope set scan：入口 S7，S1–S6 排除，S0 完成', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    setScope(dir, state, { mode: 'scan', by: 'user', quote: '我只要查重' })

    assert.equal(state.scope.entry, 'S7')
    assert.equal(state.scope.mode, 'scan')
    assert.equal(state.stages.S0.status, 'done')
    assert.equal(state.stages.S1.status, 'excluded')
    assert.equal(state.stages.S6.status, 'excluded')
    assert.equal(state.stages.S7.status, 'active')
    assert.equal(state.current, 'S7')
  })
})

test('scope set 回 full：被排除阶段恢复 pending', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    setScope(dir, state, { mode: 'scan', by: 'user', quote: '只查重' })
    setScope(dir, state, { mode: 'full', by: 'user', quote: '还是走全流程' })

    assert.equal(state.scope.entry, 'S0')
    assert.equal(state.stages.S1.status, 'pending')
    assert.equal(state.current, 'S1')
  })
})

test('scope set 必须用户原话', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    assert.equal(codeOf(() => setScope(dir, state, { mode: 'scan', by: 'agent', quote: 'x' })), 3)
    assert.equal(codeOf(() => setScope(dir, state, { mode: 'scan', by: 'user' })), 3)
  })
})

test('scope 变化写入事件日志', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    setScope(dir, state, { mode: 'verify', by: 'user', quote: '只校验' })
    const saved = loadState(dir)
    assert.equal(saved.scope.entry, 'S10')
    assert.equal(saved.scope.mode, 'verify')
  })
})
