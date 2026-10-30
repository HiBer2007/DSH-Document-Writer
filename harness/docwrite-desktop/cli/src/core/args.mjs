import { CliError, EXIT } from './errors.mjs'

/**
 * 极简参数解析：
 *   --key value / --key=value / --flag
 * 位置参数按顺序收集。
 */
export function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const body = arg.slice(2)
    if (!body) continue
    const eq = body.indexOf('=')
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1)
      continue
    }
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next
      i++
    } else {
      flags[body] = true
    }
  }
  return { positional, flags }
}

export function requirePositional(positional, index, usage) {
  const value = positional[index]
  if (!value) throw new CliError(usage, EXIT.USAGE)
  return value
}
