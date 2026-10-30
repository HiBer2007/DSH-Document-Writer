import test from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  installMode,
  installProfileMode,
  modeStatus,
  profileModeStatus,
  presetTarget,
  uninstallMode,
  uninstallProfileMode,
} from '../src/core/mode.mjs'
import { CliError } from '../src/core/errors.mjs'

const ROOT = process.cwd()
const JS_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => ({ __jsExpr: value }),
}

test('mode：install → status → uninstall', () => {
  const home = mkdtempSync(join(tmpdir(), 'docwrite-dsh-'))
  try {
    const result = installMode(ROOT, { dshHome: home })
    assert.ok(existsSync(join(result.dest, 'preset.yml')))
    assert.ok(existsSync(join(result.dest, 'agent.cordis.yml')))
    assert.ok(existsSync(join(result.dest, '.docwrite-managed.json')))

    const status = modeStatus(ROOT, { dshHome: home })
    assert.equal(status.installed, true)
    assert.equal(status.name, '文档工坊')

    const removed = uninstallMode(ROOT, { dshHome: home })
    assert.equal(removed.removed, true)
    assert.equal(modeStatus(ROOT, { dshHome: home }).installed, false)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('mode：拒绝卸载非托管目录', () => {
  const home = mkdtempSync(join(tmpdir(), 'docwrite-dsh-'))
  try {
    const dest = presetTarget(home)
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, 'preset.yml'), 'name: x\n')
    assert.throws(
      () => uninstallMode(ROOT, { dshHome: home }),
      (err) => err instanceof CliError && err.code === 3,
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('profile：安装写入声明式 preset 行，重复安装幂等', () => {
  const home = mkdtempSync(join(tmpdir(), 'docwrite-profile-'))
  const profile = 'dsh-tui'
  try {
    const dir = join(home, 'profiles', profile)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'cordis.patch.yml'), '- id: hmr\n  disabled: false\n')

    const first = installProfileMode(ROOT, { dshHome: home, profile })
    assert.equal(first.appended, true)
    assert.equal(first.replaced, false)

    const patch = readFileSync(first.patch, 'utf8')
    assert.match(patch, /id: preset-docwrite/)
    assert.match(patch, /name: '@deepseek-ai\/dsh-agent-preset'/)
    assert.match(patch, /disabled: !!js \|-/)
    assert.doesNotMatch(patch, /cordis-plugin-include/)

    const parsed = parseYaml(patch, { customTags: [JS_TAG] })
    const declaration = parsed
      .flatMap((entry) => entry.insert ?? [])
      .find((row) => row.id === 'preset-docwrite')
    const agent = parseYaml(readFileSync(join(ROOT, 'presets', 'docwrite', 'agent.cordis.yml'), 'utf8'), {
      customTags: [JS_TAG],
    })
    assert.deepEqual(declaration.config.plugins, agent)
    assert.equal((patch.match(/id: preset-docwrite/g) ?? []).length, 1)

    const second = installProfileMode(ROOT, { dshHome: home, profile })
    assert.equal(second.appended, false)
    assert.equal(second.replaced, true)
    const patchAfter = readFileSync(first.patch, 'utf8')
    assert.equal((patchAfter.match(/id: preset-docwrite/g) ?? []).length, 1)

    assert.equal(profileModeStatus(ROOT, { dshHome: home, profile }).installed, true)

    // 旧版动态注册文件在迁移时被清掉，避免与声明式行重复注册同一个 id。
    const legacy = join(dir, 'docwrite-preset.mjs')
    writeFileSync(legacy, "export const name = 'docwrite-preset'\n")
    const migrated = installProfileMode(ROOT, { dshHome: home, profile })
    assert.equal(migrated.legacyRemoved, true)
    assert.equal(existsSync(legacy), false)

    const removed = uninstallProfileMode(ROOT, { dshHome: home, profile })
    assert.equal(removed.removed, true)
    assert.doesNotMatch(readFileSync(first.patch, 'utf8'), /preset-docwrite/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('profile：旧版动态注册块会被声明式行替换', () => {
  const home = mkdtempSync(join(tmpdir(), 'docwrite-profile-'))
  const profile = 'dsh-tui'
  try {
    const dir = join(home, 'profiles', profile)
    mkdirSync(dir, { recursive: true })
    const patch = join(dir, 'cordis.patch.yml')
    writeFileSync(
      patch,
      [
        '- id: hmr',
        '  disabled: false',
        '',
        '# >>> docwrite-preset (managed by docwrite mode install)',
        '- insert:',
        '    - id: docwrite-preset',
        '      name: ./docwrite-preset.mjs',
        '# <<< docwrite-preset',
        '',
      ].join('\n'),
    )

    const result = installProfileMode(ROOT, { dshHome: home, profile })
    assert.equal(result.replaced, true)
    const content = readFileSync(patch, 'utf8')
    assert.doesNotMatch(content, /\.\/docwrite-preset\.mjs/)
    assert.equal((content.match(/id: preset-docwrite/g) ?? []).length, 1)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('profile：bundle 已提供预设时不再写 patch 行', () => {
  const home = mkdtempSync(join(tmpdir(), 'docwrite-profile-'))
  const profile = 'desktop'
  try {
    const dir = join(home, 'profiles', profile)
    mkdirSync(dir, { recursive: true })
    const patch = join(dir, 'cordis.patch.yml')
    writeFileSync(patch, '- id: hmr\n  disabled: false\n')
    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify({ dsh: { profile: { bundles: ['@local/dsh-docwrite'] } } }, null, 2)}\n`,
    )

    const result = installProfileMode(ROOT, { dshHome: home, profile })
    assert.equal(result.bundled, true)
    assert.equal(result.appended, false)
    assert.doesNotMatch(readFileSync(patch, 'utf8'), /preset-docwrite/)

    const status = profileModeStatus(ROOT, { dshHome: home, profile })
    assert.equal(status.installed, true)
    assert.equal(status.bundled, true)

    const removed = uninstallProfileMode(ROOT, { dshHome: home, profile })
    assert.equal(removed.bundled, true)
    assert.equal(removed.removed, false)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('profile：找不到 patch 时报前置错误', () => {
  const home = mkdtempSync(join(tmpdir(), 'docwrite-profile-'))
  try {
    assert.throws(
      () => installProfileMode(ROOT, { dshHome: home, profile: 'nope' }),
      (err) => err instanceof CliError && err.code === 3,
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
