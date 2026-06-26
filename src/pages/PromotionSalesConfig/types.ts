import { AlgorithmType, Region, RecommendChannel } from '../Recommend/constants'

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
  promotionName: string           // 推广名称
  channel: RecommendChannel       // 业务频道
  slotPosition: number            // 展示位置
  dailyPrice: number              // 单日单价 (MOP)
  availableStartDate: string      // 可购买日期起
  availableEndDate: string        // 可购买日期止
  totalSlots: number              // 总时段数
  soldSlots: number               // 已售时段数
  algorithmType: AlgorithmType    // 推荐类型
  region: Region                  // 所属商圈
}

/** 购物车项 */
export interface CartItem {
  id: string                      // 唯一标识 (inventoryId-date)
  inventoryItem: InventoryItem    // 关联库存数据
  date: string                    // 购买日期
  timeSlots: number[]             // 选中的时段索引 (0-47)
  totalPrice: number              // 该项总价
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
    type: AlgorithmType.NEW_STORE_AD,
    name: '新店廣告',
    icon: '🏪',
    description: '新店專屬推廣位，快速獲取首批顧客',
    enabled: false,
  },
  {
    type: AlgorithmType.HOT_REVIVE_AD,
    name: '熱門盤活',
    icon: '🔥',
    description: '盤活熱門商家流量，提升店鋪曝光',
    enabled: false,
  },
  {
    type: AlgorithmType.TRAFFIC_AD,
    name: '流量廣告',
    icon: '📊',
    description: '精準流量投放，覆蓋目標用戶群體',
    enabled: false,
  },
  {
    type: AlgorithmType.ORGANIC_TRAFFIC,
    name: '自然流量',
    icon: '🌿',
    description: '自然流量曝光，提升店鋪基礎流量',
    enabled: false,
  },
  {
    type: AlgorithmType.EXCLUSIVE_MERCHANT,
    name: '獨家商家',
    icon: '👑',
    description: '獨家商家專屬展示位，彰顯品牌實力',
    enabled: false,
  },
]

/** 频道标签映射 */
export const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
}

/** 生成伪随机数（可预期） */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/** 生成 Mock 库存数据 */
export function generateMockInventory(region: Region, algorithmType?: AlgorithmType): InventoryItem[] {
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
    [AlgorithmType.HOT_REVIVE_AD]: '熱門盤活',
    [AlgorithmType.TRAFFIC_AD]: '流量廣告',
    [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
    [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
    [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
    [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
  }
  
  // 各类型的推广名称后缀
  const promotionSuffixes = [
    '·黃金展位', '·首頁推薦', '·外賣熱推', '·團購精選',
    '·超市優選', '·週末專場', '·節日特惠', '·品牌周推廣',
  ]

  const items: InventoryItem[] = []
  const baseId = region * 1000 + (algorithmType || 0) * 100
  const targetTypes = algorithmType ? [algorithmType] : Object.values(AlgorithmType).filter(v => typeof v === 'number') as AlgorithmType[]

  let idCounter = 1
  for (const type of targetTypes) {
    const prefix = typePrefixes[type] || '廣告'
    
    for (let i = 0; i < 4; i++) {
      const seed = baseId + idCounter * 37
      const channel = channels[Math.floor(pseudoRandom(seed + 1) * channels.length)]
      const slotPosition = 1 + Math.floor(pseudoRandom(seed + 2) * 5)
      const dailyPrice = 800 + Math.floor(pseudoRandom(seed + 3) * 2200)
      const totalSlots = 20 + Math.floor(pseudoRandom(seed + 4) * 30)
      const soldSlots = Math.floor(pseudoRandom(seed + 5) * totalSlots * 0.7)
      const startDay = 1 + Math.floor(pseudoRandom(seed + 6) * 10)
      const endDay = startDay + 14 + Math.floor(pseudoRandom(seed + 7) * 16)

      items.push({
        id: baseId + idCounter,
        promotionName: `${prefix}${promotionSuffixes[idCounter % promotionSuffixes.length]}`,
        channel,
        slotPosition,
        dailyPrice,
        availableStartDate: '2025-07-05',
        availableEndDate: '2025-07-31',
        totalSlots,
        soldSlots,
        algorithmType: type,
        region,
      })
      idCounter++
    }
  }
  return items
}

/** 为指定日期生成48个时段状态 */
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

  // 根据日期确定行号（从可购买日期开始计算）
  const startDate = '2025-07-05'
  const startDay = parseInt(startDate.split('-')[2], 10)
  const currentDay = parseInt(date.split('-')[2], 10)
  const rowIndex = currentDay - startDay // 第几行（0-based）

  // 按行配置售罄时段
  const soldOutConfig: Record<number, number[]> = {
    2: [14, 15, 16, 17, 18, 19], // 第 3 行（07-07）：早餐
    6: [22, 23, 24, 25, 26, 27], // 第 7 行（07-11）：午餐
    8: [28, 29, 30, 31, 32, 33], // 第 9 行（07-13）：下午茶
    10: [34, 35, 36, 37, 38, 39, 40, 41], // 第 11 行（07-15）：晚餐
    11: [42, 43, 44, 45, 46, 47], // 第 12 行（07-16）：夜宵
    13: [14, 15, 16, 17, 18, 19], // 第 14 行（07-18）：早餐
    17: [22, 23, 24, 25, 26, 27], // 第 18 行（07-22）：午餐
    21: [34, 35, 36, 37, 38, 39, 40, 41], // 第 22 行（07-26）：晚餐
  }

  // 应用当前行的售罄配置
  const soldOutSlots = soldOutConfig[rowIndex] || []
  soldOutSlots.forEach(slotIndex => {
    if (slotIndex < statuses.length) {
      statuses[slotIndex] = TimeSlotStatus.SOLD_OUT
    }
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
  // 根据日期确定行号（从可购买日期开始计算）
  const startDate = '2025-07-05'
  const startDay = parseInt(startDate.split('-')[2], 10)
  const currentDay = parseInt(date.split('-')[2], 10)
  const rowIndex = currentDay - startDay // 第几行（0-based）

  // 按行配置无折扣时段
  const noDiscountConfig: Record<number, number[]> = {
    0: [28, 29, 30, 31, 32, 33], // 第1行（07-05）：下午茶
    1: [42, 43, 44, 45, 46, 47, 0, 1, 2, 3], // 第2行（07-06）：夜宵
    2: [34, 35, 36, 37, 38, 39, 40, 41], // 第3行（07-07）：晚餐
    3: [22, 23, 24, 25, 26, 27], // 第4行（07-08）：午餐
    4: [34, 35, 36, 37, 38, 39, 40, 41], // 第5行（07-09）：晚餐
    5: [22, 23, 24, 25, 26, 27], // 第6行（07-10）：午餐
  }

  return noDiscountConfig[rowIndex] || []
}