import { useEffect, useMemo, useRef, useState } from 'react'
import './index.css'
import { parseInput } from './lib/parser'
import { analyzeMatches, defaultStrategyConfig } from './lib/engine'
import type { HistoryItem, StrategyConfig } from './lib/types'
import {
  buildDiagnosticPack,
  buildExportPayload,
  buildFallbackDigest,
  filterHistory,
  normalizeLegendVisible,
  normalizeMaskLevel,
  type DateFilter,
} from './lib/history'
import { compareHistoryItems, findLatestTwoSameMatch } from './lib/compare'
import {
  applyTagPreset,
  buildDynamicTemplate,
  buildFixHint,
  buildRepairPriority,
  patchByRepairStep,
  popRedoHistory,
  popUndoHistory,
  pushRedoHistory,
  pushUndoHistory,
  undoRedoHint,
  describePresetChanges,
  detectHardRuleIssuesFromMatch,
  enqueueToastWithLimit,
  mergedToastMessage,
  toastIcon,
  type ToastItem,
  formatRepairTarget,
  type TemplateContext,
} from './lib/tagPresets'
import { dateLocale, detectBrowserLang, t, type Lang } from './lib/i18n'

const HISTORY_KEY = 'footy_analyzer_history_v1'
const LANG_KEY = 'footy_analyzer_lang'
const MASK_LEVEL_KEY = 'footy_analyzer_mask_level'
const LEGEND_VISIBLE_KEY = 'footy_analyzer_mask_legend_visible'
const APP_VERSION = (import.meta as any).env?.npm_package_version ?? '0.0.0'
const APP_BUILD_TIME = (import.meta as any).env?.VITE_BUILD_TIME ?? 'unknown-build-time'

const uaShort = () => {
  if (typeof navigator === 'undefined') return 'Unknown/Unknown'
  const ua = navigator.userAgent
  const browser = /Chrome\/(\d+)/.test(ua)
    ? `Chrome ${RegExp.$1}`
    : /Safari\/(\d+)/.test(ua)
      ? `Safari ${RegExp.$1}`
      : /Firefox\/(\d+)/.test(ua)
        ? `Firefox ${RegExp.$1}`
        : /Edg\/(\d+)/.test(ua)
          ? `Edge ${RegExp.$1}`
          : 'UnknownBrowser'
  const os = /Mac OS X/.test(ua)
    ? 'macOS'
    : /Windows NT/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : 'UnknownOS'
  return `${browser} / ${os}`
}

const loadHistory = (): HistoryItem[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

const saveHistory = (items: HistoryItem[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
}

const defaultInput = `马德里竞技 vs 巴塞罗那 成交价主 2.82 | 平 4.10 | 客 2.50 交易量主 301198 | 平 103703 | 客 739440 占比主 26.3% | 平 9.1% | 客 64.6% 总交易量 1144341 盈亏主 294963 | 平 719159 | 客 -704259
布伦特福德 vs 阿森纳 成交价主 5.70 | 平 4.10 | 客 1.73 交易量主 172064 | 平 57869 | 客 1656780 占比主 9.1% | 平 3.1% | 客 87.8% 总交易量 1886713 盈亏主 905948 | 平 1649450 | 客 -979516 冷热主 -51 | 平 -87 | 客 55`

function App() {
  const [inputText, setInputText] = useState(defaultInput)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  const [copyMsg, setCopyMsg] = useState('')
  const [config, setConfig] = useState<StrategyConfig>(defaultStrategyConfig)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [compareText, setCompareText] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [presetToast, setPresetToast] = useState<ToastItem | null>(null)
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const [fixHint, setFixHint] = useState('')
  const [dynamicTemplate, setDynamicTemplate] = useState('')
  const [lastGoodContext, setLastGoodContext] = useState<TemplateContext>({})
  const [selectedRepairIndex, setSelectedRepairIndex] = useState(0)
  const [completedRepairSteps, setCompletedRepairSteps] = useState<string[]>([])
  const [repairHistory, setRepairHistory] = useState<Array<{ inputText: string; completed: string[] }>>([])
  const [redoHistory, setRedoHistory] = useState<Array<{ inputText: string; completed: string[] }>>([])
  const [buttonTooltip, setButtonTooltip] = useState('')
  const [exportBanner, setExportBanner] = useState('')
  const [exportBannerDetail, setExportBannerDetail] = useState('')
  const [exportFallbackReason, setExportFallbackReason] = useState('')
  const [showExportDetail, setShowExportDetail] = useState(false)
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [maskedLevel, setMaskedLevel] = useState<'A' | 'B'>(() => {
    const saved = localStorage.getItem(MASK_LEVEL_KEY)
    const normalized = normalizeMaskLevel(saved)
    if (saved && saved !== normalized) localStorage.removeItem(MASK_LEVEL_KEY)
    return normalized
  })
  const [legendVisible, setLegendVisible] = useState<boolean>(() => {
    const saved = localStorage.getItem(LEGEND_VISIBLE_KEY)
    const normalized = normalizeLegendVisible(saved)
    if (saved && saved !== '1' && saved !== '0') localStorage.removeItem(LEGEND_VISIBLE_KEY)
    return normalized
  })
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null
    if (saved === 'zh' || saved === 'en') return saved
    return detectBrowserLang()
  })
  const debounceRef = useRef<number | null>(null)
  const pendingToastRef = useRef(0)

  useEffect(() => {
    const apply = () => setIsMobile(window.innerWidth < 768)
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
  }, [lang])

  useEffect(() => {
    localStorage.setItem(MASK_LEVEL_KEY, maskedLevel)
  }, [maskedLevel])

  useEffect(() => {
    localStorage.setItem(LEGEND_VISIBLE_KEY, legendVisible ? '1' : '0')
  }, [legendVisible])

  useEffect(() => {
    if (presetToast || toastQueue.length === 0) return
    const [head, ...rest] = toastQueue
    setPresetToast(head)
    setToastQueue(rest)
    const t = window.setTimeout(() => setPresetToast(null), 1200)
    return () => window.clearTimeout(t)
  }, [presetToast, toastQueue])

  const parsed = useMemo(() => parseInput(inputText), [inputText])
  const runtimeConfig = useMemo(
    () => ({ ...config, v38IsMobile: isMobile, lang }),
    [config, isMobile, lang],
  )
  const result = useMemo(() => analyzeMatches(parsed, runtimeConfig), [parsed, runtimeConfig])
  const visibleHistory = useMemo(
    () => filterHistory(history, dateFilter, keyword),
    [history, dateFilter, keyword],
  )

  useEffect(() => {
    if (result.parsedCount === 0) return
    const safeIdx = Math.min(selectedRepairIndex, result.analyses.length - 1)
    if (safeIdx !== selectedRepairIndex) setSelectedRepairIndex(safeIdx)
    const m = result.analyses[safeIdx]?.match
    if (!m) return
    setLastGoodContext({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      timePoint: m.timePoint,
    })
  }, [result.parsedCount, result.outputText, selectedRepairIndex])

  useEffect(() => {
    setCompletedRepairSteps([])
    setRepairHistory([])
    setRedoHistory([])
  }, [selectedRepairIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmd = e.ctrlKey || e.metaKey
      const isZ = e.key.toLowerCase() === 'z'
      if (!isCmd || !isZ) return
      e.preventDefault()
      if (e.shiftKey) {
        redoRepairStep()
      } else {
        undoRepairStep()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inputText, completedRepairSteps])


  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.outputText)
    setCopyMsg(t(lang, 'copied'))
    setTimeout(() => setCopyMsg(''), 1500)
  }

  const handleSave = () => {
    const item: HistoryItem = {
      id: `h_${Date.now()}`,
      createdAt: new Date().toISOString(),
      inputText,
      outputText: result.outputText,
      parsedCount: result.parsedCount,
      configSnapshot: { ...config },
    }
    const next = [item, ...history]
    setHistory(next)
    saveHistory(next)
  }

  const handleLoad = (id: string) => {
    const item = history.find((h) => h.id === id)
    if (!item) return
    setInputText(item.inputText)
    setConfig({ ...defaultStrategyConfig, ...item.configSnapshot })
  }

  const handleDelete = (id: string) => {
    const next = history.filter((h) => h.id !== id)
    setHistory(next)
    saveHistory(next)
  }

  const handleExport = (id: string) => {
    const item = history.find((h) => h.id === id)
    if (!item) return
    const exportLang: Lang = lang === 'zh' ? 'zh' : 'en'
    const { text, usedFallback, reason } = buildExportPayload(item, exportLang)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const prefix = exportLang === 'zh' ? '复盘导出' : 'footy-review'
    a.download = `${prefix}-${item.createdAt.replace(/[:.]/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    if (usedFallback) {
      const msg = t(lang, 'exportFallbackShort')
      setToastQueue((prev) =>
        enqueueToastWithLimit(prev, { message: msg, level: 'warn' }, 5),
      )
      setExportBanner(msg)
      setExportFallbackReason(reason)
      setExportBannerDetail(`${t(lang, 'exportFallbackDetails')}${reason ? ` (${reason})` : ''}`)
      setShowExportDetail(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const handleCompare = () => {
    let pair: HistoryItem[] = []
    if (selectedIds.length === 2) {
      pair = history.filter((h) => selectedIds.includes(h.id)).slice(0, 2)
    } else if (selectedIds.length === 1) {
      const base = history.find((h) => h.id === selectedIds[0])
      if (base) pair = findLatestTwoSameMatch(history, base)
    }

    if (pair.length < 2) {
      setCompareText(
        lang === 'zh'
          ? '未找到可对比的两条记录。请勾选两条，或勾选一条后自动匹配同场最近两条。'
          : 'No comparable pair found. Select 2 records, or select 1 to auto-match latest same match.',
      )
      return
    }

    const res = compareHistoryItems(pair[0], pair[1], lang)
    setCompareText(res.text)
  }

  const updateConfig = <K extends keyof StrategyConfig>(key: K, value: number) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const scheduleMergedToast = (level: 'success' | 'warn' | 'error' = 'success') => {
    pendingToastRef.current += 1
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      if (pendingToastRef.current > 0) {
        setToastQueue((prev) => enqueueToastWithLimit(prev, { message: mergedToastMessage(lang), level }, 5))
      }
      pendingToastRef.current = 0
      debounceRef.current = null
    }, 500)
  }

  const updateV38Tag = (key: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      v38TagOverrides: {
        ...prev.v38TagOverrides,
        [key]: value,
      },
    }))
    scheduleMergedToast(value.trim() ? 'success' : 'warn')
  }

  const applyPreset = (preset: 'conservative' | 'aggressive') => {
    setConfig((prev) => {
      const next = applyTagPreset(prev, preset)
      // 保留变更计算用于后续扩展，但当前按2B统一合并文案
      describePresetChanges(prev.v38TagOverrides, next.v38TagOverrides)
      return next
    })
    scheduleMergedToast('success')
  }

  const pushRepairHistory = (nextInput: string, nextCompleted: string[]) => {
    setRepairHistory((prev) =>
      pushUndoHistory(prev, { inputText: nextInput, completed: nextCompleted }, 5),
    )
  }

  const undoRepairStep = () => {
    setRepairHistory((prev) => {
      const { next, popped } = popUndoHistory(prev)
      if (!popped) {
        setToastQueue((q) => enqueueToastWithLimit(q, { message: t(lang, 'noUndo'), level: 'warn' }, 5))
        return prev
      }
      setRedoHistory((rh) =>
        pushRedoHistory(rh, { inputText, completed: completedRepairSteps }, 5),
      )
      setInputText(popped.inputText)
      setCompletedRepairSteps(popped.completed)
      setToastQueue((q) => enqueueToastWithLimit(q, { message: t(lang, 'undoDone'), level: 'success' }, 5))
      return next
    })
  }

  const redoRepairStep = () => {
    setRedoHistory((prev) => {
      const { next, popped } = popRedoHistory(prev)
      if (!popped) {
        setToastQueue((q) => enqueueToastWithLimit(q, { message: t(lang, 'noRedo'), level: 'warn' }, 5))
        return prev
      }
      setRepairHistory((uh) => pushUndoHistory(uh, { inputText, completed: completedRepairSteps }, 5))
      setInputText(popped.inputText)
      setCompletedRepairSteps(popped.completed)
      setToastQueue((q) => enqueueToastWithLimit(q, { message: t(lang, 'redoDone'), level: 'success' }, 5))
      return next
    })
  }

  const handleUndoClick = () => {
    if (repairHistory.length === 0) {
      setToastQueue((q) => enqueueToastWithLimit(q, { message: undoRedoHint('undo', false, lang), level: 'warn' }, 5))
      return
    }
    undoRepairStep()
  }

  const handleRedoClick = () => {
    if (redoHistory.length === 0) {
      setToastQueue((q) => enqueueToastWithLimit(q, { message: undoRedoHint('redo', false, lang), level: 'warn' }, 5))
      return
    }
    redoRepairStep()
  }

  const applyRepairStep = (step: 'ts' | 'v' | 'hp') => {
    const safeIdx = Math.min(selectedRepairIndex, result.analyses.length - 1)
    const target = result.analyses[safeIdx]?.match
    const patched = patchByRepairStep(step, {
      homeTeam: target?.homeTeam ?? lastGoodContext.homeTeam,
      awayTeam: target?.awayTeam ?? lastGoodContext.awayTeam,
      league: target?.league ?? lastGoodContext.league,
      timePoint: target?.timePoint ?? lastGoodContext.timePoint,
    })
    const label = step === 'ts' ? 'T/快照' : step === 'v' ? 'V_total' : 'H_fav/PL_fav'
    const nextCompleted = completedRepairSteps.includes(label)
      ? completedRepairSteps
      : [...completedRepairSteps, label]
    pushRepairHistory(inputText, completedRepairSteps)
    setRedoHistory([])
    setInputText(patched)
    setCompletedRepairSteps(nextCompleted)
    setToastQueue((prev) =>
      enqueueToastWithLimit(
        prev,
        { message: `${t(lang, 'patchedPrefix')}${safeIdx + 1}${t(lang, 'patchedSuffix')}${label}`, level: 'success' },
        5,
      ),
    )
  }

  const handleCopyFallbackSummary = async () => {
    const digest = buildFallbackDigest(exportFallbackReason, lang)
    await navigator.clipboard.writeText(digest)
    setToastQueue((prev) => enqueueToastWithLimit(prev, { message: t(lang, 'copied'), level: 'success' }, 5))
    setSummaryCopied(true)
    setTimeout(() => setSummaryCopied(false), 1500)
  }

  const copyDiagnosticPack = async (masked: boolean) => {
    const targetLabel = `${lastGoodContext.homeTeam ?? 'N/A'} vs ${lastGoodContext.awayTeam ?? 'N/A'}`
    const pack = buildDiagnosticPack({
      reason: exportFallbackReason,
      lang,
      inputText,
      selectedRepairIndex,
      repairTargetLabel: targetLabel,
      configSnapshot: config,
      appVersion: APP_VERSION,
      modeSummary: `lang=${lang},policyV38=${config.policyV38Enabled},handicap=${config.handicapEnabled}`,
      buildTime: APP_BUILD_TIME,
      uaShort: uaShort(),
      uaFull: typeof navigator === 'undefined' ? 'Unknown' : navigator.userAgent,
      masked,
      maskedLevel: masked ? maskedLevel : 'none',
    })
    await navigator.clipboard.writeText(pack)
    setToastQueue((prev) => enqueueToastWithLimit(prev, { message: t(lang, 'copied'), level: 'success' }, 5))
  }

  const handleCopyDiagnosticPack = async () => copyDiagnosticPack(false)
  const handleCopyMaskedDiagnosticPack = async () => copyDiagnosticPack(true)

  const handleGenerate = () => {
    const parsedNow = parseInput(inputText)
    if (parsedNow.length === 0) {
      setFixHint(buildFixHint('parseZero', [], undefined, lang))
      setDynamicTemplate('')
      setCompletedRepairSteps([])
      setToastQueue((prev) =>
        enqueueToastWithLimit(prev, { message: t(lang, 'parseZero'), level: 'error' }, 5),
      )
      return
    }

    if (runtimeConfig.policyV38Enabled) {
      const safeIdx = Math.min(selectedRepairIndex, result.analyses.length - 1)
      const target = result.analyses[safeIdx]?.match
      if (target) {
        const issues = detectHardRuleIssuesFromMatch(target)
        if (issues.length > 0) {
          const quickAdvice = buildRepairPriority(issues, lang)
          setFixHint(buildFixHint('hardRuleMissing', issues, quickAdvice, lang))
          setDynamicTemplate(buildDynamicTemplate(issues, {
            homeTeam: target.homeTeam,
            awayTeam: target.awayTeam,
            league: target.league,
            timePoint: target.timePoint,
          }, lang))
          const shortOrder = quickAdvice.replace('修复顺序：', '')
          setToastQueue((prev) =>
            enqueueToastWithLimit(
              prev,
              { message: `${t(lang, 'hardRuleStopPrefix')}${shortOrder}`, level: 'warn' },
              5,
            ),
          )
          return
        }
      }
    }

    setFixHint('')
    setDynamicTemplate('')
    setCompletedRepairSteps([])
    setToastQueue((prev) =>
      enqueueToastWithLimit(prev, { message: t(lang, 'analysisRefreshed'), level: 'success' }, 5),
    )
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Footy Analyzer V1</h1>
        <p>{t(lang, 'appSubtitle')}</p>
        <div className="btn-row">
          <label>
            {t(lang, 'langLabel')}：
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        {presetToast && (
          <div className={`toast toast-${presetToast.level}`}>
            {toastIcon(presetToast.level)} {presetToast.message}
          </div>
        )}
      </header>

      <section className="panel config-panel">
        <div className="panel-title">{t(lang, 'panelConfig')}</div>
        <div className="config-grid">
          <label>
            {t(lang, 'crowdThreshold')}
            <input type="number" value={config.crowdThreshold} onChange={(e) => updateConfig('crowdThreshold', Number(e.target.value) || 0)} />
          </label>
          <label>
            {t(lang, 'heatThreshold')}
            <input type="number" value={config.heatThreshold} onChange={(e) => updateConfig('heatThreshold', Number(e.target.value) || 0)} />
          </label>
          <label>
            {t(lang, 'totalBudget')}
            <input type="number" value={config.totalBudget} onChange={(e) => updateConfig('totalBudget', Number(e.target.value) || 0)} />
          </label>
          <label>
            {t(lang, 'parlayBudget')}
            <input type="number" value={config.parlayBudget} onChange={(e) => updateConfig('parlayBudget', Number(e.target.value) || 0)} />
          </label>
          <label>
            {t(lang, 'singleBudget')}
            <input type="number" value={config.singleBudget} onChange={(e) => updateConfig('singleBudget', Number(e.target.value) || 0)} />
          </label>
          <label>
            {t(lang, 'coldBudget')}
            <input type="number" value={config.coldBudget} onChange={(e) => updateConfig('coldBudget', Number(e.target.value) || 0)} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={config.handicapEnabled} onChange={(e) => setConfig((prev) => ({ ...prev, handicapEnabled: e.target.checked }))} />
            {t(lang, 'handicapEnabled')}
          </label>
          <label>
            {t(lang, 'handicapCrowdThreshold')}
            <input type="number" value={config.handicapCrowdThreshold} onChange={(e) => updateConfig('handicapCrowdThreshold', Number(e.target.value) || 0)} />
          </label>
          <label>
            {t(lang, 'handicapHeatThreshold')}
            <input type="number" value={config.handicapHeatThreshold} onChange={(e) => updateConfig('handicapHeatThreshold', Number(e.target.value) || 0)} />
          </label>
          <label>
            {t(lang, 'handicapExtraBudget')}
            <input type="number" value={config.handicapExtraBudget} onChange={(e) => updateConfig('handicapExtraBudget', Number(e.target.value) || 0)} />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.policyV38Enabled}
              onChange={(e) => setConfig((prev) => ({ ...prev, policyV38Enabled: e.target.checked }))}
            />
            {t(lang, 'policyV38Enabled')}
          </label>

          <div className="btn-row">
            <button onClick={() => applyPreset('conservative')}>{t(lang, 'applyConservative')}</button>
            <button onClick={() => applyPreset('aggressive')}>{t(lang, 'applyAggressive')}</button>
          </div>

          <label>
            {t(lang, 'tagB1')}
            <input
              type="text"
              value={config.v38TagOverrides.B1 ?? '#B1红区熔断'}
              onChange={(e) => updateV38Tag('B1', e.target.value)}
            />
          </label>
          <label>
            {t(lang, 'tagC1')}
            <input
              type="text"
              value={config.v38TagOverrides.C1 ?? '#临场覆盖'}
              onChange={(e) => updateV38Tag('C1', e.target.value)}
            />
          </label>
          <label>
            {t(lang, 'tagC8')}
            <input
              type="text"
              value={config.v38TagOverrides.C8 ?? '#高风险走廊'}
              onChange={(e) => updateV38Tag('C8', e.target.value)}
            />
          </label>
          <label>
            {t(lang, 'tagC9')}
            <input
              type="text"
              value={config.v38TagOverrides.C9 ?? '#空心热度'}
              onChange={(e) => updateV38Tag('C9', e.target.value)}
            />
          </label>
        </div>
      </section>

      {exportBanner && (
        <div className="export-banner">
          <div className="btn-row">
            <strong>{exportBanner}</strong>
            <button onClick={() => setShowExportDetail((v) => !v)}>
              {showExportDetail ? t(lang, 'exportFallbackClose') : t(lang, 'exportFallbackAction')}
            </button>
            <button onClick={() => { setExportBanner(''); setExportBannerDetail(''); setExportFallbackReason(''); setShowExportDetail(false); setSummaryCopied(false) }}>
              ×
            </button>
          </div>
          {showExportDetail && exportBannerDetail && (
            <div>
              <div className="hint-text">{exportBannerDetail}</div>
              <div className="btn-row">
                <span
                  className={`mask-badge ${maskedLevel === 'A' ? 'mask-badge-a' : 'mask-badge-b'}`}
                  title={lang === 'zh' ? (maskedLevel === 'A' ? 'A 级（更保守）' : 'B 级（更多信息）') : (maskedLevel === 'A' ? 'Level A (safer)' : 'Level B (more info)')}
                >
                  {t(lang, 'maskBadgePrefix')} {maskedLevel}
                </span>
                {legendVisible && <span className="hint-text">{t(lang, 'maskLegend')}</span>}
                <button className="link-btn" onClick={() => setLegendVisible((v) => !v)}>
                  {legendVisible ? t(lang, 'hideLegend') : t(lang, 'showLegend')}
                </button>
              </div>
              <div className="btn-row">
                <button onClick={handleCopyFallbackSummary}>
                  {summaryCopied ? t(lang, 'copied') : t(lang, 'copyErrorSummary')}
                </button>
                <button onClick={handleCopyDiagnosticPack}>{t(lang, 'copyDiagnosticPack')}</button>
                <button onClick={handleCopyMaskedDiagnosticPack}>{t(lang, 'copyDiagnosticPackMasked')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <main className="main-grid">
        <section className="panel">
          <div className="panel-title">{t(lang, 'panelInput')}</div>
          <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} className="input" placeholder={lang === 'zh' ? '粘贴比赛文本...' : 'Paste match text...'} />
          {fixHint && (
            <div className="fix-hint">
              {result.analyses.length > 0 && (
                <div className="btn-row">
                  <label>
                    {t(lang, 'fixTarget')}
                    <select
                      value={selectedRepairIndex}
                      onChange={(e) => setSelectedRepairIndex(Number(e.target.value) || 0)}
                    >
                      {result.analyses.map((a, idx) => (
                        <option key={a.match.id} value={idx}>
                          {lang === 'zh' ? `第${idx + 1}场` : `Match #${idx + 1}`} {a.match.homeTeam} vs {a.match.awayTeam}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <pre>{fixHint}</pre>
              {dynamicTemplate && <pre>{formatRepairTarget(selectedRepairIndex, lastGoodContext)}</pre>}
              <div className="btn-row">
                <button
                  onClick={() =>
                    setInputText(
                      '曼城 vs 利物浦 占比主 82 | 平 9 | 客 9 总交易量 3200000 盈亏主 -1760000 | 平 520000 | 客 810000 T=0.8h 快照=2 联赛=EPL H_early=94 H_last=81',
                    )
                  }
                >
                  {t(lang, 'fillExample')}
                </button>
                {dynamicTemplate && <button onClick={() => setInputText(dynamicTemplate)}>{t(lang, 'fillDynamicTemplate')}</button>}
              </div>
              {dynamicTemplate && (
                <>
                  <div className="btn-row">
                    <button onClick={() => applyRepairStep('ts')}>{t(lang, 'patchTS')}</button>
                    <button onClick={() => applyRepairStep('v')}>{t(lang, 'patchV')}</button>
                    <button onClick={() => applyRepairStep('hp')}>{t(lang, 'patchHP')}</button>
                    <button
                      onClick={handleUndoClick}
                      title={undoRedoHint('undo', repairHistory.length > 0, lang)}
                      onMouseEnter={() => setButtonTooltip(undoRedoHint('undo', repairHistory.length > 0, lang))}
                      onMouseLeave={() => setButtonTooltip('')}
                      className={repairHistory.length === 0 ? 'btn-disabled' : ''}
                    >
                      {t(lang, 'undoBtn')}
                    </button>
                    <button
                      onClick={handleRedoClick}
                      title={undoRedoHint('redo', redoHistory.length > 0, lang)}
                      onMouseEnter={() => setButtonTooltip(undoRedoHint('redo', redoHistory.length > 0, lang))}
                      onMouseLeave={() => setButtonTooltip('')}
                      className={redoHistory.length === 0 ? 'btn-disabled' : ''}
                    >
                      {t(lang, 'redoBtn')}
                    </button>
                    <span className="hint-text">
                      {undoRedoHint('undo', repairHistory.length > 0, lang)} ｜ {undoRedoHint('redo', redoHistory.length > 0, lang)}
                    </span>
                  </div>
                  {buttonTooltip && <div className="btn-tooltip">{buttonTooltip}</div>}
                  {completedRepairSteps.length > 0 && (
                    <div className="muted">{t(lang, 'doneSteps')}{completedRepairSteps.join(lang === 'zh' ? '、' : ', ')}</div>
                  )}
                  <pre>{dynamicTemplate}</pre>
                </>
              )}
            </div>
          )}
          <div className="btn-row">
            <button onClick={handleGenerate}>{t(lang, 'generate')}</button>
            <button onClick={handleSave}>{t(lang, 'saveHistory')}</button>
            <span className="parsed">{t(lang, 'parsedCountPrefix')} {result.parsedCount} {t(lang, 'matchesSuffix')}</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">{t(lang, 'panelOutput')}</div>
          <div className="btn-row">
            <span
              className={`mask-badge ${maskedLevel === 'A' ? 'mask-badge-a' : 'mask-badge-b'}`}
              title={lang === 'zh' ? (maskedLevel === 'A' ? 'A 级（更保守）' : 'B 级（更多信息）') : (maskedLevel === 'A' ? 'Level A (safer)' : 'Level B (more info)')}
            >
              {t(lang, 'maskBadgePrefix')} {maskedLevel}
            </span>
            {legendVisible && <span className="hint-text">{t(lang, 'maskLegend')}</span>}
            <button className="link-btn" onClick={() => setLegendVisible((v) => !v)}>
              {legendVisible ? t(lang, 'hideLegend') : t(lang, 'showLegend')}
            </button>
            <label>
              {t(lang, 'maskLevelLabel')}:
              <select value={maskedLevel} onChange={(e) => setMaskedLevel(e.target.value as 'A' | 'B')}>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <span className="hint-text">{t(lang, 'maskLevelHint')}</span>
          </div>
          <pre className="output">{result.outputText}</pre>
          <div className="btn-row">
            <button onClick={handleCopy}>{t(lang, 'copyOneClick')}</button>
            <span className="copy-msg">{copyMsg}</span>
          </div>
        </section>
      </main>

      <section className="panel history">
        <div className="panel-title">{t(lang, 'panelHistory')}</div>
        <div className="btn-row">
          <label>
            {t(lang, 'dateFilter')}
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)}>
              <option value="today">{t(lang, 'today')}</option>
              <option value="7d">{t(lang, 'last7d')}</option>
              <option value="all">{t(lang, 'all')}</option>
            </select>
          </label>
          <input
            className="history-search"
            placeholder={t(lang, 'keywordPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button onClick={handleCompare}>{t(lang, 'compareAction')}</button>
        </div>

        {visibleHistory.length === 0 && <p className="muted">{t(lang, 'noHistory')}</p>}
        {visibleHistory.map((h) => (
          <div className="history-item" key={h.id}>
            <div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(h.id)}
                  onChange={() => toggleSelect(h.id)}
                />
                <strong>{new Date(h.createdAt).toLocaleString(dateLocale(lang))}</strong>
              </label>
              <div className="muted">{t(lang, 'parsedShortPrefix')} {h.parsedCount} {t(lang, 'matchesSuffix')}</div>
            </div>
            <div className="btn-row">
              <button onClick={() => handleLoad(h.id)}>{t(lang, 'load')}</button>
              <button onClick={() => handleExport(h.id)}>{t(lang, 'exportTxt')}</button>
              <button onClick={() => handleDelete(h.id)} className="danger">{t(lang, 'delete')}</button>
            </div>
          </div>
        ))}
        {compareText && (
          <div className="compare-box">
            <div className="panel-title">{t(lang, 'panelCompare')}</div>
            <pre className="output">{compareText}</pre>
          </div>
        )}
      </section>
    </div>
  )
}

export default App
