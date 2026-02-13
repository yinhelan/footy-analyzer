export type Triple = {
  home?: number
  draw?: number
  away?: number
}

export interface MatchInput {
  id: string
  rawLine: string
  homeTeam: string
  awayTeam: string
  marketOdds?: Triple
  volume?: Triple
  share?: Triple
  totalVolume?: number
  pnl?: Triple
  heat?: Triple

  // V1.1 预留（让球）
  handicapLine?: number
  handicapOdds?: Triple

  // v3.8 规则所需（可选）
  timePoint?: string
  snapshotCount?: number
  league?: string
  hEarly?: number
  hLast?: number
  lossPressure?: number
}

export type RiskLevel = '低' | '中' | '高'

export interface MatchAnalysis {
  match: MatchInput
  recommendation: '主胜' | '平' | '客胜'
  handicapRecommendation?: '让胜' | '让平' | '让负'
  handicapRisk?: RiskLevel
  risk: RiskLevel
  stakeU: number
  reasons: string[]
  triggerColdDraw: boolean
}

export interface StrategyConfig {
  crowdThreshold: number
  heatThreshold: number
  totalBudget: number
  parlayBudget: number
  singleBudget: number
  coldBudget: number

  // V1.1 增强：让球独立策略
  handicapEnabled: boolean
  handicapCrowdThreshold: number
  handicapHeatThreshold: number
  handicapExtraBudget: number

  // v3.8.x 硬规则模式
  policyV38Enabled: boolean
  v38ExplanationStyle: 'auto' | 'short' | 'long'
  v38IsMobile: boolean
  v38TagOverrides: Record<string, string>
  lang: 'zh' | 'en'
}

export interface AnalysisResult {
  parsedCount: number
  analyses: MatchAnalysis[]
  budgetPlan: {
    total: number
    parlay: number
    single: number
    coldHedge: number
    note: string
  }
  outputText: string
}

export interface HistoryItem {
  id: string
  createdAt: string
  inputText: string
  outputText: string
  parsedCount: number
  configSnapshot: StrategyConfig
}
