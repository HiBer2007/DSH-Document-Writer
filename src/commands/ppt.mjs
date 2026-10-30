import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { loadConfig } from '../core/state.mjs'
import { buildCommands, runCommands } from '../core/ppt.mjs'
import { rootFromFlags } from './common.mjs'

export async function pptCommand(argv) {
  const [sub, ...rest] = argv
  const { positional, flags } = parseArgs(rest)
  const root = rootFromFlags(flags)
  const config = loadConfig(root)

  const commands = buildCommands({ sub, positional, flags })
  const result = runCommands(root, config, commands, { dryRun: Boolean(flags['dry-run']) })

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    return EXIT.OK
  }
  if (result.dryRun) {
    console.log('（dry-run）将执行：')
    for (const line of result.commands) console.log(`  ${line}`)
    return EXIT.OK
  }
  console.log(`✅ ppt ${sub} 完成`)
  return EXIT.OK
}
