import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  disableExtension,
  enableExtension,
  installExtension,
  listExtensions,
  validateManifest,
} from '../src/core/extensions.mjs'
import { CliError } from '../src/core/errors.mjs'

function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-ext-'))
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function makeExt(root, name, overrides = {}) {
  const dir = join(root, 'src-ext')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '# 扩展说明\n')
  writeFileSync(
    join(dir, 'extension.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      description: '测试扩展',
      entry: 'SKILL.md',
      hooks: { beforeStage: ['S10'] },
      produces: ['reports/citation.json'],
      blocking: false,
      ...overrides,
    }),
  )
  return dir
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

test('install 复制扩展并可 list', () => {
  withTemp((root) => {
    const src = makeExt(root, 'citation-check')
    const result = installExtension(root, src)
    assert.equal(result.name, 'citation-check')

    const list = listExtensions(root)
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'citation-check')
    assert.deepEqual(list[0].errors, [])
  })
})

test('非法 produces 越界被拒绝（exit 2）', () => {
  withTemp((root) => {
    const src = makeExt(root, 'bad-ext', { produces: ['draft.md'] })
    assert.equal(codeOf(() => installExtension(root, src)), 2)
  })
})

test('清单校验：name / hook / entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docwrite-manifest-'))
  try {
    writeFileSync(join(dir, 'SKILL.md'), 'x')
    const errors = validateManifest(
      { name: 'Bad_Name', version: '1', description: 'x', entry: 'SKILL.md', hooks: { nope: ['S1'] } },
      dir,
    )
    assert.ok(errors.some((e) => e.includes('kebab-case')))
    assert.ok(errors.some((e) => e.includes('未知 hook')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('enable / disable 改 state.extensions', () => {
  const state = { extensions: [] }
  enableExtension(state, 'citation-check')
  assert.deepEqual(state.extensions, ['citation-check'])
  enableExtension(state, 'citation-check')
  assert.deepEqual(state.extensions, ['citation-check'])
  disableExtension(state, 'citation-check')
  assert.deepEqual(state.extensions, [])
})
