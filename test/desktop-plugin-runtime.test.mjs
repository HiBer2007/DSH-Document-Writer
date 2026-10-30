import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../harness/docwrite-desktop/index.js'

function writeProjectState(dir, name) {
  mkdirSync(join(dir, '.run'), { recursive: true })
  const state = {
    project: name,
    root: dir,
    current: 'S5',
    scope: { mode: 'full', entry: 'S0', excluded: [] },
    approvals: { U0: { by: 'user', quote: 'ok' }, U1: { by: 'user', quote: 'ok' }, U2: { by: 'user', quote: 'ok' }, U3: { by: 'user', quote: 'ok' } },
    stages: {
      S0: { status: 'done' },
      S1: { status: 'done' },
      S2: { status: 'done' },
      S3: { status: 'done' },
      S4: { status: 'done' },
      S5: { status: 'active', attempt: 1 },
    },
    reviews: {},
    loops: {},
    revisions: 0,
    blocked: null,
  }
  writeFileSync(join(dir, '.run', 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'docwrite-desktop-'))
  const dir = join(root, 'projects', '测试')
  writeProjectState(dir, '测试')
  return { root, dir }
}

/** 在仓库自己的 projects/ 下建一个临时项目，供真实 CLI 测试使用；结束后删除。 */
function makeRepoProject(name = '__cli_test__') {
  const root = process.cwd()
  const dir = join(root, 'projects', name)
  writeProjectState(dir, name)
  return { root, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function makeCtx({
  realSubprocess = false,
  answer = { selected: ['合格，可以进入下一步'] },
  sessionCwd = null,
} = {}) {
  const tools = []
  const guards = []
  const routes = []
  const questions = []
  const ctx = {
    tools: {
      register(definition) {
        tools.push(definition)
        return () => {}
      },
      guard(guard) {
        guards.push(guard)
        return () => {}
      },
    },
    subprocess: {
      async resolveExecutable() {
        return process.execPath
      },
      spawn(spec) {
        if (!realSubprocess) throw new Error('subprocess.spawn should not be called by this test')
        const child = spawn(spec.argv[0], spec.argv.slice(1), {
          cwd: spec.cwd,
          env: spec.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => {
          stdout += chunk
        })
        child.stderr.on('data', (chunk) => {
          stderr += chunk
        })
        const done = new Promise((resolve) => {
          child.on('close', (exitCode, signal) => resolve({ exitCode, signal }))
        })
        return {
          done,
          collected: {
            stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) },
            stderr: { readFrom: () => ({ text: stderr, nextOffset: stderr.length, lossy: false }) },
          },
          terminate() {
            child.kill()
          },
        }
      },
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    userQuestions: {
      async ask(request) {
        questions.push(request)
        return {
          answers: [
            {
              id: 'docwrite-visual-check',
              selected: answer.selected,
              ...(answer.custom === undefined ? {} : { custom: answer.custom }),
            },
          ],
        }
      },
    },
    effect(callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
  }
  if (sessionCwd) {
    ctx.workingDirectory = {
      get: () => sessionCwd,
      ensure: async () => sessionCwd,
    }
    ctx.sessions = {
      get: () => ({ header: { cwd: sessionCwd } }),
      list: () => [{ header: { cwd: sessionCwd } }],
    }
  }
  return { ctx, tools, guards, routes, questions }
}

test('desktop Host 插件：注册 12 个 docwrite 工具与两条只读路由', () => {
  const { root, dir } = makeRoot()
  try {
    const { ctx, tools, routes } = makeCtx()
    apply(ctx, { root })
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'docwrite_init',
        'docwrite_constraints',
        'docwrite_status',
        'docwrite_next',
        'docwrite_stage_enter',
        'docwrite_stage_done',
        'docwrite_approve',
        'docwrite_review_open',
        'docwrite_review_submit',
        'docwrite_visual_check',
        'docwrite_verify',
        'docwrite_deliver',
      ],
    )
    assert.equal(routes.length, 2)
    assert.deepEqual(
      routes.map((route) => route.path).sort(),
      ['/docwrite/presets', '/docwrite/state'],
    )
    const stateRoute = routes.find((route) => route.path === '/docwrite/state')

    const response = {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(name, value) {
        this.headers[name] = value
      },
      end(body) {
        this.body = body
      },
    }
    stateRoute.handler({ url: '/docwrite/state' }, response)
    assert.equal(response.statusCode, 200)
    const payload = JSON.parse(response.body)
    assert.equal(payload.ok, true)
    assert.equal(payload.projects.length, 1)
    assert.equal(payload.projects[0].project, '测试')
    assert.equal(payload.projects[0].current, 'S5')
    assert.equal(payload.projects[0].pendingApproval, null)
    assert.equal(payload.projects[0].stages.length, 12)
    assert.equal(payload.projects[0].stages[8].id, 'S8')
    assert.equal(payload.projects[0].stages[8].status, 'pending')
    assert.ok(dir)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：S8 前拒绝 docx/pptx 写入，stage done 只能完成当前阶段', () => {
  const { root } = makeRoot()
  try {
    const { ctx, guards } = makeCtx()
    apply(ctx, { root })
    assert.equal(guards.length, 1)
    const guard = guards[0]

    const docx = join(root, 'projects', '测试', 'build', '论文.docx')
    const denied = guard({ name: 'write', arguments: { path: docx } })
    assert.match(denied, /强制流程机/)
    assert.match(denied, /S5/)

    assert.equal(guard({ name: 'write', arguments: { path: join(root, 'projects', '测试', 'notes.md') } }), undefined)
    assert.equal(guard({ name: 'read', arguments: { path: docx } }), undefined)

    assert.match(
      guard({ name: 'docwrite_stage_done', arguments: { stage: 'S6', project: '测试' } }),
      /当前阶段是 S5/,
    )
    assert.equal(
      guard({ name: 'docwrite_stage_done', arguments: { stage: 'S5', project: '测试' } }),
      undefined,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：status 工具省略 project 时返回全部项目快照', async () => {
  const { root } = makeRoot()
  try {
    const { ctx, tools } = makeCtx()
    apply(ctx, { root })
    const status = tools.find((tool) => tool.name === 'docwrite_status')
    const value = await status.execute({}, { signal: new AbortController().signal })
    assert.equal(value.ok, true)
    assert.equal(value.projects[0].project, '测试')
    const content = status.output.render({}, value)
    assert.equal(content[0].type, 'text')
    assert.match(content[0].text, /文档工坊/)
    assert.match(content[0].text, /S5 初稿/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：visual_check 展示产物并返回用户验收结论', async () => {
  const { root } = makeRoot()
  const draft = join(root, 'projects', '测试', 'draft.md')
  writeFileSync(draft, '# 测试初稿\n\n第一段内容。\n', 'utf8')
  try {
    const passCtx = makeCtx()
    apply(passCtx.ctx, { root })
    const passTool = passCtx.tools.find((tool) => tool.name === 'docwrite_visual_check')
    const pass = await passTool.execute(
      { project: '测试' },
      { agent: { id: 'agent-1' }, callId: 'call-1', signal: new AbortController().signal },
    )
    assert.equal(pass.verdict, 'pass')
    assert.match(pass.summary, /S5 初稿/)
    assert.match(pass.summary, /draft\.md/)
    assert.match(pass.summary, /第一段内容/)
    assert.equal(passCtx.questions.length, 1)
    assert.equal(passCtx.questions[0].wait.callId, 'call-1')
    assert.match(passCtx.questions[0].questions[0].detail, /📊 进度/)
    assert.equal(passCtx.questions[0].questions[0].options.length, 3)

    const reviseCtx = makeCtx({ answer: { selected: ['需要修改'], custom: '第二章需要补充数据' } })
    apply(reviseCtx.ctx, { root })
    const reviseTool = reviseCtx.tools.find((tool) => tool.name === 'docwrite_visual_check')
    const revise = await reviseTool.execute(
      { project: '测试' },
      { agent: { id: 'agent-1' }, signal: new AbortController().signal },
    )
    assert.equal(revise.verdict, 'revise')
    assert.equal(revise.feedback, '第二章需要补充数据')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：无 root 配置时按会话工作区运行', async () => {
  const { root } = makeRoot()
  try {
    const { ctx, tools, routes, guards } = makeCtx({ sessionCwd: root })
    apply(ctx, {})

    const status = tools.find((tool) => tool.name === 'docwrite_status')
    const value = await status.execute({}, { agent: { id: 'agent-1' }, signal: new AbortController().signal })
    assert.equal(value.root, root)
    assert.equal(value.projects[0].project, '测试')

    const stateRoute = routes.find((route) => route.path === '/docwrite/state')
    const response = {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(name, headerValue) {
        this.headers[name] = headerValue
      },
      end(body) {
        this.body = body
      },
    }
    stateRoute.handler({ url: `/docwrite/state?root=${encodeURIComponent(root)}` }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(JSON.parse(response.body).root, root)

    const denied = guards[0]({
      name: 'write',
      arguments: { path: join(root, 'projects', '测试', 'build', '论文.docx') },
      agent: { id: 'agent-1' },
    })
    assert.match(denied, /强制流程机/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：docwrite_init 在当前工作区创建项目', async () => {
  const { root } = makeRoot()
  try {
    const { ctx, tools } = makeCtx({ realSubprocess: true, sessionCwd: root })
    apply(ctx, {})
    const init = tools.find((tool) => tool.name === 'docwrite_init')
    const value = await init.execute(
      { name: '新项目', scope: 'full' },
      { agent: { id: 'agent-1' }, signal: new AbortController().signal },
    )
    assert.equal(value.ok, true)
    assert.ok(existsSync(join(root, 'projects', '新项目', '.run', 'state.json')))
    assert.ok(existsSync(join(root, '.dsh', 'skills', 'docwrite-constraints', 'SKILL.md')))
    assert.ok(value.skillsCopied >= 1)
    assert.ok(!existsSync(join(root, 'projects', '新项目', 'build', 'x.docx')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：constraints 工具返回模板并通过检查', async () => {
  const { root } = makeRoot()
  try {
    const { ctx, tools } = makeCtx({ realSubprocess: true, sessionCwd: root })
    apply(ctx, {})
    const tool = tools.find((entry) => entry.name === 'docwrite_constraints')
    const context = { agent: { id: 'agent-1' }, signal: new AbortController().signal }

    const template = await tool.execute({ action: 'template', project: '测试' }, context)
    assert.ok(template.template.items.length > 0)
    assert.ok(template.template.items[0].source)
    assert.ok(template.skillsCopied >= 1)
    assert.ok(existsSync(join(root, '.dsh', 'skills', 'docwrite-constraints', 'SKILL.md')))

    const init = await tool.execute({ action: 'init', project: '测试' }, context)
    assert.equal(init.ok, true)

    const check = await tool.execute({ action: 'check', project: '测试' }, context)
    assert.equal(check.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：工作区没有 CLI 时使用插件包内 CLI', async () => {
  const { root } = makeRoot()
  try {
    const { ctx, tools } = makeCtx({ realSubprocess: true, sessionCwd: root })
    apply(ctx, {})
    const next = tools.find((tool) => tool.name === 'docwrite_next')
    const value = await next.execute(
      { project: '测试' },
      { agent: { id: 'agent-1' }, signal: new AbortController().signal },
    )
    assert.equal(value.project, '测试')
    assert.equal(typeof value.stage, 'string')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop Host 插件：status/next 通过真实 CLI 返回 JSON', async () => {
  const { root, cleanup } = makeRepoProject()
  try {
    const { ctx, tools } = makeCtx({ realSubprocess: true })
    apply(ctx, { root })

    const status = tools.find((tool) => tool.name === 'docwrite_status')
    const statusValue = await status.execute(
      { project: '__cli_test__' },
      { signal: new AbortController().signal },
    )
    assert.equal(statusValue.project, '__cli_test__')
    assert.equal(statusValue.stages.length, 12)
    assert.equal(statusValue.stages[0].id, 'S0')

    const next = tools.find((tool) => tool.name === 'docwrite_next')
    const nextValue = await next.execute(
      { project: '__cli_test__' },
      { signal: new AbortController().signal },
    )
    assert.equal(nextValue.project, '__cli_test__')
    assert.ok('stage' in nextValue)
    assert.ok('pendingApproval' in nextValue)
  } finally {
    cleanup()
  }
})
