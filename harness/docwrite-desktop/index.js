// 文档工坊 Host 插件（DSH Desktop）
//
// 职责：
// 1. 把 docwrite CLI 的常用动作封装成模型工具，避免每次拼 PowerShell。
// 2. 强制流程机：S8 成型前禁止 write/edit 产出 docx/pptx；stage done 只能 done 当前阶段。
// 3. 为 Web GUI 的「文档工坊」面板提供 /docwrite/state 只读快照。
//
// 阶段表与 ENTRY_APPROVAL 必须和 src/core/stages.mjs 保持一致；test/desktop-plugin.test.mjs 会对比。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'docwrite-harness'
export const inject = ['tools', 'subprocess', 'webServer', 'userQuestions', 'workingDirectory', 'sessions']

export const STAGES = [
  { id: 'S0', name: '受理', gate: 'soft' },
  { id: 'S1', name: '约束', gate: 'hard' },
  { id: 'S2', name: '规格', gate: 'hard' },
  { id: 'S3', name: '素材', gate: 'soft' },
  { id: 'S4', name: '提纲', gate: 'soft' },
  { id: 'S5', name: '初稿', gate: 'soft' },
  { id: 'S6', name: '内容评审', gate: 'hard' },
  { id: 'S7', name: '降重', gate: 'soft' },
  { id: 'S8', name: '成型', gate: 'hard' },
  { id: 'S9', name: '形式评审', gate: 'hard' },
  { id: 'S10', name: '终检', gate: 'hard' },
  { id: 'S11', name: '交付', gate: 'hard' },
]

const STAGE_IDS = STAGES.map((stage) => stage.id)
const STAGE_MAP = Object.fromEntries(STAGES.map((stage) => [stage.id, stage]))

export const ENTRY_APPROVAL = {
  S1: 'U0',
  S2: 'U1',
  S3: 'U2',
  S4: 'U2',
  S5: 'U3',
  S7: 'U5',
  S8: 'U6',
  S11: 'U7',
}

export const ARTIFACTS = {
  S0: ['brief.md'],
  S1: ['constraints.json'],
  S2: ['spec.md'],
  S3: ['sources/index.json'],
  S4: ['outline.md'],
  S5: ['draft.md'],
  S6: ['review-content.json'],
  S7: ['draft_reduced.md', 'reduce-report.json', 'human-review.json'],
  S8: ['build'],
  S9: ['review-form.json'],
  S10: ['verify-report.md'],
  S11: ['deliver'],
}

const APPROVAL_QUESTION = {
  U0: '任务卡、交付物、截止、模板、提交方式与作用域，确认无误？',
  U1: '约束有没有漏、有没有冲突没裁决？',
  U2: '规格与大纲方向对不对？',
  U3: '提纲可以进入写作吗？',
  U4: '这次评审结论（pass/revise/reject）你认可吗？',
  U5: '要不要降重？降哪些部分？目标是什么？',
  U6: '确认把 Markdown 转成 docx/pptx？',
  U7: '确认交付这些文件？',
}

const STAGE_ICON = {
  done: '✅',
  active: '⏳',
  pending: '⬜',
  waived: '⏭️',
  excluded: '➖',
  blocked: '⛔',
  failed: '❌',
}

function isSatisfied(state, id) {
  const status = state.stages?.[id]?.status ?? 'pending'
  return status === 'done' || status === 'waived' || status === 'excluded'
}

function approvalMissing(state, id) {
  const gate = ENTRY_APPROVAL[id]
  if (!gate) return null
  if (state.scope?.mode && state.scope.mode !== 'full' && state.scope.entry === id) return null
  if (!state.approvals?.[gate]) return { gate, question: APPROVAL_QUESTION[gate] ?? '确认继续？' }
  return null
}

function nextPending(state) {
  for (const id of STAGE_IDS) {
    const entry = state.stages?.[id]
    if (entry?.status === 'done' && entry.stale) return STAGE_MAP[id]
  }
  for (const id of STAGE_IDS) {
    const status = state.stages?.[id]?.status ?? 'pending'
    if (status === 'done' || status === 'waived' || status === 'excluded') continue
    return STAGE_MAP[id]
  }
  return null
}

function summarize(state, updatedAt) {
  const rows = STAGES.map((stage) => {
    const entry = state.stages?.[stage.id] ?? { status: 'pending' }
    return {
      id: stage.id,
      name: stage.name,
      gate: stage.gate,
      status: entry.status ?? 'pending',
      stale: Boolean(entry.stale),
      waiver: entry.waiver ?? null,
      artifacts: entry.artifacts ?? [],
    }
  })
  const next = nextPending(state)
  return {
    project: state.project,
    current: state.current,
    scope: state.scope ?? null,
    approvals: Object.keys(state.approvals ?? {}),
    revisions: state.revisions ?? 0,
    blocked: state.blocked ?? null,
    next: next?.id ?? null,
    pendingApproval: next ? approvalMissing(state, next.id) : null,
    stages: rows,
    updatedAt: updatedAt ?? null,
  }
}

function renderStatus(value) {
  if (Array.isArray(value.projects)) {
    const lines = [`文档工坊：${value.projects.length} 个已初始化项目（root=${value.root}）`]
    for (const project of value.projects) {
      const current = STAGE_MAP[project.current]
      lines.push(
        `- ${project.project}：当前 ${project.current ?? '?'} ${current?.name ?? ''}` +
          (project.pendingApproval ? `；待确认 ${project.pendingApproval.gate}` : '') +
          (project.blocked ? `；⛔ ${project.blocked.reason}` : ''),
      )
    }
    lines.push('', '用 docwrite_next 查看下一阶段与 skill。')
    return lines.join('\n')
  }
  const current = STAGE_MAP[value.current]
  const lines = [
    `📋 ${value.project} ｜ 当前 ${value.current ?? '?'} ${current?.name ?? ''} ｜ 回退 ${value.revisions ?? 0} 次`,
  ]
  if (value.blocked) lines.push(`⛔ BLOCKED：${value.blocked.reason}`)
  for (const row of value.stages ?? []) {
    const icon = STAGE_ICON[row.status] ?? '⬜'
    lines.push(`${icon} ${row.id} ${row.name} [${row.gate === 'hard' ? '硬' : '软'}]${row.stale ? ' ⚠️stale' : ''}`)
  }
  if (value.pendingApproval) {
    lines.push('', `⚠️ 待确认 ${value.pendingApproval.gate}：${value.pendingApproval.question}`)
    lines.push(`   docwrite approve ${value.pendingApproval.gate} --by user --quote "用户原话"`)
  } else if (value.next) {
    lines.push('', `👉 下一阶段：${value.next}`)
  } else {
    lines.push('', '🎉 全部阶段已完成')
  }
  return lines.join('\n')
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 构造人工验收卡片：阶段进度、产物清单、关键指标、正文预览。
 * 这段文本会作为 ask_user_question 的 detail 显示在 GUI 提问卡里，也会回传给模型。
 */
function buildGateDetail(state, stage, projectDir) {
  const info = STAGE_MAP[stage] ?? { name: stage, gate: 'soft' }
  const timeline = STAGES.map((item) => {
    const status = state.stages?.[item.id]?.status ?? 'pending'
    return `${STAGE_ICON[status] ?? '⬜'}${item.id}`
  }).join(' ')

  const lines = [
    `📋 项目：${state.project}`,
    `🎯 阶段：${stage} ${info.name}（${info.gate === 'hard' ? '硬门禁' : '软门禁'}）`,
    `📊 进度：${timeline}`,
  ]
  if (state.blocked) lines.push(`⛔ 已阻断：${state.blocked.reason}`)
  const gate = ENTRY_APPROVAL[stage]
  if (gate) {
    lines.push(`🚧 确认点：${state.approvals?.[gate] ? `✅ ${gate} 已确认` : `⚠️ ${gate} 待确认`}`)
  }

  const artifacts = ARTIFACTS[stage] ?? []
  lines.push('', '🧾 产物：')
  if (artifacts.length === 0) lines.push('  （该阶段没有声明产物）')
  for (const rel of artifacts) {
    const path = join(projectDir, rel)
    if (!existsSync(path)) {
      lines.push(`  ⬜ ${rel}（缺失）`)
      continue
    }
    const stat = statSync(path)
    if (stat.isDirectory()) {
      const files = readdirSync(path).slice(0, 8)
      lines.push(`  📁 ${rel}/（${files.length} 项）`)
      for (const file of files) lines.push(`     · ${file}`)
    } else {
      lines.push(`  ✅ ${rel}（${formatBytes(stat.size)}）`)
    }
  }

  const notes = []
  for (const rel of ['review-content.json', 'review-form.json', 'human-review.json', 'reduce-report.json']) {
    const path = join(projectDir, rel)
    if (!existsSync(path)) continue
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      const bits = []
      if (parsed.verdict) bits.push(`verdict=${parsed.verdict}`)
      if (parsed.modificationRate != null) bits.push(`修改率=${(Number(parsed.modificationRate) * 100).toFixed(1)}%`)
      if (parsed.rate != null) bits.push(`rate=${parsed.rate}`)
      if (parsed.axes) {
        bits.push(
          `axes=${Object.entries(parsed.axes)
            .map(([key, value]) => `${key}:${value?.score ?? value}`)
            .join(' / ')}`,
        )
      }
      if (Array.isArray(parsed.issues)) bits.push(`issues=${parsed.issues.length}`)
      if (parsed.summary) bits.push(parsed.summary)
      if (bits.length > 0) notes.push(`  · ${rel}：${bits.join('；')}`)
    } catch {
      // 报告损坏时不阻塞验收，产物清单已经显示文件存在。
    }
  }
  if (notes.length > 0) lines.push('', '🔍 关键数据：', ...notes)

  const previews = []
  for (const rel of artifacts) {
    if (!rel.endsWith('.md')) continue
    const path = join(projectDir, rel)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    const excerpt = text.split('\n').slice(0, 24).join('\n').slice(0, 2000)
    previews.push(`--- ${rel}（前 24 行）---\n${excerpt}`)
    break
  }
  if (previews.length > 0) lines.push('', '📝 预览：', ...previews)
  else if (artifacts.length > 0) lines.push('', '📝 预览：二进制产物请在右侧预览或打开文件查看。')

  return lines.join('\n').slice(0, 6000)
}

function textOutput(render) {
  return {
    schema: { type: 'object', additionalProperties: true, properties: {} },
    render: (_args, value) => [{ type: 'text', text: render(value) }],
  }
}

export function apply(ctx, config) {
  const configuredRoot =
    typeof config?.root === 'string' && config.root.trim().length > 0 ? resolve(config.root) : null
  const packageDir = dirname(fileURLToPath(import.meta.url))
  const bundledCli = join(packageDir, 'cli')

  /** 文档工作区可以自带 CLI；否则用插件包内同步好的 CLI。 */
  function cliRootFor(workspace) {
    if (existsSync(join(workspace, 'bin', 'docwrite.mjs'))) return workspace
    if (existsSync(join(bundledCli, 'bin', 'docwrite.mjs'))) return bundledCli
    throw new Error(
      '找不到 docwrite CLI：工作区没有 bin/docwrite.mjs，插件包也没有 cli/。请重装插件或把仓库一起安装。',
    )
  }

  /** 把插件内置的 skill 库补齐到工作区；不覆盖用户已改过的 skill。 */
  function ensureWorkspaceSkills(root) {
    const source = join(packageDir, 'skills')
    if (!existsSync(source)) return 0
    let copied = 0
    const target = join(root, '.dsh', 'skills')
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const destination = join(target, entry.name)
      if (existsSync(destination)) continue
      mkdirSync(target, { recursive: true })
      cpSync(join(source, entry.name), destination, { recursive: true })
      copied += 1
    }
    return copied
  }

  /** 同步取某个 Agent 当前会话的工作区；取不到就回退到显式配置。 */
  function currentSessionRoot(agent) {
    if (!agent) return configuredRoot
    try {
      if (agent.session && ctx.workingDirectory) return ctx.workingDirectory.get(agent.session)
    } catch {
      // 落到下面的 id 查询。
    }
    try {
      if (agent.id && ctx.sessions && ctx.workingDirectory) {
        const session = ctx.sessions.get(agent.id)
        if (session) return ctx.workingDirectory.get(session)
      }
    } catch {
      // 回退到配置。
    }
    return configuredRoot
  }

  /** 工具执行前解析工作区：优先会话目录，其次显式配置。 */
  async function sessionRoot(exec) {
    if (exec?.agent && ctx.workingDirectory && typeof ctx.workingDirectory.ensure === 'function') {
      try {
        return await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      } catch {
        // 会话目录失效时回退到配置。
      }
    }
    return currentSessionRoot(exec?.agent)
  }

  function requireRoot(root) {
    if (typeof root !== 'string' || root.length === 0) {
      throw new Error('无法确定工作区：请在已打开工作区的会话里调用，或给插件配置 root。')
    }
    return root
  }

  function projectState(root, project) {
    if (!root || typeof project !== 'string' || project.length === 0) return undefined
    const path = join(root, 'projects', project, '.run', 'state.json')
    if (!existsSync(path)) return undefined
    try {
      return { state: JSON.parse(readFileSync(path, 'utf8')), path }
    } catch {
      return undefined
    }
  }

  function listProjects(root) {
    if (!root) return []
    const dir = join(root, 'projects')
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(dir, name, '.run', 'state.json')))
  }

  function resolveProject(root, project) {
    requireRoot(root)
    if (typeof project === 'string' && project.length > 0) {
      if (!projectState(root, project)) throw new Error(`项目不存在或未初始化：${project}`)
      return project
    }
    const names = listProjects(root)
    if (names.length === 1) return names[0]
    if (names.length === 0) throw new Error('当前没有已初始化项目，先运行 docwrite init <项目名>')
    throw new Error(`有多个项目，请用 project 参数指定：${names.join('、')}`)
  }

  function snapshot(root, project) {
    requireRoot(root)
    const names = typeof project === 'string' && project.length > 0 ? [project] : listProjects(root)
    const projects = names.map((name) => {
      const found = projectState(root, name)
      if (!found) return { project: name, error: 'state.json 不可读' }
      let updatedAt = null
      try {
        updatedAt = statSync(found.path).mtime.toISOString()
      } catch {
        updatedAt = null
      }
      return summarize(found.state, updatedAt)
    })
    return { ok: true, root, generatedAt: new Date().toISOString(), projects }
  }

  /** 每个工具调用都绑定到调用者会话的工作区，而不是插件安装时的固定路径。 */
  async function toolContext(exec) {
    const root = requireRoot(await sessionRoot(exec))
    return {
      root,
      projectState: (project) => projectState(root, project),
      listProjects: () => listProjects(root),
      resolveProject: (project) => resolveProject(root, project),
      snapshot: (project) => snapshot(root, project),
      runCli: (args) => runCli(root, exec, args),
      callCli: (args) => callCli(root, exec, args),
      callCliJson: (args) => callCliJson(root, exec, args),
    }
  }

  // ── GUI 数据路由（只读） ──────────────────────────────────────────────
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/docwrite/presets',
      handler: async (_req, res) => {
        try {
          const service = ctx.get('agentPresets')
          const roster = service && typeof service.list === 'function' ? await service.list() : []
          const presets = []
          for (const preset of roster) {
            let resolved = false
            let resolveError = null
            let broken = null
            if (service && typeof service.resolve === 'function') {
              try {
                const info = await service.resolve(preset.id)
                resolved = true
                broken = info?.broken ?? null
              } catch (err) {
                resolveError = err?.message ?? String(err)
              }
            }
            presets.push({
              id: preset.id,
              name: preset.name ?? null,
              description: preset.description ?? null,
              order: preset.order ?? null,
              resolved,
              resolveError,
              broken,
            })
          }
          const body = JSON.stringify({ ok: true, presets })
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(body)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: false, error: err?.message ?? String(err) }))
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/docwrite/state',
      handler: (req, res) => {
        try {
          const url = new URL(typeof req.url === 'string' ? req.url : '/docwrite/state', 'http://127.0.0.1')
          const project = url.searchParams.get('project')
          const requested = url.searchParams.get('root')
          const base =
            requested && isAbsolute(requested) && existsSync(requested) && statSync(requested).isDirectory()
              ? requested
              : configuredRoot
          if (!base) {
            res.statusCode = 503
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                ok: false,
                error: '没有指定工作区；面板应传入当前工作区的 root，或给插件配置 root。',
              }),
            )
            return
          }
          const body = JSON.stringify(snapshot(base, project ?? undefined))
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(body)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: false, error: err?.message ?? String(err) }))
        }
      },
    }),
  )

  // ── 强制流程机 ────────────────────────────────────────────────────────
  ctx.effect(() =>
    ctx.tools.guard((execution) => {
      const args =
        execution.arguments && typeof execution.arguments === 'object' ? execution.arguments : {}
      const guardBase = currentSessionRoot(execution.agent)

      if (execution.name === 'docwrite_stage_done') {
        const stage = typeof args.stage === 'string' ? args.stage : ''
        if (!guardBase) return undefined
        let state
        try {
          const name = resolveProject(guardBase, args.project)
          state = projectState(guardBase, name)?.state
        } catch {
          state = undefined
        }
        if (state && stage && state.current !== stage) {
          return `强制流程机：当前阶段是 ${state.current}，不能直接 done ${stage}。先运行 docwrite_next 确认下一阶段。`
        }
        return undefined
      }

      if (execution.name !== 'write' && execution.name !== 'edit' && execution.name !== 'str_replace_editor') {
        return undefined
      }
      if (!guardBase) return undefined
      const raw =
        typeof args.path === 'string'
          ? args.path
          : typeof args.file_path === 'string'
            ? args.file_path
            : ''
      if (!raw || !/\.(docx|pptx)$/i.test(raw)) return undefined

      const absolute = resolve(guardBase, raw)
      const match = absolute.match(/[\\/]projects[\\/]([^\\/]+)[\\/]/)
      if (!match) return undefined
      const found = projectState(guardBase, match[1])
      if (!found) return undefined
      const state = found.state
      const currentIndex = STAGE_IDS.indexOf(state.current)
      const s8 = state.stages?.S8?.status
      if (currentIndex >= STAGE_IDS.indexOf('S8') || s8 === 'active' || s8 === 'done' || s8 === 'excluded') {
        return undefined
      }
      return `强制流程机：${match[1]} 还在 ${state.current}（${STAGE_MAP[state.current]?.name ?? ''}），S8 成型前不得写 docx/pptx。先完成 S7 降重并经 U6 确认。`
    }),
  )

  // ── CLI 封装 ──────────────────────────────────────────────────────────
  let nodePromise
  function nodeExecutable() {
    nodePromise ??= ctx.subprocess.resolveExecutable('node').catch(() => process.execPath)
    return nodePromise
  }

  async function runCli(root, exec, args) {
    const node = await nodeExecutable()
    const cliRoot = cliRootFor(root)
    const handle = ctx.subprocess.spawn({
      argv: [node, join(cliRoot, 'bin', 'docwrite.mjs'), ...args],
      cwd: root,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 2_000_000 },
        stderr: { maxBytes: 200_000 },
      },
      graceMs: 5000,
      signal: exec.signal,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })

    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        handle.terminate()
        reject(new Error('docwrite CLI 超时（120s）'))
      }, 120_000)
    })
    try {
      const outcome = await Promise.race([handle.done, timeout])
      return {
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        stdout: handle.collected.stdout?.readFrom(0).text ?? '',
        stderr: handle.collected.stderr?.readFrom(0).text ?? '',
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async function callCli(root, exec, args) {
    const result = await runCli(root, exec, args)
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout || '').trim()
      throw new Error(`docwrite ${args.join(' ')} 失败（exit ${result.exitCode}）：${detail}`)
    }
    return result
  }

  async function callCliJson(root, exec, args) {
    const result = await callCli(root, exec, args)
    const text = result.stdout.trim()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return { raw: text }
    }
  }

  const projectParam = {
    type: 'string',
    description: '项目名。省略时要求只有一个已初始化项目。',
  }

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_init',
      description:
        '在当前会话工作区初始化文档项目（projects/<name>）。可选模板、截止时间、格式、作用域和入口阶段；不会读取或写入其他工作区。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '项目名（目录名）' },
          template: { type: 'string', description: '模板 docx 的相对或绝对路径（可选）' },
          deadline: { type: 'string', description: '截止时间（可选）' },
          format: { type: 'string', enum: ['docx', 'pptx', 'md'], description: '交付格式，默认 docx' },
          scope: {
            type: 'string',
            enum: ['full', 'scan', 'reduce', 'revise', 'compose', 'verify'],
            description: '作用域，默认 full',
          },
          at: { type: 'string', description: '入口阶段，例如 S7（可选）' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { root, callCli } = await toolContext(exec)
        const name = String(args?.name ?? '').trim()
        if (!name) throw new Error('name 不能为空')
        const argv = ['init', name]
        for (const key of ['template', 'deadline', 'format', 'scope', 'at']) {
          const value = args?.[key]
          if (typeof value === 'string' && value.length > 0) argv.push(`--${key}`, value)
        }
        const result = await callCli(argv)

        // 工作区是空的时，把插件内置的 skill 库复制进项目，模型才能看到 S1 的 schema。
        const skillsCopied = ensureWorkspaceSkills(root)
        return { ok: true, project: name, skillsCopied, output: result.stdout.trim() }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_constraints',
      description:
        '约束文件 constraints.json 的工具入口：template 返回可直接抄的合法 JSON；init 在当前工作区写骨架；check 校验字段、重复 id 与冲突裁决。不要凭记忆猜 schema。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['template', 'init', 'check'],
            description: 'template（默认）/ init / check',
          },
          project: projectParam,
          force: { type: 'boolean', description: 'init 时覆盖已存在的 constraints.json' },
        },
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { root, resolveProject, callCliJson, callCli, runCli } = await toolContext(exec)
        const name = resolveProject(args?.project)
        const skillsCopied = ensureWorkspaceSkills(root)
        const action = typeof args?.action === 'string' ? args.action : 'template'
        if (action === 'template') {
          const template = await callCliJson(['constraints', 'template', '--project', name])
          return { ok: true, project: name, skillsCopied, template }
        }
        if (action === 'init') {
          const argv = ['constraints', 'init', '--project', name]
          if (args?.force === true) argv.push('--force')
          const result = await callCli(argv)
          return { ok: true, project: name, skillsCopied, output: result.stdout.trim() }
        }
        if (action === 'check') {
          const result = await runCli(['constraints', 'check', '--project', name])
          return {
            ok: result.exitCode === 0,
            project: name,
            skillsCopied,
            output: (result.stderr || result.stdout).trim(),
          }
        }
        throw new Error(`未知 action：${action}（可用 template / init / check）`)
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_status',
      description:
        '文档工坊流水线快照。强制流程机的第一步：先看当前阶段、待确认点、blocked 与各阶段状态，再决定动作。省略 project 时返回所有项目概览。',
      parameters: {
        type: 'object',
        properties: { project: projectParam },
        additionalProperties: false,
      },
      output: textOutput(renderStatus),
      async execute(args, exec) {
        const { callCliJson, snapshot } = await toolContext(exec)
        if (typeof args?.project === 'string' && args.project.length > 0) {
          return callCliJson(['status', '--json', '--project', args.project])
        }
        return snapshot()
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_next',
      description:
        '返回下一阶段、对应 skill、待确认点与进入命令。每次开工前先调用；pendingApproval 非空时必须先问用户，blocked 非空时不得开工。',
      parameters: {
        type: 'object',
        properties: { project: projectParam },
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCliJson } = await toolContext(exec)
        const name = resolveProject(args?.project)
        return callCliJson(['next', '--json', '--project', name])
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_stage_enter',
      description:
        '进入指定阶段（S0–S11）。CLI 会检查前置阶段、blocked 和待确认点；缺 U 确认时先向用户要原话，再用 docwrite_approve 记录。',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: '阶段 id，例如 S7' },
          project: projectParam,
        },
        required: ['stage'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCli } = await toolContext(exec)
        const stage = String(args?.stage ?? '')
        if (!/^S\d{1,2}$/.test(stage)) throw new Error(`stage 必须是 S0–S11，收到：${stage}`)
        const name = resolveProject(args?.project)
        const result = await callCli(['stage', 'enter', stage, '--project', name])
        return { ok: true, stage, project: name, output: result.stdout.trim() }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_stage_done',
      description:
        '完成当前阶段。只有 CLI 的 checkStage 通过才算完成；模型不得口头声称完成。硬门禁不可豁免，软门禁豁免必须由用户原话驱动。',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: '阶段 id，例如 S7' },
          project: projectParam,
        },
        required: ['stage'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCli } = await toolContext(exec)
        const stage = String(args?.stage ?? '')
        if (!/^S\d{1,2}$/.test(stage)) throw new Error(`stage 必须是 S0–S11，收到：${stage}`)
        const name = resolveProject(args?.project)
        const result = await callCli(['stage', 'done', stage, '--project', name])
        return { ok: true, stage, project: name, output: result.stdout.trim() }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_approve',
      description:
        '记录用户确认点（U0–U7）。quote 必须是用户原话，不许模型代写或自行 approve；CLI 会拒绝 --by 非 user 或空 quote。',
      parameters: {
        type: 'object',
        properties: {
          gate: { type: 'string', description: '确认点，U0–U7' },
          quote: { type: 'string', description: '用户原话（逐字引用）' },
          project: projectParam,
        },
        required: ['gate', 'quote'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCli } = await toolContext(exec)
        const gate = String(args?.gate ?? '')
        if (!/^U[0-7]$/.test(gate)) throw new Error(`gate 必须是 U0–U7，收到：${gate}`)
        const quote = String(args?.quote ?? '').trim()
        if (!quote) throw new Error('quote 必须是用户原话，不能为空')
        const name = resolveProject(args?.project)
        const result = await callCli(['approve', gate, '--by', 'user', '--quote', quote, '--project', name])
        return { ok: true, gate, project: name, output: result.stdout.trim() }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_review_open',
      description:
        'S6/S7/S9 独立评审第一步：生成评审包（prompt、rubric、doc、refs、template），返回 reviewId 与子代理输出路径。必须派 subagent（新上下文）评审，禁止 subagent_fork 或主代理自评。',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: '评审阶段：S6、S7 或 S9' },
          doc: { type: 'string', description: '被评审的 Markdown 文件（相对项目目录），例如 draft_reduced.md' },
          project: projectParam,
        },
        required: ['stage', 'doc'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCliJson } = await toolContext(exec)
        const stage = String(args?.stage ?? '')
        if (!['S6', 'S7', 'S9'].includes(stage)) throw new Error(`评审阶段必须是 S6/S7/S9，收到：${stage}`)
        const doc = String(args?.doc ?? '')
        if (!doc) throw new Error('doc 不能为空')
        const name = resolveProject(args?.project)
        return callCliJson(['review', 'open', '--stage', stage, '--doc', doc, '--json', '--project', name])
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_review_submit',
      description:
        'S6/S7/S9 独立评审第二步：收子代理写好的 review.json。verdict=revise 时返回 ok:false 与 issues（不抛错，便于继续修改）；reject 会进入 blocked。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'review open 返回的 reviewId' },
          project: projectParam,
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, runCli } = await toolContext(exec)
        const id = String(args?.id ?? '')
        if (!id) throw new Error('id 不能为空')
        const name = resolveProject(args?.project)
        const result = await runCli(['review', 'submit', '--id', id, '--json', '--project', name])
        if (result.exitCode !== 0 && result.exitCode !== 2) {
          const detail = (result.stderr || result.stdout || '').trim()
          throw new Error(`docwrite review submit 失败（exit ${result.exitCode}）：${detail}`)
        }
        const parsed = result.stdout.trim() ? JSON.parse(result.stdout) : {}
        return { ...parsed, ok: result.exitCode === 0 }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_visual_check',
      description:
        '把当前阶段的成果以可视化摘要（阶段进度、产物清单、关键指标、正文预览）展示给用户，并询问“是否合格、能否进入下一步”。不合格时收集需要修改的地方。每次 stage done 前先调用；它只记录人工验收意见，真正的阶段完成仍由 CLI 的 stage done 判定。',
      parameters: {
        type: 'object',
        properties: {
          project: projectParam,
          stage: { type: 'string', description: '要验收的阶段；省略时用当前阶段 state.current' },
        },
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { root, projectState, resolveProject } = await toolContext(exec)
        const name = resolveProject(args?.project)
        const found = projectState(name)
        if (!found) throw new Error(`项目不存在或未初始化：${name}`)
        const state = found.state
        const stage =
          typeof args?.stage === 'string' && args.stage.length > 0 ? args.stage : state.current
        if (!STAGE_MAP[stage]) throw new Error(`未知阶段：${stage}`)
        if (!exec.agent) throw new Error('docwrite_visual_check 需要 agent 会话')

        const detail = buildGateDetail(state, stage, join(root, 'projects', name))
        const answer = await ctx.userQuestions.ask({
          agent: exec.agent,
          signal: exec.signal,
          wait: { callId: exec.callId },
          questions: [
            {
              id: 'docwrite-visual-check',
              header: `文档工坊 · ${stage} ${STAGE_MAP[stage].name}`,
              question: '当前成果是否合格，可以进入下一步？如果不行，请说明需要修改的地方。',
              detail,
              options: [
                {
                  label: '合格，可以进入下一步',
                  description: '记录验收通过；随后由 CLI 的 stage done 做硬检查。',
                },
                {
                  label: '需要修改',
                  description: '请在补充说明里写清楚要改什么。',
                },
                {
                  label: '暂不判断',
                  description: '先保留当前状态，稍后再验收。',
                },
              ],
            },
          ],
        })

        const item = answer.answers?.find((entry) => entry.id === 'docwrite-visual-check')
        const selected = item?.selected ?? []
        const custom = (item?.custom ?? '').trim()
        const verdict = selected.some((label) => label.includes('合格'))
          ? 'pass'
          : selected.some((label) => label.includes('修改'))
            ? 'revise'
            : 'pending'

        return {
          ok: true,
          project: name,
          stage,
          verdict,
          feedback: custom,
          artifacts: ARTIFACTS[stage] ?? [],
          summary: detail,
          next:
            verdict === 'pass'
              ? `docwrite_stage_done ${stage}`
              : verdict === 'revise'
                ? custom
                  ? '按反馈修改后重新调用 docwrite_visual_check'
                  : '用户要求修改但未填写具体说明；先问清楚要改哪里，再修改'
                : '稍后再验收',
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_verify',
      description: 'S10 终检：跑全部硬约束、哈希与扩展检查，写 verify-report.md，返回 PASS/FAIL。必须在 S10 进入后调用。',
      parameters: {
        type: 'object',
        properties: { project: projectParam },
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, runCli } = await toolContext(exec)
        const name = resolveProject(args?.project)
        const result = await runCli(['verify', '--json', '--project', name])
        if (result.exitCode !== 0 && result.exitCode !== 2) {
          const detail = (result.stderr || result.stdout || '').trim()
          throw new Error(`docwrite verify 失败（exit ${result.exitCode}）：${detail}`)
        }
        const parsed = result.stdout.trim() ? JSON.parse(result.stdout) : {}
        return { ...parsed, ok: result.exitCode === 0 }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_deliver',
      description: 'S11 交付：把成品复制到 deliver/ 并写 delivery-manifest.json。verify 未 PASS 时 CLI 会拒绝。',
      parameters: {
        type: 'object',
        properties: {
          project: projectParam,
          to: { type: 'string', enum: ['docx', 'pptx', 'md', 'pdf'], description: '交付格式；省略则按项目配置' },
        },
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCliJson } = await toolContext(exec)
        const name = resolveProject(args?.project)
        const argv = ['deliver', '--json', '--project', name]
        if (typeof args?.to === 'string' && args.to.length > 0) argv.push('--to', args.to)
        return callCliJson(argv)
      },
    }),
  )
}
