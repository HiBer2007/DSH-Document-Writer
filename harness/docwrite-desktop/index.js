// 文档工坊 Host 插件（DSH Desktop）
//
// 职责：
// 1. 把 docwrite CLI 的常用动作封装成模型工具，避免每次拼 PowerShell。
// 2. 强制流程机：S8 成型前禁止 write/edit 产出 docx/pptx；stage done 只能 done 当前阶段。
// 3. 为 Web GUI 的「文档工坊」面板提供 /docwrite/state 只读快照。
//
// 阶段表与 ENTRY_APPROVAL 必须和 src/core/stages.mjs 保持一致；test/desktop-plugin.test.mjs 会对比。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOC_MODES, getSessionMode, modeInfo, setSessionMode } from './mode.js'

export const name = 'docwrite-harness'
export const inject = ['webServer', 'sessions', 'sessionQuery']

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

const APPROVAL_OPTIONS = {
  U0: ['受理信息正确，继续', '需要修改'],
  U1: ['约束清单可用，继续', '有遗漏或冲突，需要修改'],
  U2: ['规格与大纲方向正确，继续', '需要调整'],
  U3: ['提纲确认，进入写作', '需要修改提纲'],
  U4: ['认可评审结论，继续', '需要复核或修改'],
  U5: ['按现有范围降重', '只降高风险段落', '不降重（需另行 waive S7）'],
  U6: ['确认转换', '暂不转换'],
  U7: ['确认交付', '暂不交付'],
}

function autoApprovalNotice(mode, action, defaultOption, extra = '') {
  const info = modeInfo(mode)
  return `此处为自动审批通过：${action} 已由文档修改模式 ${mode}「${info.label}」自动确认，采用默认项「${defaultOption}」。${extra}`.trim()
}

function subagentText(result) {
  return (result?.output ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function subagentJson(result) {
  if (result?.structured && typeof result.structured === 'object') return result.structured
  const text = subagentText(result)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
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
    lines.push(`   docwrite_u_confirm ${value.pendingApproval.gate} --project ${value.project ?? '<项目>'}`)
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

function readBody(req, limit = 64 * 1024) {
  if (typeof req?.body === 'string') {
    if (req.body.length > limit) return Promise.reject(new Error('请求体过大'))
    return Promise.resolve(req.body)
  }
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        req.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function apply(ctx, config) {
  const mode = config?.mode ?? 'all'
  const configuredRoot =
    typeof config?.root === 'string' && config.root.trim().length > 0 ? resolve(config.root) : null
  const packageDir = dirname(fileURLToPath(import.meta.url))
  const bundledCli = join(packageDir, 'cli')
  const REPO = 'HiBer2007/DSH-Document-Writer'
  let currentVersion = '0.0.0'
  try {
    currentVersion = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).version ?? currentVersion
  } catch {
    // 版本读不到时仍允许检查，只显示 0.0.0。
  }
  let updateCache = null

  function compareVersions(left, right) {
    const parse = (value) =>
      String(value)
        .replace(/^v/i, '')
        .split('-')[0]
        .split('.')
        .map((part) => Number.parseInt(part, 10) || 0)
    const a = parse(left)
    const b = parse(right)
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const diff = (a[index] ?? 0) - (b[index] ?? 0)
      if (diff !== 0) return diff > 0 ? 1 : -1
    }
    return 0
  }

  async function fetchRelease() {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `dsh-docwrite/${currentVersion}`,
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`GitHub API ${response.status}`)
    return response.json()
  }

  /** Node 自带 fetch 在部分 Windows 证书环境下会 UNABLE_TO_VERIFY_LEAF_SIGNATURE；用 gh 兜底。 */
  function ghRelease() {
    return new Promise((resolve, reject) => {
      execFile(
        'gh',
        ['api', `repos/${REPO}/releases/latest`],
        { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error((stderr || error.message || 'gh 调用失败').trim()))
            return
          }
          try {
            resolve(JSON.parse(stdout))
            return
          } catch {
            const start = stdout.indexOf('{')
            const end = stdout.lastIndexOf('}')
            if (start >= 0 && end > start) {
              try {
                resolve(JSON.parse(stdout.slice(start, end + 1)))
                return
              } catch {
                // 继续走统一报错。
              }
            }
          }
          reject(new Error('gh 返回的不是 JSON'))
        },
      )
    })
  }

  function runGit(args, timeout = 30000) {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        args,
        { timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error((stderr || error.message || 'git 调用失败').trim()))
            return
          }
          resolve(stdout)
        },
      )
    })
  }

  /** 仅支持 git 安装：工作区干净时把当前分支快进到最新 Release tag。 */
  async function applyUpdate() {
    const repoRoot = resolve(packageDir, '..', '..')
    if (!existsSync(join(repoRoot, '.git'))) {
      throw new Error('当前安装不是 git 仓库，无法自动更新；请按 Release 页面说明重装插件')
    }
    const status = await runGit(['-C', repoRoot, 'status', '--porcelain'])
    if (status.trim()) {
      throw new Error('仓库有未提交修改，不能自动更新；请先提交或 stash 后重试')
    }
    const branch = (await runGit(['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    if (!branch || branch === 'HEAD') {
      throw new Error('当前是 detached HEAD，不能自动更新；请切回 main 或 release 分支')
    }
    const latest = await checkUpdate()
    if (!latest.updateAvailable) {
      return { ok: true, upToDate: true, current: latest.current, message: '已是最新版本' }
    }
    if (!/^v?\d+\.\d+\.\d+$/.test(latest.tag)) {
      throw new Error(`Release tag 格式不支持：${latest.tag}`)
    }
    await runGit(['-C', repoRoot, 'fetch', '--tags', '--force'], 60000)
    const output = await runGit(['-C', repoRoot, 'merge', '--ff-only', latest.tag], 60000)
    updateCache = null
    return {
      ok: true,
      upToDate: false,
      tag: latest.tag,
      branch,
      message: `已更新到 ${latest.tag}；请重启 DSH 或重新加载插件后生效`,
      output: output.trim(),
    }
  }

  async function checkUpdate() {
    if (updateCache && Date.now() - updateCache.at < 10 * 60 * 1000) return updateCache.value
    let release
    try {
      release = await fetchRelease()
    } catch (first) {
      try {
        release = await ghRelease()
      } catch {
        throw first
      }
    }
    const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
    if (!tag) throw new Error('GitHub 没有返回 release tag')
    const latest = tag.replace(/^v/i, '')
    const value = {
      ok: true,
      current: currentVersion,
      latest,
      tag,
      updateAvailable: compareVersions(latest, currentVersion) > 0,
      name: release.name ?? tag,
      url: release.html_url ?? `https://github.com/${REPO}/releases/tag/${tag}`,
      publishedAt: release.published_at ?? null,
      notes: typeof release.body === 'string' ? release.body.slice(0, 4000) : '',
    }
    updateCache = { at: Date.now(), value }
    return value
  }

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
  async function sessionPreset(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return null
    try {
      const query = ctx.get('sessionQuery')
      if (query && typeof query.observeSession === 'function') {
        const observation = await query.observeSession(sessionId)
        const preset =
          observation?.projections?.values?.agentPreset ??
          observation?.header?.agentPreset ??
          null
        if (typeof preset === 'string' && preset.length > 0) return preset
      }
    } catch {
      // 回退到 sessions。
    }
    try {
      const session = ctx.sessions?.get?.(sessionId)
      return (
        session?.agentPreset ??
        session?.header?.agentPreset ??
        session?.projections?.values?.agentPreset ??
        null
      )
    } catch {
      return null
    }
  }

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

  /** 当前所有活会话的工作区里，已经初始化过 docwrite 项目的根。 */
  function sessionRoots() {
    const roots = []
    const seen = new Set()
    try {
      for (const session of ctx.sessions?.list?.() ?? []) {
        const cwd = session?.header?.cwd
        if (typeof cwd !== 'string' || cwd.length === 0) continue
        const key = cwd.toLowerCase()
        if (seen.has(key)) continue
        if (!existsSync(join(cwd, 'projects'))) continue
        seen.add(key)
        roots.push(cwd)
      }
    } catch {
      // 没有 sessions 服务时回退到显式配置。
    }
    if (roots.length === 0 && configuredRoot) roots.push(configuredRoot)
    return roots
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

  function readPanelMeta(root, project) {
    const path = join(root, 'projects', project, '.run', 'panel.json')
    if (!existsSync(path)) return {}
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return {}
    }
  }

  function writePanelMeta(root, project, archived, reason = '') {
    const dir = join(root, 'projects', project, '.run')
    mkdirSync(dir, { recursive: true })
    const previous = readPanelMeta(root, project)
    const meta = {
      ...previous,
      archived: Boolean(archived),
      archivedAt: archived ? new Date().toISOString() : null,
      archivedBy: archived ? 'user' : null,
      reason: archived ? reason : '',
    }
    writeFileSync(join(dir, 'panel.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    return meta
  }

  function snapshot(root, project) {
    requireRoot(root)
    const names = typeof project === 'string' && project.length > 0 ? [project] : listProjects(root)
    const projects = names.map((name) => {
      const found = projectState(root, name)
      if (!found) return { project: name, workspace: root, archived: false, error: 'state.json 不可读' }
      let updatedAt = null
      try {
        updatedAt = statSync(found.path).mtime.toISOString()
      } catch {
        updatedAt = null
      }
      const meta = readPanelMeta(root, name)
      return {
        ...summarize(found.state, updatedAt),
        workspace: root,
        archived: meta.archived === true,
        archivedAt: meta.archivedAt ?? null,
      }
    })
    return { ok: true, root, generatedAt: new Date().toISOString(), projects }
  }

  if (mode !== 'tools') {
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

  // ── 文档修改模式（仅文档工坊会话） ───────────────────────────────────
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/docwrite/mode',
      handler: async (req, res) => {
        const send = (status, value) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(value))
        }
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          let payload = {}
          if (req.method === 'POST') {
            const raw = await readBody(req)
            payload = raw.trim() ? JSON.parse(raw) : {}
          }
          const session = String(payload.session ?? url.searchParams.get('session') ?? '')
          if (!session) {
            send(400, { ok: false, error: '缺少 session' })
            return
          }
          const preset = await sessionPreset(session)
          if (preset !== 'docwrite') {
            send(403, { ok: false, error: '文档修改模式仅在文档工坊会话可用', preset })
            return
          }
          if (req.method === 'GET') {
            send(200, {
              ok: true,
              session,
              preset,
              mode: getSessionMode(session),
              modes: DOC_MODES,
            })
            return
          }
          if (req.method !== 'POST') {
            send(405, { ok: false, error: '只支持 GET/POST' })
            return
          }
          const mode = Number(payload.mode)
          if (!Number.isInteger(mode) || mode < 1 || mode > 5) {
            send(400, { ok: false, error: '文档修改模式必须是 1–5' })
            return
          }
          const saved = setSessionMode(session, mode)
          send(200, {
            ok: true,
            session,
            preset,
            mode: saved,
            modes: DOC_MODES,
          })
        } catch (err) {
          send(500, { ok: false, error: err?.message ?? String(err) })
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
          let body
          if (requested) {
            if (!isAbsolute(requested) || !existsSync(requested) || !statSync(requested).isDirectory()) {
              res.statusCode = 400
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ ok: false, error: `工作区不存在：${requested}` }))
              return
            }
            body = JSON.stringify(snapshot(requested, project ?? undefined))
          } else {
            const roots = sessionRoots()
            if (roots.length === 0) {
              res.statusCode = 503
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.end(
                JSON.stringify({
                  ok: false,
                  error: '没有找到已初始化 docwrite 项目的工作区；先在会话工作区运行 docwrite_init。',
                }),
              )
              return
            }
            if (roots.length === 1) {
              body = JSON.stringify(snapshot(roots[0], project ?? undefined))
            } else {
              const projects = []
              for (const root of roots) {
                try {
                  projects.push(...snapshot(root, project ?? undefined).projects)
                } catch {
                  // 某个工作区暂时不可读时，仍展示其余工作区。
                }
              }
              body = JSON.stringify({
                ok: true,
                roots,
                generatedAt: new Date().toISOString(),
                projects,
              })
            }
          }
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

  // ── 手工归档（只写 .run/panel.json，不改流程状态） ────────────────────
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/docwrite/archive',
      handler: async (req, res) => {
        const send = (status, value) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(value))
        }
        try {
          if (req.method !== 'POST') {
            send(405, { ok: false, error: '只支持 POST' })
            return
          }
          const raw = await readBody(req)
          let payload
          try {
            payload = JSON.parse(raw || '{}')
          } catch {
            send(400, { ok: false, error: '请求体不是合法 JSON' })
            return
          }
          const root = typeof payload.root === 'string' ? payload.root : ''
          const project = typeof payload.project === 'string' ? payload.project : ''
          const archived = payload.archived !== false
          const reason = typeof payload.reason === 'string' ? payload.reason : ''
          if (!isAbsolute(root) || !existsSync(root) || !statSync(root).isDirectory()) {
            send(400, { ok: false, error: `工作区不存在：${root}` })
            return
          }
          if (!/^[^\\/:*?"<>|]+$/.test(project) || project === '.' || project === '..') {
            send(400, { ok: false, error: `项目名不合法：${project}` })
            return
          }
          if (!projectState(root, project)) {
            send(404, { ok: false, error: `项目不存在或未初始化：${project}` })
            return
          }
          const meta = writePanelMeta(root, project, archived, reason)
          send(200, { ok: true, project, archived: meta.archived, meta })
        } catch (err) {
          send(500, { ok: false, error: err?.message ?? String(err) })
        }
      },
    }),
  )

  // ── 检查更新（GitHub Release，只读，10 分钟缓存） ─────────────────────
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/docwrite/update',
      handler: async (_req, res) => {
        try {
          const value = await checkUpdate()
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(value))
        } catch (err) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              current: currentVersion,
              error: err?.message ?? String(err),
              url: `https://github.com/${REPO}/releases`,
            }),
          )
        }
      },
    }),
  )

  // ── 立即更新（git 安装时快进到最新 Release tag） ─────────────────────
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/docwrite/update/apply',
      handler: async (req, res) => {
        const send = (status, value) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(value))
        }
        if (req.method !== 'POST') {
          send(405, { ok: false, error: '只支持 POST' })
          return
        }
        try {
          const value = await applyUpdate()
          send(200, value)
        } catch (err) {
          send(200, {
            ok: false,
            current: currentVersion,
            error: err?.message ?? String(err),
            url: `https://github.com/${REPO}/releases`,
          })
        }
      },
    }),
  )

  }

  if (mode !== 'panel') {
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
        '返回下一阶段、对应 skill、待确认点与进入命令。每次开工前先调用；pendingApproval 非空时用 docwrite_u_confirm（不要用通用 question），blocked 非空时不得开工。',
      parameters: {
        type: 'object',
        properties: { project: projectParam },
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCliJson } = await toolContext(exec)
        const name = resolveProject(args?.project)
        const value = await callCliJson(['next', '--json', '--project', name])
        const mode = getSessionMode(exec.agent?.id)
        const pending = value?.pendingApproval ?? null
        return {
          ...value,
          mode,
          modeName: modeInfo(mode).label,
          confirmTool: pending
            ? {
                name: 'docwrite_u_confirm',
                gate: pending.gate,
                forceAvailable: mode >= 3 && mode < 5,
              }
            : null,
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_stage_enter',
      description:
        '进入指定阶段（S0–S11）。CLI 会检查前置阶段、blocked 和待确认点；缺 U 确认时用 docwrite_u_confirm（模式 1/2 问问用户，模式 3+ 自动通过），不要用通用 question。',
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
        '直接记录 U0–U7 的低层入口。优先使用 docwrite_u_confirm（会展示确认项）；模式 3+ 下省略 quote 会自动确认并返回 notice，模式 1/2 必须提供用户原话。',
      parameters: {
        type: 'object',
        properties: {
          gate: { type: 'string', description: '确认点，U0–U7' },
          quote: { type: 'string', description: '用户原话；模式 1/2 必填，模式 3+ 可省略' },
          project: projectParam,
        },
        required: ['gate'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { resolveProject, callCli } = await toolContext(exec)
        const gate = String(args?.gate ?? '')
        if (!/^U[0-7]$/.test(gate)) throw new Error(`gate 必须是 U0–U7，收到：${gate}`)
        const mode = getSessionMode(exec.agent?.id)
        const supplied = String(args?.quote ?? '').trim()
        const auto = !supplied && mode >= 3
        const quote = supplied || (auto ? `文档修改模式 ${mode}：自动确认 ${gate}` : '')
        if (!quote) throw new Error('quote 必须是用户原话，不能为空')
        const name = resolveProject(args?.project)
        const result = await callCli(['approve', gate, '--by', 'user', '--quote', quote, '--project', name])
        return {
          ok: true,
          gate,
          project: name,
          mode,
          modeName: modeInfo(mode).label,
          auto,
          quote,
          ...(auto
            ? { notice: autoApprovalNotice(mode, `${gate} 确认`, '继续（低层 approve 入口）') }
            : {}),
          output: result.stdout.trim(),
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_u_confirm',
      description:
        '确认 U0–U7 的专用工具。模式 1/2 必须让用户选择；模式 3/4 自动采用默认项，只有 force=true 才中断问用户；模式 5 连 force 也自动采用默认项。自动通过会在 notice 里说明模式等级、名称和默认项。不要再用通用 question 工具代替 U 确认。',
      parameters: {
        type: 'object',
        properties: {
          gate: { type: 'string', enum: ['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'] },
          project: projectParam,
          force: {
            type: 'boolean',
            description: '模式 3/4 下强制中断问用户；模式 1/2 本来就问；模式 5 忽略并自动选默认项',
          },
          note: { type: 'string', description: '给用户看的补充说明（可选）' },
        },
        required: ['gate'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { root, projectState, resolveProject, callCli } = await toolContext(exec)
        const gate = String(args?.gate ?? '')
        if (!APPROVAL_QUESTION[gate]) throw new Error(`gate 必须是 U0–U7，收到：${gate}`)
        if (!exec.agent) throw new Error('docwrite_u_confirm 需要 agent 会话')
        const mode = getSessionMode(exec.agent?.id)
        const info = modeInfo(mode)
        const force = Boolean(args?.force)
        const name = resolveProject(args?.project)
        const found = projectState(name)
        if (!found) throw new Error(`项目不存在或未初始化：${name}`)
        const state = found.state
        const options = APPROVAL_OPTIONS[gate]
        const defaultOption = options[0]
        const question = APPROVAL_QUESTION[gate]
        const stage = state.current
        const projectDir = join(root, 'projects', name)
        const note = String(args?.note ?? '').trim()
        let detail = `项目：${name}｜当前阶段：${stage}｜文档修改模式 ${mode}「${info.label}」`
        if (note) detail += `\n${note}`
        try {
          detail += `\n\n${buildGateDetail(state, stage, projectDir)}`
        } catch {
          // 状态异常时仍允许确认，只给基础信息。
        }

        const shouldAsk = mode <= 2 || (force && mode < 5)
        if (!shouldAsk) {
          const quote = `文档修改模式 ${mode}：自动确认 ${gate}（${defaultOption}）`
          const result = await callCli([
            'approve',
            gate,
            '--by',
            'user',
            '--quote',
            quote,
            '--project',
            name,
          ])
          return {
            ok: true,
            approved: true,
            auto: true,
            forced: force,
            gate,
            project: name,
            stage,
            mode,
            modeName: info.label,
            defaultOption,
            quote,
            notice: autoApprovalNotice(
              mode,
              `${gate} 确认`,
              defaultOption,
              force && mode === 5 ? ' 本次强制问询在模式 5 下也被跳过。' : '',
            ),
            output: result.stdout.trim(),
          }
        }

        const answer = await ctx.userQuestions.ask({
          agent: exec.agent,
          signal: exec.signal,
          wait: { callId: exec.callId },
          questions: [
            {
              id: 'docwrite-u-confirm',
              header: `文档工坊 · ${gate} 确认`,
              question,
              detail,
              options: options.map((label, index) => ({
                label,
                description:
                  index === 0
                    ? '默认项：模式 3/4 自动通过时会采用它'
                    : gate === 'U5' && label.startsWith('不降重')
                      ? '记录不降重；S7 仍需另行 waive'
                      : '选择后不记录本次确认',
              })),
            },
          ],
        })

        const item = answer?.answers?.find((entry) => entry.id === 'docwrite-u-confirm')
        const selected = item?.selected ?? []
        const custom = (item?.custom ?? '').trim()
        const choice = custom || selected[0] || ''
        if (!choice) {
          return {
            ok: false,
            approved: false,
            gate,
            project: name,
            mode,
            modeName: info.label,
            reason: 'no-answer',
            message: '用户没有选择确认项；不要自行 approve。',
          }
        }
        const declined =
          gate !== 'U5' &&
          (options.slice(1).includes(choice) ||
            /^(需要|暂不|有遗漏|不通过|不同意)/.test(choice))
        if (declined) {
          return {
            ok: false,
            approved: false,
            gate,
            project: name,
            mode,
            modeName: info.label,
            reason: 'user-declined',
            quote: choice,
            message: '用户没有确认；按用户要求修改或暂停，不要继续进入下一阶段。',
          }
        }

        const result = await callCli([
          'approve',
          gate,
          '--by',
          'user',
          '--quote',
          choice,
          '--project',
          name,
        ])
        return {
          ok: true,
          approved: true,
          auto: false,
          forced: force,
          gate,
          project: name,
          stage,
          mode,
          modeName: info.label,
          quote: choice,
          output: result.stdout.trim(),
        }
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
      name: 'docwrite_review_extend',
      description:
        '评审轮次用满后追加 1 轮。模式 2+ 按用户选择自动许可；模式 1 必须由用户在验收卡上点“允许”。模型不能绕过硬上限，也不能在还有未提交评审时追加。',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string', enum: ['S6', 'S7', 'S9'], description: '评审阶段' },
          reason: {
            type: 'string',
            description: '为什么需要追加：这一轮改了什么、还需要评审员复核什么',
          },
          project: projectParam,
        },
        required: ['stage', 'reason'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { root, projectState, resolveProject, callCli } = await toolContext(exec)
        const name = resolveProject(args?.project)
        const stage = String(args?.stage ?? '')
        if (!['S6', 'S7', 'S9'].includes(stage)) {
          throw new Error(`评审阶段必须是 S6/S7/S9，收到：${stage}`)
        }
        const reason = String(args?.reason ?? '').trim()
        if (!reason) throw new Error('reason 不能为空：写清楚这一轮改了什么、要复核什么')
        if (!exec.agent) throw new Error('docwrite_review_extend 需要 agent 会话')

        let workflow = {}
        try {
          workflow = JSON.parse(readFileSync(join(root, 'docwrite.config.json'), 'utf8')).workflow ?? {}
        } catch {
          workflow = {}
        }
        const base = Number(workflow.maxRoundsPerReview ?? 3)
        const maxExtra = Number(workflow.maxReviewExtraRounds ?? 2)
        const review = projectState(name)?.state?.reviews?.[stage]
        const round = Number(review?.round ?? 0)
        const extra = Number(review?.extraRounds ?? 0)
        const limit = base + extra

        if (review?.status === 'open') {
          return {
            ok: false,
            extended: false,
            stage,
            project: name,
            reason: 'open-review',
            message: `当前 ${stage} 还有未提交的评审 ${review.id}；先 docwrite_review_submit，再申请追加。`,
          }
        }
        if (round < limit) {
          return {
            ok: false,
            extended: false,
            stage,
            project: name,
            reason: 'below-cap',
            message: `${stage} 还没到上限（${round}/${limit}），直接 docwrite_review_open 即可。`,
          }
        }
        if (extra >= maxExtra) {
          return {
            ok: false,
            extended: false,
            stage,
            project: name,
            reason: 'exhausted',
            message: `${stage} 已追加 ${extra}/${maxExtra} 轮；请用户决定回退或接受现有结论。`,
          }
        }

        const mode = getSessionMode(exec.agent?.id)
        let quote
        if (mode >= 2) {
          quote = `文档修改模式 ${mode}：自动许可轮次增加`
        } else {
          const answer = await ctx.userQuestions.ask({
            agent: exec.agent,
            signal: exec.signal,
            wait: { callId: exec.callId },
            questions: [
              {
                id: 'docwrite-review-extend',
                header: `文档工坊 · ${stage} 评审轮次`,
                question: `${stage} 已开 ${round} 轮评审（基础上限 ${base}，已追加 ${extra} 轮）。是否允许再追加 1 轮，让评审员复核这一轮的修改？`,
                detail: `追加理由：${reason}\n\n追加只影响 ${stage}；最多再追加 ${maxExtra - extra} 轮。不允许时按现有评审结论处理或回退。`,
                options: [
                  {
                    label: '允许，加 1 轮',
                    description: `记录 review.extend；随后可开第 ${round + 1} 轮。`,
                  },
                  {
                    label: '不增加，按现有评审结论处理',
                    description: '不追加预算；按当前 verdict 决定回退或接受。',
                  },
                ],
              },
            ],
          })

          const item = answer?.answers?.find((entry) => entry.id === 'docwrite-review-extend')
          const selected = item?.selected ?? []
          const custom = (item?.custom ?? '').trim()
          if (!selected.some((label) => label.startsWith('允许'))) {
            return {
              ok: false,
              extended: false,
              stage,
              project: name,
              reason: 'user-declined',
              quote: custom || selected.join('；') || '用户未允许追加',
            }
          }
          quote = custom || '允许，加 1 轮'
        }
        const result = await callCli([
          'review',
          'extend',
          '--stage',
          stage,
          '--add',
          '1',
          '--by',
          'user',
          '--quote',
          quote,
          '--reason',
          reason,
          '--project',
          name,
        ])
        return {
          ok: true,
          extended: true,
          stage,
          project: name,
          round: round + 1,
          limit: limit + 1,
          quote,
          mode,
          modeName: modeInfo(mode).label,
          auto: mode >= 2,
          ...(mode >= 2
            ? {
                notice: autoApprovalNotice(
                  mode,
                  `${stage} 评审轮次追加`,
                  '允许，加 1 轮',
                ),
              }
            : {}),
          output: result.stdout.trim(),
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_visual_check',
      description:
        '把当前阶段的成果以可视化摘要（阶段进度、产物清单、关键指标、正文预览）展示给用户，并询问“是否合格、能否进入下一步”。不合格时收集需要修改的地方。模式 3 自动通过 S7 降重验收，模式 4/5 自动通过所有阶段；仍建议在关键阶段使用强制暂停审阅。',
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
        const mode = getSessionMode(exec.agent?.id)
        if (mode >= 4 || (mode >= 3 && stage === 'S7')) {
          return {
            ok: true,
            project: name,
            stage,
            verdict: 'pass',
            feedback: '',
            auto: true,
            mode,
            modeName: modeInfo(mode).label,
            notified: mode === 4,
            message:
              mode >= 4
                ? `文档修改模式 ${mode}：常规验收自动通过；只有强制暂停审阅会打断。`
                : `文档修改模式 ${mode}：S7 降重审阅自动通过。`,
            notice: autoApprovalNotice(
              mode,
              `${stage} 验收`,
              '合格，可以进入下一步',
            ),
            artifacts: ARTIFACTS[stage] ?? [],
            summary: detail,
            next: `docwrite_stage_done ${stage}`,
          }
        }
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
      name: 'docwrite_force_pause_review',
      description:
        '文档修改模式 4/5 专用：强制暂停自动流程，把当前阶段成果交给用户审阅。低于模式 4 调用会被拒绝；模式 5 下强制问询也直接采用默认项「已审阅，继续」，不中断。',
      parameters: {
        type: 'object',
        properties: {
          project: projectParam,
          stage: { type: 'string', description: '要审阅的阶段；省略时用当前阶段' },
          reason: { type: 'string', description: '为什么现在必须暂停审阅' },
        },
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { root, projectState, resolveProject } = await toolContext(exec)
        const mode = getSessionMode(exec.agent?.id)
        if (mode < 4) {
          return {
            ok: false,
            reason: 'mode-too-low',
            mode,
            message: '强制暂停审阅仅在文档修改模式 4/5 可用；当前模式不会自动跳过验收。',
          }
        }
        if (!exec.agent) throw new Error('docwrite_force_pause_review 需要 agent 会话')
        const name = resolveProject(args?.project)
        const found = projectState(name)
        if (!found) throw new Error(`项目不存在或未初始化：${name}`)
        const state = found.state
        const stage =
          typeof args?.stage === 'string' && args.stage.length > 0 ? args.stage : state.current
        if (!STAGE_MAP[stage]) throw new Error(`未知阶段：${stage}`)
        const reason = String(args?.reason ?? '').trim()
        const detail = buildGateDetail(state, stage, join(root, 'projects', name))
        if (mode >= 5) {
          const defaultOption = '已审阅，继续'
          return {
            ok: true,
            project: name,
            stage,
            mode,
            modeName: modeInfo(mode).label,
            verdict: 'continue',
            feedback: '',
            auto: true,
            forced: true,
            defaultOption,
            notice: autoApprovalNotice(
              mode,
              `${stage} 强制暂停审阅`,
              defaultOption,
              ' 本次强制问询在模式 5 下也被跳过。',
            ),
            summary: detail,
          }
        }
        const answer = await ctx.userQuestions.ask({
          agent: exec.agent,
          signal: exec.signal,
          wait: { callId: exec.callId },
          questions: [
            {
              id: 'docwrite-force-pause-review',
              header: `文档工坊 · ${stage} 强制暂停审阅`,
              question: reason || '模型请求暂停，请审阅当前阶段成果；是否继续？',
              detail,
              options: [
                { label: '已审阅，继续', description: '记录这次暂停审阅，模型可以继续。' },
                { label: '需要修改', description: '请在补充说明里写清楚要改什么。' },
              ],
            },
          ],
        })
        const item = answer.answers?.find((entry) => entry.id === 'docwrite-force-pause-review')
        const selected = item?.selected ?? []
        const feedback = (item?.custom ?? '').trim()
        const verdict = selected.some((label) => label.includes('修改'))
          ? 'revise'
          : selected.length > 0
            ? 'continue'
            : 'pending'
        return {
          ok: true,
          project: name,
          stage,
          mode,
          verdict,
          feedback,
          artifacts: ARTIFACTS[stage] ?? [],
          summary: detail,
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'docwrite_block',
      description:
        '仅模式 4/5：确实无法继续时，先启动独立子代理核查；只有子代理确认“无论如何都不能继续”才 block 并停止等待用户接管。子代理认为仍有可行路径时不 block。',
      parameters: {
        type: 'object',
        properties: {
          project: projectParam,
          reason: { type: 'string', description: '为什么无法继续；写清已经尝试过什么' },
          evidence: { type: 'string', description: '可选：相关错误、文件或检查结果' },
        },
        required: ['reason'],
        additionalProperties: false,
      },
      output: textOutput((value) => JSON.stringify(value, null, 2)),
      async execute(args, exec) {
        const { root, projectState, resolveProject, callCli } = await toolContext(exec)
        const mode = getSessionMode(exec.agent?.id)
        const info = modeInfo(mode)
        if (mode < 4) {
          return {
            ok: false,
            blocked: false,
            reason: 'mode-too-low',
            mode,
            message: 'docwrite_block 仅在文档修改模式 4/5 可用；低模式请先向用户说明并请求接管。',
          }
        }
        if (!exec.agent) throw new Error('docwrite_block 需要 agent 会话')
        const name = resolveProject(args?.project)
        const found = projectState(name)
        if (!found) throw new Error(`项目不存在或未初始化：${name}`)
        const state = found.state
        if (state.blocked) {
          return {
            ok: true,
            blocked: true,
            alreadyBlocked: true,
            stop: true,
            project: name,
            mode,
            modeName: info.label,
            blockedReason: state.blocked.reason ?? null,
          }
        }
        const reason = String(args?.reason ?? '').trim()
        if (!reason) throw new Error('reason 不能为空：写清为什么无法继续')
        const evidence = String(args?.evidence ?? '').trim()
        const service = ctx.get?.('subagents') ?? ctx.subagents
        if (!service || typeof service.startActivation !== 'function') {
          throw new Error('docwrite_block 需要 subagents 服务；当前组合不可用')
        }
        const stage = state.current
        const detail = `项目：${name}\n当前阶段：${stage}\n原因：${reason}${evidence ? `\n证据：${evidence}` : ''}`
        const prompt = `你是「文档工坊」的独立阻断核查员。主代理认为当前文档任务无论如何都不能继续，准备 block 并等待用户接管。

你的职责是独立核查，不是执行任务，也不要修改任何文件：
- 先理解项目当前阶段、目标、已尝试的路径与错误证据；
- 检查是否仍有可行路径：补充素材/引用、缩小范围、waive 软门禁、改格式、询问用户、换工具、回退阶段、修复环境；
- 只有这些路径都不可行，或继续会造成不可接受的风险时，才判定 canContinue=false；
- 只要还有一条具体可尝试的路，就判 canContinue=true，并给出 alternatives。

${detail}

只输出 JSON：
{"canContinue": boolean, "reason": "一句话结论", "alternatives": ["仍可尝试的具体路径"]}`

        let activation
        try {
          activation = await service.startActivation({
            provider: 'spawn',
            label: 'docwrite-block-review',
            request: {
              parent: exec.agent,
              cwd: root,
              prompt: [{ type: 'text', text: prompt }],
              maxDepth: 0,
              outputSchema: {
                type: 'object',
                properties: {
                  canContinue: { type: 'boolean' },
                  reason: { type: 'string' },
                  alternatives: { type: 'array', items: { type: 'string' } },
                },
                required: ['canContinue', 'reason'],
                additionalProperties: false,
              },
            },
            signal: exec.signal,
            delivery: 'caller',
          })
        } catch (err) {
          return {
            ok: false,
            blocked: false,
            confirmed: false,
            reason: 'reviewer-start-failed',
            mode,
            modeName: info.label,
            message: `子代理核查无法启动，未执行 block：${err?.message ?? String(err)}`,
          }
        }

        let result
        try {
          result = await activation.result
        } catch (err) {
          return {
            ok: false,
            blocked: false,
            confirmed: false,
            reason: 'reviewer-failed',
            mode,
            modeName: info.label,
            childId: activation.childId ?? null,
            message: `子代理核查失败，未执行 block：${err?.message ?? String(err)}`,
          }
        }
        const verdict = subagentJson(result)
        const reviewerReason =
          typeof verdict?.reason === 'string' ? verdict.reason.trim() : ''
        if (!verdict || typeof verdict.canContinue !== 'boolean') {
          return {
            ok: false,
            blocked: false,
            confirmed: false,
            reason: 'reviewer-inconclusive',
            mode,
            modeName: info.label,
            childId: activation.childId ?? null,
            reviewerReason,
            stopReason: result?.stopReason ?? null,
            message: '子代理没有给出可判定的核查结论，未执行 block。',
          }
        }
        if (verdict.canContinue === true) {
          return {
            ok: false,
            blocked: false,
            confirmed: false,
            reason: 'can-still-continue',
            mode,
            modeName: info.label,
            childId: activation.childId ?? null,
            reviewerReason,
            alternatives: Array.isArray(verdict.alternatives) ? verdict.alternatives : [],
            message: '子代理认为仍有可行路径，未执行 block；先尝试这些路径。',
          }
        }

        const reviewer = `子代理 ${activation.childId ?? '?'} 核查：${reviewerReason || '确认无法继续'}`
        const cli = await callCli([
          'block',
          '--reason',
          reason,
          '--by',
          'subagent',
          '--evidence',
          evidence ? `${reviewer}；证据：${evidence}` : reviewer,
          '--project',
          name,
        ])
        let acknowledged = false
        try {
          const answer = await ctx.userQuestions.ask({
            agent: exec.agent,
            signal: exec.signal,
            wait: { callId: exec.callId },
            questions: [
              {
                id: 'docwrite-block-takeover',
                header: '文档工坊 · 已阻断，等待接管',
                question:
                  '独立子代理已确认无法继续，项目已 block。请接管处理；解除时运行 docwrite unblock。',
                detail: `阻断原因：${reason}\n核查结论：${reviewerReason}\n\n${detail}`,
                options: [
                  {
                    label: '我知道了，保持阻断',
                    description: '模型停止继续工作，等待你下一步指令或手动 unblock。',
                  },
                ],
              },
            ],
          })
          acknowledged = Boolean(answer)
        } catch {
          // 用户关闭卡片也保持 blocked；不要自动解除。
        }
        return {
          ok: true,
          blocked: true,
          stop: true,
          confirmed: true,
          project: name,
          stage,
          mode,
          modeName: info.label,
          childId: activation.childId ?? null,
          reviewerReason,
          acknowledged,
          blockedReason: reason,
          message: '已 block：停止继续工作，等待用户接管。除 docwrite_status/unblock 外不要继续流水线。',
          output: cli.stdout.trim(),
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
}
