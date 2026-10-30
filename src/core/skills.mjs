import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CliError, EXIT } from './errors.mjs'

export function loadRegistry(root = process.cwd()) {
  const path = join(root, 'skills', 'registry.json')
  if (!existsSync(path)) {
    throw new CliError('缺少 skills/registry.json（先运行 scripts/gen-skills.mjs）', EXIT.IO)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function findSkill(root, id) {
  return loadRegistry(root).skills.find((skill) => skill.id === id) ?? null
}

export function skillForStage(root, stage) {
  return loadRegistry(root).skills.find((skill) => skill.stage === stage) ?? null
}
