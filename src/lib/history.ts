import type { HistoryItem } from './types'
import type { Lang } from './i18n'
import { parseInput } from './parser'
import { analyzeMatches } from './engine'

export type DateFilter = 'today' | '7d' | 'all'

export const filterHistory = (items: HistoryItem[], dateFilter: DateFilter, keyword: string) => {
  const now = Date.now()
  const kw = keyword.trim().toLowerCase()

  return items.filter((item) => {
    const ts = new Date(item.createdAt).getTime()
    const byDate =
      dateFilter === 'all'
        ? true
        : dateFilter === 'today'
          ? new Date(item.createdAt).toDateString() === new Date().toDateString()
          : now - ts <= 7 * 24 * 60 * 60 * 1000

    const byKeyword =
      !kw ||
      item.inputText.toLowerCase().includes(kw) ||
      item.outputText.toLowerCase().includes(kw)

    return byDate && byKeyword
  })
}

export const buildExportText = (item: HistoryItem, lang: Lang = 'zh') => {
  const isZh = lang === 'zh'
  return [
    `${isZh ? '时间' : 'Time'}: ${new Date(item.createdAt).toLocaleString(isZh ? 'zh-CN' : 'en-US')}`,
    `${isZh ? '解析场次' : 'Parsed matches'}: ${item.parsedCount}`,
    '',
    isZh ? '--- 输入 ---' : '--- INPUT ---',
    item.inputText,
    '',
    isZh ? '--- 参数 ---' : '--- CONFIG ---',
    JSON.stringify(item.configSnapshot, null, 2),
    '',
    isZh ? '--- 输出 ---' : '--- OUTPUT ---',
    item.outputText,
    '',
  ].join('\n')
}

export const buildFallbackDigest = (reason: string, lang: Lang = 'zh', nowIso?: string) => {
  const ts = nowIso ?? new Date().toISOString()
  return lang === 'zh'
    ? `错误摘要: ${reason || 'unknown'} | 语言: zh | 时间: ${ts}`
    : `Error summary: ${reason || 'unknown'} | lang: en | time: ${ts}`
}

export const normalizeMaskLevel = (value: string | null | undefined): 'A' | 'B' => {
  if (value === 'A' || value === 'B') return value
  return 'A'
}

export const normalizeLegendVisible = (value: string | null | undefined): boolean => {
  if (value === '1') return true
  if (value === '0') return false
  return true
}

export const maskUaFull = (uaFull: string, level: 'A' | 'B' = 'A') => {
  // level A: browser family/version + OS
  // level B: level A + device type
  const browser = /Chrome\/(\d+)/.test(uaFull)
    ? `Chrome/${RegExp.$1}`
    : /Firefox\/(\d+)/.test(uaFull)
      ? `Firefox/${RegExp.$1}`
      : /Version\/(\d+)/.test(uaFull) && /Safari/.test(uaFull)
        ? `Safari/${RegExp.$1}`
        : /Edg\/(\d+)/.test(uaFull)
          ? `Edge/${RegExp.$1}`
          : 'UnknownBrowser'
  const os = /Mac OS X|Macintosh/.test(uaFull)
    ? 'macOS'
    : /Windows NT/.test(uaFull)
      ? 'Windows'
      : /Android/.test(uaFull)
        ? 'Android'
        : /iPhone|iPad/.test(uaFull)
          ? 'iOS'
          : 'UnknownOS'
  if (level === 'A') return `${browser}; ${os}`
  const device = /Mobile|Android|iPhone|iPad/.test(uaFull) ? 'Mobile' : 'Desktop'
  return `${browser}; ${os}; ${device}`
}

export const buildDiagnosticPack = (params: {
  reason: string
  lang: Lang
  inputText: string
  selectedRepairIndex: number
  repairTargetLabel: string
  configSnapshot: object
  appVersion?: string
  modeSummary?: string
  buildTime?: string
  uaShort?: string
  uaFull?: string
  masked?: boolean
  maskedLevel?: 'A' | 'B' | 'none'
  nowIso?: string
}) => {
  const ts = params.nowIso ?? new Date().toISOString()
  const inputPreview = params.inputText.slice(0, 200)
  const version = params.appVersion || '0.0.0'
  const mode = params.modeSummary || 'default'
  const buildTime = params.buildTime || ts
  const uaShort = params.uaShort || 'Unknown'
  const uaFullRaw = params.uaFull || 'Unknown'
  const uaFull = params.masked ? maskUaFull(uaFullRaw, (params.maskedLevel as 'A' | 'B') ?? 'A') : uaFullRaw
  const maskLevel = params.masked ? params.maskedLevel ?? 'A' : 'none'

  if (params.lang === 'zh') {
    return [
      '[Session Meta]',
      `版本: ${version}`,
      `模式: ${mode}`,
      `构建时间: ${buildTime}`,
      `UA简写: ${uaShort}`,
      `maskLevel: ${maskLevel}`,
      `诊断包时间: ${ts}`,
      `语言: zh`,
      `修复对象: 第${params.selectedRepairIndex + 1}场 (${params.repairTargetLabel})`,
      `异常原因: ${params.reason || 'unknown'}`,
      `输入预览(200): ${inputPreview}`,
      `配置快照: ${JSON.stringify(params.configSnapshot)}`,
      `UA完整: ${uaFull}`,
    ].join('\n')
  }
  return [
    '[Session Meta]',
    `version: ${version}`,
    `mode: ${mode}`,
    `buildTime: ${buildTime}`,
    `uaShort: ${uaShort}`,
    `maskLevel: ${maskLevel}`,
    `Diagnostic time: ${ts}`,
    `lang: en`,
    `Repair target: Match #${params.selectedRepairIndex + 1} (${params.repairTargetLabel})`,
    `Reason: ${params.reason || 'unknown'}`,
    `Input preview(200): ${inputPreview}`,
    `Config snapshot: ${JSON.stringify(params.configSnapshot)}`,
    `uaFull: ${uaFull}`,
  ].join('\n')
}

export const buildExportPayload = (item: HistoryItem, lang: Lang = 'zh') => {
  try {
    const parsed = parseInput(item.inputText)
    const recomputed = analyzeMatches(parsed, { ...item.configSnapshot, lang })
    const text = buildExportText({ ...item, outputText: recomputed.outputText }, lang)
    return { text, usedFallback: false, reason: '' }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    const fallbackNote =
      lang === 'zh'
        ? `\n\n[fallback] 重算失败，已回退历史存档输出。原因：${err}`
        : `\n\n[fallback] Recompute failed, fell back to stored historical output. Reason: ${err}`
    const text = buildExportText({ ...item, outputText: `${item.outputText}${fallbackNote}` }, lang)
    return { text, usedFallback: true, reason: err }
  }
}
