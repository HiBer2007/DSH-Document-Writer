#!/usr/bin/env node
// 迁移 OLD/projects 下的三个存量项目到新工作区结构。
// 只搬运与转换，不伪造流程状态；项目从 S8（成型）开始，等待用户继续。
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { initProject, projectDir } from '../src/core/project.mjs'
import { readDocument } from '../src/core/ooxml/docx.mjs'
import { readPptx } from '../src/core/ooxml/pptx.mjs'
import { docxToMarkdown, markdownToDocxBytes } from '../src/core/md.mjs'
import { fillFields } from '../src/core/docx-ops.mjs'

const root = process.cwd()
const OLD = join(root, 'OLD', 'projects')

function ensureProject(name, extra = {}) {
  const dir = projectDir(root, name)
  if (!existsSync(join(dir, '.run', 'state.json'))) {
    initProject({ root, name, scope: 'compose', reason: '迁移存量项目', ...extra })
  }
  return dir
}

function normalize(text) {
  return String(text).replace(/\s+/g, '')
}

function coverMap(doc) {
  const map = new Map()
  for (const paragraph of doc.paragraphs) {
    const text = normalize(paragraph.text)
    for (const label of ['姓名', '性别', '学历层次', '院系', '学号', '年级', '指导老师']) {
      if (text.startsWith(label) && !map.has(label)) map.set(label, text)
    }
  }
  return map
}

function migratePlan() {
  const name = '职业生涯规划书'
  const dir = ensureProject(name, { format: 'docx' })
  mkdirSync(join(dir, 'templates'), { recursive: true })
  mkdirSync(join(dir, 'legacy'), { recursive: true })

  const templateSrc = join(OLD, name, 'templates', '25级  职业生涯规划书模板.docx')
  const outputSrc = join(OLD, name, 'output', '250431220徐海博-职业生涯规划书.docx')
  copyFileSync(templateSrc, join(dir, 'templates', 'template.docx'))
  copyFileSync(outputSrc, join(dir, 'legacy', 'old-output.docx'))
  copyFileSync(join(OLD, name, '约束条件.md'), join(dir, '约束条件.md'))

  const legacy = readDocument(join(dir, 'legacy', 'old-output.docx'))
  writeFileSync(join(dir, 'draft.md'), docxToMarkdown(legacy), 'utf8')

  const fields = {
    '姓    名': '姓    名          徐海博',
    '性    别': '性    别          男',
    学历层次: '学历层次         本科',
    '院    系': '院    系          电子信息工程',
    '学    号': '学    号          250431220',
    '年    级': '年    级          2025级',
    指导老师: '指导老师         迪丽努尔·阿卜杜那斯尔',
  }
  fillFields(join(dir, 'templates', 'template.docx'), join(dir, 'build', 'cover-filled.docx'), fields)

  const filled = readDocument(join(dir, 'build', 'cover-filled.docx'))
  const oldCover = coverMap(legacy)
  const newCover = coverMap(filled)
  const rows = [...oldCover.keys()].map((label) => ({
    label,
    old: oldCover.get(label) ?? '(缺失)',
    next: newCover.get(label) ?? '(缺失)',
    same: oldCover.get(label) === newCover.get(label),
  }))
  const ok = rows.every((row) => row.same)

  const report = [
    `# 迁移报告：${name}`,
    '',
    `- 模板：templates/template.docx`,
    `- 旧产物：legacy/old-output.docx（${legacy.paragraphs.length} 段、${legacy.tables.length} 表）`,
    `- 迁移稿：draft.md`,
    `- 封面重填：build/cover-filled.docx`,
    '',
    '## 封面字段对比（去空白后逐项）',
    '',
    '| 字段 | 旧产物 | 新填充 | 一致 |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.label} | ${row.old} | ${row.next} | ${row.same ? '✅' : '❌'} |`),
    '',
    `结论：${ok ? '封面字段全部一致' : '存在差异，见上表'}`,
    '',
    '## 说明',
    '',
    '迁移只做到 S8 入口（成型），正文与降重由用户按 12 阶段流程继续。',
  ].join('\n')
  writeFileSync(join(dir, 'migration-report.md'), `${report}\n`, 'utf8')
  return { name, ok, paragraphs: legacy.paragraphs.length, tables: legacy.tables.length }
}

function migrateResume() {
  const name = '个人简历'
  const dir = ensureProject(name, { format: 'docx' })
  mkdirSync(join(dir, 'legacy'), { recursive: true })
  copyFileSync(
    join(OLD, '个人简历（26.7.4）', 'output', '徐海博-个人简历.docx'),
    join(dir, 'legacy', 'old-output.docx'),
  )
  copyFileSync(
    join(OLD, '个人简历（26.7.4）', '约束条件.md'),
    join(dir, '约束条件.md'),
  )

  const legacy = readDocument(join(dir, 'legacy', 'old-output.docx'))
  const markdown = docxToMarkdown(legacy)
  writeFileSync(join(dir, 'draft.md'), markdown, 'utf8')
  writeFileSync(join(dir, 'build', 'rebuilt.docx'), markdownToDocxBytes(markdown, { title: '徐海博' }))

  const rebuilt = readDocument(join(dir, 'build', 'rebuilt.docx'))
  const sections = ['个人信息', '教育背景', '技能特长', '兴趣爱好', '自我评价']
  const text = rebuilt.paragraphs.map((p) => p.text).join('\n')
  const found = sections.filter((section) => text.includes(section))

  const report = [
    `# 迁移报告：${name}`,
    '',
    `- 旧产物：legacy/old-output.docx（${legacy.paragraphs.length} 段）`,
    `- 迁移稿：draft.md`,
    `- md → docx 重建：build/rebuilt.docx（${rebuilt.paragraphs.length} 段）`,
    '',
    `## 章节检查：${found.length}/${sections.length}`,
    '',
    ...sections.map((section) => `- ${text.includes(section) ? '✅' : '❌'} ${section}`),
    '',
    '## 说明',
    '',
    '重建稿用于验证 from-md 能力，最终提交仍以旧产物为准，除非用户要求重排。',
  ].join('\n')
  writeFileSync(join(dir, 'migration-report.md'), `${report}\n`, 'utf8')
  return { name, sections: `${found.length}/${sections.length}`, paragraphs: legacy.paragraphs.length }
}

function migrateSpeech() {
  const name = '英语学术演讲'
  const dir = ensureProject(name, { format: 'pptx' })
  mkdirSync(join(dir, 'legacy'), { recursive: true })
  copyFileSync(
    join(OLD, name, 'output', '250431220徐海博Agentic_AI_Speech.pptx'),
    join(dir, 'legacy', 'deck.pptx'),
  )
  copyFileSync(join(OLD, name, '约束条件.md'), join(dir, '约束条件.md'))
  for (const file of ['Agentic_AI_Speech.md', 'Agentic_AI_Speech_CN.md', 'Agentic_AI_Speech_Architecture.md']) {
    const source = join(OLD, name, 'output', file)
    if (existsSync(source)) copyFileSync(source, join(dir, 'sources', file))
  }

  const deck = readPptx(join(dir, 'legacy', 'deck.pptx'))
  const report = [
    `# 迁移报告：${name}`,
    '',
    `- 旧 PPTX：legacy/deck.pptx（${deck.slideCount} 页，备注 ${deck.notesCount} 条）`,
    `- 演讲稿：sources/*.md`,
    '',
    '## 幻灯片首行',
    '',
    ...deck.slides.map((slide) => `- [${slide.index + 1}] ${slide.text.split('\n')[0] ?? ''}`),
    '',
    '## 说明',
    '',
    'PPT 只迁移文本层；版式与动画沿用旧文件，后续可用 preview 接管预览。',
  ].join('\n')
  writeFileSync(join(dir, 'migration-report.md'), `${report}\n`, 'utf8')
  return { name, slides: deck.slideCount, notes: deck.notesCount }
}

const results = [migratePlan(), migrateResume(), migrateSpeech()]
console.log('迁移完成：')
for (const result of results) {
  console.log(`  - ${result.name}：${JSON.stringify(result)}`)
}
