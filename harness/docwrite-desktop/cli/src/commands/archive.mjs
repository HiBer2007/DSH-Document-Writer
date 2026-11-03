import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { setArchived } from '../core/archive.mjs'
import { projectFromFlags } from './common.mjs'

export async function archiveCommand(argv, archived = true) {
  const [first, ...rest] = argv
  const { flags } = parseArgs(rest)
  const project = first && !first.startsWith('--') ? first : flags.project
  if (!project) {
    throw new CliError(
      '用法：docwrite archive <项目名> [--reason "..."] | docwrite unarchive <项目名>',
      EXIT.USAGE,
    )
  }
  const { dir } = projectFromFlags({ ...flags, project })
  const meta = setArchived(dir, archived, {
    by: 'user',
    reason: typeof flags.reason === 'string' ? flags.reason : '',
  })
  if (flags.json) {
    console.log(JSON.stringify(meta, null, 2))
  } else if (archived) {
    console.log(`已归档：${project}（数据保留，可用 docwrite unarchive ${project} 恢复）`)
  } else {
    console.log(`已恢复：${project}`)
  }
  return EXIT.OK
}
