import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CliError, EXIT } from './errors.mjs'

export function pptRoot(root, config = {}) {
  return resolve(root, config.pptMaster?.root ?? 'vendor/ppt-master')
}

/** 优先用 OLD/.venv 里的 Python（ppt-master 依赖装在那里），否则退回 PATH */
export function resolvePython(root, config = {}) {
  const configured = config.pptMaster?.python
  if (configured) return resolve(root, configured)
  const venv = join(root, 'OLD', '.venv', 'Scripts', 'python.exe')
  if (existsSync(venv)) return venv
  return 'python'
}

export function buildCommands({ sub, positional, flags = {} }) {
  switch (sub) {
    case 'init': {
      const name = positional[0]
      if (!name) {
        throw new CliError(
          '用法：docwrite ppt init <项目名> [--format ppt169] [--dir <目录>]',
          EXIT.USAGE,
        )
      }
      const args = ['init', name, '--format', flags.format ?? 'ppt169']
      if (typeof flags.dir === 'string') args.push('--dir', flags.dir)
      return [{ script: 'project_manager.py', args }]
    }
    case 'import': {
      const project = positional[0]
      const sources = positional.slice(1)
      if (!project || !sources.length) {
        throw new CliError(
          '用法：docwrite ppt import <项目目录> <源文件...> [--move|--copy]',
          EXIT.USAGE,
        )
      }
      const args = ['import-sources', project, ...sources]
      if (flags.move) args.push('--move')
      if (flags.copy) args.push('--copy')
      return [{ script: 'project_manager.py', args }]
    }
    case 'validate': {
      const project = positional[0]
      if (!project) throw new CliError('用法：docwrite ppt validate <项目目录>', EXIT.USAGE)
      return [{ script: 'project_manager.py', args: ['validate', project] }]
    }
    case 'info': {
      const project = positional[0]
      if (!project) throw new CliError('用法：docwrite ppt info <项目目录>', EXIT.USAGE)
      return [{ script: 'project_manager.py', args: ['info', project] }]
    }
    case 'build': {
      const project = positional[0]
      if (!project) {
        throw new CliError(
          '用法：docwrite ppt build <项目目录> [--out 输出.pptx] [--format ppt169]',
          EXIT.USAGE,
        )
      }
      const svgArgs = [project]
      if (typeof flags.out === 'string') svgArgs.push('-o', flags.out)
      if (typeof flags.format === 'string') svgArgs.push('-f', flags.format)
      return [
        { script: 'finalize_svg.py', args: [project] },
        { script: 'svg_to_pptx.py', args: svgArgs },
      ]
    }
    case 'check': {
      const project = positional[0]
      if (!project) {
        throw new CliError('用法：docwrite ppt check <项目目录> [--format ppt169]', EXIT.USAGE)
      }
      const args = [project]
      if (typeof flags.format === 'string') args.push('--format', flags.format)
      return [{ script: 'svg_quality_checker.py', args }]
    }
    default:
      throw new CliError(
        `ppt 子命令未知：${sub ?? '(空)'}。可用：init、import、validate、info、build、check`,
        EXIT.USAGE,
      )
  }
}

export function runCommands(root, config, commands, { dryRun = false } = {}) {
  const python = resolvePython(root, config)
  const base = pptRoot(root, config)
  const lines = commands.map((command) =>
    [python, join(base, 'scripts', command.script), ...command.args].join(' '),
  )
  if (dryRun) return { dryRun: true, commands: lines }

  for (const command of commands) {
    const script = join(base, 'scripts', command.script)
    if (!existsSync(script)) throw new CliError(`缺少脚本：${script}`, EXIT.IO)
    const result = spawnSync(python, [script, ...command.args], {
      stdio: 'inherit',
      cwd: root,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    })
    if (result.status !== 0) {
      throw new CliError(`${command.script} 退出码 ${result.status}`, EXIT.CHECK)
    }
  }
  return { dryRun: false, commands: lines }
}
