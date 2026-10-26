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
  /** 優惠券力度計分：報名分 + 優惠比例檔位分 × 門檻可達係數（COM_03~COM_07 新方案） */
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

/** 條件計分子項（一組條件描述 → 分值） */
export interface ScoreConditionItem {
  /** 條件描述（如「報名免運費活動」） */
  condition: string
  /** 該條件對應分值（正=加分，負=扣分） */
  score: number
}

/**
 * 营业状态四档（索引与 STB_02 的 conditionItems 一一对应）。
 * filtered 档由系统直接过滤、不加载到瀑布流，因此不参与计分也不提供分值配置入口；
 * 库里对应槽位的 condition 固定为 'filtered'（见迁移 organic:stb02-filtered-v1），两边语义一致。
 */
export const BUSINESS_STATE_ITEMS: Array<{ key: string; label: string; desc: string; filtered?: boolean }> = [
  { key: 'operating', label: '營業中狀態', desc: '正常營業中' },
  { key: 'shortBreak', label: '休息一會，馬上回來', desc: '短暫休息後恢復營業' },
  { key: 'overload', label: '爆單了，暫停接單一會', desc: '訂單量超過承載能力' },
  { key: 'closed', label: '休息打烊', desc: '當日不再營業', filtered: true },
]

/** 系統過濾檔在 conditionItems 裡的 condition 標記（與後端 FILTERED_CONDITION 一致） */
export const FILTERED_STATE_CONDITION = 'filtered'

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

/** 使用券類計分 v1 面板的規則編碼集合（COM_01 滿額立減 + COM_03~COM_07 五個券類活動） */
export const COUPON_SCORE_RULE_IDS = ['COM_01', 'COM_03', 'COM_04', 'COM_05', 'COM_06', 'COM_07'] as const
export type CouponScoreRuleId = typeof COUPON_SCORE_RULE_IDS[number]

/** 判斷該計分項是否走券類計分 v1 面板；不改變後端已保存的計分模式。 */
export const isCouponScoreRule = (id?: string): boolean =>
  !!id && (COUPON_SCORE_RULE_IDS as readonly string[]).includes(id)

/** 已下架的計分項編碼：不再展示、不再作為新增模板（後端殘留數據由遷移清理） */
export const RETIRED_ORGANIC_RULE_IDS: string[] = ['COM_09', 'STB_04']

/** 品牌專屬計分項：所屬品牌命中該鍵時，對應編碼不展示（如 MFOOD 無閃蜂官方神券） */
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
 * COM_03~COM_07 五個券類活動各自獨立一份配置，互不影響。
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
  /** 屏蔽商家列表（店鋪代碼，即使滿足條件也不扶持）—— 全局共享，不受區域限制 */
  blockedMerchants?: string[]
  /** 區域配置（PLT_03 商家扶持用 RegionSupportConfig，PLT_04 訂單過熱調控用 RegionOverheatConfig） */
  regionConfigs?: Record<string, RegionSupportConfig | RegionOverheatConfig>
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
  { id: 'COM_01', dimension: ScoreDimension.COMMERCIAL, name: '滿額立減', description: '商家參與滿額立減：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（立減金額 ÷ 計價基數）', mode: ScoreMode.TIERED_MULTIPLIER, score: 0, status: ENABLED, builtin: true, thresholdScore: 10, multiplierTiers: [
    { multiplier: 1, score: 30 },
    { multiplier: 2, score: 20 },
    { multiplier: 3, score: 10 },
  ] },
  { id: 'COM_02', dimension: ScoreDimension.COMMERCIAL, name: '減免運費', description: '商家減免配送運費加分', mode: ScoreMode.RULE_BONUS, score: 20, status: ENABLED, builtin: true, prerequisites: '報名減免運費' },
  { id: 'COM_03', dimension: ScoreDimension.COMMERCIAL, name: '進店領券', description: '商家設置進店領券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_04', dimension: ScoreDimension.COMMERCIAL, name: '新客立減', description: '商家參與新客立減：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.RULE_BONUS, score: 30, status: ENABLED, builtin: true },
  { id: 'COM_05', dimension: ScoreDimension.COMMERCIAL, name: '收藏送券', description: '商家設置收藏送券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_06', dimension: ScoreDimension.COMMERCIAL, name: '會員紅包', description: '商家設置會員紅包：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_07', dimension: ScoreDimension.COMMERCIAL, name: '閃蜂官方神券', description: '商家設置閃蜂官方神券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）', mode: ScoreMode.AMOUNT_MULTIPLIER, score: 2, status: ENABLED, builtin: true },
  { id: 'COM_10', dimension: ScoreDimension.COMMERCIAL, name: '金字招牌(廣告)', description: '商家購買金字招牌標籤後，按已購買且在投放期內的標籤逐個累加計分', mode: ScoreMode.RULE_BONUS, score: 100, status: ENABLED, builtin: true },

  // ===== 店鋪維度（基礎信息 + 店鋪運營） =====
  { id: 'STB_01', dimension: ScoreDimension.STORE, name: '主營時段加分', description: '主營時段配置完整，當前處於主營時段內加分', mode: ScoreMode.RULE_BONUS, score: 60, status: ENABLED, builtin: true },
  { id: 'STB_02', dimension: ScoreDimension.STORE, name: '營業狀態', description: '營業中滿分；休息一會（2小時自動恢復）、爆單暫停（2小時自動恢復）降權；休息打烊由系統直接過濾，不加載到瀑布流也不計分', mode: ScoreMode.CONDITIONAL, score: 0, status: ENABLED, builtin: true, conditionItems: [
      { condition: 'bonus', score: 100 },
      { condition: 'deduction', score: 20 },
      { condition: 'deduction', score: 50 },
      // 休息打烊为系统过滤档：condition 固定 filtered、分值 0，与后端迁移写回的口径一致
      { condition: 'filtered', score: 0 },
    ] },
  { id: 'STB_03', dimension: ScoreDimension.STORE, name: '評價得分', description: '統計天數內顧客評價星級計分，支持固定加扣分或動態倍率', mode: ScoreMode.CONDITIONAL, score: 0, statDays: 30, status: ENABLED, builtin: true, conditionItems: [
    { condition: 'fixed_bonus', score: 50 },
    { condition: 'fixed_bonus', score: 20 },
    { condition: 'fixed_bonus', score: 0 },
    { condition: 'fixed_deduction', score: 20 },
    { condition: 'fixed_deduction', score: 50 },
  ] },
  { id: 'PLT_03', dimension: ScoreDimension.PLATFORM, name: '商家扶持', description: '按區域配置商家扶持：每個區域獨立設置前提條件、統計天數與梯度加分，屏蔽商家全局統一', mode: ScoreMode.TIERED, score: 0, status: ENABLED, builtin: true, blockedMerchants: [], regionConfigs: {
    MACAU: { prerequisites: 'UNCONDITIONAL', statDays: 30, tiers: [
      { threshold: 50, direction: TierDirection.LESS_THAN, score: 20 },
    ] },
    TAIPA: { prerequisites: 'UNCONDITIONAL', statDays: 30, tiers: [
      { threshold: 50, direction: TierDirection.LESS_THAN, score: 20 },
    ] },
  } },
  { id: 'PLT_04', dimension: ScoreDimension.PLATFORM, name: '訂單過熱調控', description: '按區域配置訂單過熱調控：每個區域獨立設置校驗間隔與梯度降權，平衡流量分配給其他商家機會', mode: ScoreMode.TIERED, score: 0, calcCycle: CalcCycle.SCHEDULED, calcIntervalHours: 1, status: ENABLED, builtin: true, regionConfigs: {
    MACAU: { calcIntervalHours: 1, tiers: [
      { threshold: 200, direction: TierDirection.MORE_THAN, score: -10 },
      { threshold: 500, direction: TierDirection.MORE_THAN, score: -30 },
      { threshold: 1000, direction: TierDirection.MORE_THAN, score: -60 },
    ] },
    TAIPA: { calcIntervalHours: 1, tiers: [
      { threshold: 200, direction: TierDirection.MORE_THAN, score: -10 },
      { threshold: 500, direction: TierDirection.MORE_THAN, score: -30 },
      { threshold: 1000, direction: TierDirection.MORE_THAN, score: -60 },
    ] },
  } },
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
