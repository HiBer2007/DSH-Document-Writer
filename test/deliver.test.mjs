import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProject } from '../src/core/project.mjs'
import { deliverProject } from '../src/core/deliver.mjs'
import { CliError } from '../src/core/errors.mjs'

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-deliver-'))
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

test('deliver：S10 未完成 → exit 3', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    assert.equal(codeOf(() => deliverProject(dir, state)), 3)
  })
})

test('deliver：复制成品并写清单', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    state.stages.S10 = { status: 'done', at: new Date().toISOString() }
    writeFileSync(join(dir, 'build', 'final.docx'), 'fake-docx-bytes')

    const result = deliverProject(dir, state)
    assert.ok(existsSync(result.target))
    assert.equal(result.target.endsWith('demo.docx'), true)

    const manifestPath = join(dir, 'deliver', 'delivery-manifest.json')
    assert.ok(existsSync(manifestPath))
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.project, 'demo')
    assert.equal(manifest.files[0].name, 'demo.docx')
    assert.match(manifest.files[0].sha256, /^sha256:/)
  })
})

test('deliver：--to 指定格式', () => {
  withRoot((root) => {
    const { dir, state } = initProject({ root, name: 'demo' })
    state.stages.S10 = { status: 'done', at: new Date().toISOString() }
    writeFileSync(join(dir, 'build', 'a.docx'), 'docx')
    writeFileSync(join(dir, 'build', 'b.md'), 'md')

    const result = deliverProject(dir, state, { to: 'md' })
    assert.equal(result.target.endsWith('demo.md'), true)
    assert.equal(codeOf(() => deliverProject(dir, state, { to: 'pptx' })), 3)
  })
})
