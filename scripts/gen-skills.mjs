#!/usr/bin/env node
// 生成 .dsh/skills/docwrite*/SKILL.md 与 skills/registry.json。
// 内容按阶段固化，避免手写漂移。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const SKILLS = [
  {
    id: 'docwrite',
    stage: null,
    name: '文档工坊入口',
    gate: null,
    approval: null,
    requires: [],
    produces: [],
    commands: ['docwrite status', 'docwrite next', 'docwrite dispatch'],
    description: '文档工坊总入口：12 阶段流水线、硬门禁、用户确认点、人工降重与独立评审。',
    when: '用户提出任何文档任务（论文、作业、简历、报告、演示文稿）时先读本 skill。',
    inputs: ['用户任务描述', '项目目录'],
    steps: [
      '`docwrite status` 看当前阶段；没有项目就先 `docwrite init`',
      '`docwrite next` 拿下一阶段、skill、待确认点',
      '按 `dispatch <stage>` 返回的 skill 工作，不许跳阶段',
    ],
    criteria: ['每步都有 CLI 记录', '阶段完成由 `stage done` 判定'],
    failure: ['pendingApproval 非空：先问用户', 'blocked：先 unblock 或问用户'],
    confirm: '任何阶段推进前，先确认 pendingApproval。',
  },
  {
    id: 'docwrite-intake',
    stage: 'S0',
    name: '受理',
    gate: 'soft',
    approval: 'U0',
    requires: [],
    produces: ['brief.md'],
    commands: ['docwrite init', 'docwrite status', 'docwrite next'],
    description: '受理阶段：把请求变成任务卡，确定交付物、截止、模板、提交方式与作用域。',
    when: '新任务开始，或任务卡字段不全。',
    inputs: ['用户原话', '附件与模板'],
    steps: [
      '`docwrite init <项目> [--scope ...] [--deadline ...] [--template ...]`',
      '用 edit 补全 brief.md 的提交方式等字段',
      '`docwrite status` 复核，`docwrite next` 看 U0',
    ],
    criteria: ['交付物、截止、模板、提交方式 4 项齐全', 'scope 与入口阶段符合用户意图'],
    failure: ['信息缺失：问用户，不许编造截止时间与提交方式'],
    confirm: '把任务卡念给用户，确认后 `docwrite approve U0 --by user --quote "..."`',
  },
  {
    id: 'docwrite-constraints',
    stage: 'S1',
    name: '约束',
    gate: 'hard',
    approval: 'U1',
    requires: ['S0'],
    produces: ['constraints.json'],
    commands: ['docwrite stage done'],
    description: '约束阶段：把考试说明、模板、平台限制合并成 constraints.json。',
    when: '进入 S1，或发现约束有遗漏。',
    inputs: ['brief.md', '模板', '指导手册', '全局约束'],
    steps: [
      '用 edit 写 `constraints.json`：`{"items":[{"id","type","priority","source","check"}]}`',
      '冲突必须写 `resolution` 字段',
      '`docwrite stage done S1`',
    ],
    criteria: ['items 非空', '每条有 source/type/priority', '冲突有裁决记录'],
    failure: ['冲突无法裁决：列选项问用户'],
    confirm: '把约束清单给用户确认，`approve U1 --by user --quote "..."`',
  },
  {
    id: 'docwrite-spec',
    stage: 'S2',
    name: '规格',
    gate: 'hard',
    approval: 'U2',
    requires: ['S1'],
    produces: ['spec.md'],
    commands: ['docwrite stage done'],
    description: '规格阶段：章节树、字数预算、格式、引用、评分点映射。',
    when: '进入 S2。',
    inputs: ['constraints.json'],
    steps: ['用 edit 写 `spec.md`（章节树 + 每章字数预算 + 格式/引用）', '`docwrite stage done S2`'],
    criteria: ['章节树非空', '每章有字数预算', '评分点至少映射 1 章'],
    failure: ['章节与评分点对不上：回 S1 补约束'],
    confirm: '方向给用户确认，`approve U2 --by user --quote "..."`',
  },
  {
    id: 'docwrite-source',
    stage: 'S3',
    name: '素材',
    gate: 'soft',
    approval: null,
    requires: ['S1'],
    produces: ['sources/index.json'],
    commands: ['docwrite source add', 'docwrite source declare', 'docwrite source status', 'docwrite stage done'],
    description: '素材阶段：资料入库、来源记账；允许后补。',
    when: '进入 S3，或写作中发现缺资料。',
    inputs: ['用户提供的文件', '指导手册'],
    steps: [
      '`docwrite source add <文件>` 入库',
      '缺的用 `docwrite source declare "名称"` 登记待补',
      '`docwrite source status` 看 pending',
      '`docwrite stage done S3`',
    ],
    criteria: ['index.json 有 entries', 'pending 清单可见'],
    failure: ['无法转换：标 unreadable，不静默丢'],
    confirm: '待补清单给用户过目。',
  },
  {
    id: 'docwrite-outline',
    stage: 'S4',
    name: '提纲',
    gate: 'soft',
    approval: 'U3',
    requires: ['S2'],
    produces: ['outline.md'],
    commands: ['docwrite stage done'],
    description: '提纲阶段：每节要点、论据、数据、引用占位。',
    when: '进入 S4。',
    inputs: ['spec.md', 'sources/'],
    steps: ['用 edit 写 `outline.md`', '`docwrite stage done S4`'],
    criteria: ['覆盖 spec 全部章节', '每节 ≥1 论据'],
    failure: ['覆盖不全：列缺口补'],
    confirm: '提纲给用户确认，`approve U3 --by user --quote "..."`',
  },
  {
    id: 'docwrite-draft',
    stage: 'S5',
    name: '初稿',
    gate: 'soft',
    approval: null,
    requires: ['S4'],
    produces: ['draft.md'],
    commands: ['docwrite stage done'],
    description: '初稿阶段：只写 Markdown，不转 docx。',
    when: '进入 S5，或需要改稿。',
    inputs: ['outline.md', 'sources/'],
    steps: ['用 edit 写 `draft.md`（纯 md）', '`docwrite stage done S5`'],
    criteria: ['标题集合 = outline 章节', '字数在预算 ±20%', '无 TODO 占位'],
    failure: ['缺章/超字数：定位到章节补'],
    confirm: '初稿完成告诉用户，不自行转格式。',
  },
  {
    id: 'docwrite-review-content',
    stage: 'S6',
    name: '内容评审',
    gate: 'hard',
    approval: 'U4',
    requires: ['S5'],
    produces: ['review-content.json'],
    commands: ['docwrite review open', 'docwrite review submit', 'docwrite stage done'],
    description: '内容评审：独立子代理按 rubric 评覆盖度、逻辑、事实、引用、语体。',
    when: '进入 S6。',
    inputs: ['draft.md', 'spec.md', 'constraints.json'],
    steps: [
      '`docwrite review open --stage S6 --doc draft.md`',
      '派 subagent（新上下文）读 prompt，写 review.json',
      '`docwrite review submit --id <id>`',
      '`docwrite approve U4 --by user --quote "..."`',
      '`docwrite stage done S6`',
    ],
    criteria: ['verdict=pass', 'reviewer=subagent', 'issues 可执行'],
    failure: ['revise：按 issues 回 S4/S5；reject：blocked'],
    confirm: '把评审结论与 issue 给用户，确认 U4。',
  },
  {
    id: 'docwrite-reduce',
    stage: 'S7',
    name: '降重',
    gate: 'soft',
    approval: 'U5',
    requires: ['S6'],
    produces: ['draft_reduced.md', 'reduce-report.json', 'human-review.json'],
    commands: ['docwrite scan', 'docwrite suggest', 'docwrite diff', 'docwrite review open', 'docwrite review submit', 'docwrite stage done'],
    description: '降重阶段：模型亲手逐段 edit，三轴（AI 率 / AI 味 / 机器味）同时达标。',
    when: '进入 S7，或用户要求降 AI 味。',
    inputs: ['draft.md', 'review-content.json'],
    steps: [
      '`docwrite scan draft.md --json` 看热点',
      '复制 draft.md 为 draft_reduced.md',
      '**用 edit 工具逐段改**，禁止脚本批量替换',
      '每批 `docwrite diff draft.md draft_reduced.md --checkpoint`',
      '`docwrite review open --stage S7 --doc draft_reduced.md`，派 subagent 评审',
      '`docwrite review submit --id <id>`',
      '`docwrite approve U4` 后 `docwrite stage done S7`',
    ],
    criteria: ['修改率 ≥ 40%', '检查点 ≥3', '三轴 ≤ 阈值', 'reviewer=subagent'],
    failure: ['三轴超标：继续 edit；不许改阈值、不许换脚本'],
    confirm: '降重前后对比与三轴分数给用户，确认 U4。',
  },
  {
    id: 'docwrite-compose',
    stage: 'S8',
    name: '成型',
    gate: 'hard',
    approval: 'U6',
    requires: ['S7'],
    produces: ['build'],
    commands: ['docwrite docx fill', 'docwrite docx md', 'docwrite from-md', 'docwrite pptx fill', 'docwrite ppt build', 'docwrite stage done'],
    description: '成型阶段：唯一允许把 Markdown 转成 docx/pptx 的地方。',
    when: 'S7 完成且用户确认转换。',
    inputs: ['draft_reduced.md', '模板'],
    steps: [
      '`docwrite approve U6 --by user --quote "..."`',
      '`docwrite docx fill <模板> build/x.docx --fields-file cover.json`',
      '或 `docwrite from-md draft_reduced.md build/x.docx`',
      '或 `docwrite ppt build <ppt-master 项目> --out build/x.pptx`',
      '`docwrite stage done S8`',
    ],
    criteria: ['占位符 = 0', '样式未破坏', '字数/页数符合 spec'],
    failure: ['占位符残留：列清单修完重跑'],
    confirm: '转换前必须 U6 确认。',
  },
  {
    id: 'docwrite-review-form',
    stage: 'S9',
    name: '形式评审',
    gate: 'hard',
    approval: 'U4',
    requires: ['S8'],
    produces: ['review-form.json'],
    commands: ['docwrite review open', 'docwrite review submit', 'docwrite stage done'],
    description: '形式评审：字号、行距、页边距、标题层级、页码、图表编号、命名。',
    when: '进入 S9。',
    inputs: ['build/*.docx|pptx'],
    steps: [
      '`docwrite review open --stage S9 --doc build/x.docx`',
      '按 rubric 检查（可用 reviewer=cli）',
      '`docwrite review submit --id <id>`',
      '`docwrite approve U4` 后 `docwrite stage done S9`',
    ],
    criteria: ['verdict=pass', '命名合规', '页数/字号符合 spec'],
    failure: ['revise：回 S8（排版）或 S5（内容）'],
    confirm: '形式问题清单给用户。',
  },
  {
    id: 'docwrite-verify',
    stage: 'S10',
    name: '终检',
    gate: 'hard',
    approval: 'U4',
    requires: ['S9'],
    produces: ['verify-report.md'],
    commands: ['docwrite verify', 'docwrite stage done'],
    description: '终检：全部硬约束、哈希、扩展检查，出 PASS/FAIL 报告。',
    when: '进入 S10。',
    inputs: ['全部已完成阶段的产物'],
    steps: ['`docwrite verify`', '报告 PASS 后 `docwrite approve U4`', '`docwrite stage done S10`'],
    criteria: ['verify 返回 PASS', '无 stale', '扩展 blocking 检查通过'],
    failure: ['FAIL：按报告回 S5/S7/S8；reject：blocked'],
    confirm: '报告给用户，确认 U4。',
  },
  {
    id: 'docwrite-deliver',
    stage: 'S11',
    name: '交付',
    gate: 'hard',
    approval: 'U7',
    requires: ['S10'],
    produces: ['deliver'],
    commands: ['docwrite deliver', 'docwrite stage done'],
    description: '交付：复制成品到 deliver/，写 delivery-manifest.json。',
    when: 'S10 完成且用户确认交付。',
    inputs: ['build/ 成品', 'verify-report.md'],
    steps: ['`docwrite approve U7 --by user --quote "..."`', '`docwrite deliver`', '`docwrite stage done S11`'],
    criteria: ['deliver/ 有文件', 'manifest 有哈希', 'S10 PASS'],
    failure: ['导出失败：报错并保留中间产物'],
    confirm: '交付清单给用户，确认 U7。',
  },
]

function frontmatter(skill) {
  const lines = ['---', `name: ${skill.id}`, `description: ${skill.description}`, `whenToUse: ${skill.when}`, 'metadata:']
  if (skill.stage) lines.push(`  stage: ${skill.stage}`)
  lines.push(`  kind: ${skill.stage ? 'core' : 'entry'}`)
  if (skill.gate) lines.push(`  gate: ${skill.gate}`)
  if (skill.approval) lines.push(`  approval: ${skill.approval}`)
  lines.push(`  requires: [${skill.requires.join(', ')}]`)
  lines.push(`  produces: [${skill.produces.map((p) => `"${p}"`).join(', ')}]`)
  lines.push(`  commands: [${skill.commands.map((c) => `"${c}"`).join(', ')}]`)
  lines.push('---', '')
  return lines.join('\n')
}

function body(skill) {
  const lines = []
  lines.push(`# ${skill.stage ? `${skill.stage} ` : ''}${skill.name}`, '')
  lines.push('## 输入', '')
  for (const input of skill.inputs) lines.push(`- ${input}`)
  lines.push('', '## 命令', '')
  skill.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`))
  lines.push('', '## 完成判据', '')
  for (const criterion of skill.criteria) lines.push(`- ${criterion}`)
  lines.push('', '## 失败怎么办', '')
  for (const item of skill.failure) lines.push(`- ${item}`)
  lines.push('', '## 请求确认', '')
  lines.push(`- ${skill.confirm}`)
  lines.push('')
  return lines.join('\n')
}

for (const skill of SKILLS) {
  const dir = join(root, '.dsh', 'skills', skill.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `${frontmatter(skill)}${body(skill)}`, 'utf8')
}

const registry = {
  version: 2,
  skills: SKILLS.map((skill) => ({
    id: skill.id,
    stage: skill.stage,
    gate: skill.gate,
    approval: skill.approval,
    requires: skill.requires,
    produces: skill.produces,
    commands: skill.commands,
    path: `.dsh/skills/${skill.id}/SKILL.md`,
  })),
  routes: [
    { when: '新文档', entry: 'S0', skill: 'docwrite-intake' },
    { when: '只查重', entry: 'S7', skill: 'docwrite-reduce', scope: 'scan' },
    { when: '只改一段', entry: 'S5', skill: 'docwrite-draft', scope: 'revise' },
    { when: '只转格式', entry: 'S8', skill: 'docwrite-compose', scope: 'compose' },
    { when: '只校验', entry: 'S10', skill: 'docwrite-verify', scope: 'verify' },
    { when: '做 PPT', entry: 'S8', skill: 'docwrite-compose', scope: 'compose' },
  ],
}
mkdirSync(join(root, 'skills'), { recursive: true })
writeFileSync(join(root, 'skills', 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8')

console.log(`已生成 ${SKILLS.length} 个 skill 与 skills/registry.json`)
