/**
 * 流量沙盤 Mock 數據層
 *
 * 設計要點：
 * - 確定性隨機：以 storeCode / algoCode / 日期等查詢條件做種子（mulberry32，
 *   與 src/api/store.ts 的 generateStoreDataConfig 同一思路），保證同一查詢條件
 *   多次進入結果完全一致，便於評審與後續同真實接口對比。
 * - 文案本地化：規則名稱、命中說明等 UI 文案通過傳入的 TFunction 解析
 *   （沿用 src/pages/SearchVerify 的既有做法）；門店名、算法名等屬於業務數據，
 *   直接以字面量作為數據池。
 */
import type { TFunction } from 'i18next'
import {
  AlgorithmType,
  BidMode,
  RankingStage,
  RecallDimension,
  Region,
  ServiceStatus,
  TimeSlot,
} from '../../pages/Recommend/constants'

// ============================================================
// 種子隨機
// ============================================================

/** 將任意字符串轉為 32 位整數種子 */
function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h >>> 0
}

/** mulberry32 確定性隨機數生成器 */
function createRng(seedInput: string) {
  let seed = hashSeed(seedInput)
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next: rnd,
    /** [min, max] 閉區間整數 */
    int: (min: number, max: number) => Math.round(min + rnd() * (max - min)),
    /** 從數組中取一項 */
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length) % arr.length],
    /** 以概率命中 */
    hit: (probability: number) => rnd() < probability,
  }
}

// ============================================================
// 業務數據池
// ============================================================

/** 門店數據池（門店編碼 / 名稱 / 所屬集團） */
const STORE_POOL = [
  { code: 'MD00001', name: '澳門正宗漢堡王', group: '漢堡王集團' },
  { code: 'MD00002', name: '葡撻皇旗艦店', group: '葡撻皇餐飲' },
  { code: 'MD00003', name: '水蟹粥大王', group: '澳門老字號' },
  { code: 'MD00004', name: '麻辣火鍋王', group: '蜀味餐飲集團' },
  { code: 'MD00005', name: '珍珠奶茶專門店', group: '茶飲聯盟' },
  { code: 'MD00006', name: '壽司之神', group: '和風料理集團' },
  { code: 'MD00007', name: '咖喱魚蛋檔', group: '街頭小食' },
  { code: 'MD00008', name: '雲吞麵世家', group: '澳門老字號' },
  { code: 'MD00009', name: '燒臘專門店', group: '粵式燒臘' },
  { code: 'MD00010', name: '楊枝甘露工坊', group: '甜品聯盟' },
  { code: 'MD00011', name: '雞蛋仔小站', group: '街頭小食' },
  { code: 'MD00012', name: '煲仔飯老店', group: '粵式燒臘' },
  { code: 'MD00013', name: '酸辣粉之家', group: '蜀味餐飲集團' },
  { code: 'MD00014', name: '粥品專家', group: '澳門老字號' },
  { code: 'MD00015', name: '必勝客外賣', group: '國際連鎖' },
  { code: 'MD00016', name: '芝士漢堡工坊', group: '漢堡王集團' },
  { code: 'MD00017', name: '豬扒包茶餐廳', group: '茶餐廳聯盟' },
  { code: 'MD00018', name: '竹昇麵家', group: '澳門老字號' },
  { code: 'MD00019', name: '木糠布甸屋', group: '甜品聯盟' },
  { code: 'MD00020', name: '非洲雞餐廳', group: '葡式餐飲' },
  { code: 'MD00021', name: '馬介休專門店', group: '葡式餐飲' },
  { code: 'MD00022', name: '大三巴手信店', group: '手信集團' },
  { code: 'MD00023', name: '牛雜小館', group: '街頭小食' },
  { code: 'MD00024', name: '避風塘炒蟹', group: '海鮮酒家' },
  { code: 'MD00025', name: '沙嗲牛肉麵', group: '茶餐廳聯盟' },
  { code: 'MD00026', name: '生滾粥品店', group: '澳門老字號' },
  { code: 'MD00027', name: '手打魚蛋粉', group: '街頭小食' },
  { code: 'MD00028', name: '葡國餐廳', group: '葡式餐飲' },
  { code: 'MD00029', name: '蛋撻專門店', group: '葡撻皇餐飲' },
  { code: 'MD00030', name: '海鮮火鍋城', group: '海鮮酒家' },
  { code: 'MD00031', name: '日式拉麵館', group: '和風料理集團' },
  { code: 'MD00032', name: '韓式炸雞店', group: '國際連鎖' },
  { code: 'MD00033', name: '泰式船麵屋', group: '南洋風味' },
  { code: 'MD00034', name: '越南河粉店', group: '南洋風味' },
  { code: 'MD00035', name: '重慶小面館', group: '蜀味餐飲集團' },
  { code: 'MD00036', name: '港式茶點軒', group: '茶餐廳聯盟' },
  { code: 'MD00037', name: '鮮榨果汁吧', group: '茶飲聯盟' },
  { code: 'MD00038', name: '手工雪糕店', group: '甜品聯盟' },
  { code: 'MD00039', name: '砂鍋粥夜市', group: '海鮮酒家' },
  { code: 'MD00040', name: '燒鳥居酒屋', group: '和風料理集團' },
] as const

export type StorePoolItem = typeof STORE_POOL[number]

/** 對外導出門店數據池（供遠程搜索下拉使用） */
export const SANDBOX_STORE_POOL: readonly StorePoolItem[] = STORE_POOL

/** 算法類型 → 編碼前綴（與 backend/sql/33_biz_seq_rule.sql 的編號規則一致） */
const ALGO_TYPE_PREFIX: Partial<Record<AlgorithmType, string>> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'SFWD',
  [AlgorithmType.NEW_STORE_AD]: 'SFXD',
  [AlgorithmType.HOT_REVIVE_AD]: 'SFPH',
  [AlgorithmType.TRAFFIC_AD]: 'SFLL',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'SFRQ',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'SFZR',
  [AlgorithmType.BRAND_MERCHANT]: 'SFPP',
  [AlgorithmType.GOLDEN_SIGNBOARD]: 'SFJZ',
}

/** 沙盤可用的算法數據池 */
export interface SandboxAlgorithm {
  algoCode: string
  algoName: string
  algoType: AlgorithmType
  /** 服務狀態：ENABLED 視為已上線，DISABLED 視為未上線（詳見方案待確認事項 2） */
  status: ServiceStatus
  slotCount: number
  recallDimension: RecallDimension
  rankingStage: RankingStage
  bidMode: BidMode
}

const ALGO_POOL: SandboxAlgorithm[] = [
  { algoCode: 'SFWD20260818001', algoName: '無敵星星-澳門全區', algoType: AlgorithmType.INVINCIBLE_STAR, status: ServiceStatus.ENABLED, slotCount: 3, recallDimension: RecallDimension.COMMERCIAL, rankingStage: RankingStage.RERANK, bidMode: BidMode.CPM },
  { algoCode: 'SFXD20260818002', algoName: '新店廣告-新開商戶扶持', algoType: AlgorithmType.NEW_STORE_AD, status: ServiceStatus.ENABLED, slotCount: 2, recallDimension: RecallDimension.MERCHANT, rankingStage: RankingStage.FINE, bidMode: BidMode.CPC },
  { algoCode: 'SFPH20260818003', algoName: '盤活復甦-沉睡商戶喚醒', algoType: AlgorithmType.HOT_REVIVE_AD, status: ServiceStatus.ENABLED, slotCount: 2, recallDimension: RecallDimension.MERCHANT, rankingStage: RankingStage.COARSE, bidMode: BidMode.OCPC },
  { algoCode: 'SFRQ20260818004', algoName: '人氣商家-高評分優先', algoType: AlgorithmType.POPULAR_MERCHANT_KA, status: ServiceStatus.ENABLED, slotCount: 4, recallDimension: RecallDimension.USER, rankingStage: RankingStage.FINE, bidMode: BidMode.CPC },
  { algoCode: 'SFJZ20260818005', algoName: '金字招牌-全澳對比', algoType: AlgorithmType.GOLDEN_SIGNBOARD, status: ServiceStatus.ENABLED, slotCount: 3, recallDimension: RecallDimension.COMMERCIAL, rankingStage: RankingStage.RERANK, bidMode: BidMode.CPM },
  { algoCode: 'SFPP20260818006', algoName: '品牌商家-KA專屬位', algoType: AlgorithmType.BRAND_MERCHANT, status: ServiceStatus.ENABLED, slotCount: 2, recallDimension: RecallDimension.MERCHANT, rankingStage: RankingStage.RERANK, bidMode: BidMode.CPM },
  { algoCode: 'SFZR20260818007', algoName: '自然流量-綜合計分排序', algoType: AlgorithmType.ORGANIC_TRAFFIC, status: ServiceStatus.ENABLED, slotCount: 20, recallDimension: RecallDimension.PLATFORM, rankingStage: RankingStage.FINE, bidMode: BidMode.CPC },
  { algoCode: 'SFLL20260818008', algoName: '流量廣告-泛曝光', algoType: AlgorithmType.TRAFFIC_AD, status: ServiceStatus.ENABLED, slotCount: 3, recallDimension: RecallDimension.PLATFORM, rankingStage: RankingStage.COARSE, bidMode: BidMode.CPM },
  // ── 以下為未上線算法：僅在沙盤推演模式下可選 ──
  { algoCode: 'SFWD20260901009', algoName: '無敵星星-氹仔加權試驗', algoType: AlgorithmType.INVINCIBLE_STAR, status: ServiceStatus.DISABLED, slotCount: 4, recallDimension: RecallDimension.USER, rankingStage: RankingStage.RERANK, bidMode: BidMode.OCPC },
  { algoCode: 'SFRQ20260901010', algoName: '人氣商家-出餐速度優先', algoType: AlgorithmType.POPULAR_MERCHANT_KA, status: ServiceStatus.DISABLED, slotCount: 3, recallDimension: RecallDimension.ITEM, rankingStage: RankingStage.FINE, bidMode: BidMode.CPC },
  { algoCode: 'SFJZ20260901011', algoName: '金字招牌-商圈對比新策略', algoType: AlgorithmType.GOLDEN_SIGNBOARD, status: ServiceStatus.DISABLED, slotCount: 5, recallDimension: RecallDimension.COMMERCIAL, rankingStage: RankingStage.RERANK, bidMode: BidMode.CPM },
  { algoCode: 'SFPH20260901012', algoName: '盤活復甦-珠海專項', algoType: AlgorithmType.HOT_REVIVE_AD, status: ServiceStatus.DISABLED, slotCount: 2, recallDimension: RecallDimension.MERCHANT, rankingStage: RankingStage.COARSE, bidMode: BidMode.CPC },
]

/** 對外導出算法池 */
export const SANDBOX_ALGO_POOL: readonly SandboxAlgorithm[] = ALGO_POOL

/** 依編碼取算法 */
export function findSandboxAlgorithm(algoCode: string): SandboxAlgorithm | undefined {
  return ALGO_POOL.find(a => a.algoCode === algoCode)
}

/** 算法類型對應的編碼前綴（供頁面展示算法歸類） */
export function getAlgoPrefix(algoType: AlgorithmType): string {
  return ALGO_TYPE_PREFIX[algoType] ?? 'SF'
}

// ============================================================
// 3.1 瀑布流推演
// ============================================================

/** 坑位類型 */
export enum SlotKind {
  /** 廣告佔位 */
  AD = 1,
  /** 自然流量填充 */
  ORGANIC = 2,
}

/** 展示位競爭候選 */
export interface SlotCandidate {
  storeCode: string
  storeName: string
  /** 出價（廣告位）或得分（自然流量位） */
  bidOrScore: number
  win: boolean
  /** 落選原因 i18n key（勝出者為空） */
  loseReasonKey?: string
}

/** 展示位推演結果 */
export interface WaterfallSlotResult {
  key: string
  position: number
  kind: SlotKind
  algoCode: string
  algoName: string
  algoType: AlgorithmType
  storeCode: string
  storeName: string
  /** 廣告位的來源訂單號；自然流量位為空 */
  orderNo?: string
  /** 自然流量位的商家總分；廣告位為空 */
  totalScore?: number
  candidates: SlotCandidate[]
}

/** 瀑布流策略摘要 */
export interface WaterfallStrategySummary {
  strategyCode: string
  strategyName: string
  brand: string
  naturalAlgoCode: string
  naturalAlgoName: string
  /** 過濾用戶不喜歡：1=開啟 2=關閉 */
  filterDislike: number
  status: ServiceStatus
}

/** 坑位配置（沙盤模式下可臨時調整） */
export interface SlotConfig {
  position: number
  algoCode: string
  enabled: boolean
}

export interface WaterfallSimulationParams {
  brand: string
  channel: number
  placement: number
  region: Region
  date: string
  timeSlot: TimeSlot
  userId?: string
  /** 沙盤模式：允許命中未上線策略 */
  sandbox: boolean
  /** 沙盤模式下的臨時坑位覆蓋配置 */
  slotOverrides?: SlotConfig[]
}

export interface WaterfallSimulationResult {
  strategy: WaterfallStrategySummary | null
  slots: WaterfallSlotResult[]
  /** 該策略的原始坑位配置（沙盤調整的基線） */
  baseSlotConfigs: SlotConfig[]
  stats: {
    totalSlots: number
    adSlots: number
    organicSlots: number
    merchantCount: number
  }
}

/** 生成瀑布流推演結果 */
export function generateWaterfallSimulation(
  params: WaterfallSimulationParams,
  t: TFunction,
): WaterfallSimulationResult {
  const { brand, channel, placement, region, date, timeSlot, sandbox, slotOverrides } = params
  const seedKey = `wf|${brand}|${channel}|${placement}|${region}|${date}|${timeSlot}`
  const rng = createRng(seedKey)

  // 非沙盤模式下，部分維度組合模擬「無啟用策略」以驗證空態
  const strategyEnabled = rng.hit(0.85)
  if (!sandbox && !strategyEnabled) {
    return {
      strategy: null,
      slots: [],
      baseSlotConfigs: [],
      stats: { totalSlots: 0, adSlots: 0, organicSlots: 0, merchantCount: 0 },
    }
  }

  const naturalAlgo = ALGO_POOL.find(a => a.algoType === AlgorithmType.ORGANIC_TRAFFIC)!
  const strategy: WaterfallStrategySummary = {
    strategyCode: `PB${date.replace(/-/g, '')}${String(rng.int(1, 999)).padStart(3, '0')}`,
    strategyName: t('waterfallSimulation.strategyNameTpl', {
      region: t(`recommend.region${regionKeySuffix(region)}`),
      channel: t(`recommend.channel${channelKeySuffix(channel)}`),
    }),
    brand,
    naturalAlgoCode: naturalAlgo.algoCode,
    naturalAlgoName: naturalAlgo.algoName,
    filterDislike: rng.hit(0.6) ? 1 : 2,
    status: strategyEnabled ? ServiceStatus.ENABLED : ServiceStatus.DISABLED,
  }

  // 生成基線坑位配置：20~30 個展示位，廣告位穿插在前段
  const totalSlots = rng.int(20, 30)
  const adAlgos = ALGO_POOL.filter(
    a => a.algoType !== AlgorithmType.ORGANIC_TRAFFIC
      && (sandbox || a.status === ServiceStatus.ENABLED),
  )
  const baseSlotConfigs: SlotConfig[] = []
  for (let pos = 1; pos <= totalSlots; pos++) {
    // 前 12 位廣告密度高，越往後自然流量佔比越大
    const adProbability = pos <= 4 ? 0.8 : pos <= 12 ? 0.45 : 0.12
    const isAd = rng.hit(adProbability)
    baseSlotConfigs.push({
      position: pos,
      algoCode: isAd ? rng.pick(adAlgos).algoCode : naturalAlgo.algoCode,
      enabled: true,
    })
  }

  // 沙盤覆蓋：以 position 為鍵合併
  const effectiveConfigs = baseSlotConfigs.map(base => {
    const override = slotOverrides?.find(o => o.position === base.position)
    return override ?? base
  })

  const usedStores = new Set<string>()
  const slots: WaterfallSlotResult[] = []

  effectiveConfigs.filter(c => c.enabled).forEach(cfg => {
    const algo = findSandboxAlgorithm(cfg.algoCode) ?? naturalAlgo
    const isOrganic = algo.algoType === AlgorithmType.ORGANIC_TRAFFIC
    const slotRng = createRng(`${seedKey}|slot${cfg.position}|${cfg.algoCode}`)

    // 為該坑位挑選 3 個候選商家，取勝出者作為實際展示商家
    const candidatePool: StorePoolItem[] = []
    let guard = 0
    while (candidatePool.length < 3 && guard < 60) {
      const s = slotRng.pick(STORE_POOL)
      if (!candidatePool.includes(s) && !usedStores.has(s.code)) candidatePool.push(s)
      guard++
    }
    if (candidatePool.length === 0) return

    const loseReasonKeys = isOrganic
      ? ['waterfallSimulation.loseLowerScore', 'waterfallSimulation.loseDistanceDecay']
      : ['waterfallSimulation.loseLowerBid', 'waterfallSimulation.loseInventorySoldOut', 'waterfallSimulation.loseDuplicateStore']

    const candidates: SlotCandidate[] = candidatePool
      .map((s, idx) => ({
        storeCode: s.code,
        storeName: s.name,
        bidOrScore: isOrganic
          ? slotRng.int(400, 980) - idx * slotRng.int(10, 60)
          : slotRng.int(50, 500) - idx * slotRng.int(5, 40),
        win: false,
        loseReasonKey: undefined as string | undefined,
      }))
      .sort((a, b) => b.bidOrScore - a.bidOrScore)

    candidates.forEach((c, idx) => {
      c.win = idx === 0
      if (idx > 0) c.loseReasonKey = loseReasonKeys[(idx - 1) % loseReasonKeys.length]
    })

    const winner = candidates[0]
    usedStores.add(winner.storeCode)

    slots.push({
      key: `slot-${cfg.position}`,
      position: cfg.position,
      kind: isOrganic ? SlotKind.ORGANIC : SlotKind.AD,
      algoCode: algo.algoCode,
      algoName: algo.algoName,
      algoType: algo.algoType,
      storeCode: winner.storeCode,
      storeName: winner.storeName,
      orderNo: isOrganic
        ? undefined
        : `GD${date.replace(/-/g, '')}${String(slotRng.int(1, 9999)).padStart(4, '0')}`,
      totalScore: isOrganic ? winner.bidOrScore : undefined,
      candidates,
    })
  })

  const adSlots = slots.filter(s => s.kind === SlotKind.AD).length
  return {
    strategy,
    slots,
    baseSlotConfigs,
    stats: {
      totalSlots: slots.length,
      adSlots,
      organicSlots: slots.length - adSlots,
      merchantCount: usedStores.size,
    },
  }
}

/** Region 枚舉 → i18n key 後綴 */
function regionKeySuffix(region: Region): string {
  const map: Record<Region, string> = {
    [Region.KOKSAA]: 'Koksaa',
    [Region.COSTA]: 'Costa',
    [Region.SANMA]: 'Sanma',
    [Region.SANWONG]: 'Sanwong',
    [Region.HKM]: 'Hkm',
    [Region.FAHUA]: 'Fahua',
    [Region.AIRPORT]: 'Airport',
    [Region.LHOTEL]: 'LHotel',
    [Region.RHOTEL]: 'RHotel',
    [Region.UM]: 'Um',
    [Region.HACS]: 'Hacs',
    [Region.GONGBEI]: 'Gongbei',
    [Region.HENGQIN]: 'Hengqin',
  }
  return map[region]
}

/** 業務頻道 → i18n key 後綴 */
function channelKeySuffix(channel: number): string {
  const map: Record<number, string> = {
    1: 'Home',
    2: 'Delivery',
    3: 'Supermarket',
    4: 'GroupBuy',
  }
  return map[channel] ?? 'Home'
}

// ============================================================
// 3.2 算法推演
// ============================================================

/** 命中來源 */
export enum HitSource {
  /** 購買廣告訂單命中 */
  ORDER = 1,
  /** 資格條件達標命中 */
  QUALIFIED = 2,
}

export interface AlgorithmHitMerchant {
  key: string
  rank: number
  storeCode: string
  storeName: string
  groupName: string
  region: Region
  hitSource: HitSource
  orderNo?: string
  /** 出價或成交價格（元） */
  bidPrice: number
  score: number
  /** 排序依據說明 i18n key */
  rankBasisKey: string
}

export interface AlgorithmMissMerchant {
  key: string
  storeCode: string
  storeName: string
  /** 未命中原因 i18n key */
  missReasonKey: string
}

/** 沙盤參數試算的可調參數 */
export interface AlgorithmTrialParams {
  recallDimension: RecallDimension
  rankingStage: RankingStage
  bidMode: BidMode
  slotCount: number
}

export interface AlgorithmSimulationParams {
  algoCode: string
  region?: Region
  date: string
  timeSlot: TimeSlot
  sandbox: boolean
  /** 沙盤模式下的參數試算覆蓋 */
  trial?: AlgorithmTrialParams
}

export interface AlgorithmSimulationResult {
  algo: SandboxAlgorithm
  /** 生效參數（沙盤試算時為覆蓋後的值） */
  effective: AlgorithmTrialParams
  /** 被試算修改過的字段名集合 */
  adjustedFields: Array<keyof AlgorithmTrialParams>
  hits: AlgorithmHitMerchant[]
  misses: AlgorithmMissMerchant[]
  stats: {
    hitCount: number
    soldSlots: number
    remainingStock: number
    avgScore: number
  }
}

/** 生成算法推演結果 */
export function generateAlgorithmSimulation(
  params: AlgorithmSimulationParams,
): AlgorithmSimulationResult | null {
  const algo = findSandboxAlgorithm(params.algoCode)
  if (!algo) return null

  const baseParams: AlgorithmTrialParams = {
    recallDimension: algo.recallDimension,
    rankingStage: algo.rankingStage,
    bidMode: algo.bidMode,
    slotCount: algo.slotCount,
  }
  const effective = params.trial ?? baseParams
  const adjustedFields = params.trial
    ? (Object.keys(baseParams) as Array<keyof AlgorithmTrialParams>)
      .filter(k => baseParams[k] !== effective[k])
    : []

  // 生效參數參與種子，保證試算後結果隨之變化且可復現
  const seedKey = [
    'algo', params.algoCode, params.region ?? 'all', params.date, params.timeSlot,
    effective.recallDimension, effective.rankingStage, effective.bidMode, effective.slotCount,
  ].join('|')
  const rng = createRng(seedKey)

  const hitCount = rng.int(30, Math.min(80, STORE_POOL.length * 2))
  const rankBasisKeys = [
    'algorithmSimulation.basisBidDesc',
    'algorithmSimulation.basisScoreDesc',
    'algorithmSimulation.basisQualifiedThenBid',
    'algorithmSimulation.basisOrderTime',
  ]

  const hits: AlgorithmHitMerchant[] = []
  const usedCodes = new Set<string>()
  for (let i = 0; i < hitCount; i++) {
    // 門店池不足時以序號後綴派生虛擬門店，保證命中量可達 30~80
    const base = STORE_POOL[i % STORE_POOL.length]
    const round = Math.floor(i / STORE_POOL.length)
    const storeCode = round === 0 ? base.code : `${base.code}-${round + 1}`
    if (usedCodes.has(storeCode)) continue
    usedCodes.add(storeCode)

    const itemRng = createRng(`${seedKey}|hit|${storeCode}`)
    const fromOrder = itemRng.hit(0.65)
    hits.push({
      key: storeCode,
      rank: 0,
      storeCode,
      storeName: round === 0 ? base.name : `${base.name}（${round + 1}店）`,
      groupName: base.group,
      region: itemRng.pick(Object.values(Region).filter(v => typeof v === 'number') as Region[]),
      hitSource: fromOrder ? HitSource.ORDER : HitSource.QUALIFIED,
      orderNo: fromOrder
        ? `GD${params.date.replace(/-/g, '')}${String(itemRng.int(1, 9999)).padStart(4, '0')}`
        : undefined,
      bidPrice: itemRng.int(50, 800),
      score: itemRng.int(300, 990),
      rankBasisKey: rankBasisKeys[itemRng.int(0, rankBasisKeys.length - 1)],
    })
  }

  // 出價模式決定排序主鍵：CPM 看出價，其餘看綜合得分
  hits.sort((a, b) => effective.bidMode === BidMode.CPM
    ? b.bidPrice - a.bidPrice
    : b.score - a.score)
  hits.forEach((h, idx) => { h.rank = idx + 1 })

  const missReasonKeys = [
    'algorithmSimulation.missNotPurchased',
    'algorithmSimulation.missQualificationFailed',
    'algorithmSimulation.missStoreDisabled',
    'algorithmSimulation.missRegionMismatch',
  ]
  const misses: AlgorithmMissMerchant[] = STORE_POOL
    .filter(s => !usedCodes.has(s.code))
    .slice(0, 8)
    .map((s, idx) => ({
      key: s.code,
      storeCode: s.code,
      storeName: s.name,
      missReasonKey: missReasonKeys[idx % missReasonKeys.length],
    }))

  const soldSlots = Math.min(effective.slotCount, rng.int(1, effective.slotCount))
  return {
    algo,
    effective,
    adjustedFields,
    hits,
    misses,
    stats: {
      hitCount: hits.length,
      soldSlots,
      remainingStock: effective.slotCount - soldSlots,
      avgScore: hits.length
        ? Math.round(hits.reduce((sum, h) => sum + h.score, 0) / hits.length)
        : 0,
    },
  }
}

// ============================================================
// 3.3 商家評分透視
// ============================================================

/** 計分維度（對應 biz_organic_score_dimension.dimension） */
export enum ScoreDimension {
  COMMERCIAL = 1,
  STORE = 2,
  PLATFORM = 4,
}

/** 計分方式（對應 biz_organic_score_rule.mode） */
export enum ScoreMode {
  RULE_ADD = 1,
  DECAY = 2,
  RULE_DEDUCT = 3,
  AMOUNT_RATIO = 4,
  TIER = 5,
  CONDITION = 6,
}

export interface ScoreRuleDetail {
  key: string
  ruleCode: string
  /** 規則名稱 i18n key */
  nameKey: string
  mode: ScoreMode
  statDays: number
  /** 基準分值（減分項為負） */
  baseScore: number
  /** 實際得分 */
  actualScore: number
  hit: boolean
  /** 計算說明 i18n key */
  calcKey: string
  /** 計算說明插值參數 */
  calcParams: Record<string, string | number>
}

export interface ScoreDimensionDetail {
  dimension: ScoreDimension
  weight: number
  /** 維度原始分 */
  rawScore: number
  /** 加權分 = 原始分 × 權重 / 100 */
  weightedScore: number
  rules: ScoreRuleDetail[]
}

export interface ScoreInsightResult {
  storeCode: string
  storeName: string
  groupName: string
  totalScore: number
  dimensions: ScoreDimensionDetail[]
}

/** 規則配置表：規則編碼 / 名稱 key / 計分方式 / 統計天數 / 基準分 */
const SCORE_RULE_CONFIG: Array<{
  dimension: ScoreDimension
  ruleCode: string
  nameKey: string
  mode: ScoreMode
  statDays: number
  baseScore: number
}> = [
  // 商業維度
  { dimension: ScoreDimension.COMMERCIAL, ruleCode: 'COM_01', nameKey: 'scoreInsight.ruleFullDiscount', mode: ScoreMode.TIER, statDays: 30, baseScore: 20 },
  { dimension: ScoreDimension.COMMERCIAL, ruleCode: 'COM_02', nameKey: 'scoreInsight.ruleFreeShipping', mode: ScoreMode.RULE_ADD, statDays: 30, baseScore: 15 },
  { dimension: ScoreDimension.COMMERCIAL, ruleCode: 'COM_03', nameKey: 'scoreInsight.ruleNewCustomer', mode: ScoreMode.RULE_ADD, statDays: 30, baseScore: 12 },
  { dimension: ScoreDimension.COMMERCIAL, ruleCode: 'COM_04', nameKey: 'scoreInsight.ruleFavoriteCoupon', mode: ScoreMode.CONDITION, statDays: 30, baseScore: 10 },
  { dimension: ScoreDimension.COMMERCIAL, ruleCode: 'COM_05', nameKey: 'scoreInsight.ruleMemberRedPacket', mode: ScoreMode.RULE_ADD, statDays: 30, baseScore: 8 },
  { dimension: ScoreDimension.COMMERCIAL, ruleCode: 'COM_06', nameKey: 'scoreInsight.rulePurchaseAd', mode: ScoreMode.AMOUNT_RATIO, statDays: 30, baseScore: 25 },
  // 店鋪維度
  { dimension: ScoreDimension.STORE, ruleCode: 'STB_01', nameKey: 'scoreInsight.ruleMainTimeSlot', mode: ScoreMode.CONDITION, statDays: 7, baseScore: 15 },
  { dimension: ScoreDimension.STORE, ruleCode: 'STB_02', nameKey: 'scoreInsight.ruleStoreTag', mode: ScoreMode.RULE_ADD, statDays: 30, baseScore: 10 },
  { dimension: ScoreDimension.STORE, ruleCode: 'STB_03', nameKey: 'scoreInsight.ruleBusinessStatus', mode: ScoreMode.RULE_ADD, statDays: 7, baseScore: 12 },
  { dimension: ScoreDimension.STORE, ruleCode: 'STB_04', nameKey: 'scoreInsight.ruleRatingScore', mode: ScoreMode.TIER, statDays: 30, baseScore: 25 },
  { dimension: ScoreDimension.STORE, ruleCode: 'STB_05', nameKey: 'scoreInsight.ruleServingSpeed', mode: ScoreMode.TIER, statDays: 14, baseScore: 18 },
  { dimension: ScoreDimension.STORE, ruleCode: 'STB_06', nameKey: 'scoreInsight.ruleRejectOrder', mode: ScoreMode.RULE_DEDUCT, statDays: 14, baseScore: -20 },
  // 平台維度
  { dimension: ScoreDimension.PLATFORM, ruleCode: 'PLT_01', nameKey: 'scoreInsight.ruleDistanceDecay', mode: ScoreMode.DECAY, statDays: 1, baseScore: 30 },
  { dimension: ScoreDimension.PLATFORM, ruleCode: 'PLT_02', nameKey: 'scoreInsight.ruleDeliveryRange', mode: ScoreMode.CONDITION, statDays: 1, baseScore: 15 },
  { dimension: ScoreDimension.PLATFORM, ruleCode: 'PLT_03', nameKey: 'scoreInsight.ruleMerchantSupport', mode: ScoreMode.RULE_ADD, statDays: 30, baseScore: 20 },
  { dimension: ScoreDimension.PLATFORM, ruleCode: 'PLT_04', nameKey: 'scoreInsight.ruleOrderOverheat', mode: ScoreMode.RULE_DEDUCT, statDays: 1, baseScore: -15 },
]

/** 維度默認權重（對應 biz_organic_score_dimension.weight） */
const DIMENSION_WEIGHT: Record<ScoreDimension, number> = {
  [ScoreDimension.COMMERCIAL]: 40,
  [ScoreDimension.STORE]: 35,
  [ScoreDimension.PLATFORM]: 25,
}

export interface ScoreInsightParams {
  storeCode: string
  brand: string
  channel: number
  date: string
  /** 試算：維度權重覆蓋 */
  weightOverrides?: Partial<Record<ScoreDimension, number>>
  /** 試算：屏蔽的規則編碼 */
  blockedRuleCodes?: string[]
}

/** 生成商家評分透視結果 */
export function generateScoreInsight(params: ScoreInsightParams): ScoreInsightResult | null {
  const store = STORE_POOL.find(s => s.code === params.storeCode)
  if (!store) return null

  const seedKey = `score|${params.storeCode}|${params.brand}|${params.channel}|${params.date}`
  const blocked = new Set(params.blockedRuleCodes ?? [])

  const dimensions: ScoreDimensionDetail[] = (
    [ScoreDimension.COMMERCIAL, ScoreDimension.STORE, ScoreDimension.PLATFORM]
  ).map(dim => {
    const rules: ScoreRuleDetail[] = SCORE_RULE_CONFIG
      .filter(cfg => cfg.dimension === dim)
      .map(cfg => {
        const ruleRng = createRng(`${seedKey}|${cfg.ruleCode}`)
        const isDeduct = cfg.baseScore < 0
        // 減分項命中率低（多數商家不觸發扣分），加分項命中率高
        const hit = blocked.has(cfg.ruleCode)
          ? false
          : isDeduct ? ruleRng.hit(0.25) : ruleRng.hit(0.75)

        let actualScore = 0
        const calcParams: Record<string, string | number> = {}
        // 命中與未命中分支均會賦值，故不設初值
        let calcKey: string

        if (hit) {
          switch (cfg.mode) {
            case ScoreMode.TIER: {
              const value = ruleRng.int(600, 2400)
              const tierLow = value < 1000 ? 500 : value < 2000 ? 1000 : 2000
              const tierHigh = tierLow === 500 ? 1000 : tierLow === 1000 ? 2000 : 3000
              const ratio = tierLow === 500 ? 0.5 : tierLow === 1000 ? 0.75 : 1
              actualScore = Math.round(cfg.baseScore * ratio)
              calcKey = 'scoreInsight.calcTier'
              calcParams.days = cfg.statDays
              calcParams.value = value.toLocaleString()
              calcParams.tierLow = tierLow.toLocaleString()
              calcParams.tierHigh = tierHigh.toLocaleString()
              calcParams.score = actualScore
              break
            }
            case ScoreMode.DECAY: {
              const distance = (ruleRng.int(3, 45) / 10).toFixed(1)
              const coefficient = (1 - Number(distance) / 6).toFixed(2)
              actualScore = Math.max(0, Math.round(cfg.baseScore * Number(coefficient)))
              calcKey = 'scoreInsight.calcDecay'
              calcParams.distance = distance
              calcParams.coefficient = coefficient
              calcParams.score = actualScore
              break
            }
            case ScoreMode.AMOUNT_RATIO: {
              const amount = ruleRng.int(500, 8000)
              const ratio = (amount / 1000).toFixed(1)
              actualScore = Math.min(cfg.baseScore, Math.round(amount / 400))
              calcKey = 'scoreInsight.calcAmountRatio'
              calcParams.days = cfg.statDays
              calcParams.amount = amount.toLocaleString()
              calcParams.ratio = ratio
              calcParams.score = actualScore
              break
            }
            case ScoreMode.CONDITION: {
              actualScore = cfg.baseScore
              calcKey = 'scoreInsight.calcCondition'
              calcParams.score = actualScore
              break
            }
            case ScoreMode.RULE_DEDUCT: {
              const count = ruleRng.int(1, 5)
              actualScore = Math.max(cfg.baseScore, -Math.abs(cfg.baseScore / 5) * count)
              actualScore = Math.round(actualScore)
              calcKey = 'scoreInsight.calcDeduct'
              calcParams.days = cfg.statDays
              calcParams.count = count
              calcParams.score = actualScore
              break
            }
            default: {
              actualScore = cfg.baseScore
              calcKey = 'scoreInsight.calcRuleAdd'
              calcParams.days = cfg.statDays
              calcParams.score = actualScore
            }
          }
        } else {
          calcKey = blocked.has(cfg.ruleCode)
            ? 'scoreInsight.calcBlocked'
            : isDeduct ? 'scoreInsight.calcNoDeduct' : 'scoreInsight.calcNotHit'
          calcParams.days = cfg.statDays
        }

        return {
          key: cfg.ruleCode,
          ruleCode: cfg.ruleCode,
          nameKey: cfg.nameKey,
          mode: cfg.mode,
          statDays: cfg.statDays,
          baseScore: cfg.baseScore,
          actualScore,
          hit,
          calcKey,
          calcParams,
        }
      })

    const rawScore = rules.reduce((sum, r) => sum + r.actualScore, 0)
    const weight = params.weightOverrides?.[dim] ?? DIMENSION_WEIGHT[dim]
    return {
      dimension: dim,
      weight,
      rawScore,
      weightedScore: Math.round(rawScore * weight / 100),
      rules,
    }
  })

  return {
    storeCode: store.code,
    storeName: store.name,
    groupName: store.group,
    totalScore: dimensions.reduce((sum, d) => sum + d.weightedScore, 0),
    dimensions,
  }
}

// ============================================================
// 3.4 商家推廣診斷
// ============================================================

/** 診斷結論 */
export enum DiagnoseVerdict {
  /** 正常展示 */
  NORMAL = 1,
  /** 已購買但未展示 */
  PURCHASED_NOT_SHOWN = 2,
  /** 未購買任何廣告 */
  NOT_PURCHASED = 3,
}

/** 訂單狀態（對應 biz_ad_order.status） */
export enum AdOrderStatus {
  PENDING = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  REFUNDED = 4,
  CANCELLED = 5,
}

/** 投放狀態（對應 order_item.delivery_status） */
export enum DeliveryStatus {
  PENDING = 1,
  DELIVERED = 2,
  REFUNDED = 3,
}

export interface PurchasedAd {
  key: string
  orderNo: string
  algoCode: string
  algoName: string
  bizDate: string
  timeSlot: TimeSlot
  region: Region
  orderStatus: AdOrderStatus
  deliveryStatus: DeliveryStatus
  actualAmount: number
}

export interface DisplayPosition {
  key: string
  channel: number
  placement: number
  region: Region
  strategyCode: string
  strategyName: string
  position: number
  algoCode: string
  algoName: string
  shown: boolean
}

export interface DiagnoseCheckItem {
  key: string
  /** 檢查項名稱 i18n key */
  labelKey: string
  passed: boolean
  /** 檢查結論說明 i18n key */
  detailKey: string
  detailParams?: Record<string, string | number>
  /** 未通過時的修復指引 i18n key */
  fixKey?: string
  /** 修復指引跳轉路徑 */
  fixPath?: string
}

export interface MerchantDiagnoseResult {
  storeCode: string
  storeName: string
  groupName: string
  verdict: DiagnoseVerdict
  /** 主要未展示原因 i18n key（verdict 為 PURCHASED_NOT_SHOWN 時有值） */
  primaryReasonKey?: string
  stats: {
    activeAdCount: number
    displayPositionCount: number
    exposedSlotCount: number
    organicTotalScore: number
  }
  purchasedAds: PurchasedAd[]
  displayPositions: DisplayPosition[]
  checks: DiagnoseCheckItem[]
}

export interface MerchantDiagnoseParams {
  storeCode: string
  date: string
}

/** 生成商家推廣診斷結果 */
export function generateMerchantDiagnose(
  params: MerchantDiagnoseParams,
): MerchantDiagnoseResult | null {
  const store = STORE_POOL.find(s => s.code === params.storeCode)
  if (!store) return null

  const seedKey = `diag|${params.storeCode}|${params.date}`
  const rng = createRng(seedKey)

  // 三種診斷結論按門店確定性分布：60% 正常、25% 已購未展示、15% 未購買
  const roll = rng.next()
  const verdict = roll < 0.6
    ? DiagnoseVerdict.NORMAL
    : roll < 0.85 ? DiagnoseVerdict.PURCHASED_NOT_SHOWN : DiagnoseVerdict.NOT_PURCHASED

  // 已購買廣告
  const purchasedAds: PurchasedAd[] = []
  if (verdict !== DiagnoseVerdict.NOT_PURCHASED) {
    const adCount = rng.int(1, 4)
    const enabledAlgos = ALGO_POOL.filter(
      a => a.algoType !== AlgorithmType.ORGANIC_TRAFFIC && a.status === ServiceStatus.ENABLED,
    )
    for (let i = 0; i < adCount; i++) {
      const adRng = createRng(`${seedKey}|ad${i}`)
      const algo = adRng.pick(enabledAlgos)
      const normal = verdict === DiagnoseVerdict.NORMAL
      purchasedAds.push({
        key: `ad-${i}`,
        orderNo: `GD${params.date.replace(/-/g, '')}${String(adRng.int(1, 9999)).padStart(4, '0')}`,
        algoCode: algo.algoCode,
        algoName: algo.algoName,
        bizDate: params.date,
        timeSlot: adRng.pick([TimeSlot.ALL_DAY, TimeSlot.LUNCH, TimeSlot.DINNER, TimeSlot.NIGHT_SNACK]),
        region: adRng.pick(Object.values(Region).filter(v => typeof v === 'number') as Region[]),
        orderStatus: normal
          ? AdOrderStatus.PROMOTING
          : adRng.pick([AdOrderStatus.PENDING, AdOrderStatus.PROMOTING]),
        deliveryStatus: normal ? DeliveryStatus.DELIVERED : DeliveryStatus.PENDING,
        actualAmount: adRng.int(200, 5000),
      })
    }
  }

  // 實際展示位置
  const displayPositions: DisplayPosition[] = []
  if (verdict === DiagnoseVerdict.NORMAL) {
    const posCount = rng.int(1, 3)
    for (let i = 0; i < posCount; i++) {
      const posRng = createRng(`${seedKey}|pos${i}`)
      const ad = purchasedAds[i % purchasedAds.length]
      displayPositions.push({
        key: `pos-${i}`,
        channel: posRng.int(1, 4),
        placement: posRng.int(1, 4),
        region: ad.region,
        strategyCode: `PB${params.date.replace(/-/g, '')}${String(posRng.int(1, 999)).padStart(3, '0')}`,
        strategyName: `${store.group}-${posRng.int(1, 9)}號策略`,
        position: posRng.int(1, 12),
        algoCode: ad.algoCode,
        algoName: ad.algoName,
        shown: true,
      })
    }
  }

  // 未展示原因診斷：正常時全部通過；已購未展示時令其中一項失敗作為根因
  const failIndex = verdict === DiagnoseVerdict.PURCHASED_NOT_SHOWN ? rng.int(0, 8) : -1
  const firstAlgoCode = purchasedAds[0]?.algoCode ?? '—'
  const checkDefs: Array<{
    labelKey: string
    passDetailKey: string
    failDetailKey: string
    fixKey?: string
    fixPath?: string
  }> = [
    { labelKey: 'merchantDiagnose.checkOrderStatus', passDetailKey: 'merchantDiagnose.checkOrderStatusPass', failDetailKey: 'merchantDiagnose.checkOrderStatusFail', fixKey: 'merchantDiagnose.fixOrderStatus' },
    { labelKey: 'merchantDiagnose.checkDateRange', passDetailKey: 'merchantDiagnose.checkDateRangePass', failDetailKey: 'merchantDiagnose.checkDateRangeFail', fixKey: 'merchantDiagnose.fixDateRange' },
    { labelKey: 'merchantDiagnose.checkTimeSlot', passDetailKey: 'merchantDiagnose.checkTimeSlotPass', failDetailKey: 'merchantDiagnose.checkTimeSlotFail', fixKey: 'merchantDiagnose.fixTimeSlot' },
    { labelKey: 'merchantDiagnose.checkAlgoEnabled', passDetailKey: 'merchantDiagnose.checkAlgoEnabledPass', failDetailKey: 'merchantDiagnose.checkAlgoEnabledFail', fixKey: 'merchantDiagnose.fixAlgoEnabled', fixPath: '/promotion-algorithm' },
    { labelKey: 'merchantDiagnose.checkAlgoInWaterfall', passDetailKey: 'merchantDiagnose.checkAlgoInWaterfallPass', failDetailKey: 'merchantDiagnose.checkAlgoInWaterfallFail', fixKey: 'merchantDiagnose.fixAlgoInWaterfall', fixPath: '/promotion-slot-config' },
    { labelKey: 'merchantDiagnose.checkStrategyEnabled', passDetailKey: 'merchantDiagnose.checkStrategyEnabledPass', failDetailKey: 'merchantDiagnose.checkStrategyEnabledFail', fixKey: 'merchantDiagnose.fixStrategyEnabled', fixPath: '/promotion-slot-config' },
    { labelKey: 'merchantDiagnose.checkRegionMatch', passDetailKey: 'merchantDiagnose.checkRegionMatchPass', failDetailKey: 'merchantDiagnose.checkRegionMatchFail', fixKey: 'merchantDiagnose.fixRegionMatch' },
    { labelKey: 'merchantDiagnose.checkStoreStatus', passDetailKey: 'merchantDiagnose.checkStoreStatusPass', failDetailKey: 'merchantDiagnose.checkStoreStatusFail', fixKey: 'merchantDiagnose.fixStoreStatus', fixPath: '/store-list' },
    { labelKey: 'merchantDiagnose.checkBrandChannel', passDetailKey: 'merchantDiagnose.checkBrandChannelPass', failDetailKey: 'merchantDiagnose.checkBrandChannelFail', fixKey: 'merchantDiagnose.fixBrandChannel', fixPath: '/store-list' },
  ]

  const checks: DiagnoseCheckItem[] = checkDefs.map((def, idx) => {
    // 未購買廣告時，廣告相關檢查項不適用，統一標記通過並以說明澄清
    const passed = verdict === DiagnoseVerdict.NOT_PURCHASED ? true : idx !== failIndex
    return {
      key: `check-${idx}`,
      labelKey: def.labelKey,
      passed,
      detailKey: passed ? def.passDetailKey : def.failDetailKey,
      detailParams: { algoCode: firstAlgoCode },
      fixKey: passed ? undefined : def.fixKey,
      fixPath: passed ? undefined : def.fixPath,
    }
  })

  const scoreResult = generateScoreInsight({
    storeCode: store.code,
    brand: 'flashBee',
    channel: 1,
    date: params.date,
  })

  return {
    storeCode: store.code,
    storeName: store.name,
    groupName: store.group,
    verdict,
    primaryReasonKey: failIndex >= 0 ? checkDefs[failIndex].failDetailKey : undefined,
    stats: {
      activeAdCount: purchasedAds.filter(a => a.orderStatus === AdOrderStatus.PROMOTING).length,
      displayPositionCount: displayPositions.length,
      exposedSlotCount: displayPositions.filter(p => p.shown).length,
      organicTotalScore: scoreResult?.totalScore ?? 0,
    },
    purchasedAds,
    displayPositions,
    checks,
  }
}
