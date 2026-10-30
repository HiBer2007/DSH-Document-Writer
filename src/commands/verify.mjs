import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import { loadConfig, statusOf } from '../core/state.mjs'
import { verifyProject, writeVerifyReport } from '../core/verify.mjs'
import { projectFromFlags } from './common.mjs'

export async function verifyCommand(argv) {
  const { flags } = parseArgs(argv)
  const { root, dir, state } = projectFromFlags(flags)
  const config = loadConfig(root)

  const stage = statusOf(state, 'S10')
  if (stage !== 'active' && stage !== 'done') {
    throw new CliError('当前不在 S10 终检阶段（先 docwrite stage enter S10）', EXIT.PREREQ)
  }

  const result = verifyProject(dir, state, config, { root })
  writeVerifyReport(dir, state.project, result)

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`🔍 终检：${result.ok ? 'PASS' : 'FAIL'}`)
    console.log(`   PASS ${result.passed} ｜ WAIVED ${result.waived} ｜ FAIL ${result.failed}`)
    for (const row of result.results) {
      if (row.status === 'FAIL') console.log(`   ❌ ${row.id} ${row.name}：${row.errors.join('；')}`)
    }
    for (const ext of result.extensions) {
      console.log(`   ${ext.status === 'PASS' ? '✅' : ext.status === 'WARN' ? '⚠️' : '❌'} 扩展 ${ext.name}：${ext.status}`)
    }
    console.log(`   报告：${dir}\\verify-report.md`)
  }
  return result.ok ? EXIT.OK : EXIT.CHECK
}
