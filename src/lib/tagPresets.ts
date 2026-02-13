import type { StrategyConfig } from './types'
import type { Lang } from './i18n'

export type TagPresetName = 'conservative' | 'aggressive'

const PRESETS: Record<TagPresetName, Record<string, string>> = {
  conservative: {
    B1: '#红区熔断',
    C1: '#临场复核',
    C8: '#高压走廊',
    C9: '#空心谨慎',
  },
  aggressive: {
    B1: '#红区强警',
    C1: '#临场覆盖',
    C8: '#高风险推进',
    C9: '#空心告警',
  },
}

export const applyTagPreset = (config: StrategyConfig, preset: TagPresetName): StrategyConfig => {
  return {
    ...config,
    v38TagOverrides: {
      ...config.v38TagOverrides,
      ...PRESETS[preset],
    },
  }
}

export const describePresetChanges = (
  before: Record<string, string>,
  after: Record<string, string>,
): string => {
  const keys = ['B1', 'C1', 'C8', 'C9']
  const changed = keys.filter((k) => (before[k] ?? '') !== (after[k] ?? ''))
  return changed.length ? `已更新标签：${changed.join('/')}` : '标签无变化'
}

export const describeManualChange = (key: string): string => `标签已手动更新：${key}`

export const mergedToastMessage = (lang: Lang = 'zh') =>
  lang === 'zh' ? '已更新多项配置' : 'Multiple settings updated'

export type ToastLevel = 'success' | 'warn' | 'error'

export interface ToastItem {
  message: string
  level: ToastLevel
}

export const toastIcon = (level: ToastLevel) => {
  if (level === 'success') return '✓'
  if (level === 'warn') return '!'
  return '✕'
}

export interface HardRuleLikeMatch {
  totalVolume?: number
  share?: { home?: number; draw?: number; away?: number }
  pnl?: { home?: number; draw?: number; away?: number }
  timePoint?: string
  snapshotCount?: number
}

export const detectHardRuleIssuesFromMatch = (m: HardRuleLikeMatch) => {
  const issues: string[] = []
  if (m.totalVolume == null) issues.push('V_total=缺失')

  const hasShare =
    m.share != null &&
    [m.share.home, m.share.draw, m.share.away].some((v) => typeof v === 'number' && Number.isFinite(v))
  if (!hasShare) issues.push('H_fav=缺失')

  const hasPnl =
    m.pnl != null &&
    [m.pnl.home, m.pnl.draw, m.pnl.away].some((v) => typeof v === 'number' && Number.isFinite(v))
  if (!hasPnl) issues.push('PL_fav=缺失')

  if (!m.timePoint) issues.push('T=缺失')
  const snap = m.snapshotCount
  if (typeof snap !== 'number' || !Number.isFinite(snap)) issues.push('快照=缺失')
  else if (snap < 2) issues.push(`快照=${snap}(不足2档)`)

  return issues
}

export interface TemplateContext {
  homeTeam?: string
  awayTeam?: string
  league?: string
  timePoint?: string
}

export const formatRepairTarget = (index: number, ctx?: TemplateContext) => {
  const home = ctx?.homeTeam || '主队'
  const away = ctx?.awayTeam || '客队'
  const league = ctx?.league || 'EPL'
  const t = ctx?.timePoint || '1.2h'
  return `第${index + 1}场：${home} vs ${away}｜联赛=${league}｜T=${t}`
}

export const buildDynamicTemplate = (
  issues: string[],
  ctx?: TemplateContext,
  lang: Lang = 'zh',
) => {
  const needV = issues.some((x) => x.startsWith('V_total'))
  const needH = issues.some((x) => x.startsWith('H_fav'))
  const needPL = issues.some((x) => x.startsWith('PL_fav'))
  const needT = issues.some((x) => x.startsWith('T='))
  const needSnap = issues.some((x) => x.startsWith('快照='))

  const home = ctx?.homeTeam?.trim() || (lang === 'zh' ? '主队' : 'HomeTeam')
  const away = ctx?.awayTeam?.trim() || (lang === 'zh' ? '客队' : 'AwayTeam')
  const league = ctx?.league?.trim() || 'EPL'
  const t = ctx?.timePoint?.trim() || '1.2h'

  const parts = [`${home} vs ${away}`]
  parts.push(
    needH
      ? lang === 'zh'
        ? '占比主 70 | 平 15 | 客 15'
        : 'Share Home 70 | Draw 15 | Away 15'
      : lang === 'zh'
        ? '占比主 X | 平 Y | 客 Z'
        : 'Share Home X | Draw Y | Away Z',
  )
  parts.push(needV ? (lang === 'zh' ? '总交易量 1200000' : 'TotalVolume 1200000') : lang === 'zh' ? '总交易量 N' : 'TotalVolume N')
  parts.push(
    needPL
      ? lang === 'zh'
        ? '盈亏主 -300000 | 平 120000 | 客 180000'
        : 'PnL Home -300000 | Draw 120000 | Away 180000'
      : lang === 'zh'
        ? '盈亏主 A | 平 B | 客 C'
        : 'PnL Home A | Draw B | Away C',
  )
  if (needT) parts.push(`T=${t}`)
  if (needSnap) parts.push(lang === 'zh' ? '快照=2' : 'Snapshots=2')
  parts.push(`League=${league} H_early=85 H_last=79 loss_pressure=12`)

  return [
    `${home} vs ${away}`,
    parts.join(' '),
    lang === 'zh'
      ? '（已按缺失字段补齐最小可运行值，可直接覆盖后生成）'
      : '(Minimal runnable template generated from missing fields. You can overwrite and run.)',
  ].join('\n')
}

export const buildRepairPriority = (issues: string[], lang: Lang = 'zh') => {
  const steps: string[] = []
  const hasT = issues.some((x) => x.startsWith('T='))
  const hasSnap = issues.some((x) => x.startsWith('快照='))
  const hasV = issues.some((x) => x.startsWith('V_total'))
  const hasH = issues.some((x) => x.startsWith('H_fav'))
  const hasPL = issues.some((x) => x.startsWith('PL_fav'))

  if (hasT || hasSnap) {
    const ts = [hasT ? 'T' : '', hasSnap ? (lang === 'zh' ? '快照' : 'snapshots') : '']
      .filter(Boolean)
      .join('/')
    steps.push(lang === 'zh' ? `先补 ${ts}` : `First: ${ts}`)
  }
  if (hasV) steps.push(lang === 'zh' ? '再补 V_total' : 'Then: V_total')
  if (hasH || hasPL) {
    const hs = [hasH ? 'H_fav' : '', hasPL ? 'PL_fav' : ''].filter(Boolean).join('/')
    steps.push(lang === 'zh' ? `最后补 ${hs}` : `Finally: ${hs}`)
  }

  if (steps.length === 0)
    return lang === 'zh' ? '修复顺序：字段完整，无需补齐' : 'Repair order: complete, no patch needed'
  return lang === 'zh' ? `修复顺序：${steps.join(' → ')}` : `Repair order: ${steps.join(' -> ')}`
}

export interface RepairSnapshot {
  inputText: string
  completed: string[]
}

export const pushUndoHistory = (
  history: RepairSnapshot[],
  snapshot: RepairSnapshot,
  limit = 5,
) => {
  const next = [...history, snapshot]
  if (next.length <= limit) return next
  return next.slice(next.length - limit)
}

export const popUndoHistory = (history: RepairSnapshot[]) => {
  if (history.length === 0) return { next: history, popped: undefined as RepairSnapshot | undefined }
  const next = [...history]
  const popped = next.pop()
  return { next, popped }
}

export const pushRedoHistory = (
  history: RepairSnapshot[],
  snapshot: RepairSnapshot,
  limit = 5,
) => {
  const next = [...history, snapshot]
  if (next.length <= limit) return next
  return next.slice(next.length - limit)
}

export const popRedoHistory = (history: RepairSnapshot[]) => {
  if (history.length === 0) return { next: history, popped: undefined as RepairSnapshot | undefined }
  const next = [...history]
  const popped = next.pop()
  return { next, popped }
}

export const undoRedoHint = (kind: 'undo' | 'redo', enabled: boolean, lang: Lang = 'zh') => {
  if (lang === 'en') {
    if (kind === 'undo') {
      return enabled
        ? 'Undo one step (Cmd/Ctrl+Z)'
        : 'Nothing to undo: run one patch step first, then undo (Cmd/Ctrl+Z)'
    }
    return enabled
      ? 'Redo one step (Cmd/Ctrl+Shift+Z)'
      : 'Nothing to redo: undo first, then redo (Cmd/Ctrl+Shift+Z)'
  }

  if (kind === 'undo') {
    return enabled
      ? '撤销一步（Cmd/Ctrl+Z）'
      : '暂无可撤销步骤：先执行一次“补T/快照、补V_total或补H_fav/PL_fav”后即可撤销（Cmd/Ctrl+Z）'
  }
  return enabled
    ? '重做一步（Cmd/Ctrl+Shift+Z）'
    : '暂无可重做步骤：先执行一次撤销后，才可重做（Cmd/Ctrl+Shift+Z）'
}

export const patchByRepairStep = (
  step: 'ts' | 'v' | 'hp',
  ctx?: TemplateContext,
) => {
  const home = ctx?.homeTeam?.trim() || '主队'
  const away = ctx?.awayTeam?.trim() || '客队'
  const league = ctx?.league?.trim() || 'EPL'
  const t = ctx?.timePoint?.trim() || '1.2h'

  if (step === 'ts') {
    return `${home} vs ${away} T=${t} 快照=2 联赛=${league}`
  }
  if (step === 'v') {
    return `${home} vs ${away} 总交易量 1200000 联赛=${league}`
  }
  return `${home} vs ${away} 占比主 70 | 平 15 | 客 15 盈亏主 -300000 | 平 120000 | 客 180000 联赛=${league}`
}

export const buildFixHint = (
  kind: 'parseZero' | 'hardRuleMissing',
  issues: string[] = [],
  quickAdvice?: string,
  lang: Lang = 'zh',
) => {
  if (kind === 'parseZero') {
    return lang === 'zh'
      ? [
          '解析失败：请按“队伍 vs 队伍 + 占比/总交易量/盈亏”格式输入。',
          '示例：曼城 vs 利物浦 占比主 82 | 平 9 | 客 9 总交易量 3200000 盈亏主 -1760000 | 平 520000 | 客 810000',
        ].join('\n')
      : [
          'Parse failed: use format "Team vs Team + Share/TotalVolume/PnL".',
          'Example: Man City vs Liverpool Share Home 82 | Draw 9 | Away 9 TotalVolume 3200000 PnL Home -1760000 | Draw 520000 | Away 810000',
        ].join('\n')
  }
  const issueLine = issues.length
    ? lang === 'zh'
      ? `缺失/可疑字段：${issues.join('，')}`
      : `Missing/suspicious fields: ${issues.join(', ')}`
    : lang === 'zh'
      ? '缺失/可疑字段：待检查'
      : 'Missing/suspicious fields: pending check'
  return [
    lang === 'zh'
      ? '硬规则停机：请补齐关键字段 V_total / H_fav / PL_fav / T / 快照。'
      : 'Hard-rule stop: please fill V_total / H_fav / PL_fav / T / snapshots.',
    issueLine,
    quickAdvice
      ? lang === 'zh'
        ? `快速建议：${quickAdvice}`
        : `Quick advice: ${quickAdvice}`
      : lang === 'zh'
        ? '快速建议：优先补齐T与快照，再补齐成交体量与盈亏。'
        : 'Quick advice: fill T/snapshots first, then volume and PnL.',
    lang === 'zh'
      ? '已生成动态模板（见下方“填入动态模板”按钮）。'
      : 'Dynamic template generated (see "Fill dynamic template" below).',
  ].join('\n')
}

export const enqueueToastWithLimit = (queue: ToastItem[], item: ToastItem, limit = 5) => {
  const next = [...queue, item]
  if (next.length <= limit) return next
  return next.slice(next.length - limit)
}
