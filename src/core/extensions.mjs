import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CliError, EXIT } from './errors.mjs'
import { STAGE_IDS } from './stages.mjs'

export function extensionsRoot(root) {
  return join(root, 'extensions')
}

export function validateManifest(manifest, dir) {
  const errors = []
  if (!manifest || typeof manifest !== 'object') return ['清单不是对象']
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.name ?? '')) errors.push('name 必须是 kebab-case')
  if (!manifest.version) errors.push('缺少 version')
  if (!manifest.description) errors.push('缺少 description')
  if (!manifest.entry) errors.push('缺少 entry')
  else if (!existsSync(join(dir, manifest.entry))) errors.push(`entry 文件不存在：${manifest.entry}`)

  for (const produced of manifest.produces ?? []) {
    const ok =
      typeof produced === 'string' &&
      (produced.startsWith('reports/') || produced.startsWith(`extensions/${manifest.name}/`))
    if (!ok) errors.push(`produces 越界：${produced}`)
  }

  for (const [hook, list] of Object.entries(manifest.hooks ?? {})) {
    if (!['beforeStage', 'afterStage', 'onVerdict'].includes(hook)) {
      errors.push(`未知 hook：${hook}`)
      continue
    }
    for (const stage of list ?? []) {
      if (!STAGE_IDS.includes(stage)) errors.push(`hook 阶段未知：${stage}`)
    }
  }

  if (manifest.blocking !== undefined && typeof manifest.blocking !== 'boolean') {
    errors.push('blocking 必须是布尔值')
  }
  return errors
}

export function listExtensions(root) {
  const dir = extensionsRoot(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      const extDir = join(dir, entry.name)
      const manifestPath = join(extDir, 'extension.json')
      if (!existsSync(manifestPath)) {
        return { name: entry.name, dir: extDir, errors: ['缺少 extension.json'] }
      }
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        return { ...manifest, dir: extDir, errors: validateManifest(manifest, extDir) }
      } catch (err) {
        return { name: entry.name, dir: extDir, errors: [err.message] }
      }
    })
}

export function installExtension(root, srcPath) {
  const src = resolve(srcPath)
  const manifestPath = join(src, 'extension.json')
  if (!existsSync(manifestPath)) {
    throw new CliError(`扩展缺少 extension.json：${srcPath}`, EXIT.USAGE)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const errors = validateManifest(manifest, src)
  if (errors.length) throw new CliError(`扩展清单不合法：${errors.join('；')}`, EXIT.CHECK)

  const dest = join(extensionsRoot(root), manifest.name)
  if (existsSync(dest)) throw new CliError(`扩展已存在：${manifest.name}`, EXIT.USAGE)
  cpSync(src, dest, { recursive: true })
  return { name: manifest.name, dir: dest }
}

export function enableExtension(state, name) {
  state.extensions = [...new Set([...(state.extensions ?? []), name])]
  return state
}

export function disableExtension(state, name) {
  state.extensions = (state.extensions ?? []).filter((item) => item !== name)
  return state
}
