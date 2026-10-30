import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import { initProject } from '../core/project.mjs'
import {
  approve,
  computeStatus,
  loadConfig,
  loadState,
  nextPending,
  setScope,
  unblock,
} from '../core/state.mjs'
import { STAGE_MAP } from '../core/stages.mjs'
import { projectFromFlags, rootFromFlags } from './common.mjs'

const ICON = {
  done: '✅',
  active: '⏳',
  pending: '⬜',
  waived: '⏭️',
  excluded: '➖',
  blocked: '⛔',
  failed: '❌',
}

export async function initCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const name = requirePositional(
    positional,
    0,
    '用法：docwrite init <项目名> [--template f.docx] [--deadline 2026-06-30] [--format docx] [--scope full|scan|reduce|revise|compose|verify] [--at S7]',
  )
  const root = rootFromFlags(flags)
  const { dir, state } = initProject({
    root,
    name,
    template: typeof flags.template === 'string' ? flags.template : null,
    deadline: typeof flags.deadline === 'string' ? flags.deadline : null,
    format: typeof flags.format === 'string' ? flags.format : 'docx',
    scope: typeof flags.scope === 'string' ? flags.scope : 'full',
    at: typeof flags.at === 'string' ? flags.at : null,
    reason: typeof flags.reason === 'string' ? flags.reason : '',
  })

  if (flags.json) {
    console.log(JSON.stringify({ dir, state }, null, 2))
    return EXIT.OK
  }
  console.log(`✅ 项目已创建：${dir}`)
  console.log(`   作用域 ${state.scope.mode}，入口 ${state.scope.entry}，当前 ${state.current}`)
  console.log('   下一步：docwrite status ／ docwrite next')
  return EXIT.OK
}

export async function statusCommand(argv) {
  const { flags } = parseArgs(argv)
  const { dir, state } = projectFromFlags(flags)
  const view = computeStatus(state)

  if (flags.json) {
    console.log(JSON.stringify(view, null, 2))
    return EXIT.OK
  }

  console.log(`📋 项目：${state.project}（${dir}）`)
  console.log(`   当前：${state.current} ${STAGE_MAP[state.current]?.name ?? ''}`)
  console.log(
    `   作用域：${state.scope?.mode ?? 'full'}（入口 ${state.scope?.entry ?? 'S0'}${state.scope?.excluded?.length ? `，排除 ${state.scope.excluded.join('、')}` : ''}）`,
  )
  console.log(`   确认：${view.approvals.join(' ') || '(无)'} ｜ 回退 ${view.revisions} 次`)
  if (state.blocked) console.log(`   ⛔ BLOCKED：${state.blocked.reason}`)
  console.log('')
  for (const row of view.stages) {
    const gate = row.gate === 'hard' ? '硬' : '软'
    const suffix = row.waiver ? `（豁免：${row.waiver.quote}）` : ''
    const stale = row.stale ? ' ⚠️stale' : ''
    console.log(`   ${ICON[row.status] ?? '⬜'} ${row.id} ${row.name} [${gate}]${stale} ${suffix}`)
  }
  console.log('')
  if (view.pendingApproval) {
    console.log(`⚠️ 待确认 ${view.pendingApproval.gate}：${view.pendingApproval.question}`)
    console.log(`   确认：docwrite approve ${view.pendingApproval.gate} --by user --quote "..."`)
  } else if (view.next) {
    console.log(`👉 下一阶段：${view.next}（docwrite next 查看命令）`)
  } else {
    console.log('🎉 全部阶段已完成')
  }
  return EXIT.OK
}

export async function nextCommand(argv) {
  const { flags } = parseArgs(argv)
  const { state } = projectFromFlags(flags)
  const stage = nextPending(state)
  const view = computeStatus(state)

  const result = {
    project: state.project,
    current: state.current,
    stage: stage?.id ?? null,
    name: stage?.name ?? null,
    skill: stage?.skill ?? null,
    gate: stage?.gate ?? null,
    stale: stage ? Boolean(state.stages[stage.id]?.stale) : false,
    pendingApproval: view.pendingApproval,
    blocked: state.blocked,
    review: stage ? (state.reviews?.[stage.id] ?? null) : null,
    nextCommand: stage ? `docwrite stage enter ${stage.id}` : null,
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    return EXIT.OK
  }
  if (!stage) {
    console.log('🎉 全部阶段已完成')
    return EXIT.OK
  }
  console.log(`👉 ${stage.id} ${stage.name}（${stage.gate === 'hard' ? '硬门禁' : '软门禁'}）`)
  console.log(`   skill：${stage.skill}`)
  if (result.stale) console.log('   🔁 该阶段已标 stale（素材后补），需重检')
  if (result.pendingApproval) {
    console.log(`⚠️ 先确认 ${result.pendingApproval.gate}：${result.pendingApproval.question}`)
  }
  console.log(`   进入：docwrite stage enter ${stage.id}`)
  return EXIT.OK
}

export async function approveCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const gate = requirePositional(
    positional,
    0,
    '用法：docwrite approve U1 --by user --quote "用户原话"',
  )
  const { dir, state } = projectFromFlags(flags)
  approve(dir, state, gate, { by: flags.by, quote: flags.quote })
  if (flags.json) {
    console.log(JSON.stringify({ gate, quote: flags.quote }, null, 2))
  } else {
    console.log(`✅ 已记录确认 ${gate}：${flags.quote}`)
  }
  return EXIT.OK
}

export async function unblockCommand(argv) {
  const { flags } = parseArgs(argv)
  const { dir, state } = projectFromFlags(flags)
  if (!state.blocked) {
    console.log('项目当前未 blocked。')
    return EXIT.OK
  }
  unblock(dir, state, flags['reset-all'] ? 'reset-all' : 'reset-edge')
  console.log('✅ 已解除 blocked（回退计数已重置）')
  return EXIT.OK
}

export async function scopeCommand(argv) {
  const [sub, ...rest] = argv
  const { flags } = parseArgs(rest)
  const { dir, state } = projectFromFlags(flags)
  if (sub === 'set') {
    const mode = typeof flags.mode === 'string' ? flags.mode : null
    if (!mode) {
      throw new CliError(
        '用法：docwrite scope set --mode scan --by user --quote "用户原话"',
        EXIT.USAGE,
      )
    }
    setScope(dir, state, { mode, by: flags.by, quote: flags.quote, reason: flags.reason ?? '' })
    if (flags.json) {
      console.log(JSON.stringify(state.scope, null, 2))
      return EXIT.OK
    }
    console.log(`✅ 作用域已改为 ${mode}（入口 ${state.scope.entry}）`)
    return EXIT.OK
  }
  if (flags.json) {
    console.log(JSON.stringify(state.scope, null, 2))
    return EXIT.OK
  }
  console.log(`作用域：${state.scope.mode}（入口 ${state.scope.entry}）`)
  if (state.scope.excluded?.length) console.log(`排除：${state.scope.excluded.join('、')}`)
  if (state.scope.reason) console.log(`原因：${state.scope.reason}`)
  return EXIT.OK
}
