import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { CliError, EXIT } from './errors.mjs'
import { now, sha256File, statusOf } from './state.mjs'

const PRIORITY = { '.docx': 0, '.pptx': 1, '.md': 2 }

function sanitize(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '-').trim() || 'document'
}

/** 交付：复制 build 成品到 deliver/，写 delivery-manifest.json */
export function deliverProject(projectDir, state, { to } = {}) {
  if (statusOf(state, 'S10') !== 'done') {
    throw new CliError('S10 终检未完成，不能交付（先 verify 并 stage done S10）', EXIT.PREREQ)
  }

  const buildDir = join(projectDir, 'build')
  if (!existsSync(buildDir)) throw new CliError('缺少 build/ 目录', EXIT.PREREQ)

  const files = readdirSync(buildDir).filter((file) => /\.(docx|pptx|md)$/i.test(file))
  if (!files.length) throw new CliError('build/ 下没有可交付文件（docx/pptx/md）', EXIT.PREREQ)

  let source
  if (to) {
    source = files.find((file) => extname(file).toLowerCase() === `.${to}`)
    if (!source) throw new CliError(`build/ 下没有 .${to} 文件`, EXIT.PREREQ)
  } else {
    source = [...files].sort(
      (a, b) => (PRIORITY[extname(a).toLowerCase()] ?? 9) - (PRIORITY[extname(b).toLowerCase()] ?? 9),
    )[0]
  }

  const deliverDir = join(projectDir, 'deliver')
  mkdirSync(deliverDir, { recursive: true })
  const target = join(deliverDir, `${sanitize(state.project)}${extname(source)}`)
  copyFileSync(join(buildDir, source), target)

  const manifest = {
    project: state.project,
    deliveredAt: now(),
    source: `build/${source}`,
    files: [
      {
        name: basename(target),
        sha256: sha256File(target),
        size: statSync(target).size,
      },
    ],
  }
  writeFileSync(
    join(deliverDir, 'delivery-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  return { target, manifest }
}

/** 交付 PDF：build 下的 docx → deliver/<项目>.pdf */
export async function deliverPdf(projectDir, state, { backend = 'auto', sofficePath } = {}) {
  if (statusOf(state, 'S10') !== 'done') {
    throw new CliError('S10 终检未完成，不能交付', EXIT.PREREQ)
  }
  const buildDir = join(projectDir, 'build')
  const docx = existsSync(buildDir)
    ? readdirSync(buildDir).find((file) => /\.docx$/i.test(file))
    : null
  if (!docx) throw new CliError('build/ 下没有 docx，无法导出 PDF', EXIT.PREREQ)

  const deliverDir = join(projectDir, 'deliver')
  mkdirSync(deliverDir, { recursive: true })
  const target = join(deliverDir, `${sanitize(state.project)}.pdf`)

  const { exportPdf } = await import('./pdf.mjs')
  const result = await exportPdf(join(buildDir, docx), target, { backend, sofficePath })

  const manifest = {
    project: state.project,
    deliveredAt: now(),
    source: `build/${docx}`,
    format: 'pdf',
    backend: result.backend,
    files: [
      { name: basename(target), sha256: sha256File(target), size: statSync(target).size },
    ],
  }
  writeFileSync(
    join(deliverDir, 'delivery-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  return { target, manifest, backend: result.backend }
}
