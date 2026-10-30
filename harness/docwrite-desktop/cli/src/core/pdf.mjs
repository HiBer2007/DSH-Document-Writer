import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { CliError, EXIT } from './errors.mjs'

const COMMON_SOFFICE = [
  'C:/Program Files/LibreOffice/program/soffice.exe',
  'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
]

/** 找 soffice：显式路径 → 常见安装位置 → PATH */
export function findSoffice(explicit) {
  if (explicit) return existsSync(explicit) ? explicit : null
  for (const path of COMMON_SOFFICE) {
    if (existsSync(path)) return path
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['soffice'], {
    encoding: 'utf8',
  })
  if (which.status === 0) {
    const first = which.stdout.split(/\r?\n/).find(Boolean)
    if (first) return first.trim()
  }
  return null
}

/** 尝试加载可选的 @deepseek-ai/libreoffice-kit */
export async function loadKit() {
  try {
    return await import('@deepseek-ai/libreoffice-kit')
  } catch {
    return null
  }
}

/**
 * 导出 PDF。后端链：kit（可选依赖）→ soffice（可选外部程序）。
 * kitModule 传入 undefined 表示按默认动态加载；传 null 表示禁用（测试用）。
 */
export async function exportPdf(
  inputPath,
  outputPath,
  { backend = 'auto', kitModule, sofficePath, timeoutMs = 120000 } = {},
) {
  if (!existsSync(inputPath)) throw new CliError(`找不到源文件：${inputPath}`, EXIT.IO)
  mkdirSync(dirname(outputPath), { recursive: true })
  const errors = []

  if (backend === 'auto' || backend === 'kit') {
    const kit = kitModule !== undefined ? kitModule : await loadKit()
    if (kit) {
      try {
        const converter = await kit.createConverter({ timeoutMs })
        try {
          await converter.render({ inputPath, outputPath })
        } finally {
          if (typeof converter.dispose === 'function') await converter.dispose()
        }
        if (existsSync(outputPath)) return { backend: 'kit', outputPath }
        errors.push('kit：没有产出文件')
      } catch (err) {
        errors.push(`kit：${err.message}`)
      }
    } else {
      errors.push('kit：未安装 @deepseek-ai/libreoffice-kit')
    }
  }

  if (backend === 'auto' || backend === 'soffice') {
    const soffice = findSoffice(sofficePath)
    if (soffice) {
      const outDir = dirname(outputPath)
      const result = spawnSync(
        soffice,
        ['--headless', '--convert-to', 'pdf', '--outdir', outDir, inputPath],
        { encoding: 'utf8', timeout: timeoutMs },
      )
      const produced = join(outDir, `${basename(inputPath).replace(/\.[^.]+$/, '')}.pdf`)
      if (result.status === 0) {
        if (produced !== outputPath && existsSync(produced)) renameSync(produced, outputPath)
        if (existsSync(outputPath)) return { backend: 'soffice', outputPath }
      }
      errors.push(`soffice：退出码 ${result.status} ${(result.stderr ?? '').slice(0, 200)}`)
    } else {
      errors.push('soffice：未找到（可用 --soffice 指定路径）')
    }
  }

  throw new CliError(
    `PDF 导出失败：${errors.join('；')}。可选：npm i @deepseek-ai/libreoffice-kit，或安装 LibreOffice`,
    EXIT.IO,
  )
}
