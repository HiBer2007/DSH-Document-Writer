// 把 docwrite CLI 的运行时（bin/src/rules）和 skill 库同步进 Desktop 插件包，
// 让插件作为独立包安装时不再依赖仓库根目录，也不读取安装机上的其他工作区。
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const target = join(root, 'harness', 'docwrite-desktop', 'cli')
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
for (const dir of ['bin', 'src', 'rules']) {
  cpSync(join(root, dir), join(target, dir), { recursive: true })
}

const skillsTarget = join(root, 'harness', 'docwrite-desktop', 'skills')
rmSync(skillsTarget, { recursive: true, force: true })
cpSync(join(root, '.dsh', 'skills'), skillsTarget, { recursive: true })

console.log(`synced ${target} and ${skillsTarget}`)
