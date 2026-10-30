import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { CliError, EXIT } from './errors.mjs'
import { now, sha256File } from './state.mjs'

export function sourcesDir(projectDir) {
  return join(projectDir, 'sources')
}

export function indexPath(projectDir) {
  return join(sourcesDir(projectDir), 'index.json')
}

export function loadIndex(projectDir) {
  const path = indexPath(projectDir)
  if (!existsSync(path)) return { version: 1, entries: [], pending: [] }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new CliError(`sources/index.json 解析失败：${err.message}`, EXIT.CHECK)
  }
}

export function saveIndex(projectDir, index) {
  mkdirSync(sourcesDir(projectDir), { recursive: true })
  writeFileSync(indexPath(projectDir), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

/** 加入素材：复制到 sources/，记录来源与哈希 */
export function addSource(projectDir, filePath) {
  const source = resolve(filePath)
  if (!existsSync(source)) throw new CliError(`素材不存在：${filePath}`, EXIT.IO)
  mkdirSync(sourcesDir(projectDir), { recursive: true })
  const name = basename(source)
  const dest = join(sourcesDir(projectDir), name)
  copyFileSync(source, dest)

  const index = loadIndex(projectDir)
  const entry = { file: name, origin: source, sha256: sha256File(dest), addedAt: now() }
  index.entries = [...(index.entries ?? []).filter((item) => item.file !== name), entry]
  saveIndex(projectDir, index)
  return entry
}

/** 声明“还缺的素材”，允许后补 */
export function declarePending(projectDir, label) {
  if (!label) throw new CliError('缺少素材名称', EXIT.USAGE)
  const index = loadIndex(projectDir)
  const pending = [...(index.pending ?? [])]
  if (!pending.includes(label)) pending.push(label)
  index.pending = pending
  saveIndex(projectDir, index)
  return index
}

/** 后补完成：从 pending 移除 */
export function resolvePending(projectDir, label) {
  const index = loadIndex(projectDir)
  index.pending = (index.pending ?? []).filter((item) => item !== label)
  saveIndex(projectDir, index)
  return index
}

export function sourceStatus(projectDir) {
  const index = loadIndex(projectDir)
  const entries = index.entries ?? []
  const pending = index.pending ?? []
  let status = 'pending'
  if (entries.length && pending.length) status = 'partial'
  else if (entries.length && !pending.length) status = 'complete'
  return { status, entries, pending }
}

/** 后补素材后，把依赖内容的已完成阶段标 stale */
export function markDownstreamStale(state) {
  const marked = []
  for (const id of ['S4', 'S5', 'S6']) {
    if (state.stages[id]?.status === 'done') {
      state.stages[id].stale = true
      marked.push(id)
    }
  }
  return marked
}
