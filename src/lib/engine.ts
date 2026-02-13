import type {
  AnalysisResult,
  MatchAnalysis,
  MatchInput,
  RiskLevel,
  StrategyConfig,
  Triple,
} from './types'

const pickMax = (t?: Triple): '主胜' | '平' | '客胜' => {
  const h = t?.home ?? 0
  const d = t?.draw ?? 0
  const a = t?.away ?? 0
  if (h >= d && h >= a) return '主胜'
  if (d >= h && d >= a) return '平'
  return '客胜'
}

const pickHandicapMax = (t?: Triple): '让胜' | '让平' | '让负' | undefined => {
  if (!t) return undefined
  const h = t.home ?? -Infinity
  const d = t.draw ?? -Infinity
  const a = t.away ?? -Infinity
  if (h >= d && h >= a) return '让胜'
  if (d >= h && d >= a) return '让平'
  return '让负'
}

const dirKey = (r: '主胜' | '平' | '客胜') =>
  r === '主胜' ? 'home' : r === '平' ? 'draw' : 'away'

const getValue = (t: Triple | undefined, rec: '主胜' | '平' | '客胜') => t?.[dirKey(rec)]

const mapHandicapToMain = (r: '让胜' | '让平' | '让负'): '主胜' | '平' | '客胜' => {
  if (r === '让胜') return '主胜'
  if (r === '让平') return '平'
  return '客胜'
}

export const defaultStrategyConfig: StrategyConfig = {
  crowdThreshold: 80,
  heatThreshold: 50,
  totalBudget: 100,
  parlayBudget: 70,
  singleBudget: 20,
  coldBudget: 10,

  handicapEnabled: true,
  handicapCrowdThreshold: 80,
  handicapHeatThreshold: 50,
  handicapExtraBudget: 50,

  policyV38Enabled: false,
  v38ExplanationStyle: 'auto',
  v38IsMobile: false,
  v38TagOverrides: {},
  lang: 'zh',
}

const computeRisk = (
  recShare: number,
  recHeat: number,
  negativePnl: boolean,
  crowdThreshold: number,
  heatThreshold: number,
) => {
  const crowded = recShare >= crowdThreshold
  const veryHot = recHeat >= heatThreshold

  let risk: RiskLevel = '低'
  if ((crowded && (veryHot || negativePnl)) || (veryHot && negativePnl)) risk = '高'
  else if (crowded || veryHot || negativePnl) risk = '中'

  return { risk, crowded, veryHot }
}

const stakeByRisk = (risk: RiskLevel, crowded: boolean): number => {
  if (risk === '低') return 1
  if (risk === '中') return crowded ? 0.75 : 0.5
  return 0.25
}

const riskScore = (risk: RiskLevel) => (risk === '低' ? 1 : risk === '中' ? 2 : 3)

const localizeRisk = (risk: RiskLevel, en: boolean) => {
  if (!en) return risk
  if (risk === '低') return 'Low'
  if (risk === '中') return 'Medium'
  return 'High'
}

const localizeRec = (rec: '主胜' | '平' | '客胜', en: boolean) => {
  if (!en) return rec
  if (rec === '主胜') return 'Home win'
  if (rec === '平') return 'Draw'
  return 'Away win'
}

const localizeHandicapRec = (rec: '让胜' | '让平' | '让负' | undefined, en: boolean) => {
  if (!rec) return '—'
  if (!en) return rec
  if (rec === '让胜') return 'Handicap home'
  if (rec === '让平') return 'Handicap draw'
  return 'Handicap away'
}

const parseTimeToHours = (t?: string) => {
  if (!t) return undefined
  const v = t.trim().toLowerCase()
  const hm = v.match(/^(\d+(?:\.\d+)?)h$/)
  if (hm) return Number(hm[1])
  const mm = v.match(/^(\d+(?:\.\d+)?)m$/)
  if (mm) return Number(mm[1]) / 60
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => {
  if (a === '高' || b === '高') return '高'
  if (a === '中' || b === '中') return '中'
  return '低'
}

const capRisk = (risk: RiskLevel, cap: RiskLevel): RiskLevel => {
  if (cap === '高') return risk
  if (cap === '中') return risk === '高' ? '中' : risk
  return '低'
}

const buildShortTags = (
  ruleName: string | undefined,
  risk: RiskLevel,
  ratio: number,
  overrides: Record<string, string>,
) => {
  const riskTag = risk === '高' ? '#高风险' : risk === '中' ? '#中风险' : '#低风险'
  const ratioTag = `#ratio${ratio.toFixed(1)}`
  const pick = (key: string, fallback: string) => overrides[key]?.trim() || fallback

  if (!ruleName) return `${pick('BASE', '#基础分段')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('B1')) return `${pick('B1', '#B1红区熔断')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C0')) return `${pick('C0', '#样本作废')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C1')) return `${pick('C1', '#临场覆盖')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C2')) return `${pick('C2', '#巨量豁免')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C3')) return `${pick('C3', '#标准豁免')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C8')) return `${pick('C8', '#高风险走廊')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C9')) return `${pick('C9', '#空心热度')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C10')) return `${pick('C10', '#极端空心')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C7')) return `${pick('C7', '#回归撤销')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C6')) return `${pick('C6', '#降级阀')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('C11')) return `${pick('C11', '#结构健康')} ${riskTag} ${ratioTag}`
  if (ruleName.includes('D层')) return `${pick('D', '#联赛校准')} ${riskTag} ${ratioTag}`
  return `${pick('OTHER', '#主规则')} ${riskTag} ${ratioTag}`
}

const explainDecisiveRule = (
  ruleName: string | undefined,
  ratio: number,
  top3: string[],
  style: 'short' | 'long',
  risk: RiskLevel,
  overrides: Record<string, string>,
): string => {
  if (!ruleName)
    return style === 'short'
      ? buildShortTags(undefined, risk, ratio, overrides)
      : '未命中规则，按基础压力分段。'

  if (style === 'short') return buildShortTags(ruleName, risk, ratio, overrides)

  const r = ruleName
  if (r.includes('B1')) return `命中B1红区（ratio=${ratio.toFixed(2)}%落在55%~60%）。该规则优先级最高，直接触发熔断解释。`
  if (r.includes('C0')) return '样本体量不足（V_total<50万），先判定样本作废。该判定优先于常规风险细分。'
  if (r.includes('C1')) return '已进入临场窗口（≤1小时），临场规则优先覆盖常规判定。结论以最终时点口径解释。'
  if (r.includes('C2')) return '巨量体量场（≥800万），触发更高熔断线口径。该规则改变压力阈值解释边界。'
  if (r.includes('C3')) return '标准体量豁免（300万~800万），熔断线按60%口径执行。用于避免中体量误熔断。'
  if (r.includes('C8')) return '高集中且庄家对热门方向承压，命中高风险走廊。该结构优先解释为高风险形态。'
  if (r.includes('C9')) return '热度高但盈亏压力不足，结构偏空心。故风险解释上调为谨慎级别。'
  if (r.includes('C10')) return '极端热度且损失压力偏低，触发极端空心警示。优先解释为异常结构而非常规热度。'
  if (r.includes('C7')) return '末段集中度显著回落，触发回归撤销。用于抑制过度趋势化解读。'
  if (r.includes('C6')) return '中低体量区间触发降级阀，风险上限被限制。避免小样本放大解释。'
  if (r.includes('C11')) return '结构指标满足健康条件，结论偏中性/健康解释。用于对冲单一风险信号。'
  if (r.includes('D层')) return `命中联赛校准标签（${r}）。该层仅做解释增强，不覆盖B/C层主判定。`

  const topHint = top3.length > 1 ? ` 同时命中：${top3.slice(1).join('；')}。` : ''
  return `命中优先级最高规则：${r}。${topHint}`
}

const analyzeV38 = (matches: MatchInput[], config: StrategyConfig): AnalysisResult => {
  const lines: string[] = []
  const analyses: MatchAnalysis[] = []
  const en = config.lang === 'en'

  lines.push(en ? '[Footy Analyzer v3.8.x Hard-rule Audit]' : '【Footy Analyzer v3.8.x 硬规则审计】')
  lines.push('')

  matches.forEach((m, idx) => {
    const rec = pickMax(m.share)
    const hFav = getValue(m.share, rec)
    const plFav = getValue(m.pnl, rec)
    const vTotal = m.totalVolume
    const snapshotCount = m.snapshotCount ?? 0
    const hoursToKickoff = parseTimeToHours(m.timePoint)
    const evidence: string[] = []
    const rules: string[] = []
    const ruleRank = new Map<string, number>()
    const pushRule = (name: string, rank: number) => {
      rules.push(name)
      if (!ruleRank.has(name)) ruleRank.set(name, rank)
    }

    lines.push(`${idx + 1}. ${m.homeTeam} vs ${m.awayTeam}`)
    lines.push(en ? '1) Snapshots & Source' : '1) 数据快照与来源')
    lines.push(en ? `- Source: user-pasted text (local)` : `- 来源：用户粘贴文本（本地）`)
    lines.push(en ? `- League: ${m.league ?? 'N/A'}` : `- 联赛：${m.league ?? '未提供'}`)
    lines.push(`- V_total：${vTotal ?? '数据缺失/未验证'}`)
    lines.push(`- H_fav：${hFav ?? '数据缺失/未验证'}`)
    lines.push(`- PL_fav：${plFav ?? '数据缺失/未验证'}`)
    lines.push(en ? `- Time T: ${m.timePoint ?? 'missing/unverified'}` : `- 时间点T：${m.timePoint ?? '数据缺失/未验证'}`)
    lines.push(en ? `- Snapshot count (T1/T2...): ${snapshotCount}` : `- 快照数(T1/T2...)：${snapshotCount}`)

    const criticalMissing =
      vTotal == null || hFav == null || plFav == null || !m.timePoint || snapshotCount < 2
    if (criticalMissing) {
      lines.push(en ? '2) Risk Audit Table' : '2) 风险审计表')
      lines.push('| 项目 | 结果 |')
      lines.push('|---|---|')
      lines.push(en ? '| Status | Hard-stop triggered |' : '| 状态 | 停机协议触发 |')
      lines.push(en ? '3) Key Evidence' : '3) 关键证据')
      lines.push(en ? '- A1 failed: critical fields missing or snapshots < 2 (need T1/T2)' : '- A1失败：关键字段缺失或快照不足（需至少T1/T2）')
      lines.push(en ? '4) Research Notes (non-execution)' : '4) 研究性建议（非执行）')
      lines.push(en ? '- Risk audit is blocked. Please complete fields and rerun.' : '- 当前禁止风险判定，请补齐数据后重算')
      lines.push(en ? '5) Data request checklist' : '5) 数据索取清单')
      lines.push(en ? '- At least two snapshots: T1/T2 (H_fav, PL_fav, V_total)' : '- 至少两档快照：T1/T2（H_fav, PL_fav, V_total）')
      lines.push(en ? '- Explicit time point T (e.g. T=0.8h / T=45m)' : '- 明确时间点T（示例：T=0.8h / T=45m）')
      lines.push('')
      analyses.push({
        match: m,
        recommendation: rec,
        risk: '高',
        stakeU: 0,
        reasons: ['停机协议触发：关键字段缺失/冲突'],
        triggerColdDraw: false,
      })
      return
    }

    let risk: RiskLevel = '低'
    let tag = '✅ 低压力通道'

    // C0: D0 Auto-Void
    if (vTotal < 500000) {
      pushRule('C0 D0 Auto-Void', 20)
      tag = '🗑️ 样本作废：流动性不足'
      risk = '中'
      evidence.push(`V_total=${vTotal} < 500000`) 
    }

    // C1: 临场强制覆盖
    if (hoursToKickoff != null && hoursToKickoff <= 1) {
      pushRule('C1 F-T 临场强制覆盖', 30)
      evidence.push(`距开赛≈${hoursToKickoff.toFixed(2)}h，使用T_last口径`) 
    }

    const ratio = (Math.abs(plFav) / vTotal) * 100
    let meltdownLine = 50

    // B1 优先覆盖
    if (ratio >= 55 && ratio < 60) {
      pushRule('B1 Red-Zone Meltdown', 10)
      tag = '⚠️ Red-Zone Meltdown'
      risk = '高'
    } else {
      // C2/C3 体量豁免（B1未触发才生效）
      if (vTotal >= 8000000) {
        meltdownLine = 70
        pushRule('C2 FΩ-Mega', 40)
      } else if (vTotal >= 3000000 && vTotal < 8000000) {
        meltdownLine = 60
        pushRule('C3 FΩ-Standard', 50)
      }

      if (ratio > 100) {
        tag = '⚠️ 系统性异常区'
        risk = '高'
      } else if (ratio > meltdownLine) {
        tag = '⚠️ 压力熔断区'
        risk = '高'
      } else if (ratio >= 25) {
        tag = '⚠️ 中高压力区'
        risk = maxRisk(risk, '中')
      }
    }

    // C4 解释标签
    if (vTotal > 5000000) pushRule('C4 FΩ-EX-R 超大体量共识场（解释标签）', 60)

    // C5 抛物线增量（仅有快照信息时做弱判断）
    if (snapshotCount >= 3 && hFav >= 80) {
      pushRule('C5 F-S 抛物线增量（弱证据）', 70)
      evidence.push('快照数≥3且集中度较高，需防噪声高')
    }

    // C7 回归撤销
    if (m.hEarly != null && m.hLast != null && Math.abs(m.hLast - m.hEarly) > 10 && m.hLast < 88) {
      pushRule('C7 F3-R 回归撤销', 90)
      risk = capRisk(risk, '中')
      evidence.push(`H_last(${m.hLast}) 较 H_early(${m.hEarly}) 回落明显`) 
    }

    // C8/C9/C10/C11 结构规则
    if (vTotal > 2000000 && hFav > 80 && plFav < 0) {
      pushRule('C8 F1-C 高风险走廊', 100)
      risk = '高'
    }

    if (hFav > 70 && (Math.abs(plFav) < 500000 || Math.abs(plFav) < 0.05 * vTotal)) {
      pushRule('C9 F0-W 空心热度', 110)
      risk = maxRisk(risk, '中')
    }

    if (hFav > 90 && (m.lossPressure ?? ratio) < 10) {
      pushRule('C10 F0-W-X 极端空心热度', 120)
      risk = '高'
    }

    if (hFav >= 60 && hFav <= 80 && Math.abs(plFav) < 0.05 * vTotal && vTotal >= 1000000) {
      pushRule('C11 F2 结构相对健康', 130)
      risk = capRisk(risk, '中')
    }

    // C6 低中体量风险上限
    if (vTotal >= 500000 && vTotal < 1500000) {
      pushRule('C6 Fσ-L 中低体量降级阀', 80)
      risk = capRisk(risk, '中')
    }

    // D层联赛校准（解释层）
    if (m.league) {
      const lg = m.league.toUpperCase()
      if (['EPL', 'UCL', 'LALIGA', 'LA_LIGA'].includes(lg)) {
        pushRule(`D层联赛校准：${lg}`, 200)
      }
    }

    evidence.unshift(`当前 ratio=${ratio.toFixed(2)}%，熔断线=${meltdownLine}%`)
    evidence.push('双证据核验：至少两档快照已提供')

    const rankedRules = [...ruleRank.entries()].sort((a, b) => a[1] - b[1])
    const decisive = rankedRules[0]
    const top3Names = rankedRules.slice(0, 3).map((r) => r[0])
    const explainStyle =
      config.v38ExplanationStyle === 'auto'
        ? config.v38IsMobile
          ? 'short'
          : 'long'
        : config.v38ExplanationStyle
    const decisiveExplanation = explainDecisiveRule(
      decisive?.[0],
      ratio,
      top3Names,
      explainStyle,
      risk,
      config.v38TagOverrides,
    )
    if (explainStyle === 'short' && evidence[0]) {
      evidence[0] = `${evidence[0]} | ${decisiveExplanation}`
    }

    lines.push(en ? '2) Risk Audit Table' : '2) 风险审计表')
    lines.push(en ? '| Item | Value |' : '| 项目 | 数值 |')
    lines.push('|---|---|')
    lines.push(`| ratio | ${ratio.toFixed(2)}% |`)
    lines.push(en ? `| Tag | ${tag} |` : `| 标签 | ${tag} |`)
    lines.push(en ? `| Decisive Rule | ${decisive ? `${decisive[0]} (priority #${decisive[1]})` : 'none'} |` : `| 决定性规则 | ${decisive ? `${decisive[0]}（优先级#${decisive[1]}）` : '无'} |`)
    lines.push(en ? `| Decisive Rule Explanation | ${decisiveExplanation} |` : `| 决定性规则解释 | ${decisiveExplanation} |`)
    lines.push(
      en
        ? `| Top 3 Rules | ${rankedRules.length ? rankedRules.slice(0, 3).map((r) => `${r[0]}(#${r[1]})`).join('; ') : 'none'} |`
        : `| Top3规则 | ${rankedRules.length ? rankedRules.slice(0, 3).map((r) => `${r[0]}(#${r[1]})`).join('；') : '无'} |`,
    )
    lines.push(en ? `| Triggered Rules | ${rankedRules.length ? rankedRules.map((r) => r[0]).join('; ') : 'none'} |` : `| 触发规则 | ${rankedRules.length ? rankedRules.map((r) => r[0]).join('；') : '无'} |`)
    lines.push(en ? '3) Key Evidence' : '3) 关键证据')
    evidence.slice(0, 6).forEach((e) => lines.push(`- ${e}`))
    lines.push(en ? '4) Research Notes (non-execution)' : '4) 研究性建议（非执行）')
    lines.push(en ? `- Risk level: ${localizeRisk(risk, true)} (research-only, not execution advice)` : `- 风险等级：${risk}（仅研究用途，不构成执行建议）`)
    lines.push(en ? '5) Review Mapping (optional)' : '5) 复盘映射（可选）')
    lines.push(en ? '- Use /lock /settle /review /tune for review workflow' : '- 可用 /lock /settle /review /tune 归档迭代')
    lines.push('')

    analyses.push({
      match: m,
      recommendation: rec,
      risk,
      stakeU: 0,
      reasons: [`ratio=${ratio.toFixed(2)}%`, tag, ...rules.slice(0, 2)],
      triggerColdDraw: false,
    })
  })

  return {
    parsedCount: matches.length,
    analyses,
    budgetPlan: {
      total: 0,
      parlay: 0,
      single: 0,
      coldHedge: 0,
      note: en
        ? 'v3.8 hard-rule mode: research-only risk output (no execution suggestion)'
        : 'v3.8硬规则模式：仅输出研究性风险信息，不输出执行建议',
    },
    outputText: lines.join('\n'),
  }
}

export const analyzeMatches = (
  matches: MatchInput[],
  config: StrategyConfig = defaultStrategyConfig,
): AnalysisResult => {
  if (config.policyV38Enabled) return analyzeV38(matches, config)
  const en = config.lang === 'en'

  const analyses: MatchAnalysis[] = matches.map((m) => {
    const rec = pickMax(m.share)
    const recShare = getValue(m.share, rec) ?? 0
    const recHeat = Math.abs(getValue(m.heat, rec) ?? 0)
    const recPnl = getValue(m.pnl, rec)
    const negativePnl = typeof recPnl === 'number' ? recPnl < 0 : false

    const mainSig = computeRisk(
      recShare,
      recHeat,
      negativePnl,
      config.crowdThreshold,
      config.heatThreshold,
    )

    const stakeU = stakeByRisk(mainSig.risk, mainSig.crowded)

    let handicapRecommendation: '让胜' | '让平' | '让负' | undefined
    let handicapRisk: RiskLevel | undefined
    if (config.handicapEnabled && (typeof m.handicapLine === 'number' || m.handicapOdds)) {
      const pick = pickHandicapMax(m.handicapOdds)
      if (pick) {
        const mapped = mapHandicapToMain(pick)
        const hShare = getValue(m.share, mapped) ?? recShare
        const hHeat = Math.abs(getValue(m.heat, mapped) ?? recHeat)
        const hPnl = getValue(m.pnl, mapped)
        const hNegPnl = typeof hPnl === 'number' ? hPnl < 0 : false
        const hSig = computeRisk(
          hShare,
          hHeat,
          hNegPnl,
          config.handicapCrowdThreshold,
          config.handicapHeatThreshold,
        )
        // 3C: 高风险也输出，但加警示
        handicapRecommendation = pick
        handicapRisk = hSig.risk
      }
    }

    const triggerColdDraw = (mainSig.crowded || mainSig.veryHot) && negativePnl

    const reasons = en
      ? [
          `Top share direction: ${localizeRec(rec, true)} (${recShare || '—'}%)`,
          `Heat signal: ${recHeat || 0}`,
          `Book P/L (pick side): ${recPnl ?? '—'}`,
        ].slice(0, 3)
      : [
          `交易占比最大方向：${rec}（${recShare || '—'}%）`,
          `冷热信号：${recHeat || 0}`,
          `庄家盈亏（推荐方向）：${recPnl ?? '—'}`,
        ].slice(0, 3)

    return {
      match: m,
      recommendation: rec,
      handicapRecommendation,
      handicapRisk,
      risk: mainSig.risk,
      stakeU,
      reasons,
      triggerColdDraw,
    }
  })

  const sorted = [...analyses].sort((a, b) => riskScore(a.risk) - riskScore(b.risk))
  const parlayPicks = sorted.slice(0, 2)
  const singlePick = sorted[0]

  const coldTriggered = analyses.some((a) => a.triggerColdDraw)
  const budgetPlan = {
    total: config.totalBudget,
    parlay: parlayPicks.length >= 2 ? config.parlayBudget : 0,
    single: singlePick ? config.singleBudget : 0,
    coldHedge: coldTriggered ? config.coldBudget : 0,
    note: coldTriggered
      ? en
        ? `Conditional hedge triggered (draw) ${config.coldBudget} RMB`
        : `触发条件博冷（防平）${config.coldBudget} RMB`
      : en
        ? `${config.coldBudget} RMB reserved`
        : `${config.coldBudget} RMB 留空`,
  }

  const lines: string[] = []
  lines.push(en ? '[Footy Analyzer V1 Suggestions]' : '【Footy Analyzer V1 建议】')
  lines.push(en ? `Parsed matches: ${matches.length}` : `已解析场次：${matches.length}`)
  lines.push('')

  lines.push(en ? '[1X2 Suggestions]' : '【胜平负建议】')
  analyses.forEach((a, idx) => {
    const m = a.match
    lines.push(`${idx + 1}. ${m.homeTeam} vs ${m.awayTeam}`)
    lines.push(en ? `- Pick: ${localizeRec(a.recommendation, true)}` : `- 推荐：${a.recommendation}`)
    lines.push(en ? `- Risk: ${localizeRisk(a.risk, true)} (stake ${a.stakeU}u)` : `- 风险：${a.risk}（仓位 ${a.stakeU}u）`)
    lines.push(en ? `- Reasons: ${a.reasons.join('; ')}` : `- 理由：${a.reasons.join('；')}`)
    if (a.triggerColdDraw) lines.push(en ? `- Conditional hedge: draw (${config.coldBudget} RMB)` : `- 条件博冷：防平（${config.coldBudget} RMB）`)
    lines.push('')
  })

  lines.push(en ? '[Handicap Suggestions]' : '【让球建议】')
  const handicapRows = analyses.filter((a) => a.handicapRecommendation)
  const handicapSorted = [...handicapRows].sort(
    (a, b) => riskScore(a.handicapRisk ?? '高') - riskScore(b.handicapRisk ?? '高'),
  )
  const handicapBudgetMap = new Map<string, number>()
  if (config.handicapEnabled && handicapSorted.length > 0) {
    handicapBudgetMap.set(handicapSorted[0].match.id, 30)
    if (handicapSorted[1]) handicapBudgetMap.set(handicapSorted[1].match.id, 20)
  }

  if (!config.handicapEnabled) {
    lines.push(en ? '- Handicap suggestion is disabled' : '- 已关闭让球推荐')
  } else if (handicapRows.length === 0) {
    lines.push(en ? '- No qualifying handicap suggestion' : '- 无满足条件的让球推荐')
  } else {
    handicapRows.forEach((a, idx) => {
      const m = a.match
      const line = typeof m.handicapLine === 'number' ? `${m.handicapLine}` : '—'
      const budget = handicapBudgetMap.get(m.id) ?? 0
      const risk = a.handicapRisk ?? '高'
      const riskWarn = risk === '高' ? (en ? ' (warning)' : '（警示）') : ''
      lines.push(`${idx + 1}. ${m.homeTeam} vs ${m.awayTeam}`)
      lines.push(en ? `- Line: ${line}` : `- 让球线：${line}`)
      lines.push(en ? `- Pick: ${localizeHandicapRec(a.handicapRecommendation, true)}` : `- 推荐：${a.handicapRecommendation}`)
      lines.push(en ? `- Risk tag: ${localizeRisk(risk, true)}${riskWarn}` : `- 风险标签：${risk}${riskWarn}`)
      lines.push(en ? `- Handicap budget: ${budget} RMB` : `- 让球预算分配：${budget} RMB`)
      lines.push('')
    })
  }

  lines.push(
    en
      ? `[Budget (${config.totalBudget} RMB + handicap extra ${config.handicapExtraBudget} RMB)]`
      : `【预算（${config.totalBudget} RMB + 让球额外${config.handicapExtraBudget} RMB）】`,
  )
  if (parlayPicks.length >= 2) {
    lines.push(
      en
        ? `- Parlay (2-leg): ${config.parlayBudget} RMB (${parlayPicks[0].match.homeTeam} vs ${parlayPicks[0].match.awayTeam} + ${parlayPicks[1].match.homeTeam} vs ${parlayPicks[1].match.awayTeam})`
        : `- 主串(2串1)：${config.parlayBudget} RMB（${parlayPicks[0].match.homeTeam} vs ${parlayPicks[0].match.awayTeam} + ${parlayPicks[1].match.homeTeam} vs ${parlayPicks[1].match.awayTeam}）`,
    )
  } else {
    lines.push(en ? '- Parlay (2-leg): 0 RMB (insufficient matches)' : '- 主串(2串1)：0 RMB（场次不足）')
  }
  if (singlePick) {
    lines.push(
      en
        ? `- Single flex: ${config.singleBudget} RMB (${singlePick.match.homeTeam} vs ${singlePick.match.awayTeam})`
        : `- 机动单场：${config.singleBudget} RMB（${singlePick.match.homeTeam} vs ${singlePick.match.awayTeam}）`,
    )
  } else {
    lines.push(en ? '- Single flex: 0 RMB' : '- 机动单场：0 RMB')
  }
  lines.push(en ? `- Conditional hedge: ${budgetPlan.coldHedge} RMB` : `- 条件博冷：${budgetPlan.coldHedge} RMB`)
  lines.push(
    en
      ? `- Handicap extra budget: ${config.handicapExtraBudget} RMB (allocation: 30+20)`
      : `- 让球独立预算：${config.handicapExtraBudget} RMB（分配规则：30+20）`,
  )
  lines.push(en ? `- Notes: ${budgetPlan.note}` : `- 说明：${budgetPlan.note}`)

  return {
    parsedCount: matches.length,
    analyses,
    budgetPlan,
    outputText: lines.join('\n'),
  }
}
