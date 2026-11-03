import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'

export const UPDATE_REPO = 'HiBer2007/DSH-Document-Writer'

export function compareVersions(left, right) {
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

function readVersion() {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
  } catch {
    return '0.0.0'
  }
}

function ghRelease(repo) {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      ['api', `repos/${repo}/releases/latest`],
      { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new CliError((stderr || error.message || 'gh 调用失败').trim(), EXIT.IO))
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
        reject(new CliError('gh 返回的不是 JSON', EXIT.IO))
      },
    )
  })
}

/** 查 GitHub 最新 Release；只读，不自动安装。 */
export async function checkForUpdate({
  repo = UPDATE_REPO,
  current = readVersion(),
  fetchImpl = globalThis.fetch,
} = {}) {
  let release
  if (typeof fetchImpl !== 'function') {
    release = await ghRelease(repo)
  } else {
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': `docwrite/${current}`,
        },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new CliError(`GitHub API ${response.status}`, EXIT.IO)
      release = await response.json()
    } catch (err) {
      // 测试里注入的 fetchImpl 不兜底；真实 fetch 失败时用 gh。
      if (fetchImpl !== globalThis.fetch) throw err
      release = await ghRelease(repo)
    }
  }
  const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
  if (!tag) throw new CliError('GitHub 没有返回 release tag', EXIT.IO)
  const latest = tag.replace(/^v/i, '')
  return {
    ok: true,
    current,
    latest,
    tag,
    updateAvailable: compareVersions(latest, current) > 0,
    name: release.name ?? tag,
    url: release.html_url ?? `https://github.com/${repo}/releases/tag/${tag}`,
    publishedAt: release.published_at ?? null,
    notes: typeof release.body === 'string' ? release.body.slice(0, 4000) : '',
  }
}

export async function updateCommand(argv = []) {
  const { flags } = parseArgs(argv)
  try {
    const result = await checkForUpdate()
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2))
    } else if (result.updateAvailable) {
      console.log(`发现新版本 ${result.tag}（当前 ${result.current}）：${result.url}`)
    } else {
      console.log(`已是最新版本：${result.current}`)
    }
    return EXIT.OK
  } catch (err) {
    const message = err?.message ?? String(err)
    if (flags.json) {
      console.log(JSON.stringify({ ok: false, current: readVersion(), error: message }, null, 2))
    } else {
      console.error(`检查更新失败：${message}`)
    }
    return EXIT.IO
  }
}
