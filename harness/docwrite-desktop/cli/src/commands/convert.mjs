import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs, requirePositional } from '../core/args.mjs'
import { markdownToDocxBytes } from '../core/md.mjs'

export async function fromMdCommand(argv) {
  const { positional, flags } = parseArgs(argv)
  const usage = '用法：docwrite from-md <输入.md> <输出.docx> [--title "..."]'
  const input = requirePositional(positional, 0, usage)
  const output = requirePositional(positional, 1, usage)

  let markdown
  try {
    markdown = readFileSync(resolve(input), 'utf8')
  } catch (err) {
    throw new CliError(`读不到文件：${input}（${err.code ?? err.message}）`, EXIT.IO)
  }

  const bytes = markdownToDocxBytes(markdown, {
    title: typeof flags.title === 'string' ? flags.title : undefined,
  })
  writeFileSync(resolve(output), bytes)
  console.log(`✅ 已生成：${resolve(output)}`)
  return EXIT.OK
}
