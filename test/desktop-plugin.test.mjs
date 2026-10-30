import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { ARTIFACTS, ENTRY_APPROVAL, STAGES } from '../harness/docwrite-desktop/index.js'
import {
  ARTIFACTS as CORE_ARTIFACTS,
  ENTRY_APPROVAL as CORE_ENTRY_APPROVAL,
  STAGES as CORE_STAGES,
} from '../src/core/stages.mjs'

const DIR = join(process.cwd(), 'harness', 'docwrite-desktop')
const JS_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => ({ __jsExpr: value }),
}

test('desktop 插件：阶段表与核心 stages.mjs 一致', () => {
  assert.deepEqual(
    STAGES.map(({ id, name, gate }) => ({ id, name, gate })),
    CORE_STAGES.map(({ id, name, gate }) => ({ id, name, gate })),
  )
  assert.deepEqual(ENTRY_APPROVAL, CORE_ENTRY_APPROVAL)
  assert.deepEqual(ARTIFACTS, CORE_ARTIFACTS)
})

test('desktop 插件：manifest 暴露 bundle、client、locale 与 icon', () => {
  const manifest = JSON.parse(readFileSync(join(DIR, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@local/dsh-docwrite')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['./client'], './client.js')
  assert.equal(manifest.exports['./icon'], './icon.svg')
  assert.ok(manifest.files.includes('client.js'))
  assert.ok(manifest.files.includes('locale/*.json'))
})

test('desktop 插件：patch 内联预设行且与 agent.cordis.yml 一致', () => {
  const patch = parseYaml(readFileSync(join(DIR, 'cordis.patch.yml'), 'utf8'), {
    customTags: [JS_TAG],
  })
  const agent = parseYaml(
    readFileSync(join(process.cwd(), 'presets', 'docwrite', 'agent.cordis.yml'), 'utf8'),
    { customTags: [JS_TAG] },
  )
  const rows = patch[0].insert
  const preset = rows.find((row) => row.id === 'preset-docwrite')
  const host = rows.find((row) => row.id === 'docwrite-harness')
  assert.equal(preset.name, '@deepseek-ai/dsh-agent-preset')
  assert.equal(preset.config.id, 'docwrite')
  assert.deepEqual(preset.config.plugins, agent)
  assert.ok(preset.config.plugins.some((row) => row.id === 'persona'))
  assert.ok(preset.config.plugins.some((row) => row.id === 'tool-fs'))
  assert.equal(host.name, '@local/dsh-docwrite')
  assert.equal(host.config, undefined)
})

test('desktop 插件：内置 CLI 运行时，工作区无 CLI 时也能运行', () => {
  assert.ok(existsSync(join(DIR, 'cli', 'bin', 'docwrite.mjs')))
  assert.ok(existsSync(join(DIR, 'cli', 'src', 'cli.mjs')))
  assert.ok(existsSync(join(DIR, 'cli', 'rules', 'scan-rules.json')))
})

test('desktop 插件：client 注册侧栏图标与 main 面板', () => {
  const source = readFileSync(join(DIR, 'client.js'), 'utf8')
  assert.match(source, /sidebar\.panellist/)
  assert.match(source, /name: 'main', key: 'docwrite'/)
  assert.match(source, /docwrite\/state\?root=/)
  assert.match(source, /fetch\(endpoint/)
  assert.match(source, /window\.__ModuleLoader__\.load/)
})
