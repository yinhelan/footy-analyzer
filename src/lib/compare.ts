import { analyzeMatches } from './engine'
import { parseInput } from './parser'
import type { HistoryItem } from './types'
import type { Lang } from './i18n'

const pickComparableKey = (inputText: string) => {
  const first = inputText.split('\n').map((s) => s.trim()).find(Boolean) || ''
  const m = first.match(/^(.*?)\s*(?:vs|VS|Vs|vS|对)\s*(.*?)(?:\s|$)/)
  if (!m) return first
  return `${m[1].trim()}__${m[2].trim()}`
}

export const findLatestTwoSameMatch = (history: HistoryItem[], base: HistoryItem): HistoryItem[] => {
  const key = pickComparableKey(base.inputText)
  const same = history.filter((h) => pickComparableKey(h.inputText) === key)
  return same.slice(0, 2)
}

export const compareHistoryItems = (a: HistoryItem, b: HistoryItem, lang: Lang = 'zh') => {
  const ra = analyzeMatches(parseInput(a.inputText), { ...a.configSnapshot, lang })
  const rb = analyzeMatches(parseInput(b.inputText), { ...b.configSnapshot, lang })
  const en = lang === 'en'
  const locale = en ? 'en-US' : 'zh-CN'

  const lines: string[] = []
  lines.push(en ? '[Review Compare]' : '【复盘对比】')
  lines.push(`A: ${new Date(a.createdAt).toLocaleString(locale)}`)
  lines.push(`B: ${new Date(b.createdAt).toLocaleString(locale)}`)
  lines.push('')

  const max = Math.max(ra.analyses.length, rb.analyses.length)
  for (let i = 0; i < max; i++) {
    const ma = ra.analyses[i]
    const mb = rb.analyses[i]
    if (!ma && !mb) continue
    const title = `${i + 1}. ${(ma?.match.homeTeam ?? mb?.match.homeTeam) || '—'} vs ${(ma?.match.awayTeam ?? mb?.match.awayTeam) || '—'}`
    lines.push(title)
    lines.push(`${en ? '- Recommendation' : '- 推荐'}: ${ma?.recommendation ?? '—'} → ${mb?.recommendation ?? '—'}`)
    lines.push(`${en ? '- Risk' : '- 风险'}: ${ma?.risk ?? '—'} → ${mb?.risk ?? '—'}`)
    lines.push(`${en ? '- Handicap' : '- 让球'}: ${ma?.handicapRecommendation ?? '—'} → ${mb?.handicapRecommendation ?? '—'}`)
    lines.push('')
  }

  lines.push(en ? '[Budget Compare]' : '【预算对比】')
  lines.push(`${en ? '- Main budget' : '- 主预算'}: ${ra.budgetPlan.total} → ${rb.budgetPlan.total}`)
  lines.push(`${en ? '- Parlay' : '- 主串'}: ${ra.budgetPlan.parlay} → ${rb.budgetPlan.parlay}`)
  lines.push(`${en ? '- Single' : '- 单场'}: ${ra.budgetPlan.single} → ${rb.budgetPlan.single}`)
  lines.push(`${en ? '- Cold hedge' : '- 博冷'}: ${ra.budgetPlan.coldHedge} → ${rb.budgetPlan.coldHedge}`)

  return {
    text: lines.join('\n'),
    a: ra,
    b: rb,
  }
}
