import { resolve } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import { loadConfig } from '../core/state.mjs'
import { exportPdf } from '../core/pdf.mjs'
import { rootFromFlags } from './common.mjs'

export async function pdfCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const input = requirePositional(
    positional,
    0,
    '用法：docwrite pdf <文件.docx> [输出.pdf] [--backend auto|kit|soffice] [--soffice <路径>]',
  )
  const output = positional[1] ?? input.replace(/\.(docx?|pptx)$/i, '.pdf')
  const root = rootFromFlags(flags)
  const config = loadConfig(root)
  const backend = typeof flags.backend === 'string' ? flags.backend : config.pdf?.backend ?? 'auto'

  if (!['auto', 'kit', 'soffice'].includes(backend)) {
    throw new CliError(`--backend 只支持 auto / kit / soffice，收到：${backend}`, EXIT.USAGE)
  }

  const result = await exportPdf(resolve(input), resolve(output), {
    backend,
    sofficePath: typeof flags.soffice === 'string' ? flags.soffice : undefined,
    timeoutMs: flags.timeout ? Number(flags.timeout) : undefined,
  })

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    return EXIT.OK
  }
  console.log(`✅ PDF 已生成：${result.outputPath}（后端 ${result.backend}）`)
  return EXIT.OK
}
