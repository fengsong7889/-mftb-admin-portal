import { ServiceStatus } from './constants'

/**
 * 自然流量算法評分配置
 * 自然流量無需商家購買坑位，商家之間靠「綜合得分」高低較量排名，
 * 系統從 3 個維度累加得分：商業維度、店鋪維度、平台維度。
 */

/** 評分維度 */
export enum ScoreDimension {
  /** 商業維度：商家商業化投入貢獻 */
  COMMERCIAL = 1,
  /** 店鋪維度：店鋪自身質量與運營表現 */
  STORE = 2,
  /** 平台維度：平台側調控因子 */
  PLATFORM = 4,
}

/** 計分方式 */
export enum ScoreMode {
  /** 規則加分：命中規則即加分 */
  RULE_BONUS = 1,
  /** 衰減函數：按距離/時長/天數指數衰減 */
  DECAY = 2,
  /** 規則減分：命中規則即扣分 */
  RULE_DEDUCTION = 3,
  /** 金額倍率：得分 = 金額 × 倍率（分值字段填倍率） */
  AMOUNT_MULTIPLIER = 4,
  /** 梯度計分：按閾值分檔，不同區間對應不同分值 */
  TIERED = 5,
  /** 條件計分：多組「條件描述 → 分值」，每組獨立計分 */
  CONDITIONAL = 6,
}

/** 梯度比較方向 */
export enum TierDirection {
  /** 少於閾值 */
  LESS_THAN = 'LESS_THAN',
  /** 超過閾值 */
  MORE_THAN = 'MORE_THAN',
}

/** 計算周期 */
export enum CalcCycle {
  /** 每晚統計（滾動 N 天） */
  NIGHTLY = 'NIGHTLY',
  /** 按當天計算 */
  DAILY = 'DAILY',
  /** 定時監控（按指定小時間隔校驗） */
  SCHEDULED = 'SCHEDULED',
}

export const SCORE_DIMENSION_LABEL: Record<ScoreDimension, string> = {
  [ScoreDimension.COMMERCIAL]: '商業維度',
  [ScoreDimension.STORE]: '店鋪維度',
  [ScoreDimension.PLATFORM]: '平台維度',
}

export const SCORE_DIMENSION_DESC: Record<ScoreDimension, string> = {
  [ScoreDimension.COMMERCIAL]: '商家商業化投入貢獻：購買金字招牌、點金廣告等付費推廣及平台活動參與情況',
  [ScoreDimension.STORE]: '店鋪自身質量：基礎信息完善度 + 店鋪運營表現（評分、出餐、好差評等）',
  [ScoreDimension.PLATFORM]: '平台調控因子：距離衰減、運力天氣、流量均衡與風控降權',
}

/** 維度圖標（emoji，與卡片風格一致） */
export const SCORE_DIMENSION_ICON: Record<ScoreDimension, string> = {
  [ScoreDimension.COMMERCIAL]: '💰',
  [ScoreDimension.STORE]: '🏪',
  [ScoreDimension.PLATFORM]: '🛠️',
}

/** 維度配色（遵循數據指標統計卡標準：主色 + 底色） */
export const SCORE_DIMENSION_COLOR: Record<ScoreDimension, { color: string; bg: string }> = {
  [ScoreDimension.COMMERCIAL]: { color: '#E8720C', bg: '#FFF7E6' },
  [ScoreDimension.STORE]: { color: '#1890FF', bg: '#E6F7FF' },
  [ScoreDimension.PLATFORM]: { color: '#722ED1', bg: '#F9F0FF' },
}

export const SCORE_MODE_LABEL: Record<ScoreMode, string> = {
  [ScoreMode.RULE_BONUS]: '規則加分',
  [ScoreMode.DECAY]: '衰減函數',
  [ScoreMode.RULE_DEDUCTION]: '規則減分',
  [ScoreMode.AMOUNT_MULTIPLIER]: '金額倍率',
  [ScoreMode.TIERED]: '梯度計分',
  [ScoreMode.CONDITIONAL]: '條件計分',
}

export const SCORE_MODE_COLOR: Record<ScoreMode, string> = {
  [ScoreMode.RULE_BONUS]: 'green',
  [ScoreMode.DECAY]: 'purple',
  [ScoreMode.RULE_DEDUCTION]: 'red',
  [ScoreMode.AMOUNT_MULTIPLIER]: 'gold',
  [ScoreMode.TIERED]: 'cyan',
  [ScoreMode.CONDITIONAL]: 'geekblue',
}

export const SCORE_MODE_OPTIONS = [
  { label: SCORE_MODE_LABEL[ScoreMode.RULE_BONUS], value: ScoreMode.RULE_BONUS },
  { label: SCORE_MODE_LABEL[ScoreMode.DECAY], value: ScoreMode.DECAY },
  { label: SCORE_MODE_LABEL[ScoreMode.RULE_DEDUCTION], value: ScoreMode.RULE_DEDUCTION },
  { label: SCORE_MODE_LABEL[ScoreMode.AMOUNT_MULTIPLIER], value: ScoreMode.AMOUNT_MULTIPLIER },
  { label: SCORE_MODE_LABEL[ScoreMode.TIERED], value: ScoreMode.TIERED },
  { label: SCORE_MODE_LABEL[ScoreMode.CONDITIONAL], value: ScoreMode.CONDITIONAL },
]

export const TIER_DIRECTION_LABEL: Record<TierDirection, string> = {
  [TierDirection.LESS_THAN]: '少於',
  [TierDirection.MORE_THAN]: '超過',
}

export const CALC_CYCLE_LABEL: Record<CalcCycle, string> = {
  [CalcCycle.NIGHTLY]: '每晚統計',
  [CalcCycle.DAILY]: '按當天計算',
  [CalcCycle.SCHEDULED]: '定時監控',
}

/** 配送範圍分層分數（短程 / 中程 / 遠程 / 跨橋） */
export interface RangeScores {
  /** 短程 */
  short: number
  /** 中程 */
  medium: number
  /** 遠程 */
  long: number
  /** 跨橋 */
  crossBridge: number
}

export const RANGE_SCORE_KEYS: (keyof RangeScores)[] = ['short', 'medium', 'long', 'crossBridge']
export const RANGE_SCORE_LABELS: Record<keyof RangeScores, string> = {
  short: '短程',
  medium: '中程',
  long: '遠程',
  crossBridge: '跨橋',
}
export const DEFAULT_RANGE_SCORES: RangeScores = { short: 80, medium: 60, long: 40, crossBridge: 20 }

/** 配送範圍分時段計分（合併 PLT_02A~E） */
export interface TimeRangeScores {
  breakfast?: RangeScores
  lunch?: RangeScores
  afternoonTea?: RangeScores
  dinner?: RangeScores
  lateNight?: RangeScores
}

export const TIME_PERIOD_KEYS: (keyof TimeRangeScores)[] = ['breakfast', 'lunch', 'afternoonTea', 'dinner', 'lateNight']
export const TIME_PERIOD_LABELS: Record<keyof TimeRangeScores, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  afternoonTea: '下午茶',
  dinner: '晚餐',
  lateNight: '宵夜',
}

/** 梯度檔位 */
export interface ScoreTier {
  /** 閾值 */
  threshold: number
  /** 比較方向：少於 / 超過 */
  direction: TierDirection
  /** 該檔位對應分值（正=加分，負=扣分） */
  score: number
  /** 統計天數（可選，合併到每個梯度檔位中） */
  statDays?: number
}

/** 條件計分子項（一組條件描述 → 分值） */
export interface ScoreConditionItem {
  /** 條件描述（如「報名免運費活動」） */
  condition: string
  /** 該條件對應分值（正=加分，負=扣分） */
  score: number
}

/** 活動加分子項（一個對象 → 固定加分，僅 STB_ACT 規則使用；暫以算法庫算法ID對接驗證，後續切換為系統活動） */
export interface ActivityScoreItem {
  /** 對象ID（暫存算法庫算法ID，如 SFWD20260812000；後續切換為活動ID） */
  activityId: string
  /** 對象名稱（保存時快照：算法名稱/活動名稱） */
  activityName?: string
  /** 固定加分分值 */
  score: number
}

/** 高峰時段定義 */
export interface PeakTimeRange {
  /** 標籤（如「午高峰」） */
  label: string
  /** 開始時間（HH:mm 格式） */
  start: string
  /** 結束時間（HH:mm 格式） */
  end: string
}

/** 單條評分規則 */
export interface OrganicScoreRule {
  id: string
  dimension: ScoreDimension
  name: string
  description: string
  mode: ScoreMode
  /** 分值上限（扣分項為負值） */
  score: number
  /** 前提條件描述（如「商家報名免運費活動」） */
  prerequisites?: string
  /** 統計天數（僅部分規則需要，如店鋪銷量、好評/差評等） */
  statDays?: number
  /** 配送範圍分層分數（僅配送範圍規則使用） */
  rangeScores?: RangeScores
  /** 配送範圍分時段計分（合併 PLT_02A~E） */
  timeRangeScores?: TimeRangeScores
  /** 梯度檔位（僅 mode=TIERED 時使用） */
  tiers?: ScoreTier[]
  /** 條件計分子項（僅 mode=CONDITIONAL 時使用） */
  conditionItems?: ScoreConditionItem[]
  /** 計算周期（僅 mode=TIERED 時使用） */
  calcCycle?: CalcCycle
  /** 定時監控間隔小時數（僅 calcCycle=SCHEDULED 時使用，支持小數如 0.5） */
  calcIntervalHours?: number
  /** 歷史基線天數（出餐速度等時間窗口對比規則使用） */
  statDaysTotal?: number
  /** 近期對比天數（出餐速度等時間窗口對比規則使用） */
  statDaysRecent?: number
  /** 高峰時段定義（出餐速度等規則使用） */
  peakTimeRanges?: PeakTimeRange[]
  /** 每單固定扣分（拒絕接單等按次計罰規則使用，正值存儲，顯示時加負號） */
  deductionPerOrder?: number
  /** 衰减系数（距離衰減規則使用，每公里扣除的分數） */
  decayCoefficient?: number
  /** 屏蔽商家列表（店鋪代碼，即使滿足條件也不扶持） */
  blockedMerchants?: string[]
  /** 活動加分配置（僅 STB_ACT 規則使用；暫按算法庫算法ID配置，每個算法獨立計分） */
  activityItems?: ActivityScoreItem[]
  status: ServiceStatus
  /** 系統內置項不可刪除，僅可啟用/停用與調整分值 */
  builtin: boolean
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

/** 各維度默認權重（總和需為 100） */
export const DEFAULT_DIMENSION_WEIGHT: Record<ScoreDimension, number> = {
  [ScoreDimension.COMMERCIAL]: 35,
  [ScoreDimension.STORE]: 40,
  [ScoreDimension.PLATFORM]: 25,
}

/** 維度權重總和校驗值 */
export const DIMENSION_WEIGHT_TOTAL = 100

const { ENABLED, DISABLED: _DISABLED } = ServiceStatus

/** 默認評分規則（可在界面上新增/停用/調整分值） */
export const DEFAULT_ORGANIC_SCORE_RULES: OrganicScoreRule[] = [
  // ===== 商業維度（商家營銷投入與付費推廣） =====
  { id: 'COM_01', dimension: ScoreDimension.COMMERCIAL, name: '滿額立減', description: '商家參與滿額立減活動加分', mode: ScoreMode.RULE_BONUS, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_02', dimension: ScoreDimension.COMMERCIAL, name: '減免運費', description: '商家減免配送運費加分', mode: ScoreMode.RULE_BONUS, score: 20, status: ENABLED, builtin: true },
  { id: 'COM_03', dimension: ScoreDimension.COMMERCIAL, name: '進店領券', description: '商家設置進店領券加分', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_04', dimension: ScoreDimension.COMMERCIAL, name: '新客立減', description: '商家參與新客立減活動加分', mode: ScoreMode.RULE_BONUS, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_05', dimension: ScoreDimension.COMMERCIAL, name: '收藏送券', description: '商家設置收藏送券加分', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_06', dimension: ScoreDimension.COMMERCIAL, name: '會員紅包-按金額', description: '商家設置會員紅包加分', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_07', dimension: ScoreDimension.COMMERCIAL, name: '閃蜂官方神券-按金額', description: '商家設置閃蜂官方神券加分', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_09', dimension: ScoreDimension.COMMERCIAL, name: '購買廣告-點金廣告', description: '購買點金廣告投放期內加分', mode: ScoreMode.RULE_BONUS, score: 80, status: ENABLED, builtin: true },
  { id: 'COM_10', dimension: ScoreDimension.COMMERCIAL, name: '購買廣告-金字招牌', description: '購買金字招牌廣告投放期內加分', mode: ScoreMode.RULE_BONUS, score: 100, status: ENABLED, builtin: true },

  // ===== 店鋪維度（基礎信息 + 店鋪運營） =====
  { id: 'STB_01', dimension: ScoreDimension.STORE, name: '主營時段加分', description: '主營時段配置完整，當前處於主營時段內加分', mode: ScoreMode.RULE_BONUS, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_04', dimension: ScoreDimension.STORE, name: '店鋪標籤-金牌', description: '金牌店鋪身份標籤加分', mode: ScoreMode.RULE_BONUS, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_02', dimension: ScoreDimension.STORE, name: '營業狀態', description: '營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊重降權，四檔狀態分別配置得分', mode: ScoreMode.CONDITIONAL, score: 0, status: ENABLED, builtin: true, conditionItems: [
      { condition: 'bonus', score: 100 },
      { condition: 'deduction', score: 20 },
      { condition: 'deduction', score: 50 },
      { condition: 'deduction', score: 80 },
    ] },
  { id: 'STB_03', dimension: ScoreDimension.STORE, name: '評價得分', description: '統計天數內顧客評價星級計分，支持固定加扣分或動態倍率', mode: ScoreMode.CONDITIONAL, score: 0, statDays: 30, status: ENABLED, builtin: true, conditionItems: [
    { condition: 'fixed_bonus', score: 50 },
    { condition: 'fixed_bonus', score: 20 },
    { condition: 'fixed_bonus', score: 0 },
    { condition: 'fixed_deduction', score: 20 },
    { condition: 'fixed_deduction', score: 50 },
  ] },
  { id: 'PLT_03', dimension: ScoreDimension.PLATFORM, name: '商家扶持', description: '統計有效訂單數，按梯度加分：訂單越多得分越高', mode: ScoreMode.TIERED, score: 0, statDays: 30, prerequisites: 'UNCONDITIONAL', tiers: [
    { threshold: 50, direction: TierDirection.LESS_THAN, score: 20, statDays: 30 },
  ], status: ENABLED, builtin: true },
  { id: 'PLT_04', dimension: ScoreDimension.PLATFORM, name: '訂單過熱調控', description: '定時監控商家訂單過熱時按梯度降權，平衡流量分配給其他商家機會', mode: ScoreMode.TIERED, score: 0, calcCycle: CalcCycle.SCHEDULED, calcIntervalHours: 1, tiers: [
    { threshold: 200, direction: TierDirection.MORE_THAN, score: -10 },
    { threshold: 500, direction: TierDirection.MORE_THAN, score: -30 },
    { threshold: 1000, direction: TierDirection.MORE_THAN, score: -60 },
  ], status: ENABLED, builtin: true },
  { id: 'STB_05', dimension: ScoreDimension.STORE, name: '出餐速度', description: '統計過去N天（不含當天）出餐均值，當天出餐時間超過均值即扣分', mode: ScoreMode.CONDITIONAL, score: 0, statDaysTotal: 7, conditionItems: [
    { condition: 'over_avg_deduction', score: 30 },
  ], status: ENABLED, builtin: true },
  { id: 'STB_06', dimension: ScoreDimension.STORE, name: '拒絕接單', description: '統計天數內（含當天），每拒絕一單固定扣分，即時生效', mode: ScoreMode.RULE_DEDUCTION, score: 0, statDays: 7, deductionPerOrder: 80, status: ENABLED, builtin: true },
  { id: 'STB_07', dimension: ScoreDimension.STORE, name: '出餐超時', description: '統計天數內（不含當天），每超時一單固定扣分，即時生效', mode: ScoreMode.RULE_DEDUCTION, score: 0, statDays: 7, deductionPerOrder: 70, status: ENABLED, builtin: true },
  { id: 'STB_08', dimension: ScoreDimension.STORE, name: '取消訂單', description: '統計天數內（含當天），每取消一單固定扣分，即時生效', mode: ScoreMode.RULE_DEDUCTION, score: 0, statDays: 7, deductionPerOrder: 80, status: ENABLED, builtin: true },
  { id: 'STB_09', dimension: ScoreDimension.STORE, name: '超時接單', description: '統計天數內（含當天），每超時一單固定扣分，即時生效', mode: ScoreMode.RULE_DEDUCTION, score: 0, statDays: 7, deductionPerOrder: 60, status: ENABLED, builtin: true },
  { id: 'STB_ACT', dimension: ScoreDimension.STORE, name: '活動加分', description: '店鋪報名參與活動即得固定加分；暫以算法庫算法ID配置驗證（後續對接系統活動），系統自動獲取名稱與狀態，每個獨立計分', mode: ScoreMode.RULE_BONUS, score: 0, activityItems: [], status: ENABLED, builtin: true },

  // ===== 平台維度 =====
  { id: 'PLT_01', dimension: ScoreDimension.PLATFORM, name: '距離衰減', description: '滿分按衰減係數×距離遞減，距離越遠得分越低', mode: ScoreMode.DECAY, score: 100, decayCoefficient: 5, status: ENABLED, builtin: true },
  { id: 'PLT_02A', dimension: ScoreDimension.PLATFORM, name: '配送範圍', description: '按時段配置配送範圍分層計分，後端根據當前時間自動匹配對應時段', mode: ScoreMode.RULE_BONUS, score: 0, timeRangeScores: {
    breakfast: { ...DEFAULT_RANGE_SCORES },
    lunch: { ...DEFAULT_RANGE_SCORES },
    afternoonTea: { ...DEFAULT_RANGE_SCORES },
    dinner: { ...DEFAULT_RANGE_SCORES },
    lateNight: { ...DEFAULT_RANGE_SCORES },
  }, status: ENABLED, builtin: true },
]
