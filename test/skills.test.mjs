import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findSkill, loadRegistry, skillForStage } from '../src/core/skills.mjs'

const ROOT = process.cwd()

test('registry：13 个 skill，路径都存在', () => {
  const registry = loadRegistry(ROOT)
  assert.equal(registry.skills.length, 13)
  for (const skill of registry.skills) {
    assert.ok(existsSync(join(ROOT, skill.path)), `缺少 ${skill.path}`)
  }
})

test('registry：每个阶段的 skill 与门禁对应', () => {
  const reduce = skillForStage(ROOT, 'S7')
  assert.equal(reduce.id, 'docwrite-reduce')
  assert.equal(reduce.gate, 'soft')
  assert.equal(reduce.approval, 'U5')

  const compose = skillForStage(ROOT, 'S8')
  assert.equal(compose.id, 'docwrite-compose')
  assert.equal(compose.gate, 'hard')
})

test('SKILL.md frontmatter 与 registry 一致', () => {
  const skill = findSkill(ROOT, 'docwrite-verify')
  const content = readFileSync(join(ROOT, skill.path), 'utf8')
  assert.match(content, /^---\nname: docwrite-verify\n/)
  assert.match(content, /stage: S10/)
  assert.match(content, /## 完成判据/)
})

test('routes 覆盖常见入口', () => {
  const routes = loadRegistry(ROOT).routes.map((route) => route.when)
  for (const when of ['新文档', '只查重', '只转格式', '只校验']) {
    assert.ok(routes.includes(when), `缺少路由：${when}`)
  }
})
