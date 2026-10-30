import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCommands, resolvePython, runCommands } from '../src/core/ppt.mjs'

const ROOT = process.cwd()

test('ppt init：参数映射', () => {
  const commands = buildCommands({
    sub: 'init',
    positional: ['demo'],
    flags: { format: 'ppt169', dir: 'projects/demo/ppt' },
  })
  assert.deepEqual(commands, [
    {
      script: 'project_manager.py',
      args: ['init', 'demo', '--format', 'ppt169', '--dir', 'projects/demo/ppt'],
    },
  ])
})

test('ppt import / build / check：参数映射', () => {
  const imported = buildCommands({
    sub: 'import',
    positional: ['p', 'a.md'],
    flags: { move: true },
  })
  assert.deepEqual(imported[0].args, ['import-sources', 'p', 'a.md', '--move'])

  const build = buildCommands({
    sub: 'build',
    positional: ['p'],
    flags: { out: 'x.pptx', format: 'ppt169' },
  })
  assert.equal(build.length, 2)
  assert.equal(build[0].script, 'finalize_svg.py')
  assert.equal(build[1].script, 'svg_to_pptx.py')
  assert.deepEqual(build[1].args, ['p', '-o', 'x.pptx', '-f', 'ppt169'])

  const check = buildCommands({
    sub: 'check',
    positional: ['p'],
    flags: { format: 'ppt169' },
  })
  assert.deepEqual(check[0].args, ['p', '--format', 'ppt169'])
})

test('runCommands：dry-run 不执行，返回命令行', () => {
  const commands = buildCommands({ sub: 'info', positional: ['p'] })
  const result = runCommands(ROOT, {}, commands, { dryRun: true })
  assert.equal(result.dryRun, true)
  assert.match(result.commands[0], /project_manager\.py info p/)
})

test('resolvePython：优先用 OLD/.venv', () => {
  const python = resolvePython(ROOT, {})
  assert.ok(python.includes('.venv') || python === 'python')
})
