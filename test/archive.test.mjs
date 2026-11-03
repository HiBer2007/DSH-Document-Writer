import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isArchived, readPanelMeta, setArchived } from '../src/core/archive.mjs'
import { archiveCommand } from '../src/commands/archive.mjs'

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-archive-'))
  const dir = join(root, 'projects', 'demo')
  mkdirSync(join(dir, '.run'), { recursive: true })
  writeFileSync(
    join(dir, '.run', 'state.json'),
    `${JSON.stringify(
      {
        project: 'demo',
        root: dir,
        current: 'S5',
        scope: { mode: 'full', entry: 'S0', excluded: [] },
        approvals: {},
        stages: {},
        reviews: {},
        loops: {},
        revisions: 0,
        blocked: null,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  return { root, dir }
}

test('archive：只写 panel.json，归档/恢复可逆', () => {
  const { root, dir } = makeProject()
  try {
    assert.equal(isArchived(dir), false)
    const archived = setArchived(dir, true, { by: 'user', reason: '测完归档' })
    assert.equal(archived.archived, true)
    assert.equal(archived.archivedBy, 'user')
    assert.equal(archived.reason, '测完归档')
    assert.equal(isArchived(dir), true)
    assert.ok(existsSync(join(dir, '.run', 'panel.json')))
    assert.equal(JSON.parse(readPanelMeta(dir).archived), true)

    const restored = setArchived(dir, false)
    assert.equal(restored.archived, false)
    assert.equal(restored.archivedAt, null)
    assert.equal(isArchived(dir), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archive CLI：archive / unarchive 子命令', async () => {
  const { root, dir } = makeProject()
  try {
    assert.equal(await archiveCommand(['demo', '--root', root]), 0)
    assert.equal(isArchived(dir), true)
    assert.equal(await archiveCommand(['demo', '--root', root], false), 0)
    assert.equal(isArchived(dir), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
