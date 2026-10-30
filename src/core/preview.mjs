import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { join } from 'node:path'
import { CliError, EXIT } from './errors.mjs'
import { now } from './state.mjs'

export function previewPaths(projectDir) {
  return {
    file: join(projectDir, '.run', 'preview.json'),
    log: join(projectDir, '.run', 'preview.log'),
  }
}

export function readPreview(projectDir) {
  const { file } = previewPaths(projectDir)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function isAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function pickPort(start, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const port = start + i
    if (await isPortFree(port)) return port
  }
  throw new CliError(`端口 ${start}–${start + tries - 1} 都被占用`, EXIT.IO)
}

function waitForPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const attempt = () => {
      const socket = createConnection({ port, host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) reject(new Error(`${timeoutMs}ms 内未就绪`))
        else setTimeout(attempt, 250)
      })
    }
    attempt()
  })
}

function killTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* 已经退出 */
    }
  }
}

/** 启动预览服务并接管：端口探测、健康检查、PID 文件、日志 */
export async function startPreview(
  projectDir,
  { command, args = [], shell = false, port = 5050, timeoutMs = 10000 } = {},
) {
  if (!command) {
    throw new CliError('缺少预览命令（--cmd 或配置 pptMaster.previewCommand）', EXIT.USAGE)
  }
  const existing = readPreview(projectDir)
  if (existing?.pid && isAlive(existing.pid)) {
    throw new CliError(`预览已在运行：${existing.url}（pid ${existing.pid}）`, EXIT.PREREQ)
  }

  const actualPort = await pickPort(port)
  const { file, log } = previewPaths(projectDir)
  mkdirSync(join(projectDir, '.run'), { recursive: true })

  const fd = openSync(log, 'a')
  const child = spawn(command, args, { shell, detached: true, stdio: ['ignore', fd, fd] })
  closeSync(fd)
  child.unref()

  try {
    await waitForPort(actualPort, timeoutMs)
  } catch (err) {
    killTree(child.pid)
    throw new CliError(`预览启动失败：${err.message}（日志：${log}）`, EXIT.IO)
  }

  const info = {
    pid: child.pid,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    command: [command, ...args].join(' '),
    startedAt: now(),
  }
  writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`, 'utf8')
  return info
}

export function previewStatus(projectDir) {
  const info = readPreview(projectDir)
  if (!info) return { running: false }
  if (!isAlive(info.pid)) {
    rmSync(previewPaths(projectDir).file, { force: true })
    return { ...info, running: false, stale: true }
  }
  return { ...info, running: true }
}

export function stopPreview(projectDir) {
  const info = readPreview(projectDir)
  if (!info) return { stopped: false }
  if (isAlive(info.pid)) killTree(info.pid)
  rmSync(previewPaths(projectDir).file, { force: true })
  return { stopped: true, pid: info.pid }
}
