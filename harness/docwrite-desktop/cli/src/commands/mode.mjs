import { resolve } from 'node:path'
import { CliError, EXIT } from '../core/errors.mjs'
import { parseArgs } from '../core/args.mjs'
import {
  installMode,
  installProfileMode,
  modeStatus,
  profileModeStatus,
  uninstallMode,
  uninstallProfileMode,
} from '../core/mode.mjs'
import { rootFromFlags } from './common.mjs'

export async function modeCommand(argv) {
  const [sub, ...rest] = argv
  const { flags } = parseArgs(rest)
  const root = rootFromFlags(flags)
  const dshHome = typeof flags['dsh-home'] === 'string' ? resolve(flags['dsh-home']) : undefined
  const profile = typeof flags.profile === 'string' ? flags.profile : null

  if (sub === 'install') {
    const global = installMode(root, { dshHome })
    const profileResult = profile ? installProfileMode(root, { dshHome, profile }) : null

    if (flags.json) {
      console.log(JSON.stringify({ global, profile: profileResult }, null, 2))
      return EXIT.OK
    }
    console.log(`✅ 全局预设已安装：${global.dest}`)
    if (global.backup) console.log(`   旧版本已备份：${global.backup}`)
    if (profileResult) {
      if (profileResult.bundled) {
        console.log(`✅ profile「${profile}」的「文档工坊」由 bundle 提供：@local/dsh-docwrite`)
        console.log('   无需再写 preset 行；升级见 harness/docwrite-desktop/README.md')
      } else {
        console.log(`✅ profile「${profile}」已注册：${profileResult.declaration}（${profileResult.patch}）`)
        console.log(
          profileResult.replaced
            ? '   已把旧的动态注册替换为声明式 preset 行'
            : '   已追加声明式 preset 行',
        )
        if (profileResult.legacyRemoved) console.log('   已清理旧的 docwrite-preset.mjs')
        if (profileResult.backup) console.log(`   patch 备份：${profileResult.backup}`)
        console.log('   重启该 profile 后，/preset 里会出现「文档工坊」')
      }
    } else {
      console.log('   切换：新会话里 /preset docwrite')
    }
    return EXIT.OK
  }

  if (sub === 'status') {
    const global = modeStatus(root, { dshHome })
    const profileInfo = profile ? profileModeStatus(root, { dshHome, profile }) : null
    if (flags.json) {
      console.log(JSON.stringify({ global, profile: profileInfo }, null, 2))
      return EXIT.OK
    }
    console.log(
      global.installed
        ? `✅ 全局预设：${global.dest}（${global.name}）`
        : `⬜ 全局预设未安装：${global.dest}`,
    )
    if (profileInfo) {
      console.log(
        profileInfo.installed
          ? profileInfo.bundled
            ? `✅ profile「${profile}」：由 bundle @local/dsh-docwrite 提供`
            : `✅ profile「${profile}」：已注册声明式预设（${profileInfo.patch}）`
          : `⬜ profile「${profile}」：未注册（${profileInfo.patch}）`,
      )
    }
    return EXIT.OK
  }

  if (sub === 'uninstall') {
    const global = uninstallMode(root, { dshHome })
    const profileResult = profile ? uninstallProfileMode(root, { dshHome, profile }) : null
    if (flags.json) {
      console.log(JSON.stringify({ global, profile: profileResult }, null, 2))
      return EXIT.OK
    }
    console.log(global.removed ? `⏏️ 已卸载全局预设：${global.dest}` : '全局预设未安装。')
    if (profileResult) {
      if (profileResult.bundled) {
        console.log(`profile「${profile}」的「文档工坊」由 bundle 提供；卸载请用 plugin_manager remove_bundle。`)
      } else {
        console.log(
          profileResult.removed
            ? `⏏️ 已从 profile「${profile}」移除`
            : `profile「${profile}」没有 docwrite 注册`,
        )
      }
    }
    return EXIT.OK
  }

  throw new CliError(
    `mode 子命令未知：${sub ?? '(空)'}。可用：install、status、uninstall（可加 --profile dsh-tui）`,
    EXIT.USAGE,
  )
}
