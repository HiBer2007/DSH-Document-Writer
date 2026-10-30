import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CliError, EXIT } from './errors.mjs'
import { SCOPE_ENTRY, STAGE_IDS, stageIndex } from './stages.mjs'
import { appendEvent, now, saveState, statePath } from './state.mjs'

export function projectsRoot(root = process.cwd()) {
  return join(root, 'projects')
}

export function projectDir(root, name) {
  return join(projectsRoot(root), name)
}

export function listProjects(root = process.cwd()) {
  const dir = projectsRoot(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(statePath(join(dir, name))))
}

export function resolveActiveProject(root = process.cwd(), name) {
  if (name) {
    const dir = projectDir(root, name)
    if (!existsSync(statePath(dir))) {
      throw new CliError(`项目不存在或未初始化：${name}`, EXIT.PREREQ)
    }
    return dir
  }
  const names = listProjects(root)
  if (names.length === 1) return projectDir(root, names[0])
  if (!names.length) {
    throw new CliError('当前没有已初始化项目，先运行 docwrite init <项目名>', EXIT.PREREQ)
  }
  throw new CliError(`有多个项目，请用 --project 指定：${names.join('、')}`, EXIT.USAGE)
}

function briefTemplate({ name, template, deadline, format, scope, entry, reason }) {
  return `# 任务卡：${name}

- 交付物格式：${format}
- 截止时间：${deadline || '（待填）'}
- 模板：${template || '（无）'}
- 提交方式：（待填）
- 作用域：${scope}
- 入口阶段：${entry}
${reason ? `- 作用域原因：${reason}\n` : ''}
## 待确认

- [ ] 交付物、截止时间、模板、提交方式是否正确
- [ ] 作用域与入口阶段是否符合预期
`
}

export function initProject({
  root = process.cwd(),
  name,
  template = null,
  deadline = null,
  format = 'docx',
  scope = 'full',
  at = null,
  reason = '',
}) {
  if (!name) throw new CliError('用法：docwrite init <项目名> [--template f.docx] [--deadline ...]', EXIT.USAGE)
  if (!SCOPE_ENTRY[scope]) {
    throw new CliError(`未知作用域：${scope}（可用：${Object.keys(SCOPE_ENTRY).join('、')}）`, EXIT.USAGE)
  }
  const dir = projectDir(root, name)
  if (existsSync(statePath(dir))) {
    throw new CliError(`项目已存在：${name}`, EXIT.USAGE)
  }

  const entry = at ?? SCOPE_ENTRY[scope]
  if (!STAGE_IDS.includes(entry)) throw new CliError(`未知入口阶段：${entry}`, EXIT.USAGE)
  const entryIdx = stageIndex(entry)
  const excluded = STAGE_IDS.filter((id, i) => i < entryIdx && id !== 'S0')

  mkdirSync(join(dir, 'sources'), { recursive: true })
  mkdirSync(join(dir, 'build'), { recursive: true })
  mkdirSync(join(dir, 'deliver'), { recursive: true })
  mkdirSync(join(dir, '.run'), { recursive: true })

  writeFileSync(
    join(dir, 'brief.md'),
    briefTemplate({ name, template, deadline, format, scope, entry, reason }),
    'utf8',
  )
  writeFileSync(
    join(dir, 'project.json'),
    `${JSON.stringify({ name, template, deadline, format, scope, entry, createdAt: now() }, null, 2)}\n`,
    'utf8',
  )

  const state = {
    project: name,
    root: resolve(dir),
    createdAt: now(),
    current: entry,
    scope: { mode: scope, entry, excluded, reason },
    approvals: {},
    reviews: {},
    stages: {},
    edges: [],
    loops: {},
    revisions: 0,
    blocked: null,
    extensions: [],
  }

  if (entry === 'S0') {
    state.stages.S0 = { status: 'active', at: now(), attempt: 1 }
  } else {
    state.stages.S0 = { status: 'done', at: now(), artifacts: ['brief.md'] }
    for (const id of excluded) {
      state.stages[id] = { status: 'excluded', at: now(), reason: `作用域 ${scope} 从 ${entry} 开始` }
    }
    state.stages[entry] = { status: 'active', at: now(), attempt: 1 }
  }

  saveState(dir, state)
  appendEvent(dir, { type: 'project.init', name, scope, entry })
  return { dir, state }
}
