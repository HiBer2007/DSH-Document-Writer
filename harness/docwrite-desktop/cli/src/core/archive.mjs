import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 面板归档元数据只写 .run/panel.json，不改 state.json 的流程状态。 */
export function panelPath(projectDir) {
  return join(projectDir, '.run', 'panel.json')
}

export function readPanelMeta(projectDir) {
  const path = panelPath(projectDir)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

export function isArchived(projectDir) {
  return readPanelMeta(projectDir).archived === true
}

export function setArchived(projectDir, archived, { by = 'user', reason = '' } = {}) {
  const previous = readPanelMeta(projectDir)
  const meta = {
    ...previous,
    archived: Boolean(archived),
    archivedAt: archived ? new Date().toISOString() : null,
    archivedBy: archived ? by : null,
    reason: archived ? reason : '',
  }
  mkdirSync(join(projectDir, '.run'), { recursive: true })
  writeFileSync(panelPath(projectDir), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  return meta
}
