// 从 presets/docwrite/agent.cordis.yml 生成 Desktop bundle 的 preset 行。
//
// Desktop 的 agent-preset registry 在启动期挂载 preset；用 cordis-plugin-include
// 间接加载时，include 的子行在 audit 时还没有 fiber（“never started”），
// 会被标记为 broken，预设不会出现在工作模式选择器里。
// 因此把组合直接内联进 patch（与官方 standard/ptc/minimal/cordis 一致）。
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const agentPath = join(root, 'presets', 'docwrite', 'agent.cordis.yml')
const outPath = join(root, 'harness', 'docwrite-desktop', 'cordis.patch.yml')

const agent = readFileSync(agentPath, 'utf8').replace(/\r\n/g, '\n').trimEnd()
const indented = agent
  .split('\n')
  .map((line) => (line.length ? `          ${line}` : ''))
  .join('\n')

const patch = `# 由 scripts/sync-desktop-preset.mjs 从 presets/docwrite/agent.cordis.yml 生成；不要手改。
# 内联而不是 include：preset 在启动期挂载，include 的子行会被 audit 成 never started。
- insert:
    - id: preset-docwrite
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: docwrite
        name: "文档工坊"
        description: "12 阶段强制流水线：人工降重、独立评审、用户确认点；硬门禁不可跳步。"
        order: 6
        plugins:
${indented}

    - id: docwrite-harness
      name: '@local/dsh-docwrite'
`

writeFileSync(outPath, patch, 'utf8')
console.log(`wrote ${outPath}`)
