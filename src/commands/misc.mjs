import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { checkStage, constraintTemplate } from '../core/checks.mjs'
import { fillFields } from '../core/docx-ops.mjs'
import { markdownToDocxBytes } from '../core/md.mjs'
import { loadConfig, statusOf } from '../core/state.mjs'
import { projectFromFlags, rootFromFlags } from './common.mjs'

async function runCheck(stage, argv) {
  const { flags } = parseArgs(argv)
  const { root, dir, state } = projectFromFlags(flags)
  const result = checkStage(dir, state, stage, loadConfig(root))
  if (flags.json) {
    console.log(JSON.stringify({ stage, ...result }, null, 2))
  } else if (result.ok) {
    console.log(`✅ ${stage} 检查通过`)
  } else {
    console.error(`❌ ${stage} 检查未通过：`)
    for (const error of result.errors) console.error(`   · ${error}`)
  }
  return result.ok ? EXIT.OK : EXIT.CHECK
}

export async function constraintsCommand(argv) {
  const [sub, ...rest] = argv
  if (sub === 'show') {
    const { flags } = parseArgs(rest)
    const { dir } = projectFromFlags(flags)
    const path = join(dir, 'constraints.json')
    if (!existsSync(path)) throw new CliError('缺少 constraints.json；先运行 docwrite constraints init', EXIT.PREREQ)
    console.log(readFileSync(path, 'utf8'))
    return EXIT.OK
  }
  if (sub === 'template') {
    const { flags } = parseArgs(rest)
    const { state } = projectFromFlags(flags)
    console.log(JSON.stringify(constraintTemplate(state.project), null, 2))
    return EXIT.OK
  }
  if (sub === 'init') {
    const { flags } = parseArgs(rest)
    const { dir, state } = projectFromFlags(flags)
    const path = join(dir, 'constraints.json')
    if (existsSync(path) && !flags.force) {
      throw new CliError('constraints.json 已存在；要覆盖请加 --force', EXIT.PREREQ)
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(constraintTemplate(state.project), null, 2)}\n`, 'utf8')
    console.log(`✅ 已写入约束模板：${path}`)
    console.log('   下一步：用 edit 把 items 改成真实约束，再 docwrite constraints check')
    return EXIT.OK
  }
  if (sub === 'check') return runCheck('S1', rest)
  throw new CliError('用法：docwrite constraints show|template|init|check', EXIT.USAGE)
}

export async function specCommand(argv) {
  return runCheck('S2', argv)
}

export async function outlineCommand(argv) {
  return runCheck('S4', argv)
}

export async function draftCommand(argv) {
  return runCheck('S5', argv)
}

export async function reduceCommand(argv) {
  const [sub, ...rest] = argv
  if (sub && sub !== 'check' && sub !== 'report') {
    throw new CliError('用法：docwrite reduce check|report（降重必须人工 edit）', EXIT.USAGE)
  }
  return runCheck('S7', rest)
}

export async function historyCommand(argv) {
  const { flags } = parseArgs(argv)
  const { dir } = projectFromFlags(flags)
  const path = join(dir, '.run', 'events.jsonl')
  if (!existsSync(path)) {
    console.log('（没有事件）')
    return EXIT.OK
  }
  console.log(readFileSync(path, 'utf8').trimEnd())
  return EXIT.OK
}

export async function archiveCommand(argv) {
  const { flags } = parseArgs(argv)
  const root = rootFromFlags(flags)
  const { dir, state } = projectFromFlags(flags)
  const target = join(root, 'projects', '.archive', `${state.project}-${Date.now()}`)
  mkdirSync(dirname(target), { recursive: true })
  renameSync(dir, target)
  console.log(`📦 已归档：${target}`)
  return EXIT.OK
}

/** 成型：md → docx，或模板字段填充。要求 S7 已 done/waived/excluded。 */
export async function composeCommand(argv) {
  const { flags } = parseArgs(argv)
  const { dir, state } = projectFromFlags(flags)
  const s7 = statusOf(state, 'S7')
  if (!['done', 'waived', 'excluded'].includes(s7)) {
    throw new CliError('S7 降重未完成，不能转格式（Markdown 必须先降重）', EXIT.PREREQ)
  }

  const from = typeof flags.from === 'string' ? flags.from : 'draft_reduced.md'
  const out = typeof flags.out === 'string' ? flags.out : 'build/final.docx'
  const outPath = resolve(dir, out)
  mkdirSync(dirname(outPath), { recursive: true })

  if (typeof flags.template === 'string') {
    const fieldsFile = flags['fields-file']
    if (typeof fieldsFile !== 'string') {
      throw new CliError('--template 需要 --fields-file', EXIT.USAGE)
    }
    const fields = JSON.parse(readFileSync(resolve(fieldsFile), 'utf8'))
    fillFields(resolve(flags.template), outPath, fields)
  } else {
    const sourcePath = resolve(dir, from)
    if (!existsSync(sourcePath)) throw new CliError(`找不到 ${from}`, EXIT.PREREQ)
    writeFileSync(
      outPath,
      markdownToDocxBytes(readFileSync(sourcePath, 'utf8'), {
        title: typeof flags.title === 'string' ? flags.title : undefined,
      }),
    )
  }

  console.log(`✅ 已成型：${outPath}`)
  return EXIT.OK
}
