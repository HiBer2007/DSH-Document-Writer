import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { findSkill, loadRegistry, skillForStage } from '../core/skills.mjs'
import { rootFromFlags } from './common.mjs'

export async function skillsCommand(argv) {
  const [sub, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  const root = rootFromFlags(flags)
  const registry = loadRegistry(root)

  if (!sub || sub === 'list') {
    if (flags.json) {
      console.log(JSON.stringify(registry, null, 2))
      return EXIT.OK
    }
    for (const skill of registry.skills) {
      const stage = skill.stage ?? '—'
      const gate = skill.gate ?? '—'
      console.log(`${stage.padEnd(4)} ${skill.id.padEnd(26)} ${gate}`)
    }
    return EXIT.OK
  }

  if (sub === 'show') {
    const id = positional[0]
    if (!id) throw new CliError('用法：docwrite skills show <id>', EXIT.USAGE)
    const skill = findSkill(root, id)
    if (!skill) throw new CliError(`没有这个 skill：${id}`, EXIT.USAGE)
    if (flags.json) {
      console.log(JSON.stringify(skill, null, 2))
      return EXIT.OK
    }
    console.log(`${skill.id}（${skill.stage ?? '入口'}）`)
    console.log(`  path：${skill.path}`)
    console.log(`  gate：${skill.gate ?? '—'} ｜ approval：${skill.approval ?? '—'}`)
    console.log(`  requires：${skill.requires.join('、') || '—'}`)
    console.log(`  produces：${skill.produces.join('、') || '—'}`)
    console.log(`  commands：${skill.commands.join('；')}`)
    return EXIT.OK
  }

  throw new CliError(`skills 子命令未知：${sub}。可用：list、show`, EXIT.USAGE)
}

export async function dispatchCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const stage = positional[0] ?? (typeof flags.stage === 'string' ? flags.stage : null)
  if (!stage) throw new CliError('用法：docwrite dispatch <S0..S11> [--json]', EXIT.USAGE)
  const root = rootFromFlags(flags)
  const skill = skillForStage(root, stage)
  if (!skill) throw new CliError(`没有阶段 ${stage} 的 skill`, EXIT.USAGE)

  const result = {
    stage,
    skill: skill.id,
    path: skill.path,
    gate: skill.gate,
    approval: skill.approval,
    requires: skill.requires,
    produces: skill.produces,
    commands: skill.commands,
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    return EXIT.OK
  }
  console.log(`👉 ${stage} → ${skill.id}`)
  console.log(`   skill 文件：${skill.path}`)
  console.log(`   门禁：${skill.gate ?? '—'} ｜ 确认：${skill.approval ?? '—'}`)
  console.log(`   命令：${skill.commands.join('；')}`)
  return EXIT.OK
}
