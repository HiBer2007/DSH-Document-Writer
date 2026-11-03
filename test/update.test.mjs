import test from 'node:test'
import assert from 'node:assert/strict'
import { checkForUpdate, compareVersions } from '../src/commands/update.mjs'

test('update：版本比较按数字段', () => {
  assert.equal(compareVersions('1.1.1', '1.1.0'), 1)
  assert.equal(compareVersions('v1.2.0', '1.10.0'), -1)
  assert.equal(compareVersions('1.1.1', 'v1.1.1'), 0)
  assert.equal(compareVersions('1.1', '1.1.0'), 0)
})

test('update：发现新 Release 时 updateAvailable=true', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      tag_name: 'v1.1.2',
      name: '文档工坊 v1.1.2',
      html_url: 'https://example.test/releases/v1.1.2',
      published_at: '2026-11-04T00:00:00Z',
      body: '修复说明',
    }),
  })
  const result = await checkForUpdate({ current: '1.1.1', fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(result.latest, '1.1.2')
  assert.equal(result.updateAvailable, true)
  assert.equal(result.url, 'https://example.test/releases/v1.1.2')
  assert.equal(result.notes, '修复说明')
})

test('update：同版本不提示更新', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ tag_name: 'v1.1.1', html_url: 'https://example.test/v1.1.1' }),
  })
  const result = await checkForUpdate({ current: '1.1.1', fetchImpl })
  assert.equal(result.updateAvailable, false)
  assert.equal(result.latest, '1.1.1')
})

test('update：GitHub API 失败时抛出可读错误', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403 })
  await assert.rejects(
    () => checkForUpdate({ current: '1.1.1', fetchImpl }),
    /GitHub API 403/,
  )
})
