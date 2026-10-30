import { resolve } from 'node:path'
import { resolveActiveProject } from '../core/project.mjs'
import { loadState } from '../core/state.mjs'

export function rootFromFlags(flags = {}) {
  return typeof flags.root === 'string' ? resolve(flags.root) : process.cwd()
}

export function projectFromFlags(flags = {}) {
  const root = rootFromFlags(flags)
  const dir = resolveActiveProject(root, typeof flags.project === 'string' ? flags.project : undefined)
  return { root, dir, state: loadState(dir) }
}
