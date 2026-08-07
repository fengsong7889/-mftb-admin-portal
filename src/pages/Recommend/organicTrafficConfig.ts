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
}

export const SCORE_MODE_COLOR: Record<ScoreMode, string> = {
  [ScoreMode.RULE_BONUS]: 'green',
  [ScoreMode.DECAY]: 'purple',
  [ScoreMode.RULE_DEDUCTION]: 'red',
  [ScoreMode.AMOUNT_MULTIPLIER]: 'gold',
  [ScoreMode.TIERED]: 'cyan',
}

export const SCORE_MODE_OPTIONS = [
  { label: SCORE_MODE_LABEL[ScoreMode.RULE_BONUS], value: ScoreMode.RULE_BONUS },
  { label: SCORE_MODE_LABEL[ScoreMode.DECAY], value: ScoreMode.DECAY },
  { label: SCORE_MODE_LABEL[ScoreMode.RULE_DEDUCTION], value: ScoreMode.RULE_DEDUCTION },
  { label: SCORE_MODE_LABEL[ScoreMode.AMOUNT_MULTIPLIER], value: ScoreMode.AMOUNT_MULTIPLIER },
  { label: SCORE_MODE_LABEL[ScoreMode.TIERED], value: ScoreMode.TIERED },
]

export const TIER_DIRECTION_LABEL: Record<TierDirection, string> = {
  [TierDirection.LESS_THAN]: '少於',
  [TierDirection.MORE_THAN]: '超過',
}

export const CALC_CYCLE_LABEL: Record<CalcCycle, string> = {
  [CalcCycle.NIGHTLY]: '每晚統計',
  [CalcCycle.DAILY]: '按當天計算',
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

/** 梯度檔位 */
export interface ScoreTier {
  /** 閾值 */
  threshold: number
  /** 比較方向：少於 / 超過 */
  direction: TierDirection
  /** 該檔位對應分值（正=加分，負=扣分） */
  score: number
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
  /** 統計天數（僅部分規則需要，如店鋪銷量、好評/差評等） */
  statDays?: number
  /** 配送範圍分層分數（僅配送範圍規則使用） */
  rangeScores?: RangeScores
  /** 梯度檔位（僅 mode=TIERED 時使用） */
  tiers?: ScoreTier[]
  /** 計算周期（僅 mode=TIERED 時使用） */
  calcCycle?: CalcCycle
  status: ServiceStatus
  /** 系統內置項不可刪除，僅可啟用/停用與調整分值 */
  builtin: boolean
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
  { id: 'COM_01', dimension: ScoreDimension.COMMERCIAL, name: '滿額立減', description: '商家參與滿額立減活動固定加分', mode: ScoreMode.RULE_BONUS, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_02', dimension: ScoreDimension.COMMERCIAL, name: '減免運費', description: '商家減免配送運費固定加分', mode: ScoreMode.RULE_BONUS, score: 20, status: ENABLED, builtin: true },
  { id: 'COM_03', dimension: ScoreDimension.COMMERCIAL, name: '進店領券', description: '浮動計分：得分 = 領券金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_04', dimension: ScoreDimension.COMMERCIAL, name: '新客立減', description: '商家參與新客立減活動固定加分', mode: ScoreMode.RULE_BONUS, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_05', dimension: ScoreDimension.COMMERCIAL, name: '收藏送券', description: '浮動計分：得分 = 贈券金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_06', dimension: ScoreDimension.COMMERCIAL, name: '會員紅包-按金額', description: '浮動計分：得分 = 紅包金額 × 倍率，如紅包 10 元、倍率 2 則得 20 分', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_07', dimension: ScoreDimension.COMMERCIAL, name: '閃蜂官方神券-按金額', description: '浮動計分：得分 = 券金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_08', dimension: ScoreDimension.COMMERCIAL, name: '滿額立減-按平均折扣', description: '浮動計分：得分 = 商家出資金額 × 倍率', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_09', dimension: ScoreDimension.COMMERCIAL, name: '購買廣告-點金廣告', description: '購買點金廣告投放期內加分', mode: ScoreMode.RULE_BONUS, score: 80, status: ENABLED, builtin: true },
  { id: 'COM_10', dimension: ScoreDimension.COMMERCIAL, name: '購買廣告-金字招牌', description: '購買金字招牌廣告投放期內加分', mode: ScoreMode.RULE_BONUS, score: 100, status: ENABLED, builtin: true },

  // ===== 店鋪維度（基礎信息 + 店鋪運營） =====
  { id: 'STB_01', dimension: ScoreDimension.STORE, name: '主營時段', description: '主營時段配置完整，當前處於主營時段內加分', mode: ScoreMode.RULE_BONUS, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_04', dimension: ScoreDimension.STORE, name: '店鋪標籤-金牌', description: '金牌店鋪身份標籤加分', mode: ScoreMode.RULE_BONUS, score: 60, status: ENABLED, builtin: true },
  { id: 'STO_01', dimension: ScoreDimension.STORE, name: '營業狀態', description: '營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊重降權，四檔狀態分別配置得分', mode: ScoreMode.RULE_BONUS, score: 100, status: ENABLED, builtin: true },
  { id: 'STO_02A', dimension: ScoreDimension.STORE, name: '好評得分', description: '統計天數內好評數量加分，好評越多得分越高', mode: ScoreMode.RULE_BONUS, score: 100, statDays: 30, status: ENABLED, builtin: true },
  { id: 'STO_02B', dimension: ScoreDimension.STORE, name: '差評得分', description: '統計天數內差評數量扣分，差評越多扣分越多', mode: ScoreMode.RULE_DEDUCTION, score: -100, statDays: 30, status: ENABLED, builtin: true },
  { id: 'STO_03', dimension: ScoreDimension.STORE, name: '店鋪銷量', description: '每晚統計過去30天有效訂單數，按梯度加分：訂單越多得分越高', mode: ScoreMode.TIERED, score: 0, statDays: 30, calcCycle: CalcCycle.NIGHTLY, tiers: [
    { threshold: 50, direction: TierDirection.LESS_THAN, score: 20 },
    { threshold: 100, direction: TierDirection.LESS_THAN, score: 40 },
    { threshold: 200, direction: TierDirection.LESS_THAN, score: 60 },
    { threshold: 500, direction: TierDirection.LESS_THAN, score: 80 },
    { threshold: 500, direction: TierDirection.MORE_THAN, score: 100 },
  ], status: ENABLED, builtin: true },
  { id: 'STO_03B', dimension: ScoreDimension.STORE, name: '當天訂單超量扣分', description: '按當天計算，訂單超過閾值按梯度扣分，防止刷單', mode: ScoreMode.TIERED, score: 0, calcCycle: CalcCycle.DAILY, tiers: [
    { threshold: 200, direction: TierDirection.MORE_THAN, score: -10 },
    { threshold: 500, direction: TierDirection.MORE_THAN, score: -30 },
    { threshold: 1000, direction: TierDirection.MORE_THAN, score: -60 },
  ], status: ENABLED, builtin: true },
  { id: 'STO_04', dimension: ScoreDimension.STORE, name: '出餐速度', description: '平均出餐時長越短得分越高，店鋪自身效率指標', mode: ScoreMode.DECAY, score: 90, status: ENABLED, builtin: true },
  { id: 'STO_05', dimension: ScoreDimension.STORE, name: '拒絕訂單', description: '商家拒絕訂單按次扣分', mode: ScoreMode.RULE_DEDUCTION, score: -80, status: ENABLED, builtin: true },
  { id: 'STO_07', dimension: ScoreDimension.STORE, name: '出餐超時', description: '超出承諾出餐時長的訂單按佔比扣分', mode: ScoreMode.RULE_DEDUCTION, score: -70, status: ENABLED, builtin: true },
  { id: 'STO_08', dimension: ScoreDimension.STORE, name: '取消訂單', description: '商家主動取消訂單按次扣分', mode: ScoreMode.RULE_DEDUCTION, score: -80, status: ENABLED, builtin: true },
  { id: 'STO_09', dimension: ScoreDimension.STORE, name: '超時接單', description: '超出接單時限未接單按次扣分', mode: ScoreMode.RULE_DEDUCTION, score: -60, status: ENABLED, builtin: true },

  // ===== 平台維度 =====
  { id: 'PLT_01', dimension: ScoreDimension.PLATFORM, name: '距離衰減', description: 'e^(-k×距離km)，距離越遠得分越低', mode: ScoreMode.DECAY, score: 100, status: ENABLED, builtin: true },
  { id: 'PLT_02A', dimension: ScoreDimension.PLATFORM, name: '配送範圍-早餐', description: '早餐時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', mode: ScoreMode.RULE_BONUS, score: 80, rangeScores: { ...DEFAULT_RANGE_SCORES }, status: ENABLED, builtin: true },
  { id: 'PLT_02B', dimension: ScoreDimension.PLATFORM, name: '配送範圍-午餐', description: '午餐時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', mode: ScoreMode.RULE_BONUS, score: 80, rangeScores: { ...DEFAULT_RANGE_SCORES }, status: ENABLED, builtin: true },
  { id: 'PLT_02C', dimension: ScoreDimension.PLATFORM, name: '配送範圍-下午茶', description: '下午茶時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', mode: ScoreMode.RULE_BONUS, score: 80, rangeScores: { ...DEFAULT_RANGE_SCORES }, status: ENABLED, builtin: true },
  { id: 'PLT_02D', dimension: ScoreDimension.PLATFORM, name: '配送範圍-晚餐', description: '晚餐時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', mode: ScoreMode.RULE_BONUS, score: 80, rangeScores: { ...DEFAULT_RANGE_SCORES }, status: ENABLED, builtin: true },
  { id: 'PLT_02E', dimension: ScoreDimension.PLATFORM, name: '配送範圍-夜宵', description: '夜宵時段配送範圍分層計分，按短程/中程/遠程/跨橋分別配置分數', mode: ScoreMode.RULE_BONUS, score: 80, rangeScores: { ...DEFAULT_RANGE_SCORES }, status: ENABLED, builtin: true },
]
