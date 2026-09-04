import dayjs from 'dayjs'
import { AlgorithmType, Region, RecommendChannel, AppType } from '../Recommend/constants'
import { BIZ_CHANNEL, type BizChannelValue } from '../../constants/bizChannel'

/** 时段状态枚举 */
export enum TimeSlotStatus {
  AVAILABLE = 'available',     // 可购买
  UNAVAILABLE = 'unavailable', // 不可购买
  SOLD_OUT = 'soldOut',        // 已售罄
  SELECTED = 'selected',       // 已选中
  LOCKED = 'locked',           // 已锁定（加购到购物车）
}

/** 时段状态颜色映射 */
export const TIME_SLOT_COLORS: Record<TimeSlotStatus, string> = {
  [TimeSlotStatus.AVAILABLE]: '#52c41a',
  [TimeSlotStatus.UNAVAILABLE]: '#d9d9d9',
  [TimeSlotStatus.SOLD_OUT]: '#ff4d4f',
  [TimeSlotStatus.SELECTED]: '#1890ff',
  [TimeSlotStatus.LOCKED]: '#faad14',
}

/** 时段状态标签 */
export const TIME_SLOT_LABELS: Record<TimeSlotStatus, string> = {
  [TimeSlotStatus.AVAILABLE]: '可購買',
  [TimeSlotStatus.UNAVAILABLE]: '不可購買',
  [TimeSlotStatus.SOLD_OUT]: '已售罄',
  [TimeSlotStatus.SELECTED]: '已選中',
  [TimeSlotStatus.LOCKED]: '已鎖定',
}

/** 库存数据记录 */
export interface InventoryItem {
  id: number
  adId: string                      // 广告ID
  promotionName: string           // 广告名称
  app: AppType                    // 所属品牌
  channel: RecommendChannel       // 业务频道
  bizChannel?: string             // 業務頻道（food/supermarket/groupBuy）
  slotPosition: number            // 展示位置
  dailyPrice: number              // 单日单价 (MOP)
  availableStartDate: string      // 可购买日期起
  availableEndDate: string        // 可购买日期止
  totalSlots: number              // 总时段数
  soldSlots: number               // 已售时段数
  algorithmType: AlgorithmType    // 推荐类型
  region: Region                  // 所属商圈
}

/** 推荐类型配置（用于卡片展示） */
export interface RecommendTypeConfig {
  type: AlgorithmType
  name: string
  icon: string
  description: string
  enabled: boolean                // 是否已开放购买
}

/** 半小时时段定义 */
export interface TimeSlotDef {
  index: number                   // 0-47
  startLabel: string              // 如 "00:00"
  endLabel: string                // 如 "00:30"
  status: TimeSlotStatus
}

/** 生成48个半小时时段标签 */
export function generateTimeSlotDefs(slotStatuses: TimeSlotStatus[]): TimeSlotDef[] {
  const defs: TimeSlotDef[] = []
  for (let i = 0; i < 48; i++) {
    const hour = Math.floor(i / 2)
    const minute = (i % 2) * 30
    const nextI = i + 1
    const nextHour = Math.floor(nextI / 2) % 24
    const nextMinute = (nextI % 2) * 30
    defs.push({
      index: i,
      startLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      endLabel: `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`,
      status: slotStatuses[i] || TimeSlotStatus.UNAVAILABLE,
    })
  }
  return defs
}

/** 推荐类型卡片配置 */
export const RECOMMEND_TYPE_CONFIGS: RecommendTypeConfig[] = [
  {
    type: AlgorithmType.INVINCIBLE_STAR,
    name: '無敵星星',
    icon: '⭐',
    description: '超級曝光位，首頁頂部黃金坑位，強勢引流',
    enabled: true,
  },
  {
    type: AlgorithmType.HOT_REVIVE_AD,
    name: '盤活復蘇',
    icon: '🔥',
    description: '盤活熱門商家流量，提升店鋪曝光',
    enabled: true,
  },
  {
    type: AlgorithmType.NEW_STORE_AD,
    name: '新店廣告',
    icon: '🏪',
    description: '新店專屬推廣位，快速獲取首批顧客',
    enabled: true,
  },
  {
    type: AlgorithmType.POPULAR_MERCHANT_KA,
    name: '人氣商家',
    icon: '🏆',
    description: '人氣商家專屬推薦位，KA商家流量加持',
    enabled: true,
  },
  {
    type: AlgorithmType.TRAFFIC_AD,
    name: '投流廣告',
    icon: '📊',
    description: '精準匹配目標用戶，買得越多曝光越多',
    enabled: true,
  },
  {
    type: AlgorithmType.EXCLUSIVE_MERCHANT,
    name: '獨家商家',
    icon: '👑',
    description: '獨家商家專屬展示位，彰顯品牌實力',
    enabled: false,
  },
  {
    type: AlgorithmType.GOLDEN_SIGNBOARD,
    name: '金字招牌',
    icon: '🏅',
    description: '金字招牌商家，品質保證優先推薦',
    enabled: true,
  },
  {
    type: AlgorithmType.PRODUCT_PROMO,
    name: '商品促銷',
    icon: '🎯',
    description: '商品折扣秒殺活動，智能促銷匹配',
    enabled: false,
  },
]

/** 频道标签映射 */
export const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁-Feed',
  [RecommendChannel.DELIVERY]: '外賣頻道-Feed',
  [RecommendChannel.GROUP_BUY]: '團購頻道-Feed',
  [RecommendChannel.SUPERMARKET]: '超市頻道-Feed',
}

/** 展示頁面 → 業務頻道映射 */
const CHANNEL_TO_BIZ: Record<number, string> = {
  [RecommendChannel.DELIVERY]: 'food',
  [RecommendChannel.SUPERMARKET]: 'supermarket',
  [RecommendChannel.GROUP_BUY]: 'groupBuy',
}
const BIZ_CHANNEL_POOL = ['food', 'supermarket', 'groupBuy']

/** 可购买滚动窗口天数（非盘活复苏类型：今天起 12 天） */
const ROLLING_WINDOW_DAYS = 12
/** 盘活复苏类型滚动窗口天数（今天起 180 天） */
const REVIVE_WINDOW_DAYS = 180

/** 根据日期计算行号（0-based，相对今天的天数偏移，永不为负） */
export function getRowIndexByDate(date: string): number {
  const today = dayjs().startOf('day')
  const target = dayjs(date).startOf('day')
  const diff = target.diff(today, 'day')
  return diff < 0 ? 0 : diff
}

/** 生成伪随机数（可预期） */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/** 生成 Mock 库存数据 */
export function generateMockInventory(region: Region, algorithmType?: AlgorithmType, app?: AppType): InventoryItem[] {
  const channels = [
    RecommendChannel.HOME,
    RecommendChannel.DELIVERY,
    RecommendChannel.GROUP_BUY,
    RecommendChannel.SUPERMARKET,
  ]
  
  // 各类型的推广名称前缀
  const typePrefixes: Record<AlgorithmType, string> = {
    [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
    [AlgorithmType.NEW_STORE_AD]: '新店廣告',
    [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
    [AlgorithmType.TRAFFIC_AD]: '投流廣告',
    [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
    [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
    [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
    [AlgorithmType.POPULAR_MERCHANT_KA]: '人氣商家',
    [AlgorithmType.BRAND_MERCHANT]: '品牌商家(KA)',
    [AlgorithmType.GOLD_AD]: '點金廣告',
    [AlgorithmType.GOLDEN_SIGNBOARD]: '金字招牌',
    [AlgorithmType.PRODUCT_PROMO]: '商品促銷',
  }
  
  // 各类型的推广名称后缀
  const promotionSuffixes = [
    '·黃金展位', '·首頁推薦', '·外賣熱推', '·團購精選',
    '·超市優選', '·週末專場', '·節日特惠', '·品牌周推廣',
  ]

  const items: InventoryItem[] = []
  const baseId = region * 1000 + (algorithmType || 0) * 100
  const targetTypes = algorithmType ? [algorithmType] : Object.values(AlgorithmType).filter(v => typeof v === 'number') as AlgorithmType[]
  
  // 如果未指定品牌，生成两种品牌的数据
  const appsToGenerate = app ? [app] : [AppType.SHANFENG, AppType.MFOOD]

  let idCounter = 1
  for (const type of targetTypes) {
    const prefix = typePrefixes[type] || '廣告'
    
    for (const currentApp of appsToGenerate) {
      for (let i = 0; i < 4; i++) {
        const seed = baseId + idCounter * 37
        const channel = channels[Math.floor(pseudoRandom(seed + 1) * channels.length)]
        // 大首頁隨機分配業務頻道，其他頻道直接映射
        const bizChannel = channel === RecommendChannel.HOME
          ? BIZ_CHANNEL_POOL[Math.floor(pseudoRandom(seed + 20) * BIZ_CHANNEL_POOL.length)]
          : CHANNEL_TO_BIZ[channel]
        const slotPosition = 1 + Math.floor(pseudoRandom(seed + 2) * 5)
        const dailyPrice = 800 + Math.floor(pseudoRandom(seed + 3) * 2200)
        const totalSlots = 20 + Math.floor(pseudoRandom(seed + 4) * 30)
        const soldSlots = Math.floor(pseudoRandom(seed + 5) * totalSlots * 0.7)
        const startDay = 1 + Math.floor(pseudoRandom(seed + 6) * 10)
        const _endDay = startDay + 14 + Math.floor(pseudoRandom(seed + 7) * 16)

        items.push({
          id: baseId + idCounter,
          adId: `AD${String(baseId + idCounter).padStart(6, '0')}`,
          promotionName: `${prefix}${promotionSuffixes[idCounter % promotionSuffixes.length]}`,
          app: currentApp,
          channel,
          bizChannel,
          slotPosition,
          dailyPrice,
          availableStartDate: dayjs().format('YYYY-MM-DD'),
          availableEndDate: dayjs()
            .add(type === AlgorithmType.HOT_REVIVE_AD ? REVIVE_WINDOW_DAYS : ROLLING_WINDOW_DAYS, 'day')
            .format('YYYY-MM-DD'),
          totalSlots,
          soldSlots,
          algorithmType: type,
          region,
        })
        idCounter++
      }
    }
  }
  return items
}

/** 为指定日期生成48个时段状态（每天都有固定3个不可售、9个已售罄） */
export function generateTimeSlotStatuses(inventoryId: number, date: string): TimeSlotStatus[] {
  const dateSeed = date.split('-').reduce((acc, v) => acc + parseInt(v, 10), 0)
  const statuses: TimeSlotStatus[] = []

  // 首先填充所有时段为可售
  for (let i = 0; i < 48; i++) {
    statuses.push(TimeSlotStatus.AVAILABLE)
  }

  // 设置凌晨 0:00-6:00 为不可售（12个时段）
  for (let i = 0; i < 12; i++) {
    statuses[i] = TimeSlotStatus.UNAVAILABLE
  }

  // 收集06:00-00:00的可售时段索引（共36个）
  const availableSlots: number[] = []
  for (let i = 12; i < 48; i++) {
    availableSlots.push(i)
  }

  // 使用日期和库存ID作为种子生成确定性随机数
  const seed = inventoryId * 10000 + dateSeed
  
  // Fisher-Yates 洗牌算法
  const shuffled = [...availableSlots]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom(seed + i) * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // 固定分配：前3个为已售罄，接下来2个为不可售
  const soldOutIndices = shuffled.slice(0, 3)
  const unavailableIndices = shuffled.slice(3, 5)

  // 设置已售罄
  soldOutIndices.forEach(idx => {
    statuses[idx] = TimeSlotStatus.SOLD_OUT
  })

  // 设置不可售
  unavailableIndices.forEach(idx => {
    statuses[idx] = TimeSlotStatus.UNAVAILABLE
  })

  return statuses
}

/** 计算单个时段价格（单日单价 / 可购买时段数） */
export function calcSlotPrice(dailyPrice: number, totalAvailableSlots: number): number {
  if (totalAvailableSlots <= 0) return 0
  return Math.round(dailyPrice / totalAvailableSlots)
}

/** 获取无折扣时段配置（按行配置） */
export function getNoDiscountSlotsByRow(date: string): number[] {
  const rowIndex = getRowIndexByDate(date)

  // 按行配置无折扣时段（循环复用6种模式）
  const noDiscountConfig: Record<number, number[]> = {
    0: [28, 29, 30, 31, 32, 33], // 下午茶无折扣
    1: [42, 43, 44, 45, 46, 47, 0, 1, 2, 3], // 夜宵无折扣
    2: [34, 35, 36, 37, 38, 39, 40, 41], // 晚餐无折扣
    3: [22, 23, 24, 25, 26, 27], // 午餐无折扣
    4: [34, 35, 36, 37, 38, 39, 40, 41], // 晚餐无折扣
    5: [22, 23, 24, 25, 26, 27], // 午餐无折扣
  }

  return noDiscountConfig[rowIndex % 6] || []
}

/* ========== 投流廣告：流量包定價與訂單（對標 DUO+ 預付流量包模型） ========== */

/** 預設檔位（流量包套餐） */
export interface TrafficPackageTier {
  id: string
  name: string              // 檔位名稱
  impressions: number       // 曝光次數
  price: number             // 價格 (MOP)
  validityDays?: number     // 有效期（天）— 已停用：流量包消耗完畢即退出，不再設有效期
  onSale: boolean           // 是否上架
  sort: number              // 排序
  discountEnabled?: boolean   // 折扣開關
  discount?: number           // 折扣（折，如 8.5 = 85 折）
  discountTimeMode?: 'limited' | 'unlimited'  // 折扣時間模式：限定時間 / 不限時間（一直打折）
  discountStartDate?: string  // 折扣活動開始日期（限定時間模式）
  discountEndDate?: string    // 折扣活動結束日期（限定時間模式）
}

/** 階梯單價行（自定義數量計價） */
export interface TrafficPriceLadderRow {
  id: string
  minQty: number            // 區間下限（含）
  maxQty: number            // 區間上限（含），0 表示無上限
  unitPrice: number         // 單次曝光單價 (MOP)
}

/** 單個業務頻道的定價配置 */
export interface TrafficChannelPricing {
  bizChannel: BizChannelValue
  tiers: TrafficPackageTier[]
  ladder: TrafficPriceLadderRow[]
  customMinQty: number        // 自定義最低購買量
  customStep: number          // 自定義購買步長
  customValidityDays?: number // 自定義購買有效期 — 已停用（消耗完畢即退出）
  status?: 'enabled' | 'disabled'   // 頻道級啟停（停用後該頻道流量包停止售賣）
  allowRefund?: boolean             // 是否允許訂單退款
  refundFeePercent?: number         // 退款手續費比例（%）：手續費 = 退款金額 × 比例，0 = 免費退
}

/** 流量包訂單 */
export interface TrafficPackageOrder {
  orderNo: string
  merchantName: string
  bizChannel: BizChannelValue
  mode: 'tier' | 'custom'       // 購買方式：預設檔位 / 自定義數量
  tierName?: string             // 檔位名稱（档位購買時）
  impressions: number           // 購買曝光次數
  amount: number                // 訂單金額 (MOP)
  validityDays?: number         // 有效期 — 已停用（消耗完畢即退出）
  deliverySlot?: 'business' | 'allday'  // 投流時段：主營時段投流 / 全天投流
  status: 'paid'                // Mock：提交即已支付
  createTime: string
}

const TRAFFIC_PRICING_STORAGE_KEY = 'traffic-package-pricing'
const TRAFFIC_ORDER_STORAGE_KEY = 'traffic-package-orders'

/** 生成 3 個業務頻道的默認定價配置（與銷售定價頁一致） */
export function generateDefaultTrafficPricing(): TrafficChannelPricing[] {
  return [
    {
      bizChannel: BIZ_CHANNEL.FOOD_DELIVERY,
      tiers: [
        { id: 'food-t1', name: '體驗包', impressions: 1000, price: 200, validityDays: 7, onSale: true, sort: 1 },
        { id: 'food-t2', name: '成長包', impressions: 5000, price: 900, validityDays: 30, onSale: true, sort: 2 },
        { id: 'food-t3', name: '爆款包', impressions: 10000, price: 1600, validityDays: 60, onSale: true, sort: 3 },
      ],
      ladder: [
        { id: 'food-l1', minQty: 1, maxQty: 999, unitPrice: 0.25 },
        { id: 'food-l2', minQty: 1000, maxQty: 4999, unitPrice: 0.2 },
        { id: 'food-l3', minQty: 5000, maxQty: 0, unitPrice: 0.16 },
      ],
      customMinQty: 100,
      customStep: 100,
      customValidityDays: 30,
      status: 'enabled',
      allowRefund: true,
      refundFeePercent: 0,
    },
    {
      bizChannel: BIZ_CHANNEL.SUPERMARKET,
      tiers: [
        { id: 'super-t1', name: '體驗包', impressions: 1000, price: 180, validityDays: 7, onSale: true, sort: 1 },
        { id: 'super-t2', name: '成長包', impressions: 5000, price: 800, validityDays: 30, onSale: true, sort: 2 },
        { id: 'super-t3', name: '爆款包', impressions: 10000, price: 1450, validityDays: 60, onSale: true, sort: 3 },
      ],
      ladder: [
        { id: 'super-l1', minQty: 1, maxQty: 999, unitPrice: 0.22 },
        { id: 'super-l2', minQty: 1000, maxQty: 4999, unitPrice: 0.18 },
        { id: 'super-l3', minQty: 5000, maxQty: 0, unitPrice: 0.15 },
      ],
      customMinQty: 100,
      customStep: 100,
      customValidityDays: 30,
      status: 'enabled',
      allowRefund: true,
      refundFeePercent: 0,
    },
    {
      bizChannel: BIZ_CHANNEL.GROUP_BUY,
      tiers: [
        { id: 'group-t1', name: '體驗包', impressions: 1000, price: 220, validityDays: 7, onSale: true, sort: 1 },
        { id: 'group-t2', name: '成長包', impressions: 5000, price: 990, validityDays: 30, onSale: true, sort: 2 },
        { id: 'group-t3', name: '爆款包', impressions: 10000, price: 1760, validityDays: 60, onSale: true, sort: 3 },
      ],
      ladder: [
        { id: 'group-l1', minQty: 1, maxQty: 999, unitPrice: 0.28 },
        { id: 'group-l2', minQty: 1000, maxQty: 4999, unitPrice: 0.22 },
        { id: 'group-l3', minQty: 5000, maxQty: 0, unitPrice: 0.18 },
      ],
      customMinQty: 100,
      customStep: 100,
      customValidityDays: 30,
      status: 'enabled',
      allowRefund: true,
      refundFeePercent: 0,
    },
  ]
}

/** 讀取定價配置（優先讀取銷售定價頁已保存的配置） */
export function loadTrafficPricing(): TrafficChannelPricing[] {
  try {
    const raw = localStorage.getItem(TRAFFIC_PRICING_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TrafficChannelPricing[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* 解析失敗回退默認配置 */ }
  return generateDefaultTrafficPricing()
}

/** 按購買數量查找命中的階梯單價 */
export function findLadderUnitPrice(ladder: TrafficPriceLadderRow[], qty: number): number | null {
  const row = ladder.find(r => qty >= r.minQty && (r.maxQty === 0 || qty <= r.maxQty))
  return row ? row.unitPrice : null
}

/** 計算自定義數量訂單金額（數量 × 命中階梯單價） */
export function calcCustomAmount(ladder: TrafficPriceLadderRow[], qty: number): number {
  const unitPrice = findLadderUnitPrice(ladder, qty)
  if (unitPrice === null) return 0
  return Math.round(qty * unitPrice * 100) / 100
}

/** 讀取流量包訂單列表 */
export function loadTrafficOrders(): TrafficPackageOrder[] {
  try {
    const raw = localStorage.getItem(TRAFFIC_ORDER_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TrafficPackageOrder[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* 解析失敗返回空列表 */ }
  return []
}

/** 保存流量包訂單 */
export function saveTrafficOrder(order: TrafficPackageOrder): void {
  const orders = loadTrafficOrders()
  orders.unshift(order)
  localStorage.setItem(TRAFFIC_ORDER_STORAGE_KEY, JSON.stringify(orders))
}

/** Mock 門店列表（購買時選擇商家） */
export const MOCK_TRAFFIC_MERCHANTS = [
  { value: 'M1001', label: 'M1001 · 澳門張記牛雜（新馬路店）' },
  { value: 'M1002', label: 'M1002 · 氹仔貓山王榴蓮甜品' },
  { value: 'M1003', label: 'M1003 · 皇朝區金龍茶餐廳' },
  { value: 'M1004', label: 'M1004 · 筷子基順德公魚腐火鍋' },
  { value: 'M1005', label: 'M1005 · 路環安德魯餅店' },
  { value: 'M1006', label: 'M1006 · 新橋區大利來豬扒包' },
  { value: 'M1007', label: 'M1007 · 皇朝區御品軒日式拉麵' },
  { value: 'M1008', label: 'M1008 · 氹仔官也街誠昌飯店' },
]