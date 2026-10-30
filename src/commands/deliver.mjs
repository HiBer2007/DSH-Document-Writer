import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { deliverPdf, deliverProject } from '../core/deliver.mjs'
import { appendEvent, saveState } from '../core/state.mjs'
import { projectFromFlags } from './common.mjs'

export async function deliverCommand(argv) {
  const { flags } = parseArgs(argv)
  const { dir, state } = projectFromFlags(flags)
  const to = typeof flags.to === 'string' ? flags.to : undefined

  if (to && !['docx', 'pptx', 'md', 'pdf'].includes(to)) {
    throw new CliError(`--to 只支持 docx / pptx / md / pdf，收到：${to}`, EXIT.USAGE)
  }

  const result =
    to === 'pdf'
      ? await deliverPdf(dir, state, {
          backend: typeof flags.backend === 'string' ? flags.backend : undefined,
          sofficePath: typeof flags.soffice === 'string' ? flags.soffice : undefined,
        })
      : deliverProject(dir, state, { to })

  appendEvent(dir, { type: 'deliver', target: result.target, format: to ?? null })
  saveState(dir, state)

  if (flags.json) {
    console.log(JSON.stringify(result.manifest, null, 2))
    return EXIT.OK
  }
  console.log(`📦 已交付：${result.target}`)
  if (result.backend) console.log(`   PDF 后端：${result.backend}`)
  console.log('   清单：deliver/delivery-manifest.json')
  return EXIT.OK
}
