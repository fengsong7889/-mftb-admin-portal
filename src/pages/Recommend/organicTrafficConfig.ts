import { AppType, ServiceStatus } from '@mftb/contracts/recommendConstants'

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
  /** 倍數梯度計分：以門店客單價為基準，按倍數閾值分檔計分 */
  TIERED_MULTIPLIER = 7,
  /** 優惠券力度計分：報名分 + 優惠比例檔位分 × 門檻可達係數（COM_01/03/04/05/07 新方案） */
  COUPON_INTENSITY = 8,
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
  [ScoreDimension.COMMERCIAL]: '商家商業化投入貢獻：購買金字招牌等付費推廣及平台活動參與情況',
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
  [ScoreMode.TIERED_MULTIPLIER]: '倍數梯度計分',
  [ScoreMode.COUPON_INTENSITY]: '優惠券力度計分',
}

export const SCORE_MODE_COLOR: Record<ScoreMode, string> = {
  [ScoreMode.RULE_BONUS]: 'green',
  [ScoreMode.DECAY]: 'purple',
  [ScoreMode.RULE_DEDUCTION]: 'red',
  [ScoreMode.AMOUNT_MULTIPLIER]: 'gold',
  [ScoreMode.TIERED]: 'cyan',
  [ScoreMode.CONDITIONAL]: 'geekblue',
  [ScoreMode.TIERED_MULTIPLIER]: 'volcano',
  [ScoreMode.COUPON_INTENSITY]: 'orange',
}

export const SCORE_MODE_OPTIONS = [
  { label: SCORE_MODE_LABEL[ScoreMode.RULE_BONUS], value: ScoreMode.RULE_BONUS },
  { label: SCORE_MODE_LABEL[ScoreMode.DECAY], value: ScoreMode.DECAY },
  { label: SCORE_MODE_LABEL[ScoreMode.RULE_DEDUCTION], value: ScoreMode.RULE_DEDUCTION },
  { label: SCORE_MODE_LABEL[ScoreMode.AMOUNT_MULTIPLIER], value: ScoreMode.AMOUNT_MULTIPLIER },
  { label: SCORE_MODE_LABEL[ScoreMode.TIERED], value: ScoreMode.TIERED },
  { label: SCORE_MODE_LABEL[ScoreMode.CONDITIONAL], value: ScoreMode.CONDITIONAL },
  { label: SCORE_MODE_LABEL[ScoreMode.TIERED_MULTIPLIER], value: ScoreMode.TIERED_MULTIPLIER },
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

/** 倍數梯度計分檔位（以門店客單價為基準，滿額立減門檻 < 客單價 × 倍數 → 加分） */
export interface MultiplierTier {
  /** 倍數閾值（如 1 表示客單價的 1 倍） */
  multiplier: number
  /** 該檔位對應分值（正=加分） */
  score: number
}

/** 區域扶持配置（PLT_03 商家扶持按區域獨立配置前提條件、統計天數、梯度） */
export interface RegionSupportConfig {
  /** 前提條件描述（如 'UNCONDITIONAL' 或 JSON 數組） */
  prerequisites?: string
  /** 統計天數 */
  statDays?: number
  /** 梯度檔位 */
  tiers?: ScoreTier[]
}

/** 區域過熱調控配置（PLT_04 訂單過熱調控按區域獨立配置校驗間隔、梯度） */
export interface RegionOverheatConfig {
  /** 校驗間隔（小時） */
  calcIntervalHours?: number
  /** 梯度檔位 */
  tiers?: ScoreTier[]
}

/** 區域鍵枚舉（PLT_03 商家扶持） */
export const REGION_KEYS = ['MACAU', 'TAIPA'] as const
export type RegionKey = typeof REGION_KEYS[number]

export const REGION_LABELS: Record<RegionKey, string> = {
  MACAU: '澳門區域',
  TAIPA: '氹仔區域',
}

export const REGION_COLORS: Record<RegionKey, { primary: string; bg: string; border: string }> = {
  MACAU: { primary: '#1890FF', bg: '#E6F7FF', border: '#91D5FF' },
  TAIPA: { primary: '#722ED1', bg: '#F9F0FF', border: '#D3ADF7' },
}

/** 流量均衡订单类型（前端展示枚举；第二阶段后端不信任此值，重验） */
export const TRAFFIC_BALANCE_ORDER_TYPES = ['DELIVERY', 'PICKUP'] as const
export type TrafficBalanceOrderType = typeof TRAFFIC_BALANCE_ORDER_TYPES[number]

/** 流量均衡单档梯度：订单量上界（null=待运营校准）→ 非负固定加分 */
export interface TrafficBalanceBand {
  maxOrders: number | null
  score: number | null
}

/** 流量均衡合并配置（PLT_03）：统计口径 + 排除商家 + 区域梯度 */
export interface TrafficBalanceConfig {
  statDays: number
  refreshMinutes: number
  orderTypes: TrafficBalanceOrderType[]
  includeRefunded: boolean
  excludedStoreCodes: string[]
  regions: Record<RegionKey, TrafficBalanceBand[]>
}

const trafficBalanceDefaultBands = (): TrafficBalanceBand[] => [80, 60, 50, 30].map(score => ({ maxOrders: null, score }))

/** 默认配置：旧规则统计窗口不同，不套用旧门槛；订单量上界留空由运营按新口径校准 */
export const DEFAULT_TRAFFIC_BALANCE_CONFIG: TrafficBalanceConfig = {
  statDays: 7,
  refreshMinutes: 60,
  orderTypes: ['DELIVERY', 'PICKUP'],
  includeRefunded: false,
  excludedStoreCodes: [],
  regions: { MACAU: trafficBalanceDefaultBands(), TAIPA: trafficBalanceDefaultBands() },
}

/** 归一化后端 traffic_balance_config（字符串或对象）：过滤非法值，缺失字段回退默认 */
export function normalizeTrafficBalanceConfig(raw?: string | TrafficBalanceConfig | null): TrafficBalanceConfig {
  const base = structuredClone(DEFAULT_TRAFFIC_BALANCE_CONFIG)
  let parsed: Partial<TrafficBalanceConfig> | null = null
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) as Partial<TrafficBalanceConfig> } catch { parsed = null }
  } else if (raw && typeof raw === 'object') {
    parsed = raw
  }
  if (!parsed) return base
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb)
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb)
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const orderTypes = Array.isArray(parsed.orderTypes)
    ? parsed.orderTypes.filter((x): x is TrafficBalanceOrderType => (TRAFFIC_BALANCE_ORDER_TYPES as readonly string[]).includes(x))
    : base.orderTypes
  const bands = (v: unknown): TrafficBalanceBand[] => {
    if (!Array.isArray(v) || v.length === 0) return base.regions.MACAU.map(b => ({ ...b }))
    return v.map(item => ({
      maxOrders: item && typeof item.maxOrders === 'number' && Number.isFinite(item.maxOrders) ? item.maxOrders : null,
      score: item && typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null,
    }))
  }
  const regions = (parsed.regions ?? {}) as Partial<Record<RegionKey, TrafficBalanceBand[]>>
  return {
    statDays: num(parsed.statDays, base.statDays),
    refreshMinutes: num(parsed.refreshMinutes, base.refreshMinutes),
    orderTypes: orderTypes.length ? orderTypes : base.orderTypes,
    includeRefunded: bool(parsed.includeRefunded, base.includeRefunded),
    excludedStoreCodes: strArr(parsed.excludedStoreCodes),
    regions: { MACAU: bands(regions.MACAU), TAIPA: bands(regions.TAIPA) },
  }
}

/** 條件計分子項（一組條件描述 → 分值；部分規則用 condition 存語義標記，如準時率檔位） */
export interface ScoreConditionItem {
  /** 條件描述/語義標記（如「報名免運費活動」、`ontime_rate`） */
  condition: string
  /** 該條件對應分值（正=加分，負=扣分） */
  score: number
  /** 門檻百分比（0～100）：出餐準時率梯度檔位使用，其他規則不填 */
  rate?: number
  /** 店鋪綜合分下界（以星級勾選，0.5～5，步長 0.5）：店鋪綜合分梯度檔位（STB_03）使用，其他規則不填 */
  star?: number
  /** 最少統計單數（納入計算的樣本量門檻）：訂單取消率（STB_08）使用，其他規則不填 */
  minOrders?: number
}

/**
 * 营业状态四档（索引与 STB_02 的 conditionItems 一一对应）。
 * filtered 档由系统直接过滤、不加载到瀑布流，因此不参与计分也不提供分值配置入口；
 * bottom 档（休息一會 / 爆單暫停）不参与加减分，由系统垫底排序（排在可正常参与排序的商家之后），
 * 同样不提供分值配置入口；库里对应槽位的 condition 固定为 'filtered'（见迁移 organic:stb02-filtered-v1），
 * 两边语义一致。
 */
export const BUSINESS_STATE_ITEMS: Array<{ key: string; label: string; desc: string; filtered?: boolean; bottom?: boolean }> = [
  { key: 'operating', label: '營業中狀態', desc: '正常營業中' },
  { key: 'shortBreak', label: '休息一會，馬上回來', desc: '短暫休息後恢復營業', bottom: true },
  { key: 'overload', label: '爆單了，暫停接單一會', desc: '訂單量超過承載能力', bottom: true },
  { key: 'closed', label: '休息打烊', desc: '當日不再營業', filtered: true },
]

/** 系統過濾檔在 conditionItems 裡的 condition 標記（與後端 FILTERED_CONDITION 一致） */
export const FILTERED_STATE_CONDITION = 'filtered'

/** 出餐準時率檔位（STB_05）：準時率下界 → 分值；按率從高到低匹配，命中一档即停、分數不累加 */
export interface OntimeRateBand {
  /** 準時率下界（%，0～100） */
  rate: number
  /** 該檔分值 */
  score: number
}

/** 準時率檔位在 conditionItems 裡的 condition 標記 */
export const ONTIME_RATE_CONDITION = 'ontime_rate'

/** 默認梯度：滿準時率拿滿分，逐檔遞減；低於最低檔不得分 */
export const DEFAULT_ONTIME_RATE_BANDS: OntimeRateBand[] = [
  { rate: 100, score: 60 },
  { rate: 95, score: 50 },
  { rate: 90, score: 40 },
  { rate: 80, score: 25 },
  { rate: 70, score: 10 },
]

/**
 * 從 conditionItems 讀出準時率梯度：只認 condition='ontime_rate' 且帶合法 rate 的項，
 * 舊「超均值扣分」口徑會被過濾，調用方據空數組回退默認梯度。
 */
export function readOntimeRateBands(items?: Array<{ condition?: string; score?: number; rate?: number }>): OntimeRateBand[] {
  return (items || [])
    .filter(item => item.condition === ONTIME_RATE_CONDITION
      && typeof item.rate === 'number' && Number.isFinite(item.rate))
    .map(item => ({ rate: item.rate as number, score: Number(item.score) || 0 }))
    .sort((a, b) => b.rate - a.rate)
}

/** 梯度 → conditionItems（入庫前按率降序收斂，保證匹配順序與界面展示一致） */
export function toOntimeRateConditionItems(bands: OntimeRateBand[]): ScoreConditionItem[] {
  return [...bands]
    .sort((a, b) => b.rate - a.rate)
    .map(band => ({ condition: ONTIME_RATE_CONDITION, rate: band.rate, score: band.score }))
}

/**
 * 店鋪綜合分檔位（STB_03）：分數下界 → 固定加分。
 * 分數由業務系統實時傳遞，本項不做週期統計、以最新傳入值為準；換算口徑固定 1 星 = 1 分且支持半星，
 * 因此界面上用星星勾選下界、無需另設換算表。
 * 按分數從高到低匹配，命中一檔即停、分數不累加；低於最低檔不加分。
 */
export interface StarTierBand {
  /** 店鋪綜合分下界（以星級勾選，0.5～5，步長 0.5） */
  star: number
  /** 該檔固定加分 */
  score: number
}

/** 店鋪綜合分梯度檔位在 conditionItems 裡的 condition 標記（與後端遷移寫回的標記一致） */
export const STAR_TIER_CONDITION = 'star_tier'

/** 星星個數（勾選滿分上限，1 星 = 1 分） */
export const STAR_TIER_MAX = 5
/** 檔位步長：支持半星 0.5 分 */
export const STAR_TIER_STEP = 0.5

/** 默認梯度：5 星拿滿分，逐檔遞減；低於 3 星不加分 */
export const DEFAULT_STAR_TIER_BANDS: StarTierBand[] = [
  { star: 5, score: 50 },
  { star: 4.5, score: 40 },
  { star: 4, score: 30 },
  { star: 3.5, score: 15 },
  { star: 3, score: 5 },
]

/**
 * 從 conditionItems 讀出店鋪綜合分梯度：只認 condition='star_tier' 且帶合法 star 的項，
 * 舊「按星級逐檔加減分」口徑會被過濾，調用方據空數組回退默認梯度。
 */
export function readStarTierBands(items?: Array<{ condition?: string; score?: number; star?: number }>): StarTierBand[] {
  return (items || [])
    .filter(item => item.condition === STAR_TIER_CONDITION
      && typeof item.star === 'number' && Number.isFinite(item.star))
    .map(item => ({ star: item.star as number, score: Number(item.score) || 0 }))
    .sort((a, b) => b.star - a.star)
}

/** 梯度 → conditionItems（入庫前按分數下界降序收斂，保證匹配順序與界面展示一致） */
export function toStarTierConditionItems(bands: StarTierBand[]): ScoreConditionItem[] {
  return [...bands]
    .sort((a, b) => b.star - a.star)
    .map(band => ({ condition: STAR_TIER_CONDITION, star: band.star, score: band.score }))
}

/**
 * 訂單取消率檔位（STB_08）：取消率上界（%）→ 固定加分。
 * 只統計外賣單，自取單不納入；用戶取消與商家取消均計入取消率。
 * 統計期內單量未達最低樣本門檻（minOrders）的商家不參與本項計分；
 * 達門檻者按取消率從低到高匹配，命中一檔即停、分數不累加，高於最高檔不加分。
 */
export interface CancelRateBand {
  /** 取消率上界（%，0～100）：取消率 ≤ 本值即命中該檔 */
  maxRate: number
  /** 該檔固定加分 */
  score: number
}

/** 取消率檔位在 conditionItems 裡的 condition 標記 */
export const CANCEL_RATE_CONDITION = 'cancel_rate_max'
/** 樣本量門檻在 conditionItems 裡的 condition 標記（不計分，只攜帶 minOrders） */
export const CANCEL_SAMPLE_CONDITION = 'cancel_min_orders'

/** 默認樣本量門檻：統計期內不足 30 單不納入計算 */
export const DEFAULT_CANCEL_MIN_ORDERS = 30

/** 默認梯度：取消率越低加分越多，高於最高檔不加分 */
export const DEFAULT_CANCEL_RATE_BANDS: CancelRateBand[] = [
  { maxRate: 1, score: 30 },
  { maxRate: 3, score: 20 },
  { maxRate: 5, score: 10 },
]

/** 讀出取消率梯度（按上界升序，第一檔即最優惠檔）；非本口徑的舊項被過濾 */
export function readCancelRateBands(items?: Array<{ condition?: string; score?: number; rate?: number }>): CancelRateBand[] {
  return (items || [])
    .filter(item => item.condition === CANCEL_RATE_CONDITION
      && typeof item.rate === 'number' && Number.isFinite(item.rate))
    .map(item => ({ maxRate: item.rate as number, score: Number(item.score) || 0 }))
    .sort((a, b) => a.maxRate - b.maxRate)
}

/** 讀出樣本量門檻；未配置或舊數據無本標記時返回 undefined，由調用方回退默認值 */
export function readCancelMinOrders(items?: Array<{ condition?: string; minOrders?: number }>): number | undefined {
  const item = (items || []).find(i => i.condition === CANCEL_SAMPLE_CONDITION && typeof i.minOrders === 'number')
  return item ? item.minOrders : undefined
}

/** 梯度 + 門檻 → conditionItems（按上界升序收斂，門檻固定放末位，保證匹配順序與界面一致） */
export function toCancelRateConditionItems(bands: CancelRateBand[], minOrders?: number): ScoreConditionItem[] {
  const items: ScoreConditionItem[] = [...bands]
    .sort((a, b) => a.maxRate - b.maxRate)
    .map(band => ({ condition: CANCEL_RATE_CONDITION, rate: band.maxRate, score: band.score }))
  if (typeof minOrders === 'number') items.push({ condition: CANCEL_SAMPLE_CONDITION, minOrders, score: 0 })
  return items
}

/** 該檔是否為系統過濾檔：以數據標記為準，前端常量作為種子/舊數據未收斂時的兜底 */
export const isFilteredBusinessState = (item: { filtered?: boolean }, condItem?: { condition?: string }): boolean =>
  condItem?.condition === FILTERED_STATE_CONDITION || !!item.filtered

/** 活動加分子項（一個對象 → 固定加分，僅 STB_ACT 規則使用；暫以算法庫算法ID對接驗證，後續切換為系統活動） */
export interface ActivityScoreItem {
  /** 對象ID（暫存算法庫算法ID，如 SFWD20260812000；後續切換為活動ID） */
  activityId: string
  /** 對象名稱（保存時快照：算法名稱/活動名稱） */
  activityName?: string
  /** 固定加分分值 */
  score: number
}

/** 使用券類計分 v1 面板的規則編碼集合（COM_01 滿額立減 + COM_03/04/05/07 券類活動；COM_06 已改用加碼梯度面板） */
export const COUPON_SCORE_RULE_IDS = ['COM_01', 'COM_03', 'COM_04', 'COM_05', 'COM_07'] as const
export type CouponScoreRuleId = typeof COUPON_SCORE_RULE_IDS[number]

/** 判斷該計分項是否走券類計分 v1 面板；不改變後端已保存的計分模式。 */
export const isCouponScoreRule = (id?: string): boolean =>
  !!id && (COUPON_SCORE_RULE_IDS as readonly string[]).includes(id)

/** 已下架的計分項編碼：不再展示、不再作為新增模板（後端殘留數據由遷移清理）。PLT_04 已合并進流量均衡（PLT_03） */
export const RETIRED_ORGANIC_RULE_IDS: string[] = ['COM_09', 'STB_04', 'STB_09', 'PLT_04']

/** 品牌專屬計分項：所屬品牌命中該鍵時，對應編碼不展示（如 MFOOD 無平台官方神券） */
export const BRAND_HIDDEN_ORGANIC_RULE_IDS: Partial<Record<AppType, string[]>> = {
  [AppType.MFOOD]: ['COM_07'],
}

/** 計分項當前是否可見：已下架編碼一律隱藏，品牌專屬編碼按所屬品牌過濾（未選品牌時按可見處理） */
export function isOrganicRuleVisible(ruleId: string, brand?: AppType): boolean {
  if (RETIRED_ORGANIC_RULE_IDS.includes(ruleId)) return false
  if (brand == null) return true
  return !(BRAND_HIDDEN_ORGANIC_RULE_IDS[brand] ?? []).includes(ruleId)
}

/** 券類計分 v1：門檻倍率檔（門檻 ÷ 門店客單價 ≤ upper 倍 → score，匹配不到即 0 分，不設兜底行） */
export interface ThresholdBand {
  /** 門檻倍率上界（含） */
  upper: number
  /** 該檔分值 */
  score: number
}

/** 券類計分 v1：優惠力度檔（券面 ÷ 計價基數 ≥ lower% → score，按下界由高到低首個命中，匹配不到即 0 分） */
export interface DiscountBand {
  /** 優惠力度下界（含），單位 % */
  lower: number
  /** 該檔分值 */
  score: number
}

/**
 * 券類計分 v1 配置：得分 = 報名分 + 門檻分 + 力度分（三條獨立加分線查表後相加，無乘法/無降檔）。
 * COM_01/03/04/05/07 各自獨立一份配置，互不影響。
 */
export interface CouponScoreConfig {
  enrollmentEnabled: boolean
  enrollmentScore: number
  /** 門檻計分模組開關：停用時該模組不計分 */
  thresholdEnabled: boolean
  thresholdBands: ThresholdBand[]
  /** 力度計分模組開關：停用時該模組不計分，也不參與校驗 */
  discountEnabled: boolean
  discountBands: DiscountBand[]
  /** 硬護欄倍數：門檻超過該倍數視為空轉券，門檻分與力度分均不發 */
  guardMultiplier: number
  /** 護欄觸發時是否仍發報名分（默認否，避免挂廢券白拿報名分） */
  enrollWhenGuarded: boolean
}

/**
 * 方案 v1 默認檔位：量級對齊現行（滿分 90 < 維度封頂 100）。
 * 門檻檔按「門檻 ÷ 門店客單價」單調遞減，末檔對齊硬護欄倍數，不設兜底行（匹配不到即 0 分）；
 * 力度檔按「券面 ÷ 計價基數（客單價與門檻取大）」取下界，不設兜底行。
 */
export const DEFAULT_COUPON_SCORE_CONFIG: CouponScoreConfig = {
  enrollmentEnabled: true,
  enrollmentScore: 10,
  thresholdEnabled: true,
  thresholdBands: [
    { upper: 0.3, score: 20 },
    { upper: 0.5, score: 16 },
    { upper: 0.8, score: 12 },
    { upper: 1, score: 8 },
    { upper: 1.5, score: 4 },
    { upper: 2, score: 2 },
  ],
  discountEnabled: true,
  discountBands: [
    { lower: 50, score: 60 },
    { lower: 30, score: 45 },
    { lower: 20, score: 30 },
    { lower: 10, score: 18 },
    { lower: 5, score: 8 },
  ],
  guardMultiplier: 2,
  enrollWhenGuarded: false,
}

/** 门槛档的整句条件文案（避开「上界/下界」术语；首档含无门槛，匹配不到即 0 分） */
export function thresholdBandLabel(bands: ThresholdBand[], index: number): string {
  const band = bands[index]
  if (band.upper === Infinity) return `使用門檻超過 ${bands[index - 1]?.upper ?? 0} 倍門店客單價`
  if (index === 0) return `無門檻 ～ ≤ ${band.upper} 倍門店客單價`
  return `使用門檻 > ${bands[index - 1].upper} 倍且 ≤ ${band.upper} 倍門店客單價`
}

/** 力度档的整句条件文案（分母為計價基數 = 客單價與門檻取大；匹配不到即 0 分） */
export function discountBandLabel(bands: DiscountBand[], index: number, amountLabel = '券面金額'): string {
  const band = bands[index]
  if (index === 0) return `${amountLabel} ≥ ${band.lower}% 計價基數`
  return `${amountLabel} ≥ ${band.lower}% 且 < ${bands[index - 1].lower}% 計價基數`
}

/** 方案 v1 計算結果 */
export interface CouponScoreResult {
  /** 基準不可信（B≤0）時不計門檻分與力度分 */
  canCompute: boolean
  reason?: string
  /** 門檻倍率（T/B），保留兩位 */
  thresholdRatio: number
  thresholdBand?: ThresholdBand
  thresholdScore: number
  /** 力度計價基數 = max(客單價, 門檻)：門檻高於客單價時分母被抬高，空轉券力度分自動壓低 */
  intensityBase: number
  /** 基數是否由門檻抬高（供界面標註） */
  intensityBaseFromThreshold: boolean
  /** 優惠力度（券面/計價基數，%），保留兩位 */
  discountRate: number
  discountBand?: DiscountBand
  discountScore: number
  /** 硬護欄是否觸發 */
  guarded: boolean
  enrollmentScore: number
  total: number
}

/**
 * 方案 v1 算分：三個獨立查表相加，加上硬護欄。
 * 力度分母取「計價基數 = max(客單價, 門檻)」，把「用戶能否用上」隱式編進分母：
 * 門檻超過客單價時分母變大，同樣面額的力度分自動變低，因此不需要額外的閘門規則。
 * 匹配不到任何檔位即 0 分（檔位表不再設兜底行）。
 * 用金額交叉比較代替除法判檔，避免 0.1/0.3 這類浮點誤差造成錯檔。
 */
export function computeCouponScore(cfg: CouponScoreConfig, benchmark: number, threshold: number, coupon: number): CouponScoreResult {
  const b = benchmark || 0
  const t = threshold || 0
  const d = coupon || 0
  const enrollment = cfg.enrollmentEnabled ? cfg.enrollmentScore : 0
  if (b <= 0) {
    return {
      canCompute: false, reason: '缺少可信門店客單價，不計門檻分與力度分',
      thresholdRatio: 0, thresholdScore: 0, intensityBase: 0, intensityBaseFromThreshold: false,
      discountRate: 0, discountScore: 0, guarded: false, enrollmentScore: enrollment, total: enrollment,
    }
  }
  const thresholdRatio = Math.round((t / b + Number.EPSILON) * 100) / 100
  const guarded = t > cfg.guardMultiplier * b
  const intensityBase = Math.max(b, t)
  const thresholdBand = guarded ? undefined : cfg.thresholdBands.find(band => band.upper === Infinity || t <= band.upper * b)
  const discountBand = guarded ? undefined : cfg.discountBands.find(band => d * 100 >= band.lower * intensityBase)
  // 命中檔位仍然回傳（供界面灰显與對照），但停用模組或匹配不到時不計入總分
  const thresholdScore = guarded || !cfg.thresholdEnabled ? 0 : thresholdBand?.score ?? 0
  const discountScore = guarded || !cfg.discountEnabled ? 0 : discountBand?.score ?? 0
  return {
    canCompute: true,
    thresholdRatio, thresholdBand, thresholdScore,
    intensityBase, intensityBaseFromThreshold: t > b,
    discountRate: Math.round((d / intensityBase * 100 + Number.EPSILON) * 100) / 100, discountBand, discountScore,
    guarded,
    enrollmentScore: guarded && !cfg.enrollWhenGuarded ? 0 : enrollment,
    total: (guarded && !cfg.enrollWhenGuarded ? 0 : enrollment) + thresholdScore + discountScore,
  }
}

/**
 * 方案 v1 草稿校驗：返回錯誤文案，null 表示通過。
 * 停用的模組跳過全部校驗（其檔位不參與計算，也不應阻擋保存）；啟用時才校驗。
 */
export function validateCouponScoreConfig(cfg: CouponScoreConfig): string | null {
  if (!Number.isInteger(cfg.enrollmentScore) || cfg.enrollmentScore < 0 || cfg.enrollmentScore > 100) return '報名分必須是 0～100 的整數'
  if (cfg.guardMultiplier < 1 || cfg.guardMultiplier > 20) return '硬護欄倍數必須在 1～20 之間'
  if (cfg.thresholdEnabled) {
    const tb = cfg.thresholdBands
    if (!tb.length) return '門檻計分已啟用，至少需要一個門檻檔位'
    for (let i = 0; i < tb.length; i++) {
      if (i > 0 && (tb[i].upper === Infinity || tb[i - 1].upper === Infinity || tb[i].upper <= tb[i - 1].upper)) return '門檻倍率上界必須嚴格遞增，不得重疊或留空檔'
      if (tb[i].upper === Infinity) return '門檻檔位不再使用「不限」兜底行，匹配不到即 0 分'
      if (tb[i].score < 0 || tb[i].score > 1000) return `門檻第 ${i + 1} 檔分值必須在 0～1000 之間`
      // 硬校驗：門檻越高分值不能越高，防止把高分誤填到高門檻檔（如 2 倍拿最高分）
      if (i > 0 && tb[i].score > tb[i - 1].score) return `門檻越高，分值必須不高於上一檔（第 ${i + 1} 檔 ${tb[i].score} 分 > 第 ${i} 檔 ${tb[i - 1].score} 分）`
    }
  }
  if (cfg.discountEnabled) {
    const db = cfg.discountBands
    if (!db.length) return '力度計分已啟用，至少需要一個力度檔位'
    for (let i = 0; i < db.length; i++) {
      if (db[i].lower <= 0) return '力度比例下界必須大於 0%（低於最低檔即 0 分，不需兜底行）'
      if (db[i].score < 0 || db[i].score > 1000) return `力度第 ${i + 1} 檔分值必須在 0～1000 之間`
      if (i > 0 && db[i].lower >= db[i - 1].lower) return '力度比例下界必須嚴格遞減，不得重複'
      // 硬校驗：力度越低分值不能越高，防止把高分誤填到低力度檔
      if (i > 0 && db[i].score > db[i - 1].score) return `力度越低，分值必須不高於上一檔（第 ${i + 1} 檔 ${db[i].score} 分 > 第 ${i} 檔 ${db[i - 1].score} 分）`
    }
  }
  return null
}

/** 配置軟提示：只保留「不攔截」的建議，分值方向已改為硬校驗 */
export function couponScoreMonotonicHint(cfg: CouponScoreConfig): string | null {
  const lastThreshold = cfg.thresholdBands[cfg.thresholdBands.length - 1]
  if (lastThreshold && lastThreshold.upper !== Infinity && lastThreshold.upper > cfg.guardMultiplier) {
    return `提醒：門檻末檔 ${lastThreshold.upper} 倍已超過硬護欄 ${cfg.guardMultiplier} 倍，該檔永遠不會命中`
  }
  if (cfg.thresholdEnabled && lastThreshold && lastThreshold.upper !== Infinity && lastThreshold.upper < cfg.guardMultiplier) {
    return `提醒：門檻末檔 ${lastThreshold.upper} 倍低於硬護欄 ${cfg.guardMultiplier} 倍，${lastThreshold.upper}～${cfg.guardMultiplier} 倍之間的券門檻分為 0，建議補一檔小分作為邊界容錯`
  }
  return null
}

/* ============================ 減免運費計分（COM_02） ============================ */

/** 使用減免運費計分面板的規則編碼 */
export const FREE_SHIPPING_SCORE_RULE_IDS = ['COM_02'] as const
export type FreeShippingScoreRuleId = typeof FREE_SHIPPING_SCORE_RULE_IDS[number]

/** 判斷該計分項是否走減免運費計分面板 */
export const isFreeShippingScoreRule = (id?: string): boolean =>
  !!id && (FREE_SHIPPING_SCORE_RULE_IDS as readonly string[]).includes(id)

/** 報名計分的後端前提條件值：存在即視為已報名（沿用既有 prerequisites 字段；是否計分由面板 enrollmentEnabled 開關控制） */
export const FREE_SHIPPING_ENROLLMENT_PREREQUISITE = '報名減免運費'

/**
 * 減免運費門檻檔：運營人工配置的「使用門檻 → 分值」映射。
 * 平台活動與商家自建活動的門檻口徑不統一，系統讀不到，因此只能用金額直接配置，
 * 不像券類模組以「門店客單價」為基準自動換算倍數。
 */
export interface FreeShippingThresholdBand {
  /** 使用門檻（元，0 表示無門檻） */
  threshold: number
  /** 命中該檔時給的分值 */
  score: number
}

/** 減免運費計分配置：得分 = 報名分 + 門檻分（按生效活動的使用門檻查檔） */
export interface FreeShippingScoreConfig {
  /** 報名分開關：停用時報名分模組不計分（分值配置保留） */
  enrollmentEnabled: boolean
  /** 報名分：平台或商家自建活動最終只生效一個，報名即給分 */
  enrollmentScore: number
  /** 門檻計分模組開關：停用時該模組不計分 */
  thresholdEnabled: boolean
  /** 門檻檔位（按門檻升序，命中即停） */
  thresholdBands: FreeShippingThresholdBand[]
  /** 有效門檻上限（元）：不填表示跟隨檔位表末檔；超出上限視為空轉活動 */
  guardThreshold?: number
  /** 超過有效上限是否仍發報名分（預設停發，避免空轉活動白拿報名分） */
  enrollWhenGuarded?: boolean
}

/** 默認檔位：0 元檔保底（無門檻活動），門檻越高分值越低；護欄默認跟隨末檔且超限停發報名分 */
export const DEFAULT_FREE_SHIPPING_SCORE_CONFIG: FreeShippingScoreConfig = {
  enrollmentEnabled: true,
  enrollmentScore: 20,
  thresholdEnabled: true,
  thresholdBands: [
    { threshold: 0, score: 20 },
    { threshold: 30, score: 15 },
    { threshold: 50, score: 10 },
    { threshold: 80, score: 5 },
  ],
  enrollWhenGuarded: false,
}

/** 門檻檔的整句條件文案（0 元即無門檻） */
export function freeShippingBandLabel(band: FreeShippingThresholdBand): string {
  return band.threshold > 0 ? `減免門檻 ≤ ${band.threshold} 元` : '無門檻（0 元）'
}

/** 報名分護欄的有效上限：優先取運營手動覆蓋值，否則跟隨檔位表末檔 */
export function freeShippingGuardLimit(cfg: FreeShippingScoreConfig): number | undefined {
  if (cfg.guardThreshold !== undefined && cfg.guardThreshold !== null) return cfg.guardThreshold
  const last = cfg.thresholdBands[cfg.thresholdBands.length - 1]
  return last?.threshold
}

/**
 * 归一化后端已保存的配置：后端只透传 JSON 不做结构校验，因此读取时过滤非法档位、
 * 收敛布尔与数值类型；报名分以规则 score 字段为准（历史数据可能只有 score）。
 */
export function normalizeFreeShippingScoreConfig(
  raw: Partial<FreeShippingScoreConfig> | undefined,
  score?: number,
): FreeShippingScoreConfig {
  const bands = Array.isArray(raw?.thresholdBands)
    ? raw.thresholdBands
        .filter(band => band && Number.isFinite(band.threshold) && Number.isFinite(band.score))
        .map(band => ({ threshold: band.threshold, score: band.score }))
    : DEFAULT_FREE_SHIPPING_SCORE_CONFIG.thresholdBands
  return {
    ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG,
    ...raw,
    enrollmentEnabled: raw?.enrollmentEnabled !== false,
    thresholdEnabled: raw?.thresholdEnabled !== false,
    thresholdBands: bands,
    guardThreshold: typeof raw?.guardThreshold === 'number' && Number.isFinite(raw.guardThreshold)
      ? raw.guardThreshold
      : undefined,
    enrollWhenGuarded: raw?.enrollWhenGuarded === true,
    enrollmentScore: typeof score === 'number'
      ? score
      : typeof raw?.enrollmentScore === 'number'
        ? raw.enrollmentScore
        : DEFAULT_FREE_SHIPPING_SCORE_CONFIG.enrollmentScore,
  }
}

/** 減免運費計分結果 */
export interface FreeShippingScoreResult {
  /** 命中的門檻檔（未命中為空，不設兜底分） */
  thresholdBand?: FreeShippingThresholdBand
  thresholdScore: number
  enrollmentScore: number
  /** 是否超出有效門檻上限（超限視為空轉活動） */
  guarded: boolean
  /** 本次計算採用的有效門檻上限（元）；undefined 表示未設上限 */
  limit?: number
  total: number
}

/**
 * 算分：報名分 + 門檻分。
 * 門檻按運營配置的檔位由低到高查表，命中即停、分數不累加；匹配不到即 0 分。
 * 超出有效上限時視為空轉活動：門檻分不發，報名分是否發由 enrollWhenGuarded 決定（預設停發）。
 * 商家未填門檻（或無門檻活動）按 0 元處理，命中首檔。
 */
export function computeFreeShippingScore(cfg: FreeShippingScoreConfig, threshold: number): FreeShippingScoreResult {
  const usedThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 0
  const band = cfg.thresholdBands.find(item => usedThreshold <= item.threshold)
  const thresholdScore = cfg.thresholdEnabled ? band?.score ?? 0 : 0
  const limit = freeShippingGuardLimit(cfg)
  const guarded = limit !== undefined && usedThreshold > limit
  const enrollmentScore = guarded && !cfg.enrollWhenGuarded ? 0 : cfg.enrollmentEnabled ? cfg.enrollmentScore : 0
  return { thresholdBand: band, thresholdScore, enrollmentScore, guarded, limit, total: enrollmentScore + thresholdScore }
}

/** 配置校驗：返回錯誤文案，null 表示通過（停用的門檻模組跳過檔位校驗，但護欄仍需校驗） */
export function validateFreeShippingScoreConfig(cfg: FreeShippingScoreConfig): string | null {
  if (!Number.isInteger(cfg.enrollmentScore) || cfg.enrollmentScore < 0 || cfg.enrollmentScore > 100) {
    return '報名分必須是 0～100 的整數'
  }
  if (cfg.guardThreshold !== undefined && cfg.guardThreshold !== null) {
    if (!Number.isFinite(cfg.guardThreshold) || cfg.guardThreshold < 0) return '有效門檻上限必須大於或等於 0 元'
    const maxThreshold = cfg.thresholdBands.length
      ? Math.max(...cfg.thresholdBands.map(band => band.threshold))
      : undefined
    // 覆蓋上限低於末檔會出現「檔位有分但報名分停發」的矛盾區間，直接攔截
    if (maxThreshold !== undefined && cfg.guardThreshold < maxThreshold) {
      return `有效門檻上限不得低於末檔門檻（${maxThreshold} 元），否則會出現檔位有分但報名分停發`
    }
  }
  if (!cfg.thresholdEnabled) return null
  const bands = cfg.thresholdBands
  if (!bands.length) return '門檻計分已啟用，至少需要一個門檻檔位'
  for (let i = 0; i < bands.length; i++) {
    if (!Number.isFinite(bands[i].threshold) || bands[i].threshold < 0) return `第 ${i + 1} 檔門檻必須大於或等於 0 元`
    if (i > 0 && bands[i].threshold <= bands[i - 1].threshold) return '門檻金額必須嚴格遞增，不得重複或留空檔'
    if (!Number.isInteger(bands[i].score) || bands[i].score < 0 || bands[i].score > 1000) {
      return `門檻第 ${i + 1} 檔分值必須是 0～1000 的整數`
    }
    // 硬校驗：門檻越高分值不能越高，防止把高分誤填到高門檻檔
    if (i > 0 && bands[i].score > bands[i - 1].score) {
      return `門檻越高，分值必須不高於上一檔（第 ${i + 1} 檔 ${bands[i].score} 分 > 第 ${i} 檔 ${bands[i - 1].score} 分）`
    }
  }
  return null
}

/** 配置軟提示：只提示不攔截（補 0 元檔 / 覆蓋上限高於末檔時只剩報名分） */
export function freeShippingScoreHint(cfg: FreeShippingScoreConfig): string | null {
  const hints: string[] = []
  const first = cfg.thresholdBands[0]
  if (cfg.thresholdEnabled && first && first.threshold > 0) {
    hints.push('提醒：首檔門檻大於 0 元，無門檻的減免運費活動將拿不到門檻分，建議補一檔 0 元檔')
  }
  if (cfg.guardThreshold !== undefined && cfg.guardThreshold !== null && cfg.thresholdBands.length) {
    const maxThreshold = Math.max(...cfg.thresholdBands.map(band => band.threshold))
    if (cfg.guardThreshold > maxThreshold) {
      hints.push(`提醒：有效上限 ${cfg.guardThreshold} 元高於末檔 ${maxThreshold} 元，超出末檔的區間只有報名分（門檻分為 0）`)
    }
  }
  return hints.length ? hints.join(' ') : null
}

/* ============================ 平台會員紅包（COM_06） ============================ */

/** 使用平台會員紅包計分面板的規則編碼 */
export const MEMBER_BONUS_SCORE_RULE_IDS = ['COM_06'] as const
export type MemberBonusScoreRuleId = typeof MEMBER_BONUS_SCORE_RULE_IDS[number]

/** 判斷該計分項是否走平台會員紅包面板 */
export const isMemberBonusScoreRule = (id?: string): boolean =>
  !!id && (MEMBER_BONUS_SCORE_RULE_IDS as readonly string[]).includes(id)

/**
 * 平台會員紅包加碼檔：平台配置的出資金額由商家承擔，商家可自行額外加碼；
 * 運營按「商家加碼金額 → 分值」配置梯度，加碼越多分越高。
 */
export interface MemberBonusTier {
  /** 商家加碼金額（元），達到該金額即命中 */
  amount: number
  /** 該檔位對應分值 */
  score: number
}

/** 平台會員紅包計分配置：得分 = 報名分 + 加碼分（按商家加碼金額查檔） */
export interface MemberBonusScoreConfig {
  /** 報名分開關：停用時報名分模組不計分（分值配置保留） */
  enrollmentEnabled: boolean
  /** 報名分：商家報名平台會員紅包即給分 */
  enrollmentScore: number
  /** 加碼梯度（按金額升序，命中即停） */
  bonusTiers: MemberBonusTier[]
}

/** 默認模板：報名分 + 四檔加碼梯度（僅示例，運營按實際預算調整） */
export const DEFAULT_MEMBER_BONUS_SCORE_CONFIG: MemberBonusScoreConfig = {
  enrollmentEnabled: true,
  enrollmentScore: 10,
  bonusTiers: [
    { amount: 5, score: 5 },
    { amount: 10, score: 10 },
    { amount: 20, score: 20 },
    { amount: 50, score: 50 },
  ],
}

/** 加碼檔的整句條件文案 */
export function memberBonusTierLabel(tier: MemberBonusTier): string {
  return `商家加碼 ≥ ${tier.amount} 元`
}

/** 平台會員紅包計分結果 */
export interface MemberBonusScoreResult {
  /** 命中的加碼檔（未命中為空，不設兜底分） */
  matchedTier?: MemberBonusTier
  bonusScore: number
  enrollmentScore: number
  total: number
}

/**
 * 算分：報名分 + 加碼分。
 * 加碼金額按檔位由低到高匹配，取「達到的最後一檔」，命中即停、分數不累加；未達首檔即 0 分。
 * 商家未加碼（0 元）只拿報名分。
 */
export function computeMemberBonusScore(cfg: MemberBonusScoreConfig, addAmount: number): MemberBonusScoreResult {
  const amount = Number.isFinite(addAmount) && addAmount > 0 ? addAmount : 0
  // 取「达到的最高金额档」，不依赖配置顺序；命中一档即停，不累加
  const matchedTier = cfg.bonusTiers.reduce<MemberBonusTier | undefined>(
    (best, tier) => amount >= tier.amount && (!best || tier.amount > best.amount) ? tier : best,
    undefined,
  )
  const bonusScore = matchedTier?.score ?? 0
  const enrollmentScore = cfg.enrollmentEnabled ? cfg.enrollmentScore : 0
  return { matchedTier, bonusScore, enrollmentScore, total: enrollmentScore + bonusScore }
}

/** 配置校驗：返回錯誤文案，null 表示通過 */
export function validateMemberBonusScoreConfig(cfg: MemberBonusScoreConfig): string | null {
  if (!Number.isInteger(cfg.enrollmentScore) || cfg.enrollmentScore < 0 || cfg.enrollmentScore > 100) {
    return '報名分必須是 0～100 的整數'
  }
  if (!cfg.bonusTiers.length) return '至少需要一個加碼檔位'
  for (let i = 0; i < cfg.bonusTiers.length; i++) {
    const tier = cfg.bonusTiers[i]
    if (!Number.isFinite(tier.amount) || tier.amount <= 0) return `第 ${i + 1} 檔加碼金額必須大於 0 元`
    if (i > 0 && tier.amount <= cfg.bonusTiers[i - 1].amount) return '加碼金額必須嚴格遞增，不得重複或留空檔'
    if (!Number.isInteger(tier.score) || tier.score < 0 || tier.score > 1000) {
      return `加碼第 ${i + 1} 檔分值必須是 0～1000 的整數`
    }
    // 硬校驗：加碼越多分值不能越低，防止把低分誤填到高加碼檔
    if (i > 0 && tier.score < cfg.bonusTiers[i - 1].score) {
      return `加碼金額越高，分值不得低於上一檔（第 ${i + 1} 檔 ${tier.score} 分 < 第 ${i} 檔 ${cfg.bonusTiers[i - 1].score} 分）`
    }
  }
  return null
}

/** 归一化后端已保存的配置：过滤非法档位与类型，缺失时回退默认模板 */
export function normalizeMemberBonusScoreConfig(raw: Partial<MemberBonusScoreConfig> | undefined): MemberBonusScoreConfig {
  const tiers = Array.isArray(raw?.bonusTiers)
    ? raw.bonusTiers
        .filter(tier => tier && Number.isFinite(tier.amount) && Number.isFinite(tier.score))
        .map(tier => ({ amount: tier.amount, score: tier.score }))
    : DEFAULT_MEMBER_BONUS_SCORE_CONFIG.bonusTiers
  return {
    ...DEFAULT_MEMBER_BONUS_SCORE_CONFIG,
    ...raw,
    enrollmentEnabled: raw?.enrollmentEnabled !== false,
    bonusTiers: tiers,
    enrollmentScore: typeof raw?.enrollmentScore === 'number' && Number.isFinite(raw.enrollmentScore)
      ? raw.enrollmentScore
      : DEFAULT_MEMBER_BONUS_SCORE_CONFIG.enrollmentScore,
  }
}

/* ============================ 金字招牌標籤計分（COM_10） ============================ */

/** 使用金字招牌標籤計分面板的規則編碼 */
export const SIGNBOARD_SCORE_RULE_IDS = ['COM_10'] as const
export type SignboardScoreRuleId = typeof SIGNBOARD_SCORE_RULE_IDS[number]

/** 判斷該計分項是否走金字招牌標籤計分面板 */
export const isSignboardScoreRule = (id?: string): boolean =>
  !!id && (SIGNBOARD_SCORE_RULE_IDS as readonly string[]).includes(id)

/** 單個招牌標籤的計分配置 */
export interface SignboardLabelScore {
  /** 標籤存儲值（枚舉見 signboardLabels.ts，與訂單表 label_type 一致） */
  labelType: string
  /** 標籤名稱快照：保存時從枚舉帶出，枚舉調整後歷史數據仍可讀 */
  labelName: string
  /** 該標籤分值：商家購買且在投放期內即得分，多標籤逐個累加 */
  score: number
}

/** 金字招牌標籤計分配置（與券類 v1 面板互斥，不共用結構） */
export interface SignboardScoreConfig {
  items: SignboardLabelScore[]
}

/** 默認配置：空清單，標籤與分值全部由運營自行增刪 */
export const DEFAULT_SIGNBOARD_SCORE_CONFIG: SignboardScoreConfig = { items: [] }

/** 金字招牌計分結果 */
export interface SignboardScoreResult {
  /** 命中的標籤（保持配置順序） */
  matched: SignboardLabelScore[]
  /** 商家持有但未配置分值的標籤（不計分，供界面提示補配） */
  unconfigured: string[]
  total: number
}

/**
 * 算分：以商家「已購買且在投放期內」的標籤為準，逐個累加已配置的分值。
 * 不區分場景（全澳對比與商圈對比同標籤同分）；未配置分值的標籤不計分。
 */
export function computeSignboardScore(cfg: SignboardScoreConfig, ownedLabels: string[]): SignboardScoreResult {
  const owned = Array.from(new Set(ownedLabels.filter(Boolean)))
  const matched = cfg.items.filter(item => owned.includes(item.labelType))
  const matchedTypes = matched.map(item => item.labelType)
  const unconfigured = owned.filter(type => !matchedTypes.includes(type))
  return { matched, unconfigured, total: matched.reduce((sum, item) => sum + item.score, 0) }
}

/** 配置校驗：返回錯誤文案，null 表示通過（同一標籤不得重複，分值必須是 0～1000 整數） */
export function validateSignboardScoreConfig(cfg: SignboardScoreConfig): string | null {
  const seen = new Set<string>()
  for (let i = 0; i < cfg.items.length; i++) {
    const item = cfg.items[i]
    const name = item.labelName || item.labelType || `第 ${i + 1} 行`
    if (!item.labelType) return `${name}請選擇招牌標籤`
    if (seen.has(item.labelType)) return `標籤「${name}」重複配置，同一標籤只能有一檔分值`
    seen.add(item.labelType)
    if (!Number.isInteger(item.score) || item.score < 0 || item.score > 1000) return `標籤「${name}」的分值必須是 0～1000 的整數`
  }
  return null
}

/* ============================ 門店標籤計分（STB_LABEL） ============================ */

/**
 * 门店标签枚举（店铺维度 STB_LABEL 的计分依据）。
 * 标签由运营在门店资料中手动指定，一家门店同时只有一个标签，因此本项是「命中一檔即停」，
 * 不同于 COM_10 金字招牌的多标签逐个累加。存储值与第二阶段后端字典保持一致，界面只认本清单。
 */
export const STORE_LABELS = [
  { value: 'exclusive', label: '獨家' },
  { value: 'brand', label: '品牌' },
  { value: 'chain', label: '連鎖' },
  { value: 'gold', label: '金牌' },
] as const

export type StoreLabelValue = typeof STORE_LABELS[number]['value']

/** 按存储值取标签元数据（找不到返回 undefined，由调用方决定兜底展示） */
export const storeLabelMeta = (value?: string) => STORE_LABELS.find(item => item.value === value)
/** 标签展示文案；未知编码退回原始值，避免界面出现空白 */
export const storeLabelText = (value?: string): string => storeLabelMeta(value)?.label ?? value ?? ''

/** 使用门店标签计分面板的规则编码 */
export const STORE_LABEL_SCORE_RULE_IDS = ['STB_LABEL'] as const
export type StoreLabelScoreRuleId = typeof STORE_LABEL_SCORE_RULE_IDS[number]

/** 判断该计分项是否走门店标签计分面板 */
export const isStoreLabelScoreRule = (id?: string): boolean =>
  !!id && (STORE_LABEL_SCORE_RULE_IDS as readonly string[]).includes(id)

/** 单个门店标签的计分配置 */
export interface StoreLabelScore {
  /** 标签存储值（枚举见 STORE_LABELS） */
  labelValue: string
  /** 标签名称快照：保存时从枚举带出，枚举调整后历史数据仍可读 */
  labelName: string
  /** 该标签分值：门店当前标签命中即得分 */
  score: number
}

/** 门店标签计分配置（与券类 v1 面板互斥，不共用结构） */
export interface StoreLabelScoreConfig {
  items: StoreLabelScore[]
}

/** 默认配置：空清单，标签与分值全部由运营自行增删（对齐 COM_10 口径） */
export const DEFAULT_STORE_LABEL_SCORE_CONFIG: StoreLabelScoreConfig = { items: [] }

/** 门店标签计分结果 */
export interface StoreLabelScoreResult {
  /** 命中的标签档（未配置即为空） */
  matched?: StoreLabelScore
  /** 门店有标签但后台未配分值：不计分，供界面提示补配 */
  unconfigured: boolean
  total: number
}

/**
 * 算分：以门店当前标签为准，命中一檔即停、不累加。
 * 未配置该标签、或门店尚未指定标签，都按 0 分处理（不设兜底分）。
 */
export function computeStoreLabelScore(cfg: StoreLabelScoreConfig, labelValue?: string): StoreLabelScoreResult {
  const matched = labelValue ? cfg.items.find(item => item.labelValue === labelValue) : undefined
  return { matched, unconfigured: !!labelValue && !matched, total: matched?.score ?? 0 }
}

/** 配置校驗：返回錯誤文案，null 表示通過（同一標籤不得重複，分值必須是 0～1000 整數） */
export function validateStoreLabelScoreConfig(cfg: StoreLabelScoreConfig): string | null {
  const seen = new Set<string>()
  for (let i = 0; i < cfg.items.length; i++) {
    const item = cfg.items[i]
    const name = item.labelName || item.labelValue || `第 ${i + 1} 行`
    if (!item.labelValue) return `${name}請選擇門店標籤`
    if (seen.has(item.labelValue)) return `標籤「${name}」重複配置，同一標籤只能有一檔分值`
    seen.add(item.labelValue)
    if (!Number.isInteger(item.score) || item.score < 0 || item.score > 1000) return `標籤「${name}」的分值必須是 0～1000 的整數`
  }
  return null
}

/** 时段推荐计分的前提条件标记：与 COM_02「報名即給分」同先例，住 prerequisites 字段供后端计分侧识读 */
export const TIME_SLOT_AD_PREREQUISITE = '購買時段推薦'

/**
 * 时段推荐默认分值：商家购买时段推荐广告后得的一次性固定加分。
 * 只作未播种环境的兜底，真实分值以规则行 score 为准并可在界面编辑。
 * 编码用语义后缀而非 COM_11/COM_12：后端自动编号只取现有行最大序号 +1，
 * 数字编码可能在自定义计分项上撞车（STB_ACT 同此先例）。
 */
export const TIME_SLOT_AD_DEFAULT_SCORE = 50

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
  /** 倍數梯度檔位（僅 mode=TIERED_MULTIPLIER 時使用，以客單價為基準） */
  multiplierTiers?: MultiplierTier[]
  /** 門檻≤客單價時固定加分（僅 COM_01 使用） */
  thresholdScore?: number
  /** 計算周期（僅 mode=TIERED 時使用） */
  calcCycle?: CalcCycle
  /** 定時監控間隔小時數（僅 calcCycle=SCHEDULED 時使用，支持小數如 0.5） */
  calcIntervalHours?: number
  /** 歷史基線天數（出餐準時率 STB_05 已不再配置：統計窗口由業務系統定時任務決定，本頁只配檔位與分值） */
  statDaysTotal?: number
  /** 近期對比天數（舊時間窗口對比規則遺留，STB_05 已不再使用） */
  statDaysRecent?: number
  /** 高峰時段定義（舊出餐速度規則遺留） */
  peakTimeRanges?: PeakTimeRange[]
  /** 每單固定扣分（舊按次計罰口徑殘留：STB_06 已改為自動接單、STB_07 已改為出餐時長、STB_08 已改為訂單取消率梯度加分、STB_09 已下架，現已無規則使用，僅保留讀取兼容舊庫行） */
  deductionPerOrder?: number
  /** 衰减系数（距離衰減規則使用，每公里扣除的分數） */
  decayCoefficient?: number
  /** 屏蔽商家列表（店鋪代碼，即使滿足條件也不扶持）—— 全局共享，不受區域限制 */
  blockedMerchants?: string[]
  /** 區域配置（PLT_03 商家扶持用 RegionSupportConfig，PLT_04 訂單過熱調控用 RegionOverheatConfig） */
  regionConfigs?: Record<string, RegionSupportConfig | RegionOverheatConfig>
  /** 活動加分配置（僅 STB_ACT 規則使用；暫按算法庫算法ID配置，每個算法獨立計分） */
  activityItems?: ActivityScoreItem[]
  /** 減免運費計分配置（僅 COM_02 規則使用：門檻檔位 + 報名分護欄） */
  freeShippingConfig?: FreeShippingScoreConfig
  /** 平台會員紅包計分配置（僅 COM_06 規則使用：報名分 + 加碼梯度） */
  memberBonusConfig?: MemberBonusScoreConfig
  /** 流量均衡合併配置（僅 PLT_03 使用：統一商家扶持與訂單過熱調控，統計口徑 + 區域梯度） */
  trafficBalanceConfig?: TrafficBalanceConfig
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

/**
 * 自動接單加分（STB_06）默認分值：商家在店端開啟自動接單即得的一次性固定加分。
 * 只作未播種環境的兌底，真實分值以規則行 score 為準並可在面板編輯。
 */
export const AUTO_ACCEPT_DEFAULT_SCORE = 50

/**
 * 出餐時長加分（STB_07）默認分值：開啟自動校正後的固定加分。
 * 只作未播種環境的兌底，真實分值以規則行 score 為準並可在面板編輯。
 */
export const MEAL_TIME_DEFAULT_SCORE = 50

/**
 * 出餐时长（STB_07）「開啟自動校正」的开/关存储值：沿用既有 prerequisites 字段（与 COM_02 减免运费同先例）。
 * 必须显式存两个值，而不是「非空=开、空=关」：loadConfig 对空值有「默认开启」兜底（为了未播种环境），
 * 若「关」也存空，运营关掉开关保存后下次加载会被兜底重新打开，停用就永久存不住。
 * ON 值必须与后端 OrganicScoreDataInitializer.STB07_AUTO_CORRECT_PREREQUISITE 一致，
 * 否则迁移播种的行在界面会被读成「未开启」。
 */
export const MEAL_TIME_AUTO_CORRECT_ON = '開啟自動校正'
export const MEAL_TIME_AUTO_CORRECT_OFF = '停用自動校正'

/** 出餐时长自动校正是否开启：空值（未播种/旧按次计罚残留文案）按默认开启处理，仅显式停用值算关 */
export const isMealTimeAutoCorrectEnabled = (prerequisites?: string): boolean =>
  prerequisites !== MEAL_TIME_AUTO_CORRECT_OFF

const { ENABLED, DISABLED: _DISABLED } = ServiceStatus

/** 默認評分規則（可在界面上新增/停用/調整分值） */
export const DEFAULT_ORGANIC_SCORE_RULES: OrganicScoreRule[] = [
  // ===== 商業維度（商家營銷投入與付費推廣） =====
  { id: 'COM_01', dimension: ScoreDimension.COMMERCIAL, name: '滿額立減', description: '商家參與滿額立減：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（立減金額 ÷ 計價基數）', mode: ScoreMode.TIERED_MULTIPLIER, score: 0, status: ENABLED, builtin: true, thresholdScore: 10, multiplierTiers: [
    { multiplier: 1, score: 30 },
    { multiplier: 2, score: 20 },
    { multiplier: 3, score: 10 },
  ] },
  { id: 'COM_02', dimension: ScoreDimension.COMMERCIAL, name: '減免運費', description: '商家報名減免運費活動：報名分 + 門檻分（門檻由運營人工配置，按金額查檔）', mode: ScoreMode.RULE_BONUS, score: 20, status: ENABLED, builtin: true, prerequisites: FREE_SHIPPING_ENROLLMENT_PREREQUISITE },
  { id: 'COM_03', dimension: ScoreDimension.COMMERCIAL, name: '進店領券', description: '商家設置進店領券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_04', dimension: ScoreDimension.COMMERCIAL, name: '門店新客券', description: '商家設置門店新客券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.RULE_BONUS, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_05', dimension: ScoreDimension.COMMERCIAL, name: '收藏送券', description: '商家設置收藏送券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_06', dimension: ScoreDimension.COMMERCIAL, name: '平台會員紅包', description: '商家報名平台會員紅包：報名分 + 加碼分（按商家額外加碼出資金額梯度計分）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_07', dimension: ScoreDimension.COMMERCIAL, name: '平台官方神券', description: '商家設置平台官方神券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_10', dimension: ScoreDimension.COMMERCIAL, name: '金字招牌(廣告)', description: '商家購買金字招牌標籤後，按已購買且在投放期內的標籤逐個累加計分', mode: ScoreMode.RULE_BONUS, score: 100, status: ENABLED, builtin: true },
  // 时段推荐：与 STB_06/STB_07 同型的「购买即给固定分」计分项，不分购买时段数量、不累加
  { id: 'COM_SLOT', dimension: ScoreDimension.COMMERCIAL, name: '時段推薦', description: '商家購買時段推薦廣告，投放期內即得固定加分，不區分購買時段數量、不累加；未購買或已過期不加分', mode: ScoreMode.RULE_BONUS, score: TIME_SLOT_AD_DEFAULT_SCORE, status: ENABLED, builtin: true, prerequisites: TIME_SLOT_AD_PREREQUISITE },

  // ===== 店鋪維度（基礎信息 + 店鋪運營） =====
  { id: 'STB_01', dimension: ScoreDimension.STORE, name: '主營時段加分', description: '主營時段配置完整，當前處於主營時段內加分', mode: ScoreMode.RULE_BONUS, score: 60, status: ENABLED, builtin: true },
  // 门店标签：原 STB_04「店鋪標籤-金牌」只支持金牌单一身份，已下架；本项改为独家/品牌/连锁/金牌四选一的标签分值表
  { id: 'STB_LABEL', dimension: ScoreDimension.STORE, name: '門店標籤', description: '門店標籤由門店資料手動指定，獨家／品牌／連鎖／金牌四選一；按當前標籤命中對應分值，命中一檔即停、不累加，未配置該標籤不加分', mode: ScoreMode.RULE_BONUS, score: 0, status: ENABLED, builtin: true },
  { id: 'STB_02', dimension: ScoreDimension.STORE, name: '營業狀態', description: '營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊由系統直接過濾，不加載到瀑布流也不計分', mode: ScoreMode.CONDITIONAL, score: 0, status: ENABLED, builtin: true, conditionItems: [
      { condition: 'bonus', score: 100 },
      { condition: 'deduction', score: 20 },
      { condition: 'deduction', score: 50 },
      // 休息打烊为系统过滤档：condition 固定 filtered、分值 0，与后端迁移写回的口径一致
      { condition: 'filtered', score: 0 },
    ] },
  { id: 'STB_03', dimension: ScoreDimension.STORE, name: '店鋪綜合分', description: '店鋪綜合分由業務系統實時傳遞，以最新傳入值比對梯度檔位固定加分：分數越高加分越多，命中一檔即停、分數不累加，低於最低檔不加分', mode: ScoreMode.CONDITIONAL, score: 0, status: ENABLED, builtin: true, conditionItems: toStarTierConditionItems(DEFAULT_STAR_TIER_BANDS) },
  { id: 'PLT_03', dimension: ScoreDimension.PLATFORM, name: '流量均衡', description: '統一商家扶持與訂單過熱調控：按滾動過去 N 天的外賣/自取訂單量梯度非負加分，訂單量越高加分越少；已取消訂單不納入，退款是否計入可配。本頁僅配檔位，算分由業務系統消費 traffic_balance_config', mode: ScoreMode.TIERED, score: 0, statDays: 7, calcCycle: CalcCycle.SCHEDULED, calcIntervalHours: 1, status: ENABLED, builtin: true, trafficBalanceConfig: structuredClone(DEFAULT_TRAFFIC_BALANCE_CONFIG) },
  { id: 'STB_05', dimension: ScoreDimension.STORE, name: '出餐準時率', description: '出餐準時率由業務系統定時任務計算後傳遞（非實時傳數），本項只配置檔位與分值：按準時率從高到低匹配，命中一檔即停、分數不累加，低於最低檔不得分', mode: ScoreMode.CONDITIONAL, score: 0, conditionItems: toOntimeRateConditionItems(DEFAULT_ONTIME_RATE_BANDS), status: ENABLED, builtin: true },
  { id: 'STB_06', dimension: ScoreDimension.STORE, name: '自動接單', description: '商家在店端開啟自動接單即得固定加分，未開啟不加分；不再按拒絕單量計罰', mode: ScoreMode.RULE_BONUS, score: AUTO_ACCEPT_DEFAULT_SCORE, status: ENABLED, builtin: true },
  // 口径改造：原「出餐超時・按次计罚扣分」更名为「出餐時長・固定加分」（配置项为开启自动校正 + 固定加分），
  // 旧 stat_days / deduction_per_order 不再使用，由后端迁移 organic:stb07-meal-time-v1 覆写库内旧行
  { id: 'STB_07', dimension: ScoreDimension.STORE, name: '出餐時長', description: '開啟自動校正後按出餐時長計分，命中即得固定加分，不累加', mode: ScoreMode.RULE_BONUS, score: MEAL_TIME_DEFAULT_SCORE, status: ENABLED, builtin: true, prerequisites: MEAL_TIME_AUTO_CORRECT_ON },
  { id: 'STB_08', dimension: ScoreDimension.STORE, name: '訂單取消率', description: '統計期內外賣單的取消率（自取單不納入，用戶取消與商家取消均計入），單量達門檻才納入，按取消率梯度加分：取消率越低加分越多，命中一檔即停、不累加，高於最高檔不加分', mode: ScoreMode.CONDITIONAL, score: 0, statDays: 30, status: ENABLED, builtin: true, conditionItems: toCancelRateConditionItems(DEFAULT_CANCEL_RATE_BANDS, DEFAULT_CANCEL_MIN_ORDERS) },
  // STB_09「超時接單」已下架：从默认计分项移除并加入 RETIRED_ORGANIC_RULE_IDS，后端残留行由库内数据过滤屏蔽
  { id: 'STB_ACT', dimension: ScoreDimension.STORE, name: '活動加分', description: '活動資料由業務系統同步，僅正常進行中的活動計分；已過期、失效或未開始的活動不加分。店鋪報名進行中的活動即得固定加分，多個活動獨立計分、可累加', mode: ScoreMode.RULE_BONUS, score: 0, activityItems: [], status: ENABLED, builtin: true },

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
