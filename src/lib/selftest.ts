import { parseInput } from './parser'
import { analyzeMatches, defaultStrategyConfig } from './engine'
import {
  buildDiagnosticPack,
  buildExportPayload,
  buildExportText,
  buildFallbackDigest,
  filterHistory,
  maskUaFull,
  normalizeLegendVisible,
  normalizeMaskLevel,
} from './history'
import { compareHistoryItems, findLatestTwoSameMatch } from './compare'
import {
  applyTagPreset,
  describeManualChange,
  describePresetChanges,
  enqueueToastWithLimit,
  mergedToastMessage,
  toastIcon,
  buildFixHint,
  buildDynamicTemplate,
  buildRepairPriority,
  detectHardRuleIssuesFromMatch,
  formatRepairTarget,
  patchByRepairStep,
  popRedoHistory,
  popUndoHistory,
  pushRedoHistory,
  pushUndoHistory,
  undoRedoHint,
} from './tagPresets'
import { t } from './i18n'

const sample = `马德里竞技 vs 巴塞罗那 成交价主 2.82 | 平 4.10 | 客 2.50 交易量主 301198 | 平 103703 | 客 739440 占比主 26.3% | 平 9.1% | 客 64.6% 总交易量 1144341 盈亏主 294963 | 平 719159 | 客 -704259 让球 -0.25 让胜 1.95 | 让平 3.50 | 让负 3.60
布伦特福德 vs 阿森纳 成交价主 5.70 | 平 4.10 | 客 1.73 交易量主 172064 | 平 57869 | 客 1656780 占比主 9.1% | 平 3.1% | 客 87.8% 总交易量 1886713 盈亏主 905948 | 平 1649450 | 客 -979516 冷热主 -51 | 平 -87 | 客 55 让球 -1 让胜 2.23 | 让平 3.22 | 让负 2.70`

const matches = parseInput(sample)
const result = analyzeMatches(matches)
const resultHandicapOff = analyzeMatches(matches, {
  ...defaultStrategyConfig,
  handicapEnabled: false,
})
const resultV38 = analyzeMatches(matches, {
  ...defaultStrategyConfig,
  policyV38Enabled: true,
})

const sampleV38 = `曼城 vs 利物浦 成交价主 1.88 | 平 3.80 | 客 4.20 占比主 82 | 平 9 | 客 9 总交易量 3200000 盈亏主 -1760000 | 平 520000 | 客 810000 T=0.8h 快照=2 联赛=EPL H_early=94 H_last=81 loss_pressure=8`
const resultV38Ready = analyzeMatches(parseInput(sampleV38), {
  ...defaultStrategyConfig,
  policyV38Enabled: true,
  v38ExplanationStyle: 'long',
})
const resultEn = analyzeMatches(matches, {
  ...defaultStrategyConfig,
  lang: 'en',
})
const resultV38En = analyzeMatches(parseInput(sampleV38), {
  ...defaultStrategyConfig,
  policyV38Enabled: true,
  lang: 'en',
})
const resultV38Short = analyzeMatches(parseInput(sampleV38), {
  ...defaultStrategyConfig,
  policyV38Enabled: true,
  v38ExplanationStyle: 'short',
})
const resultV38ShortCustom = analyzeMatches(parseInput(sampleV38), {
  ...defaultStrategyConfig,
  policyV38Enabled: true,
  v38ExplanationStyle: 'short',
  v38TagOverrides: { B1: '#自定义红区' },
})
const presetConservative = applyTagPreset(defaultStrategyConfig, 'conservative')
const presetAggressive = applyTagPreset(defaultStrategyConfig, 'aggressive')
const presetChangeDesc = describePresetChanges({}, presetConservative.v38TagOverrides)
const manualChangeDesc = describeManualChange('B1')
const mergedToast = mergedToastMessage()
const toastQueueLimited = enqueueToastWithLimit(
  [
    { message: 'a', level: 'success' },
    { message: 'b', level: 'success' },
    { message: 'c', level: 'success' },
    { message: 'd', level: 'success' },
    { message: 'e', level: 'success' },
  ],
  { message: 'f', level: 'error' },
  5,
)
const iconOk = toastIcon('success')
const iconWarn = toastIcon('warn')
const iconErr = toastIcon('error')
const fixHintParseZero = buildFixHint('parseZero', [], undefined, 'zh')
const hardIssues = detectHardRuleIssuesFromMatch(resultV38.analyses[0].match)
const fixHintHardRule = buildFixHint('hardRuleMissing', hardIssues, undefined, 'zh')
const dynamicTemplate = buildDynamicTemplate(hardIssues, undefined, 'zh')
const dynamicTemplateWithCtx = buildDynamicTemplate(hardIssues, {
  homeTeam: '曼城',
  awayTeam: '利物浦',
  league: 'EPL',
  timePoint: '0.8h',
}, 'zh')
const repairTarget = formatRepairTarget(1, {
  homeTeam: '阿森纳',
  awayTeam: '切尔西',
  league: 'EPL',
  timePoint: '0.6h',
})
const issuesMatch1 = detectHardRuleIssuesFromMatch({
  totalVolume: 1200000,
  share: { home: 70, draw: 15, away: 15 },
  pnl: { home: -200000, draw: 100000, away: 100000 },
  timePoint: '0.8h',
  snapshotCount: 2,
})
const issuesMatch2 = detectHardRuleIssuesFromMatch({
  totalVolume: undefined,
  share: undefined,
  pnl: undefined,
  timePoint: '',
  snapshotCount: 0,
})
const repairPriority = buildRepairPriority(issuesMatch2, 'zh')
const patchedTs = patchByRepairStep('ts', { homeTeam: '阿森纳', awayTeam: '切尔西', league: 'EPL', timePoint: '0.6h' })
const patchedV = patchByRepairStep('v', { homeTeam: '阿森纳', awayTeam: '切尔西', league: 'EPL' })
const patchedHp = patchByRepairStep('hp', { homeTeam: '阿森纳', awayTeam: '切尔西', league: 'EPL' })
const undoHistory = pushUndoHistory(
  pushUndoHistory(
    [],
    { inputText: 'step1', completed: ['T/快照'] },
    5,
  ),
  { inputText: 'step2', completed: ['T/快照', 'V_total'] },
  5,
)
const undoPopped = popUndoHistory(undoHistory)
const redoHistory = pushRedoHistory([], { inputText: 'redo1', completed: ['V_total'] }, 5)
const redoPopped = popRedoHistory(redoHistory)
const undoHintEnabled = undoRedoHint('undo', true)
const redoHintDisabled = undoRedoHint('redo', false)
const undoHintEn = undoRedoHint('undo', true, 'en')
const i18nLangLabel = t('en', 'langLabel')
const i18nMaskBadge = t('en', 'maskBadgePrefix')
const i18nMaskHint = t('en', 'maskLevelHint')
const i18nMaskLegend = t('en', 'maskLegend')
const i18nShowLegend = t('en', 'showLegend')
const i18nHideLegend = t('en', 'hideLegend')
const i18nFallbackZh = t('en', 'zhOnlyProbe')
const exportFallbackEn = t('en', 'exportFallbackShort')
const exportFallbackDetailsZh = t('zh', 'exportFallbackDetails')
const exportFallbackActionEn = t('en', 'exportFallbackAction')
const fixHintEn = buildFixHint('parseZero', [], undefined, 'en')
const repairPriorityEn = buildRepairPriority(issuesMatch2, 'en')

const mockHistory = [
  {
    id: 'h1',
    createdAt: new Date().toISOString(),
    inputText: sample,
    outputText: result.outputText,
    parsedCount: 2,
    configSnapshot: { ...defaultStrategyConfig },
  },
  {
    id: 'h2',
    createdAt: new Date(Date.now() - 1000).toISOString(),
    inputText: sample,
    outputText: analyzeMatches(matches, { ...defaultStrategyConfig, crowdThreshold: 70 }).outputText,
    parsedCount: 2,
    configSnapshot: { ...defaultStrategyConfig, crowdThreshold: 70 },
  },
]
const filtered = filterHistory(mockHistory, 'all', '阿森纳')
const exported = buildExportText(mockHistory[0], 'zh')
const exportedEn = buildExportText(mockHistory[0], 'en')
const exportPayloadZh = buildExportPayload(mockHistory[0], 'zh')
const exportPayloadEn = buildExportPayload(mockHistory[0], 'en')
const fallbackDigestEn = buildFallbackDigest('boom', 'en', '2026-02-13T00:00:00.000Z')
const diagnosticPackEn = buildDiagnosticPack({
  reason: 'boom',
  lang: 'en',
  inputText: sample,
  selectedRepairIndex: 1,
  repairTargetLabel: 'Arsenal vs Chelsea',
  configSnapshot: { crowdThreshold: 80 },
  appVersion: '0.0.0',
  modeSummary: 'lang=en,policyV38=true,handicap=true',
  buildTime: '2026-02-13T00:00:00.000Z',
  uaShort: 'Chrome 122 / macOS',
  uaFull: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  masked: false,
  maskedLevel: 'none',
  nowIso: '2026-02-13T00:00:00.000Z',
})
const diagnosticPackMaskedEn = buildDiagnosticPack({
  reason: 'boom',
  lang: 'en',
  inputText: sample,
  selectedRepairIndex: 1,
  repairTargetLabel: 'Arsenal vs Chelsea',
  configSnapshot: { crowdThreshold: 80 },
  appVersion: '0.0.0',
  modeSummary: 'lang=en,policyV38=true,handicap=true',
  buildTime: '2026-02-13T00:00:00.000Z',
  uaShort: 'Chrome 122 / macOS',
  uaFull: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  masked: true,
  maskedLevel: 'A',
  nowIso: '2026-02-13T00:00:00.000Z',
})
const diagnosticPackMaskedBEn = buildDiagnosticPack({
  reason: 'boom',
  lang: 'en',
  inputText: sample,
  selectedRepairIndex: 1,
  repairTargetLabel: 'Arsenal vs Chelsea',
  configSnapshot: { crowdThreshold: 80 },
  appVersion: '0.0.0',
  modeSummary: 'lang=en,policyV38=true,handicap=true',
  buildTime: '2026-02-13T00:00:00.000Z',
  uaShort: 'Chrome 122 / macOS',
  uaFull: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  masked: true,
  maskedLevel: 'B',
  nowIso: '2026-02-13T00:00:00.000Z',
})
const uaMasked = maskUaFull('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36', 'A')
const uaMaskedB = maskUaFull('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36', 'B')
const maskLevelFallback = normalizeMaskLevel('X')
const legendVisibleFallback = normalizeLegendVisible('X')
const pair = findLatestTwoSameMatch(mockHistory, mockHistory[0])
const cmp = compareHistoryItems(mockHistory[0], mockHistory[1], 'zh')
const cmpEn = compareHistoryItems(mockHistory[0], mockHistory[1], 'en')

const checks = [
  {
    name: '解析场次=2',
    ok: result.parsedCount === 2,
  },
  {
    name: 'outputText 包含两场标题',
    ok:
      result.outputText.includes('马德里竞技 vs 巴塞罗那') &&
      result.outputText.includes('布伦特福德 vs 阿森纳'),
  },
  {
    name: 'outputText 包含推荐/风险/预算模块',
    ok:
      result.outputText.includes('推荐：') &&
      result.outputText.includes('风险：') &&
      result.outputText.includes('【预算（100 RMB + 让球额外50 RMB）】'),
  },
  {
    name: '阿森纳场触发条件博冷',
    ok: result.analyses.some(
      (a) => a.match.homeTeam.includes('布伦特福德') && a.triggerColdDraw,
    ),
  },
  {
    name: '让球推荐已输出（含风险标签）',
    ok:
      result.outputText.includes('【让球建议】') &&
      result.outputText.includes('风险标签：') &&
      result.outputText.includes('推荐：让平'),
  },
  {
    name: '让球预算按30+20分配',
    ok:
      result.outputText.includes('让球预算分配：30 RMB') &&
      result.outputText.includes('让球预算分配：20 RMB'),
  },
  {
    name: '关闭让球时不输出推荐',
    ok:
      resultHandicapOff.outputText.includes('已关闭让球推荐') &&
      !resultHandicapOff.outputText.includes('让球预算分配：'),
  },
  {
    name: '历史筛选（关键词）有效',
    ok: filtered.length === 2,
  },
  {
    name: '导出文本包含输入/参数/输出',
    ok:
      exported.includes('--- 输入 ---') &&
      exported.includes('--- 参数 ---') &&
      exported.includes('--- 输出 ---'),
  },
  {
    name: '导出文本支持英文标题',
    ok:
      exportedEn.includes('--- INPUT ---') &&
      exportedEn.includes('--- CONFIG ---') &&
      exportedEn.includes('--- OUTPUT ---'),
  },
  {
    name: '导出正文可按语言重算',
    ok:
      exportPayloadZh.text.includes('【Footy Analyzer V1 建议】') &&
      exportPayloadEn.text.includes('[Footy Analyzer V1 Suggestions]') &&
      !exportPayloadZh.usedFallback &&
      !exportPayloadEn.usedFallback,
  },
  {
    name: '错误摘要复制文案可生成',
    ok: fallbackDigestEn.includes('Error summary: boom') && fallbackDigestEn.includes('lang: en'),
  },
  {
    name: '完整诊断包文案可生成',
    ok:
      diagnosticPackEn.includes('[Session Meta]') &&
      diagnosticPackEn.includes('version: 0.0.0') &&
      diagnosticPackEn.includes('mode: lang=en,policyV38=true,handicap=true') &&
      diagnosticPackEn.includes('buildTime: 2026-02-13T00:00:00.000Z') &&
      diagnosticPackEn.includes('uaShort: Chrome 122 / macOS') &&
      diagnosticPackEn.includes('maskLevel: none') &&
      diagnosticPackEn.includes('uaFull: Mozilla/5.0 (Macintosh)') &&
      diagnosticPackEn.includes('Diagnostic time: 2026-02-13T00:00:00.000Z') &&
      diagnosticPackEn.includes('Repair target: Match #2') &&
      diagnosticPackEn.includes('Config snapshot:'),
  },
  {
    name: '脱敏诊断包与UA脱敏函数可用',
    ok:
      uaMasked === 'Chrome/122; macOS' &&
      uaMaskedB === 'Chrome/122; macOS; Desktop' &&
      maskLevelFallback === 'A' &&
      legendVisibleFallback === true &&
      diagnosticPackMaskedEn.includes('maskLevel: A') &&
      diagnosticPackMaskedEn.includes('uaFull: Chrome/122; macOS') &&
      diagnosticPackMaskedBEn.includes('maskLevel: B') &&
      diagnosticPackMaskedBEn.includes('uaFull: Chrome/122; macOS; Desktop') &&
      !diagnosticPackMaskedEn.includes('AppleWebKit/537.36'),
  },
  {
    name: '自动同场最近两条匹配',
    ok: pair.length === 2,
  },
  {
    name: '结构化对比可生成',
    ok: cmp.text.includes('【复盘对比】') && cmp.text.includes('【预算对比】'),
  },
  {
    name: '结构化对比支持英文',
    ok: cmpEn.text.includes('[Review Compare]') && cmpEn.text.includes('[Budget Compare]'),
  },
  {
    name: 'v3.8 缺关键字段触发停机协议',
    ok:
      resultV38.outputText.includes('停机协议触发') &&
      resultV38.outputText.includes('数据索取清单'),
  },
  {
    name: 'v3.8 完整字段可输出规则触发链',
    ok:
      resultV38Ready.outputText.includes('C1 F-T 临场强制覆盖') &&
      resultV38Ready.outputText.includes('C8 F1-C 高风险走廊') &&
      resultV38Ready.outputText.includes('D层联赛校准：EPL'),
  },
  {
    name: 'v3.8 输出决定性规则与Top3',
    ok:
      resultV38Ready.outputText.includes('决定性规则') &&
      resultV38Ready.outputText.includes('Top3规则'),
  },
  {
    name: 'v3.8 输出决定性规则解释',
    ok:
      resultV38Ready.outputText.includes('决定性规则解释') &&
      resultV38Ready.outputText.includes('命中'),
  },
  {
    name: 'v3.8 短版解释生效（标签风格）',
    ok:
      resultV38Short.outputText.includes('决定性规则解释') &&
      resultV38Short.outputText.includes('#B1红区熔断 #高风险 #ratio55.0'),
  },
  {
    name: 'v3.8 短版标签追加到关键证据首条',
    ok: resultV38Short.outputText.includes('当前 ratio=55.00%，熔断线=50% | #B1红区熔断 #高风险 #ratio55.0'),
  },
  {
    name: 'v3.8 长版解释生效',
    ok: resultV38Ready.outputText.includes('该规则优先级最高，直接触发熔断解释。'),
  },
  {
    name: 'v3.8 自定义标签生效（解释+证据）',
    ok:
      resultV38ShortCustom.outputText.includes('#自定义红区 #高风险 #ratio55.0') &&
      resultV38ShortCustom.outputText.includes('熔断线=50% | #自定义红区 #高风险 #ratio55.0'),
  },
  {
    name: '标签预设：稳健可应用',
    ok: presetConservative.v38TagOverrides.B1 === '#红区熔断',
  },
  {
    name: '标签预设：激进可应用',
    ok: presetAggressive.v38TagOverrides.C8 === '#高风险推进',
  },
  {
    name: '预设变更说明可生成',
    ok: presetChangeDesc.includes('B1/C1/C8/C9'),
  },
  {
    name: '手动变更说明可生成',
    ok: manualChangeDesc === '标签已手动更新：B1',
  },
  {
    name: 'toast 合并文案可生成',
    ok: mergedToast === '已更新多项配置',
  },
  {
    name: 'toast 队列上限=5 生效',
    ok:
      toastQueueLimited.length === 5 &&
      toastQueueLimited[0].message === 'b' &&
      toastQueueLimited[4].message === 'f' &&
      toastQueueLimited[4].level === 'error',
  },
  {
    name: 'toast 类型图标映射正确',
    ok: iconOk === '✓' && iconWarn === '!' && iconErr === '✕',
  },
  {
    name: '快速修复提示（解析失败）可生成',
    ok: fixHintParseZero.includes('解析失败') && fixHintParseZero.includes('示例：'),
  },
  {
    name: '快速修复提示（硬规则停机）可生成',
    ok: fixHintHardRule.includes('硬规则停机') && fixHintHardRule.includes('V_total'),
  },
  {
    name: '硬规则缺失/可疑字段识别可用',
    ok:
      hardIssues.includes('T=缺失') &&
      hardIssues.some((x) => x.startsWith('快照=')) &&
      hardIssues.length >= 2,
  },
  {
    name: '动态模板包含缺失字段补齐项',
    ok:
      dynamicTemplate.includes('主队 vs 客队') &&
      dynamicTemplate.includes('T=1.2h') &&
      dynamicTemplate.includes('快照=2'),
  },
  {
    name: '动态模板可继承最近上下文（队名/联赛/T）',
    ok:
      dynamicTemplateWithCtx.includes('曼城 vs 利物浦') &&
      dynamicTemplateWithCtx.includes('League=EPL') &&
      dynamicTemplateWithCtx.includes('T=0.8h'),
  },
  {
    name: '第N场修复对象标签可生成',
    ok: repairTarget.includes('第2场：阿森纳 vs 切尔西｜联赛=EPL｜T=0.6h'),
  },
  {
    name: '第N场切换可得到不同字段问题集',
    ok: issuesMatch1.length === 0 && issuesMatch2.length >= 4,
  },
  {
    name: '动态修复顺序文案可生成',
    ok:
      repairPriority.includes('先补 T/快照') &&
      repairPriority.includes('再补 V_total') &&
      repairPriority.includes('最后补 H_fav/PL_fav'),
  },
  {
    name: '分步补齐模板可生成',
    ok:
      patchedTs.includes('T=0.6h') &&
      patchedTs.includes('快照=2') &&
      patchedV.includes('总交易量 1200000') &&
      patchedHp.includes('占比主 70 | 平 15 | 客 15'),
  },
  {
    name: '撤销栈（长度5）与回退快照可用',
    ok:
      undoHistory.length === 2 &&
      undoPopped.next.length === 1 &&
      undoPopped.popped?.inputText === 'step2' &&
      undoPopped.popped?.completed.includes('V_total'),
  },
  {
    name: '重做栈可用',
    ok:
      redoHistory.length === 1 &&
      redoPopped.next.length === 0 &&
      redoPopped.popped?.inputText === 'redo1',
  },
  {
    name: '撤销/重做提示文案可生成',
    ok:
      undoHintEnabled.includes('Cmd/Ctrl+Z') &&
      redoHintDisabled.includes('无可重做步骤') &&
      redoHintDisabled.includes('先执行一次撤销后'),
  },
  {
    name: 'i18n 中英文案可命中',
    ok:
      undoHintEn.includes('Undo one step') &&
      i18nLangLabel === 'Language' &&
      i18nMaskBadge === 'MASK' &&
      i18nMaskHint === 'Affects masked diagnostic copy' &&
      i18nMaskLegend === 'A=safer, B=more info' &&
      i18nShowLegend === 'Show legend' &&
      i18nHideLegend === 'Hide legend' &&
      i18nFallbackZh === '仅中文回退' &&
      exportFallbackEn.includes('fell back') &&
      exportFallbackDetailsZh.includes('重算失败') &&
      exportFallbackActionEn === 'Details',
  },
  {
    name: '修复提示与修复顺序支持英文',
    ok: fixHintEn.includes('Parse failed') && repairPriorityEn.includes('Repair order:'),
  },
  {
    name: 'engine 常规输出支持英文',
    ok: resultEn.outputText.includes('[Footy Analyzer V1 Suggestions]') && resultEn.outputText.includes('Parsed matches:'),
  },
  {
    name: 'engine v3.8 输出支持英文',
    ok: resultV38En.outputText.includes('[Footy Analyzer v3.8.x Hard-rule Audit]') && resultV38En.outputText.includes('Risk Audit Table'),
  },
]

const failed = checks.filter((c) => !c.ok)

if (failed.length > 0) {
  console.error('❌ Selftest failed:')
  failed.forEach((f) => console.error(`- ${f.name}`))
  throw new Error('selftest failed')
}

console.log('✅ Selftest passed')
checks.forEach((c) => console.log(`- ${c.name}`))
