import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { CliError, EXIT } from './errors.mjs'
import { now } from './state.mjs'

const MARK_START = '# >>> docwrite-preset (managed by docwrite mode install)'
const MARK_END = '# <<< docwrite-preset'

export function presetSource(root) {
  return join(root, 'presets', 'docwrite')
}

export function dshHomeFromEnv(env = process.env) {
  return env.DSH_HOME || join(homedir(), '.dsh')
}

export function presetTarget(dshHome) {
  return join(dshHome, '.agent-presets', 'docwrite')
}

function validateSource(src) {
  const presetPath = join(src, 'preset.yml')
  const agentPath = join(src, 'agent.cordis.yml')
  if (!existsSync(presetPath) || !existsSync(agentPath)) {
    throw new CliError(`预设源不完整（需要 preset.yml 与 agent.cordis.yml）：${src}`, EXIT.IO)
  }
  let preset
  try {
    preset = parseYaml(readFileSync(presetPath, 'utf8'))
  } catch (err) {
    throw new CliError(`preset.yml 解析失败：${err.message}`, EXIT.CHECK)
  }
  if (!preset?.name || !preset?.description) {
    throw new CliError('preset.yml 缺少 name 或 description', EXIT.CHECK)
  }
  const agent = readFileSync(agentPath, 'utf8')
  if (!/^- id: persona/m.test(agent)) {
    throw new CliError('agent.cordis.yml 缺少 persona 行', EXIT.CHECK)
  }
  if (!/^- id: tool-fs/m.test(agent)) {
    throw new CliError('agent.cordis.yml 缺少 tool-fs 行', EXIT.CHECK)
  }
  return preset
}

export function installMode(root, { dshHome } = {}) {
  const home = dshHome ?? dshHomeFromEnv()
  const src = presetSource(root)
  const preset = validateSource(src)

  const dest = presetTarget(home)
  let backup = null
  if (existsSync(dest)) {
    backup = `${dest}.bak-${Date.now()}`
    cpSync(dest, backup, { recursive: true })
    rmSync(dest, { recursive: true, force: true })
  }

  mkdirSync(join(home, '.agent-presets'), { recursive: true })
  cpSync(src, dest, { recursive: true })
  writeFileSync(
    join(dest, '.docwrite-managed.json'),
    `${JSON.stringify({ owner: 'docwrite', installedAt: now() }, null, 2)}\n`,
    'utf8',
  )
  return { dest, backup, name: preset.name }
}

export function modeStatus(root, { dshHome } = {}) {
  const home = dshHome ?? dshHomeFromEnv()
  const dest = presetTarget(home)
  const installed =
    existsSync(join(dest, 'preset.yml')) && existsSync(join(dest, '.docwrite-managed.json'))
  let name = null
  if (installed) {
    try {
      name = parseYaml(readFileSync(join(dest, 'preset.yml'), 'utf8')).name ?? null
    } catch {
      name = null
    }
  }
  return { installed, dest, name }
}

export function uninstallMode(root, { dshHome } = {}) {
  const home = dshHome ?? dshHomeFromEnv()
  const dest = presetTarget(home)
  if (!existsSync(dest)) return { removed: false }
  if (!existsSync(join(dest, '.docwrite-managed.json'))) {
    throw new CliError(`拒绝删除非 docwrite 管理的预设：${dest}`, EXIT.PREREQ)
  }
  rmSync(dest, { recursive: true, force: true })
  return { removed: true, dest }
}

export function profileDir(dshHome, profile) {
  return join(dshHome, 'profiles', profile)
}

export function profilePatch(dshHome, profile) {
  return join(profileDir(dshHome, profile), 'cordis.patch.yml')
}

/** 旧版动态注册文件；只用于卸载/兼容，不再写入。 */
export function profilePlugin(dshHome, profile) {
  return join(profileDir(dshHome, profile), 'docwrite-preset.mjs')
}

const PRESET_NAME = '文档工坊'
const PRESET_DESCRIPTION = '12 阶段强制流水线：人工降重、独立评审、用户确认点；硬门禁不可跳步。'

/**
 * TUI 0.14 的 agentPresets 是声明式 registry：它不再扫描 `$DSH_HOME/.agent-presets`，
 * 新增预设的唯一受支持方式是插入一条 `@deepseek-ai/dsh-agent-preset` 行。
 * 组合直接内联：preset 在启动期挂载，`cordis-plugin-include` 的子行会被 audit 成
 * “never started” 而判为 broken；官方 standard/ptc/minimal/cordis 也都是内联的。
 * `disabled` 表达式让旧版（没有声明式包、只能扫目录）自动退回全局预设目录。
 */
function presetBlock(agentYaml) {
  const indented = agentYaml
    .replace(/\r\n/g, '\n')
    .trimEnd()
    .split('\n')
    .map((line) => (line.length ? `          ${line}` : ''))
    .join('\n')
  return `${MARK_START}
- insert:
    - id: preset-docwrite
      name: '@deepseek-ai/dsh-agent-preset'
      disabled: !!js |-
        !(() => {
          try {
            process.getBuiltinModule('node:module').createRequire(ctx.baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')
            return true
          } catch {
            return false
          }
        })()
      config:
        id: docwrite
        name: ${JSON.stringify(PRESET_NAME)}
        description: ${JSON.stringify(PRESET_DESCRIPTION)}
        order: 6
        plugins:
${indented}
${MARK_END}
`
}

const BLOCK_RE = /^# >>> docwrite-preset[^\n]*\n[\s\S]*?^# <<< docwrite-preset[^\n]*\n?/m

function profileBundles(home, profile) {
  const manifest = join(profileDir(home, profile), 'package.json')
  if (!existsSync(manifest)) return []
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    return Array.isArray(pkg?.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : []
  } catch {
    return []
  }
}

/** 给某个 profile 注册预设（TUI 0.14 走声明式 registry，不扫 .agent-presets） */
export function installProfileMode(root, { dshHome, profile } = {}) {
  const home = dshHome ?? dshHomeFromEnv()
  if (!profile) throw new CliError('缺少 --profile（例如 dsh-tui）', EXIT.USAGE)
  const patch = profilePatch(home, profile)
  if (!existsSync(patch)) throw new CliError(`找不到 profile patch：${patch}`, EXIT.PREREQ)

  // Desktop 的 bundle 已经自带 preset-docwrite；再写一行会让 Loader 撞 id。
  if (profileBundles(home, profile).includes('@local/dsh-docwrite')) {
    const legacy = profilePlugin(home, profile)
    const legacyRemoved = existsSync(legacy)
    if (legacyRemoved) rmSync(legacy, { force: true })
    return {
      profile,
      patch,
      declaration: 'bundle:@local/dsh-docwrite',
      bundled: true,
      appended: false,
      replaced: false,
      legacyRemoved,
      backup: null,
    }
  }

  const agentPath = join(presetSource(root), 'agent.cordis.yml')
  if (!existsSync(agentPath)) throw new CliError(`缺少预设组合：${agentPath}`, EXIT.IO)

  const content = readFileSync(patch, 'utf8')
  const hadBlock = BLOCK_RE.test(content)
  const agentYaml = readFileSync(agentPath, 'utf8')
  const next = `${content.replace(BLOCK_RE, '').replace(/\n+$/, '')}\n\n${presetBlock(agentYaml)}`

  let backup = null
  if (next !== content) {
    backup = `${patch}.bak-docwrite-${Date.now()}`
    cpSync(patch, backup)
    writeFileSync(patch, next, 'utf8')
  }

  // 旧版动态插件会让新声明重复注册同一个 id；迁移时一并清掉。
  const legacy = profilePlugin(home, profile)
  const legacyRemoved = existsSync(legacy)
  if (legacyRemoved) rmSync(legacy, { force: true })

  return {
    profile,
    patch,
    declaration: 'preset-docwrite',
    appended: !hadBlock,
    replaced: hadBlock,
    legacyRemoved,
    backup,
  }
}

export function uninstallProfileMode(root, { dshHome, profile } = {}) {
  const home = dshHome ?? dshHomeFromEnv()
  if (!profile) throw new CliError('缺少 --profile', EXIT.USAGE)
  if (profileBundles(home, profile).includes('@local/dsh-docwrite')) {
    return { profile, removed: false, bundled: true }
  }
  const plugin = profilePlugin(home, profile)
  const patch = profilePatch(home, profile)
  let removed = false

  if (existsSync(plugin)) {
    rmSync(plugin, { force: true })
    removed = true
  }
  if (existsSync(patch)) {
    const content = readFileSync(patch, 'utf8')
    if (BLOCK_RE.test(content)) {
      const backup = `${patch}.bak-docwrite-${Date.now()}`
      cpSync(patch, backup)
      writeFileSync(patch, content.replace(BLOCK_RE, ''), 'utf8')
      removed = true
    }
  }
  return { profile, removed }
}

export function profileModeStatus(root, { dshHome, profile } = {}) {
  const home = dshHome ?? dshHomeFromEnv()
  if (!profile) throw new CliError('缺少 --profile', EXIT.USAGE)
  const plugin = profilePlugin(home, profile)
  const patch = profilePatch(home, profile)
  const content = existsSync(patch) ? readFileSync(patch, 'utf8') : ''
  const bundled = profileBundles(home, profile).includes('@local/dsh-docwrite')
  const installed =
    bundled || (/id: preset-docwrite/.test(content) && content.includes('@deepseek-ai/dsh-agent-preset'))
  return { profile, installed, bundled, plugin, patch, legacyPlugin: existsSync(plugin) }
}
