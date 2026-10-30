import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CliError, EXIT } from './errors.mjs'
import {
  ARTIFACTS,
  DEFAULTS,
  ENTRY_APPROVAL,
  GUARDS,
  REVIEW_APPROVAL,
  REVIEW_STAGES,
  SCOPE_ENTRY,
  STAGE_IDS,
  STAGE_MAP,
  stageIndex,
} from './stages.mjs'

export function now() {
  return new Date().toISOString()
}

export function runDir(projectDir) {
  return join(projectDir, '.run')
}

export function statePath(projectDir) {
  return join(runDir(projectDir), 'state.json')
}

export function eventsPath(projectDir) {
  return join(runDir(projectDir), 'events.jsonl')
}

export function loadConfig(root = process.cwd()) {
  const path = join(root, 'docwrite.config.json')
  if (!existsSync(path)) return { ...DEFAULTS }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return {
      ...DEFAULTS,
      ...(raw.workflow ?? {}),
      ...(raw.thresholds ?? {}),
      ...(raw.humanLikeness ?? {}),
      pptMaster: raw.pptMaster ?? {},
      pdf: raw.pdf ?? {},
    }
  } catch (err) {
    throw new CliError(`docwrite.config.json 解析失败：${err.message}`, EXIT.USAGE)
  }
}

export function loadState(projectDir) {
  const path = statePath(projectDir)
  if (!existsSync(path)) {
    throw new CliError(`项目未初始化（缺少 .run/state.json）：${projectDir}`, EXIT.PREREQ)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function saveState(projectDir, state) {
  mkdirSync(runDir(projectDir), { recursive: true })
  writeFileSync(statePath(projectDir), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function appendEvent(projectDir, event) {
  mkdirSync(runDir(projectDir), { recursive: true })
  writeFileSync(eventsPath(projectDir), `${JSON.stringify({ at: now(), ...event })}\n`, {
    flag: 'a',
    encoding: 'utf8',
  })
}

export function sha256File(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

export function statusOf(state, id) {
  return state.stages[id]?.status ?? 'pending'
}

function isSatisfied(state, id) {
  const status = statusOf(state, id)
  return status === 'done' || status === 'waived' || status === 'excluded'
}

export function approvalMissing(state, id) {
  const gate = ENTRY_APPROVAL[id]
  if (!gate) return null
  if (state.scope?.mode && state.scope.mode !== 'full' && state.scope.entry === id) return null
  if (!state.approvals?.[gate]) return { gate, question: approvalQuestion(gate) }
  return null
}

function approvalQuestion(gate) {
  const map = {
    U0: '任务卡、交付物、截止、模板、提交方式与作用域，确认无误？',
    U1: '约束有没有漏、有没有冲突没裁决？',
    U2: '规格与大纲方向对不对？',
    U3: '提纲可以进入写作吗？',
    U4: '这次评审结论（pass/revise/reject）你认可吗？',
    U5: '要不要降重？降哪些部分？目标是什么？',
    U6: '确认把 Markdown 转成 docx/pptx？',
    U7: '确认交付这些文件？',
  }
  return map[gate] ?? '确认继续？'
}

export function prereqMissing(state, id) {
  const stage = STAGE_MAP[id]
  if (!stage) return [`未知阶段：${id}`]
  return stage.requires.filter((dep) => !isSatisfied(state, dep))
}

export function canEnter(state, id) {
  if (!STAGE_MAP[id]) throw new CliError(`未知阶段：${id}`, EXIT.USAGE)
  if (state.blocked) {
    throw new CliError(`项目处于 blocked：${state.blocked.reason}（先 unblock）`, EXIT.BUDGET)
  }
  const missing = prereqMissing(state, id)
  if (missing.length) {
    throw new CliError(`前置阶段未完成：${missing.join('、')}`, EXIT.PREREQ)
  }
  const approval = approvalMissing(state, id)
  if (approval) {
    throw new CliError(`缺少用户确认 ${approval.gate}：${approval.question}`, EXIT.APPROVAL)
  }
}

export function enterStage(projectDir, state, id) {
  canEnter(state, id)
  state.stages[id] = {
    ...(state.stages[id] ?? {}),
    status: 'active',
    attempt: (state.stages[id]?.attempt ?? 0) + 1,
    at: now(),
  }
  state.current = id
  appendEvent(projectDir, { type: 'stage.enter', stage: id })
  saveState(projectDir, state)
  return state
}

export function markDone(projectDir, state, id, { artifacts = [], hashes = {} } = {}) {
  state.stages[id] = {
    ...(state.stages[id] ?? {}),
    status: 'done',
    at: now(),
    artifacts,
    hashes,
  }
  state.current = nextPending(state)?.id ?? id
  appendEvent(projectDir, { type: 'stage.done', stage: id, artifacts })
  saveState(projectDir, state)
  return state
}

export function waiveStage(projectDir, state, id, { by, quote } = {}) {
  const stage = STAGE_MAP[id]
  if (!stage) throw new CliError(`未知阶段：${id}`, EXIT.USAGE)
  if (stage.gate === 'hard') {
    throw new CliError(`${id} ${stage.name} 是硬门禁，不可豁免`, EXIT.PREREQ)
  }
  if (by !== 'user') throw new CliError('豁免必须 --by user（模型不能给自己发豁免）', EXIT.PREREQ)
  if (!quote || !String(quote).trim()) throw new CliError('豁免必须带 --quote（用户原话）', EXIT.PREREQ)
  const missing = prereqMissing(state, id)
  if (missing.length) throw new CliError(`前置阶段未完成：${missing.join('、')}`, EXIT.PREREQ)
  if (state.stages[id]?.waiver) throw new CliError(`${id} 已有豁免记录，不重复覆盖`, EXIT.PREREQ)

  state.stages[id] = {
    status: 'waived',
    at: now(),
    waiver: { by, quote: String(quote).trim() },
  }
  appendEvent(projectDir, { type: 'stage.waive', stage: id, by, quote })
  saveState(projectDir, state)
  return state
}

export function reopenStage(projectDir, state, id, reason) {
  if (!STAGE_MAP[id]) throw new CliError(`未知阶段：${id}`, EXIT.USAGE)
  state.stages[id] = { ...(state.stages[id] ?? {}), status: 'pending', at: now() }
  state.current = id
  appendEvent(projectDir, { type: 'stage.reopen', stage: id, reason: reason ?? '' })
  saveState(projectDir, state)
  return state
}

export function jumpStage(projectDir, state, from, to, { reason = '', config = DEFAULTS } = {}) {
  const allowed = GUARDS[from] ?? []
  if (!allowed.includes(to)) {
    throw new CliError(`不允许的回退：${from} → ${to}（合法目标：${allowed.join('、') || '无'}）`, EXIT.PREREQ)
  }
  if (state.blocked) throw new CliError(`项目处于 blocked：${state.blocked.reason}`, EXIT.BUDGET)
  const key = `${from}->${to}`
  const used = (state.loops[key] ?? 0) + 1
  const revisions = (state.revisions ?? 0) + 1
  state.loops[key] = used
  state.revisions = revisions
  state.edges = [...(state.edges ?? []), { from, to, round: used, reason, at: now() }]
  state.stages[to] = { ...(state.stages[to] ?? {}), status: 'pending', at: now() }
  state.stages[from] = { ...(state.stages[from] ?? {}), status: 'pending', at: now() }
  state.current = to

  appendEvent(projectDir, { type: 'jump', from, to, round: used, reason })

  if (used > config.maxLoopsPerEdge || revisions > config.maxTotalRevisions) {
    state.blocked = {
      reason: `回退预算耗尽：${key} 第 ${used} 次（上限 ${config.maxLoopsPerEdge}）`,
      at: now(),
      edge: key,
    }
    appendEvent(projectDir, { type: 'blocked', reason: state.blocked.reason })
    saveState(projectDir, state)
    throw new CliError(state.blocked.reason, EXIT.BUDGET)
  }

  saveState(projectDir, state)
  return state
}

export function approve(projectDir, state, gate, { by, quote } = {}) {
  if (by !== 'user') throw new CliError('确认必须 --by user（模型不能自行 approve）', EXIT.PREREQ)
  if (!quote || !String(quote).trim()) throw new CliError('确认必须带 --quote（用户原话）', EXIT.PREREQ)
  if (!/^U[0-7]$/.test(gate)) throw new CliError(`未知确认点：${gate}`, EXIT.USAGE)
  state.approvals = state.approvals ?? {}
  state.approvals[gate] = { by, quote: String(quote).trim(), at: now() }
  appendEvent(projectDir, { type: 'approve', gate, quote })
  saveState(projectDir, state)
  return state
}

export function unblock(projectDir, state, mode) {
  if (!state.blocked) return state
  if (mode === 'reset-all') {
    state.loops = {}
    state.revisions = 0
  } else if (state.blocked.edge) {
    state.loops[state.blocked.edge] = 0
  }
  appendEvent(projectDir, { type: 'unblock', mode })
  state.blocked = null
  saveState(projectDir, state)
  return state
}

export function setScope(projectDir, state, { mode, by, quote, reason = '' }) {
  if (by !== 'user') throw new CliError('改作用域必须 --by user', EXIT.PREREQ)
  if (!quote || !String(quote).trim()) throw new CliError('改作用域必须带 --quote（用户原话）', EXIT.PREREQ)
  const entry = SCOPE_ENTRY[mode]
  if (!entry) {
    throw new CliError(`未知作用域：${mode}（可用：${Object.keys(SCOPE_ENTRY).join('、')}）`, EXIT.USAGE)
  }
  const entryIdx = stageIndex(entry)
  const excluded = STAGE_IDS.filter(
    (id, i) => i < entryIdx && id !== 'S0' && statusOf(state, id) !== 'done',
  )

  for (const id of STAGE_IDS) {
    if (state.stages[id]?.status === 'excluded' && !excluded.includes(id)) {
      state.stages[id] = { status: 'pending', at: now() }
    }
  }
  for (const id of excluded) {
    state.stages[id] = {
      status: 'excluded',
      at: now(),
      reason: `作用域 ${mode} 从 ${entry} 开始`,
    }
  }
  if (entry !== 'S0' && statusOf(state, 'S0') !== 'done') {
    state.stages.S0 = { status: 'done', at: now(), artifacts: ['brief.md'] }
  }
  const entryStatus = statusOf(state, entry)
  if (entry !== 'S0' && entryStatus !== 'done' && entryStatus !== 'waived') {
    state.stages[entry] = {
      ...(state.stages[entry] ?? {}),
      status: 'active',
      at: now(),
      attempt: (state.stages[entry]?.attempt ?? 0) + 1,
    }
  }

  state.scope = { mode, entry, excluded, reason: String(quote).trim() }
  state.current = nextPending(state)?.id ?? entry
  appendEvent(projectDir, { type: 'scope.set', mode, entry, excluded, quote })
  saveState(projectDir, state)
  return state
}

export function nextPending(state) {
  for (const id of STAGE_IDS) {
    const entry = state.stages[id]
    if (entry?.status === 'done' && entry.stale) return STAGE_MAP[id]
  }
  for (const id of STAGE_IDS) {
    const status = statusOf(state, id)
    if (status === 'done' || status === 'waived' || status === 'excluded') continue
    return STAGE_MAP[id]
  }
  return null
}

export function pendingApproval(state) {
  const stage = nextPending(state)
  if (!stage) return null
  return approvalMissing(state, stage.id)
}

export function computeStatus(state) {
  const rows = STAGE_IDS.map((id) => {
    const stage = STAGE_MAP[id]
    const entry = state.stages[id] ?? { status: 'pending' }
    return {
      id,
      name: stage.name,
      gate: stage.gate,
      status: entry.status,
      stale: Boolean(entry.stale),
      waiver: entry.waiver ?? null,
      review: state.reviews?.[id] ?? null,
      artifact: entry.artifacts ?? [],
    }
  })
  return {
    project: state.project,
    current: state.current,
    blocked: state.blocked,
    scope: state.scope,
    approvals: Object.keys(state.approvals ?? {}),
    loops: state.loops ?? {},
    revisions: state.revisions ?? 0,
    stages: rows,
    next: nextPending(state)?.id ?? null,
    pendingApproval: pendingApproval(state),
  }
}

export function artifactStatus(projectDir, id) {
  const list = ARTIFACTS[id] ?? []
  return list.map((rel) => {
    const path = join(projectDir, rel)
    if (!existsSync(path)) return { rel, exists: false, empty: true }
    const stat = statSync(path)
    const empty = stat.isDirectory() ? false : stat.size === 0
    return { rel, exists: true, empty }
  })
}

export { ARTIFACTS, REVIEW_APPROVAL, REVIEW_STAGES, SCOPE_ENTRY, STAGE_MAP, STAGE_IDS, stageIndex }
