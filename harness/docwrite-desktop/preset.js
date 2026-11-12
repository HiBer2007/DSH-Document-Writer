// 仅在「文档工坊」预设内挂载：工具和门禁按 agent scope 注册，
// 不会出现在标准模式、极简模式等其他预设里。
import { apply as applyAll } from './index.js'

export const name = 'docwrite-tools'
export const inject = ['tools', 'subprocess', 'userQuestions', 'workingDirectory', 'sessions']

export function apply(ctx, config) {
  return applyAll(ctx, { ...config, mode: 'tools' })
}
