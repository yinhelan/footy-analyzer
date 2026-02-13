import type { MatchInput, Triple } from './types'

const toNum = (s?: string): number | undefined => {
  if (!s) return undefined
  const cleaned = s.replace(/[,，%]/g, '').trim()
  if (!cleaned || cleaned === '—') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

const parseTriple = (
  chunk: string,
  labels: [string, string, string],
): Triple | undefined => {
  const pattern = new RegExp(
    `${labels[0]}[:：]?\\s*([-+]?\\d[\\d,.]*%?)\\s*[|｜/\\s]+${labels[1]}[:：]?\\s*([-+]?\\d[\\d,.]*%?)\\s*[|｜/\\s]+${labels[2]}[:：]?\\s*([-+]?\\d[\\d,.]*%?)`,
  )

  const m = chunk.match(pattern)
  if (!m) return undefined

  return {
    home: toNum(m[1]),
    draw: toNum(m[2]),
    away: toNum(m[3]),
  }
}

const parseTeams = (line: string): { home: string; away: string } | undefined => {
  const m = line.match(
    /^(.*?)\s*(?:vs|VS|Vs|vS|对)\s*(.*?)(?=\s+(?:成交价|交易量|占比|总交易量|盈亏|庄盈|冷热|让球)|$)/,
  )
  if (!m) return undefined
  return { home: m[1].trim(), away: m[2].trim() }
}

const parseTotalVolume = (line: string): number | undefined => {
  const m = line.match(/总交易量[:：]?\s*([\d,，.]+)/)
  return toNum(m?.[1])
}

export const parseInput = (raw: string): MatchInput[] => {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  return lines
    .map((line, idx) => {
      const teams = parseTeams(line)
      if (!teams) return undefined

      const marketOdds =
        parseTriple(line, ['成交价主', '平', '客']) ||
        parseTriple(line, ['成交价', '平', '客']) ||
        parseTriple(line, ['主', '平', '客']) ||
        parseTriple(line, ['主胜', '平', '客胜'])

      const volume =
        parseTriple(line, ['交易量主', '平', '客']) ||
        parseTriple(line, ['量主', '平', '客']) ||
        parseTriple(line, ['主量', '平量', '客量'])

      const share =
        parseTriple(line, ['占比主', '平', '客']) ||
        parseTriple(line, ['占比', '平', '客']) ||
        parseTriple(line, ['主占比', '平占比', '客占比'])

      const pnl =
        parseTriple(line, ['盈亏主', '平', '客']) ||
        parseTriple(line, ['庄家盈亏主', '平', '客']) ||
        parseTriple(line, ['庄盈主', '平', '客']) ||
        parseTriple(line, ['主盈亏', '平盈亏', '客盈亏'])

      const heat =
        parseTriple(line, ['冷热主', '平', '客']) ||
        parseTriple(line, ['热度主', '平', '客']) ||
        parseTriple(line, ['主冷热', '平冷热', '客冷热'])

      const totalVolume = parseTotalVolume(line)

      // V1.1 预留解析：让球 -0.75 / 让胜平负
      const handicapLine = toNum(line.match(/让球\s*([-+]?\d+(?:\.\d+)?)/)?.[1])
      const handicapOdds =
        parseTriple(line, ['让胜', '让平', '让负']) ||
        parseTriple(line, ['让主', '让平', '让客'])

      // v3.8 规则可选字段
      const timePoint = line.match(/T[:=]\s*([^\s]+)/i)?.[1]
      const snapshotCount = toNum(line.match(/快照[:=]\s*(\d+)/)?.[1])
      const league = line.match(/联赛[:=]\s*([^\s|]+)/i)?.[1]
      const hEarly = toNum(line.match(/H_early[:=]\s*([-+]?\d+(?:\.\d+)?)/i)?.[1])
      const hLast = toNum(line.match(/H_last[:=]\s*([-+]?\d+(?:\.\d+)?)/i)?.[1])
      const lossPressure = toNum(line.match(/loss_pressure[:=]\s*([-+]?\d+(?:\.\d+)?)/i)?.[1])

      return {
        id: `m_${Date.now()}_${idx}`,
        rawLine: line,
        homeTeam: teams.home,
        awayTeam: teams.away,
        marketOdds,
        volume,
        share,
        totalVolume,
        pnl,
        heat,
        handicapLine,
        handicapOdds,
        timePoint,
        snapshotCount,
        league,
        hEarly,
        hLast,
        lossPressure,
      } as MatchInput
    })
    .filter((x): x is MatchInput => Boolean(x))
}
