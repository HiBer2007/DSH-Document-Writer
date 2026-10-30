import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkStage } from './checks.mjs'
import { listExtensions } from './extensions.mjs'
import { STAGE_IDS, STAGE_MAP } from './stages.mjs'
import { now, sha256File, statusOf } from './state.mjs'

function hashErrorsFor(projectDir, state, id) {
  const errors = []
  for (const [rel, expected] of Object.entries(state.stages[id]?.hashes ?? {})) {
    const path = join(projectDir, rel)
    if (!existsSync(path)) {
      errors.push(`产物丢失：${rel}`)
      continue
    }
    if (sha256File(path) !== expected) errors.push(`产物被改动（stale）：${rel}`)
  }
  return errors
}

function runExtension(ext, projectDir) {
  const errors = []
  for (const command of ext.commands ?? []) {
    if (!command.run) continue
    const script = join(ext.dir, command.run)
    if (!existsSync(script)) {
      errors.push(`${command.name ?? command.run}：脚本不存在`)
      continue
    }
    const args = String(command.args ?? '')
      .split(/\s+/)
      .filter(Boolean)
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30000,
    })
    if (result.status !== 0) {
      errors.push(
        `${command.name ?? command.run} 退出码 ${result.status}：${(result.stderr ?? '').slice(0, 200)}`,
      )
    }
  }
  return errors
}

/** 全量终检：done 阶段哈希 + 检查、扩展检查、报告 */
export function verifyProject(projectDir, state, config, { root = process.cwd() } = {}) {
  const results = []

  for (const id of STAGE_IDS) {
    const status = statusOf(state, id)
    if (status === 'excluded' || status === 'pending' || status === 'active') continue
    if (status === 'waived') {
      results.push({
        id,
        name: STAGE_MAP[id].name,
        status: 'WAIVED',
        errors: [],
        warning: state.stages[id]?.waiver?.quote ?? '',
      })
      continue
    }
    const hashErrors = hashErrorsFor(projectDir, state, id)
    const check = checkStage(projectDir, state, id, config)
    results.push({
      id,
      name: STAGE_MAP[id].name,
      status: hashErrors.length || !check.ok ? 'FAIL' : 'PASS',
      errors: [...hashErrors, ...check.errors],
    })
  }

  const enabled = state.extensions ?? []
  const installed = listExtensions(root)
  const extensions = []
  for (const name of enabled) {
    const ext = installed.find((item) => item.name === name)
    if (!ext) {
      extensions.push({ name, status: 'FAIL', errors: ['已启用但未安装'] })
      continue
    }
    if (ext.errors?.length) {
      extensions.push({ name, status: 'FAIL', errors: ext.errors })
      continue
    }
    const errors = runExtension(ext, projectDir)
    extensions.push({
      name,
      status: errors.length ? (ext.blocking ? 'FAIL' : 'WARN') : 'PASS',
      errors,
    })
  }

  const failed =
    results.filter((row) => row.status === 'FAIL').length +
    extensions.filter((row) => row.status === 'FAIL').length
  const passed = results.filter((row) => row.status === 'PASS').length
  const waived = results.filter((row) => row.status === 'WAIVED').length

  return { results, extensions, failed, passed, waived, ok: failed === 0, at: now() }
}

export function formatVerifyReport(project, result) {
  const lines = []
  lines.push('# 终检报告')
  lines.push('')
  lines.push(`- 项目：${project}`)
  lines.push(`- 时间：${result.at}`)
  lines.push(`- 结论：${result.ok ? 'PASS' : 'FAIL'}`)
  lines.push(`- 统计：PASS ${result.passed} ｜ WAIVED ${result.waived} ｜ FAIL ${result.failed}`)
  lines.push('')
  lines.push('## 阶段')
  lines.push('')
  lines.push('| 阶段 | 结果 | 说明 |')
  lines.push('| --- | --- | --- |')
  for (const row of result.results) {
    const note = row.errors.length ? row.errors.join('；') : row.warning || ''
    lines.push(`| ${row.id} ${row.name} | ${row.status} | ${note} |`)
  }
  lines.push('')
  lines.push('## 扩展')
  lines.push('')
  if (!result.extensions.length) {
    lines.push('（未启用扩展）')
  } else {
    for (const ext of result.extensions) {
      lines.push(`- ${ext.name}：${ext.status}${ext.errors.length ? `（${ext.errors.join('；')}）` : ''}`)
    }
  }
  lines.push('')
  lines.push('## 人工复核')
  lines.push('')
  lines.push('- 预览地址：见 `.run/preview.json`（如已启动）')
  lines.push('- 本报告只覆盖机器可判定项；语义、引用、事实仍需用户确认。')
  return `${lines.join('\n')}\n`
}

export function writeVerifyReport(projectDir, project, result) {
  const report = formatVerifyReport(project, result)
  writeFileSync(join(projectDir, 'verify-report.md'), report, 'utf8')
  return report
}

export function readVerifyReport(projectDir) {
  const path = join(projectDir, 'verify-report.md')
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}
