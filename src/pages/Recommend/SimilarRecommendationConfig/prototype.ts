/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { collaborativeScores, computeSimilarity, matchOf } from '../TrafficAlgorithmConfig/trialCalcMath'
import { TAG_DECAY_POLICY } from '../TagDecaySettings/store'
import { CREATABLE_SCENES, sceneFromParams } from './scenes'

/** P1 仅用于路由识别，不注册到正式销售/坑位枚举，不向后端提交。 */
export const SIMILAR_PREVIEW_TYPE = 17
/** 多場景定位命名：單一策略驅動返回插入/找相似/收藏/搜索引導等場景（業界 I2I+U2I 召回＋場景路由形態）。
 *  2026-11 用户改名：由「相似推薦引擎」升级为「全域相似策略」——弱化「引擎」实现语义，
 *  突出「全域覆蓋 ＋ 生成式策略 ＋ 點擊即時生成 ＋ 多場景回插」四項能力承诺。 */
export const SIMILAR_ALGO_NAME = '全域相似策略'
export const SIMILAR_ALGO_ICON = '🧲'
export const SIMILAR_ALGO_DESC = '全局策略生成式推薦\n點擊實時多場景回插'
/** 入口卡 hero 渐变：indigo 靶蓝（hue≈245）——具科技感的冷色，与品牌宝蓝(≈224)/星紫(≈271) 间隔≥21°，看色识广告。
 *  渐变串内色值属品牌装饰面，不进 cssHex/inlineHex 棘轮口径（同 heroCardStyles 先例）。 */
export const SIMILAR_HERO_GRADIENT = 'radial-gradient(120% 150% at 86% 0%, rgba(129, 140, 248, 0.55) 0%, rgba(129, 140, 248, 0) 55%), linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)'
export type Business = 'delivery' | 'groupBuy'
export type Source = 'merchantSimilar' | 'userSimilar' | 'sameCategory'
/** 排序因子与投流 RANK_FACTOR_OPTIONS 同一词表（含匹配标签热度）；选项单一真源在投流 config。 */
export type Factor = 'match' | 'traffic' | 'quality' | 'distance' | 'tagHeat'
export const FACTOR_VALUES: Factor[] = ['match', 'traffic', 'quality', 'distance', 'tagHeat']
/** 同分决胜词表与投流 RANK_TIE_BREAK_OPTIONS 完全一致；穩定商家 ID 不再作选项——同分决胜仍同分时 inherently 按商家 ID 确定性兜底（见界面问号）。 */
export type TieBreak = 'trafficDirection' | 'quality' | 'distance' | 'random' | 'tagHeat' | 'match'
export const TIE_BREAK_VALUES: TieBreak[] = ['trafficDirection', 'quality', 'distance', 'random', 'tagHeat', 'match']
/** 同類目匹配的類目層級：與投流 similarRec 的 categoryMatchLevel 共用詞表，並補三級檔。 */
export type CategoryLevel = 'primary' | 'secondary' | 'tertiary'
/** 回插動效風格：僅影響消費者端插入瞬間的呈現，不改變召回/排序/計費口徑。 */
export type InsertStyle = 'fade' | 'slide' | 'none'
export const INSERT_STYLE_OPTIONS: { value: InsertStyle; label: string }[] = [
  { value: 'fade', label: '漸變插入' },
  { value: 'slide', label: '滑入插入' },
  { value: 'none', label: '直接插入' },
]
export const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'merchantSimilar', label: '商家相似推薦' },
  { value: 'userSimilar', label: '用戶協同推薦' },
  { value: 'sameCategory', label: '同類目商家推薦' },
]
/** 類目層級選項：層級越深候選越窄，一級最寬（僅同大類），三級最準（近同品類）。 */
export const CATEGORY_LEVEL_OPTIONS: { value: CategoryLevel; label: string }[] = [
  { value: 'primary', label: '一級類目' },
  { value: 'secondary', label: '二級類目' },
  { value: 'tertiary', label: '三級類目' },
]
export const sourceLabel = (source: Source) => SOURCE_OPTIONS.find(option => option.value === source)!.label
export const BRAND_OPTIONS = [{ value: 'flashBee', label: '閃蜂' }, { value: 'mFood', label: 'mFood' }]
export interface PrototypeValues {
  name: string
  brand: string
  business: Business
  /** 算法实例归属场景（scene-scoped）：创建后锁定，决定专属策略 schema 与引用过滤。 */
  scene: number
  tagDecayPolicy: typeof TAG_DECAY_POLICY
  merchantMinimum: number
  userMinimum: number
  metric: 'cosine' | 'weightedJaccard'
  threshold: number
  userThreshold: number
  modes: Source[]
  /** 勾選「同類目商家推薦」時生效的匹配層級；僅該來源可見可配。 */
  categoryLevel: CategoryLevel
  count: 1 | 2
  slot1: Source
  slot2: Source
  triggerMode: 'instant' | 'dwell'
  dwellSeconds: number
  dailyMode: 'unlimited' | 'limited'
  dailyLimit: number
  merchantFreqHours: number
  merchantFreqTimes: number
  rankPreset: 'matchFirst' | 'consumeFirst' | 'custom'
  factors: Factor[]
  tieBreak: TieBreak
  /** 回插動效（僅預覽/消費者端呈現，v1 協議不下發，第二階段隨 scene_config 遷移）。 */
  insertStyle: InsertStyle
  insertAnimMs: number
  insertHighlight: boolean
}
export const PROTOTYPE_DEFAULTS: PrototypeValues = {
  name: '', brand: 'flashBee', business: 'delivery', scene: 1, tagDecayPolicy: TAG_DECAY_POLICY,
  merchantMinimum: 50, userMinimum: 10,
  metric: 'cosine', threshold: 60, userThreshold: 60,
  modes: ['merchantSimilar'], categoryLevel: 'secondary', count: 1, slot1: 'merchantSimilar', slot2: 'merchantSimilar',
  triggerMode: 'instant', dwellSeconds: 10, dailyMode: 'unlimited', dailyLimit: 3,
  merchantFreqHours: 2, merchantFreqTimes: 1,
  rankPreset: 'matchFirst', factors: ['match', 'quality', 'distance'], tieBreak: 'quality',
  insertStyle: 'fade', insertAnimMs: 360, insertHighlight: true,
}

/** 集中的原型表单 schema：仅做 UX 校验，第二阶段后端必须重验。
 * label 一律不带单位——单位由控件 suffix 展示在输入框后方（AGENTS.md「配置参数单位置于输入框后方」），
 * 既避免长标签被固定列宽裁切，也与投流广告配置界面同口径。 */
export const NUMBER_FIELDS = {
  merchantMinimum: { label: '商家標籤最低有效分', unit: '分', min: 1, max: 1000 },
  userMinimum: { label: '用戶標籤最低有效分', unit: '分', min: 1, max: 100 },
  threshold: { label: '商家相似度門檻', unit: '%', min: 1, max: 100 },
  userThreshold: { label: '相似用戶門檻', unit: '%', min: 1, max: 100 },
  count: { label: '每次推薦商家數', unit: '家', min: 1, max: 2 },
  dwellSeconds: { label: '停留時長門檻', unit: '秒', min: 3, max: 120 },
  dailyLimit: { label: '單用戶每日上限', unit: '次', min: 1, max: 50 },
  merchantFreqHours: { label: '同商家統計窗口', unit: '小時', min: 0.5, max: 24 },
  merchantFreqTimes: { label: '同商家最多展示', unit: '次', min: 1, max: 20 },
} as const
export type NumericField = keyof typeof NUMBER_FIELDS
/** 数值项的输入精度：窗口支持半小时，其余为整数。 */
export const numberPrecision = (name: NumericField) => name === 'merchantFreqHours' ? 1 : 0
export interface PrototypeIssue { name: keyof PrototypeValues; message: string }
export function validatePrototype(values: PrototypeValues): PrototypeIssue[] {
  const issues: PrototypeIssue[] = []
  const add = (name: keyof PrototypeValues, message: string) => issues.push({ name, message })
  if (!values.name?.trim() || values.name.length > 100) add('name', '請填寫 1–100 字的算法名稱')
  if (!BRAND_OPTIONS.some(option => option.value === values.brand)) add('brand', '請選擇有效品牌')
  if (!['delivery', 'groupBuy'].includes(values.business)) add('business', '業務範圍必須來自有效的算法庫 Tab')
  if (!CREATABLE_SCENES.some(scene => scene.code === values.scene)) add('scene', '請選擇可建立算法的場景')
  if (values.tagDecayPolicy !== TAG_DECAY_POLICY) add('tagDecayPolicy', '必須引用全局標籤衰變規則')
  if (!values.modes?.length || values.modes.some(m => !SOURCE_OPTIONS.some(s => s.value === m))) add('modes', '至少選擇一種推薦來源')
  if (!values.modes.includes(values.slot1)) add('slot1', '請選擇已啟用的來源')
  if (values.count === 2 && !values.modes.includes(values.slot2)) add('slot2', '請選擇已啟用的來源')
  for (const name of Object.keys(NUMBER_FIELDS) as NumericField[]) {
    if (name === 'dailyLimit' && values.dailyMode !== 'limited') continue
    if (name === 'dwellSeconds' && values.triggerMode !== 'dwell') continue
    if (name === 'threshold' && !values.modes.includes('merchantSimilar')) continue
    if (name === 'userThreshold' && !values.modes.includes('userSimilar')) continue
    const { label, unit, min, max } = NUMBER_FIELDS[name]
    const value = values[name]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
      || (name === 'merchantFreqHours' ? Number(value.toFixed(1)) !== value : !Number.isInteger(value))) {
      add(name, `${label}須在 ${min}–${max}${unit ? ` ${unit}` : ''} 之間${name === 'merchantFreqHours' ? '，最多一位小數' : '，且為整數'}`)
    }
  }
  if (values.modes.includes('sameCategory') && !CATEGORY_LEVEL_OPTIONS.some(o => o.value === values.categoryLevel)) add('categoryLevel', '請選擇類目匹配層級')
  if (!['cosine', 'weightedJaccard'].includes(values.metric)) add('metric', '請選擇相似度算法')
  if (values.rankPreset === 'custom' && (!values.factors.length || values.factors.some(f => !FACTOR_VALUES.includes(f)))) add('factors', '至少選擇一個有效排序因子')
  if (!TIE_BREAK_VALUES.includes(values.tieBreak)) add('tieBreak', '請選擇有效的同分決勝')
  return issues
}
export const needsTraffic = (values: PrototypeValues) => values.rankPreset === 'consumeFirst'
  || (values.rankPreset === 'custom' && values.factors.includes('traffic'))

/** 表单值 → 服务端 type17 参数协议；条件字段只在语义需要时写入，避免后端收到非法组合。
 * 协议 v1 兼容：触发/数量/频控仍随参数下发（后端必填校验），取值为引擎级默认——
 * 表单不再编辑这些字段，真實覆蓋入口在場景綁定；第二階段協議 v2 將其遷入 scene_config 後從本函數移除。
 * categoryLevel（同類目匹配層級）不在此写入：服务端 v1 白名單（RULE_KEYS）尚未包含該鍵，写入会直接 422；
 * 第二階段隨後端新增 `categoryMatchLevel` 白名單與校驗一併下發。 */
export function serializeSimilarParams(values: PrototypeValues, business: Business): Record<string, unknown> {
  const rules: Record<string, unknown> = {
    metric: values.metric, merchantSimilarityThreshold: values.threshold,
    modes: values.modes, resultCount: values.count, slot1Source: values.slot1, slot2Source: values.slot2,
    triggerMode: values.triggerMode, dailyLimitMode: values.dailyMode,
    merchantFreqHours: values.merchantFreqHours, merchantFreqTimes: values.merchantFreqTimes,
    rankPreset: values.rankPreset, rankTieBreak: values.tieBreak,
  }
  if (values.triggerMode === 'dwell') rules.dwellSeconds = values.dwellSeconds
  if (values.dailyMode === 'limited') rules.dailyLimit = values.dailyLimit
  if (values.modes.includes('userSimilar')) rules.userSimilarityThreshold = values.userThreshold
  if (values.rankPreset === 'custom') rules.rankFactors = values.factors
  return {
    schemaVersion: 1, targetType: 1,
    applicableBusinessTypes: [business === 'groupBuy' ? 2 : 1],
    supportedScenes: [values.scene],
    tagPolicy: { merchantMinimum: values.merchantMinimum, userMinimum: values.userMinimum },
    similarRules: rules,
  }
}
/** 服务端参数 → 表单值；缺字段回默认，非法结构抛错由调用方提示，不静默覆盖。 */
export function readSimilarParams(raw: unknown, business: Business): PrototypeValues {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('相似推薦參數格式無效')
  const source = raw as Record<string, unknown>
  const tag = (source.tagPolicy ?? {}) as Record<string, unknown>
  const rules = (source.similarRules ?? {}) as Record<string, unknown>
  const num = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const modes = Array.isArray(rules.modes) ? (rules.modes.filter(m => typeof m === 'string') as Source[]) : []
  const values: PrototypeValues = {
    ...PROTOTYPE_DEFAULTS, business,
    scene: sceneFromParams(source),
    merchantMinimum: num(tag.merchantMinimum, PROTOTYPE_DEFAULTS.merchantMinimum),
    userMinimum: num(tag.userMinimum, PROTOTYPE_DEFAULTS.userMinimum),
    metric: rules.metric === 'weightedJaccard' ? 'weightedJaccard' : 'cosine',
    threshold: num(rules.merchantSimilarityThreshold, PROTOTYPE_DEFAULTS.threshold),
    userThreshold: num(rules.userSimilarityThreshold, PROTOTYPE_DEFAULTS.userThreshold),
    modes: modes.length ? modes : [...PROTOTYPE_DEFAULTS.modes],
    // 類目層級尚未進入 v1 協議，讀取時保持預設；第二階段改由 rules.categoryMatchLevel 回填。
    count: num(rules.resultCount, 1) === 2 ? 2 : 1,
    slot1: (rules.slot1Source as Source) ?? PROTOTYPE_DEFAULTS.slot1,
    slot2: (rules.slot2Source as Source) ?? PROTOTYPE_DEFAULTS.slot2,
    triggerMode: rules.triggerMode === 'dwell' ? 'dwell' : 'instant',
    dwellSeconds: num(rules.dwellSeconds, PROTOTYPE_DEFAULTS.dwellSeconds),
    dailyMode: rules.dailyLimitMode === 'limited' ? 'limited' : 'unlimited',
    dailyLimit: num(rules.dailyLimit, PROTOTYPE_DEFAULTS.dailyLimit),
    merchantFreqHours: num(rules.merchantFreqHours, PROTOTYPE_DEFAULTS.merchantFreqHours),
    merchantFreqTimes: num(rules.merchantFreqTimes, PROTOTYPE_DEFAULTS.merchantFreqTimes),
    rankPreset: rules.rankPreset === 'consumeFirst' ? 'consumeFirst' : rules.rankPreset === 'custom' ? 'custom' : 'matchFirst',
    factors: Array.isArray(rules.rankFactors) ? (rules.rankFactors.filter((f): f is Factor => typeof f === 'string' && FACTOR_VALUES.includes(f as Factor))) : [...PROTOTYPE_DEFAULTS.factors],
    tieBreak: TIE_BREAK_VALUES.includes(rules.rankTieBreak as TieBreak) ? rules.rankTieBreak as TieBreak : 'quality',
  }
  if (!values.modes.includes(values.slot1)) values.slot1 = values.modes[0]
  if (!values.modes.includes(values.slot2)) values.slot2 = values.modes[0]
  return values
}
export interface PreviewBinding { enabled: boolean; draftId?: string; trafficOnly: boolean; trafficSources: string[] }
export const TRAFFIC_SAMPLES = [{ value: 'sample-traffic-a', label: '投流來源 A（匿名示例）' }, { value: 'sample-traffic-b', label: '投流來源 B（匿名示例）' }]

/** 样例有效标签已经过衰减，不重复计算；ID 是标准标签示例，不是展示名。 */
export const ANCHOR_TAGS = [{ label: 'tag-burger', score: 100 }, { label: 'tag-chicken', score: 50 }]
const USER_TAGS = [{ label: 'tag-burger', score: 20 }, { label: 'tag-chicken', score: 10 }]
const neighbors = [
  { id: 'sample-user-a', tags: USER_TAGS, purchased: ['sample-store-b', 'sample-store-c'] },
  { id: 'sample-user-b', tags: [{ label: 'tag-burger', score: 30 }], purchased: ['sample-store-b'] },
]
const merchants = [
  { id: 'sample-store-a', name: '相似漢堡店 A', tags: ANCHOR_TAGS, category: 'snack', traffic: null, remaining: 0, total: 0, quality: 4.6, distance: 0.8 },
  { id: 'sample-store-b', name: '相似漢堡店 B', tags: [...ANCHOR_TAGS, { label: 'tag-drink', score: 100 }], category: 'snack', traffic: 'sample-traffic-a', remaining: 80, total: 100, quality: 4.3, distance: 1.2 },
  { id: 'sample-store-c', name: '相似炸雞店 C', tags: [{ label: 'tag-burger', score: 80 }, { label: 'tag-chicken', score: 100 }], category: 'snack', traffic: 'sample-traffic-b', remaining: 30, total: 100, quality: 4.5, distance: 1.8 },
  { id: 'sample-store-d', name: '純茶飲店 D', tags: [{ label: 'tag-drink', score: 100 }], category: 'drink', traffic: 'sample-traffic-a', remaining: 0, total: 100, quality: 4.2, distance: 0.5 },
]
export type PreviewScenario = 'normal' | 'one' | 'empty' | 'frequency'
export interface PreviewCandidate { id: string; name: string; source: Source; similarity: number | null; score: number; heat?: number; billing: 'natural' | 'paid' }
export interface PreviewResult { items: PreviewCandidate[]; reasons: string[] }

/** 仅为匿名交互样例：不请求真实消费者数据、写标签、申请权益或模拟已经计费。 */
export function simulatePreview(values: PrototypeValues, binding: PreviewBinding, scenario: PreviewScenario = 'normal'): PreviewResult {
  if (!binding.enabled) return { items: [], reasons: ['未選擇有效的相似推薦算法'] }
  const issues = validatePrototype(values)
  if (issues.length) return { items: [], reasons: [issues[0].message] }
  if (!binding.trafficOnly && needsTraffic(values)) return { items: [], reasons: ['自然模式不能使用流量包排序，請改用匹配優先或移除流量因子'] }
  if (binding.trafficOnly && !binding.trafficSources.length) return { items: [], reasons: ['請選擇至少一個允許的投流來源'] }
  if (scenario === 'frequency') return { items: [], reasons: ['示例：同商家曝光已達窗口上限，不放寬頻控'] }
  if (scenario === 'empty') return { items: [], reasons: ['示例：沒有業務合格候選，保留原列表'] }
  const reasons: string[] = []
  const eligible = merchants.filter(m => {
    if (binding.trafficOnly && (!m.traffic || !binding.trafficSources.includes(m.traffic) || m.remaining <= 0)) {
      reasons.push(`${m.name}：沒有所選來源的有效投流餘量`)
      return false
    }
    return true
  })
  const cf = collaborativeScores(USER_TAGS, neighbors, { currentUserId: 'sample-self', userMinimum: values.userMinimum, metric: values.metric, threshold: values.userThreshold })
  const pools = new Map<Source, PreviewCandidate[]>()
  for (const source of values.modes) {
    const pool: PreviewCandidate[] = []
    const entries: Array<{ m: typeof eligible[number]; match: number | null; rawHeat: number }> = []
    for (const m of eligible) {
      let match: number | null = null
      let rawHeat = 0
      if (source === 'merchantSimilar') {
        const rows = matchOf(ANCHOR_TAGS, m.tags, values.merchantMinimum, values.merchantMinimum).rows
        match = computeSimilarity(rows, values.metric).value
        if (match <= 0 || match * 100 + 1e-10 < values.threshold) { reasons.push(`${m.name}：商家標籤相似度未達門檻`); continue }
        // 匹配标签热度（同投流 tagHeat 口径）：商家在双方命中交集标签上有效分之和；其他来源无供给强度依据记 0。
        rawHeat = rows.reduce((s, r) => s + (r.a > 0 && r.b > 0 ? r.a : 0), 0)
      } else if (source === 'userSimilar') {
        match = cf.scores.find(s => s.store === m.id)?.cf ?? 0
        if (match <= 0) continue
      } else if (m.category !== 'snack') continue
      entries.push({ m, match, rawHeat })
    }
    const maxHeat = Math.max(0, ...entries.map(e => e.rawHeat))
    for (const { m, match, rawHeat } of entries) {
      const factors: Record<Factor, number> = { match: match ?? 0, traffic: m.total ? m.remaining / m.total : 0, quality: m.quality / 5, distance: 1 - m.distance / 3, tagHeat: maxHeat > 0 ? rawHeat / maxHeat : 0 }
      const score = values.rankPreset === 'consumeFirst' ? m.remaining : values.rankPreset === 'custom'
        ? values.factors.reduce((sum, f) => sum + factors[f], 0) / values.factors.length : match ?? 0
      pool.push({ id: m.id, name: m.name, source, similarity: match, score, heat: factors.tagHeat, billing: binding.trafficOnly ? 'paid' : 'natural' })
    }
    pool.sort((a, b) => {
      const ma = merchants.find(m => m.id === a.id)!, mb = merchants.find(m => m.id === b.id)!
      // 决胜词表与投流同源；random 及决胜仍同分时在预览中回退确定性 ID 序（预览不模拟随机）。
      const tie = values.tieBreak === 'quality' ? mb.quality - ma.quality
        : values.tieBreak === 'distance' ? ma.distance - mb.distance
        : values.tieBreak === 'trafficDirection' ? ma.remaining - mb.remaining
        : values.tieBreak === 'match' ? (b.similarity ?? 0) - (a.similarity ?? 0)
        : values.tieBreak === 'tagHeat' ? (b.heat ?? 0) - (a.heat ?? 0)
        : 0
      return b.score - a.score || tie || a.id.localeCompare(b.id)
    })
    pools.set(source, pool)
  }
  const items: PreviewCandidate[] = []
  for (const preferred of [values.slot1, values.slot2].slice(0, scenario === 'one' ? 1 : values.count)) {
    for (const source of [preferred, ...SOURCE_OPTIONS.map(s => s.value).filter(s => s !== preferred && values.modes.includes(s))]) {
      const candidate = pools.get(source)?.find(item => !items.some(chosen => chosen.id === item.id))
      if (candidate) { items.push(candidate); break }
    }
  }
  if (!items.length) reasons.push('沒有符合已啟用來源的候選，保留原列表')
  if (scenario === 'one') reasons.push('示例：僅一家具備展示資格，不複製商家補滿')
  return { items, reasons: [...new Set(reasons)] }
}
