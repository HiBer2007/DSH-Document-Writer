import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProject } from '../src/core/project.mjs'
import { composeCommand } from '../src/commands/misc.mjs'
import { CliError } from '../src/core/errors.mjs'

async function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-misc-'))
  try {
    return await fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function codeOf(factory) {
  try {
    return await factory()
  } catch (err) {
    if (err instanceof CliError) return err.code
    throw err
  }
}

test('compose：S7 未完成 → 拒绝转换（exit 3）', async () => {
  await withRoot(async (root) => {
    initProject({ root, name: 'demo' })
    const code = await codeOf(() =>
      composeCommand(['--project', 'demo', '--root', root, '--from', 'draft_reduced.md']),
    )
    assert.equal(code, 3)
  })
})

test('compose：scope=compose 时 md → docx', async () => {
  await withRoot(async (root) => {
    const { dir } = initProject({ root, name: 'demo', scope: 'compose' })
    writeFileSync(join(dir, 'draft_reduced.md'), '# 标题\n\n正文内容\n')

    const code = await composeCommand([
      '--project',
      'demo',
      '--root',
      root,
      '--from',
      'draft_reduced.md',
      '--out',
      'build/out.docx',
    ])
    assert.equal(code, 0)
    assert.ok(existsSync(join(dir, 'build', 'out.docx')))
  })
})
