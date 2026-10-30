import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { constraintTemplate, validateConstraints } from '../src/core/checks.mjs'
import { constraintsCommand } from '../src/commands/misc.mjs'

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-constraints-'))
  const dir = join(root, 'projects', '测试')
  mkdirSync(join(dir, '.run'), { recursive: true })
  writeFileSync(
    join(dir, '.run', 'state.json'),
    `${JSON.stringify(
      {
        project: '测试',
        root: dir,
        current: 'S1',
        scope: { mode: 'full', entry: 'S0', excluded: [] },
        approvals: {},
        stages: { S1: { status: 'active', attempt: 1 } },
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

test('constraints：模板覆盖必填字段，校验通过', () => {
  const template = constraintTemplate('测试')
  assert.ok(Array.isArray(template.items))
  assert.ok(template.items.length >= 3)
  assert.deepEqual(validateConstraints(template).errors, [])
})

test('constraints：缺字段 / 重复 id / 非法 priority 都会报错', () => {
  const data = {
    items: [
      { id: 'C-1', type: 'format', priority: 'hard', source: '模板', check: '≤8000 字' },
      { id: 'C-1', type: 'style', priority: 'medium', source: '', check: '' },
    ],
    conflicts: [{ between: ['C-1', 'C-9'], resolution: '' }],
  }
  const { errors } = validateConstraints(data)
  assert.ok(errors.some((error) => error.includes('id 重复')))
  assert.ok(errors.some((error) => error.includes('priority')))
  assert.ok(errors.some((error) => error.includes('缺少 source')))
  assert.ok(errors.some((error) => error.includes('缺少 check')))
  assert.ok(errors.some((error) => error.includes('不存在的 id')))
  assert.ok(errors.some((error) => error.includes('缺少 resolution')))
})

test('constraints：init → check → 坏文件 check 失败', async () => {
  const { root, dir } = makeProject()
  try {
    assert.equal(
      await constraintsCommand(['init', '--root', root, '--project', '测试']),
      0,
    )
    const path = join(dir, 'constraints.json')
    assert.ok(existsSync(path))
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    assert.ok(Array.isArray(parsed.items) && parsed.items.length > 0)

    assert.equal(
      await constraintsCommand(['check', '--root', root, '--project', '测试']),
      0,
    )

    writeFileSync(path, '{"items":[{"id":"C-1"}]}\n', 'utf8')
    assert.equal(
      await constraintsCommand(['check', '--root', root, '--project', '测试']),
      2,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('constraints：template 命令输出可解析的 JSON', async () => {
  const { root } = makeProject()
  const original = console.log
  const lines = []
  console.log = (value) => lines.push(String(value))
  try {
    assert.equal(
      await constraintsCommand(['template', '--root', root, '--project', '测试']),
      0,
    )
  } finally {
    console.log = original
    rmSync(root, { recursive: true, force: true })
  }
  const parsed = JSON.parse(lines.join('\n'))
  assert.ok(Array.isArray(parsed.items))
  assert.deepEqual(validateConstraints(parsed).errors, [])
})
