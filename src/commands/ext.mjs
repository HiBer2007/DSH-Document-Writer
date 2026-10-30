import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import {
  disableExtension,
  enableExtension,
  installExtension,
  listExtensions,
} from '../core/extensions.mjs'
import { appendEvent, saveState } from '../core/state.mjs'
import { projectFromFlags, rootFromFlags } from './common.mjs'

export async function extCommand(argv) {
  const [sub, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  const root = rootFromFlags(flags)

  if (sub === 'list') {
    const list = listExtensions(root)
    let enabled = []
    try {
      enabled = projectFromFlags(flags).state.extensions ?? []
    } catch {
      enabled = []
    }
    if (flags.json) {
      console.log(JSON.stringify({ extensions: list, enabled }, null, 2))
      return EXIT.OK
    }
    if (!list.length) {
      console.log('extensions/ 下没有扩展。')
      return EXIT.OK
    }
    for (const ext of list) {
      const mark = enabled.includes(ext.name) ? '✅' : '⬜'
      const bad = ext.errors?.length ? ` ⚠️ ${ext.errors.join('；')}` : ''
      console.log(`${mark} ${ext.name} ${ext.version ?? ''} ${ext.description ?? ''}${bad}`)
    }
    return EXIT.OK
  }

  if (sub === 'install') {
    const src = requirePositional(positional, 0, '用法：docwrite ext install <扩展目录>')
    const result = installExtension(root, src)
    console.log(`✅ 扩展已安装：${result.name}（默认未启用）`)
    return EXIT.OK
  }

  const { dir, state } = projectFromFlags(flags)
  if (sub === 'enable' || sub === 'disable') {
    const name = requirePositional(positional, 0, `用法：docwrite ext ${sub} <名称>`)
    const installed = listExtensions(root).find((ext) => ext.name === name)
    if (!installed) throw new CliError(`扩展不存在：${name}`, EXIT.PREREQ)
    if (installed.errors?.length) {
      throw new CliError(`扩展清单不合法：${installed.errors.join('；')}`, EXIT.CHECK)
    }
    if (sub === 'enable') enableExtension(state, name)
    else disableExtension(state, name)
    saveState(dir, state)
    appendEvent(dir, { type: `ext.${sub}`, name })
    console.log(`${sub === 'enable' ? '✅ 已启用' : '⏸️ 已停用'}：${name}`)
    return EXIT.OK
  }

  throw new CliError(
    `ext 子命令未知：${sub ?? '(空)'}。可用：list、install、enable、disable`,
    EXIT.USAGE,
  )
}
