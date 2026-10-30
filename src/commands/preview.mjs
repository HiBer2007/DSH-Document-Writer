import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { loadConfig } from '../core/state.mjs'
import { previewStatus, startPreview, stopPreview } from '../core/preview.mjs'
import { projectFromFlags } from './common.mjs'

export async function previewCommand(argv) {
  const [sub, ...rest] = argv
  const { flags } = parseArgs(rest)
  const { root, dir } = projectFromFlags(flags)
  const config = loadConfig(root)

  if (sub === 'start') {
    let command = typeof flags.cmd === 'string' ? flags.cmd : null
    let args = []
    let shell = false
    if (!command) {
      const list = config.pptMaster?.previewCommand
      if (Array.isArray(list) && list.length) {
        command = list[0]
        args = list.slice(1)
      }
    } else {
      shell = true
    }

    const port = Number(flags.port ?? config.pptMaster?.previewPort ?? 5050)
    const info = await startPreview(dir, { command, args, shell, port })
    if (flags.json) {
      console.log(JSON.stringify(info, null, 2))
      return EXIT.OK
    }
    console.log(`🌐 预览已启动：${info.url}（pid ${info.pid}，端口 ${info.port}）`)
    console.log(`   日志：${dir}\\.run\\preview.log`)
    return EXIT.OK
  }

  if (sub === 'status') {
    const info = previewStatus(dir)
    if (flags.json) {
      console.log(JSON.stringify(info, null, 2))
      return EXIT.OK
    }
    if (!info.running) {
      console.log(info.stale ? '⚠️ 预览已退出（pid 文件已清理）' : '预览未运行。')
      return EXIT.OK
    }
    console.log(`🌐 ${info.url} 运行中（pid ${info.pid}，端口 ${info.port}）`)
    return EXIT.OK
  }

  if (sub === 'stop') {
    const result = stopPreview(dir)
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2))
      return EXIT.OK
    }
    console.log(result.stopped ? `⏹️ 已停止预览（pid ${result.pid}）` : '预览未运行。')
    return EXIT.OK
  }

  throw new CliError(
    `preview 子命令未知：${sub ?? '(空)'}。可用：start、status、stop`,
    EXIT.USAGE,
  )
}
