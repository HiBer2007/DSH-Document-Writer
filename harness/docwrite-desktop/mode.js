import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/**
 * 文档修改模式：只在「文档工坊」预设内使用。
 * 等级越高，自动许可越多，危险性越高；1 是默认的完全人工。
 */
export const DOC_MODES = [
  {
    level: 1,
    key: 'manual',
    label: '完全人工审阅',
    short: '人工',
    description: '所有轮次追加、阶段验收和确认点都由你决定。',
    danger: false,
  },
  {
    level: 2,
    key: 'auto-round',
    label: '自动许可轮次增加',
    short: '轮次+',
    description: '评审轮次用满后自动追加 1 轮；其他验收和 U 确认仍问你。',
    danger: false,
  },
  {
    level: 3,
    key: 'auto-reduce',
    label: '自动许可降重审阅',
    short: '降重',
    description: '包含 2；S7 降重验收和 U0–U7 确认自动通过；强制问询仍会中断。',
    danger: false,
  },
  {
    level: 4,
    key: 'notify-only',
    label: '仅通知模型要求的审阅',
    short: '通知',
    description:
      '包含 3；常规验收和 U 确认自动通过，只有强制暂停/强制问询或子代理确认后的 block 才停。',
    danger: true,
    warning:
      '模式 4 会跳过常规验收和 U 确认。只有模型主动调用「强制暂停审阅」「强制问询」或经子代理确认的 block 时才会暂停；如果模型不调用，你可能看不到中间审阅。',
  },
  {
    level: 5,
    key: 'auto',
    label: '全自动许可（auto mode）',
    short: '全自动',
    description:
      '所有确认点、U 确认、轮次和验收都自动通过；强制问询也选默认项，只有通用 question 和子代理确认后的 block 仍会中断。',
    danger: true,
    warning:
      '模式 5 会自动通过所有文档确认点、U 确认和验收，模型可以连续执行到交付；强制问询也会直接采用默认项。只有通用 question 和经子代理确认的 block 仍会正常中断；请只在完全信任当前任务时使用。',
  },
]

export const DEFAULT_DOC_MODE = 1

export function normalizeMode(value, fallback = DEFAULT_DOC_MODE) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : fallback
}

export function modeInfo(level) {
  const normalized = normalizeMode(level)
  return DOC_MODES.find((mode) => mode.level === normalized) ?? DOC_MODES[0]
}

export function modeAtLeast(level, minimum) {
  return normalizeMode(level) >= minimum
}

/** 模式文件按 profile 保存；测试可用 DOCWRITE_MODE_FILE 覆盖。 */
export function modeFilePath() {
  if (process.env.DOCWRITE_MODE_FILE) return process.env.DOCWRITE_MODE_FILE
  const base =
    process.env.DSH_PROFILE_DIR ||
    process.env.DSH_HOME ||
    join(homedir(), '.dsh')
  return join(base, 'docwrite-modes.json')
}

function readStore() {
  const file = modeFilePath()
  if (!existsSync(file)) return { version: 1, modes: {} }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const modes = {}
    for (const [session, value] of Object.entries(parsed?.modes ?? {})) {
      const mode =
        typeof value === 'number' ? value : Number(value?.mode ?? value)
      if (Number.isInteger(mode) && mode >= 1 && mode <= 5) {
        modes[session] = {
          mode,
          updatedAt: value?.updatedAt ?? null,
        }
      }
    }
    return { version: 1, modes }
  } catch {
    return { version: 1, modes: {} }
  }
}

function writeStore(store) {
  const file = modeFilePath()
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
}

export function getSessionMode(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return DEFAULT_DOC_MODE
  return normalizeMode(readStore().modes[sessionId]?.mode ?? DEFAULT_DOC_MODE)
}

export function setSessionMode(sessionId, mode) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('session 不能为空')
  }
  const normalized = normalizeMode(mode, 0)
  if (!normalized) throw new Error('文档修改模式必须是 1–5')
  const store = readStore()
  store.modes[sessionId] = { mode: normalized, updatedAt: new Date().toISOString() }
  writeStore(store)
  return normalized
}
