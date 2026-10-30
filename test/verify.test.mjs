import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProject } from '../src/core/project.mjs'
import { loadConfig, now, sha256File } from '../src/core/state.mjs'
import { verifyProject } from '../src/core/verify.mjs'

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-verify-'))
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function markS0Done(dir, state) {
  state.stages.S0 = {
    status: 'done',
    at: now(),
    artifacts: ['brief.md'],
    hashes: { 'brief.md': sha256File(join(dir, 'brief.md')) },
  }
  state.stages.S10 = { status: 'active', at: now() }
}

test('verify：哈希一致时 PASS', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    markS0Done(dir, state)
    const result = verifyProject(dir, state, loadConfig(root), { root })
    assert.equal(result.ok, true)
    assert.equal(result.results.find((row) => row.id === 'S0').status, 'PASS')
  })
})

test('verify：产物被改动 → stale FAIL', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    markS0Done(dir, state)
    appendFileSync(join(dir, 'brief.md'), '\n手改一行')
    const result = verifyProject(dir, state, loadConfig(root), { root })
    assert.equal(result.ok, false)
    const row = result.results.find((item) => item.id === 'S0')
    assert.equal(row.status, 'FAIL')
    assert.ok(row.errors.some((error) => error.includes('stale')))
  })
})

test('verify：非 blocking 扩展失败只告警', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    markS0Done(dir, state)
    const extDir = join(root, 'extensions', 'bad-ext')
    mkdirSync(extDir, { recursive: true })
    writeFileSync(
      join(extDir, 'extension.json'),
      JSON.stringify({
        name: 'bad-ext',
        version: '1.0.0',
        description: 'x',
        entry: 'SKILL.md',
        commands: [{ name: 'check', run: 'run.mjs' }],
        blocking: false,
      }),
    )
    writeFileSync(join(extDir, 'SKILL.md'), '# x')
    writeFileSync(join(extDir, 'run.mjs'), 'process.exit(1)')
    state.extensions = ['bad-ext']

    const result = verifyProject(dir, state, loadConfig(root), { root })
    assert.equal(result.ok, true)
    assert.equal(result.extensions[0].status, 'WARN')
  })
})

test('verify：blocking 扩展失败 → FAIL', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    markS0Done(dir, state)
    const extDir = join(root, 'extensions', 'block-ext')
    mkdirSync(extDir, { recursive: true })
    writeFileSync(
      join(extDir, 'extension.json'),
      JSON.stringify({
        name: 'block-ext',
        version: '1.0.0',
        description: 'x',
        entry: 'SKILL.md',
        commands: [{ name: 'check', run: 'run.mjs' }],
        blocking: true,
      }),
    )
    writeFileSync(join(extDir, 'SKILL.md'), '# x')
    writeFileSync(join(extDir, 'run.mjs'), 'process.exit(2)')
    state.extensions = ['block-ext']

    const result = verifyProject(dir, state, loadConfig(root), { root })
    assert.equal(result.ok, false)
    assert.equal(result.extensions[0].status, 'FAIL')
  })
})
