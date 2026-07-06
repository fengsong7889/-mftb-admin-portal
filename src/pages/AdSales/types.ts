import { AlgorithmType, Region, RecommendChannel, AppType } from '../Recommend/constants'

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

/** 可购买起始日期 */
const PURCHASE_START_DATE = '2025-07-05'
const PURCHASE_START_DAY = parseInt(PURCHASE_START_DATE.split('-')[2], 10)

/** 根据日期计算行号（0-based） */
export function getRowIndexByDate(date: string): number {
  const currentDay = parseInt(date.split('-')[2], 10)
  return currentDay - PURCHASE_START_DAY
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
        const endDay = startDay + 14 + Math.floor(pseudoRandom(seed + 7) * 16)

        items.push({
          id: baseId + idCounter,
          adId: `AD${String(baseId + idCounter).padStart(6, '0')}`,
          promotionName: `${prefix}${promotionSuffixes[idCounter % promotionSuffixes.length]}`,
          app: currentApp,
          channel,
          bizChannel,
          slotPosition,
          dailyPrice,
          availableStartDate: '2025-07-05',
          availableEndDate: '2025-07-18',
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

  // 根据日期确定行号
  const rowIndex = getRowIndexByDate(date)

  // 根据日期配置特定的不可售时段
  const unavailableConfig: Record<number, number[]> = {
    3: [14, 15, 16, 17, 18, 19, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47], // 第 4 行（07-08）：早餐+晚餐+夜宵
    6: [14, 15, 16, 17, 18, 19, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47], // 第 7 行（07-11）：早餐+晚餐+夜宵
  }

  // 应用特定日期的不可售配置
  const unavailableSlots = unavailableConfig[rowIndex] || []
  unavailableSlots.forEach(slotIndex => {
    if (slotIndex < statuses.length) {
      statuses[slotIndex] = TimeSlotStatus.UNAVAILABLE
    }
  })

  // 按行配置售罄时段
  const soldOutConfig: Record<number, number[]> = {
    0: [22, 23, 24, 25, 26, 27], // 第 1 行（07-05）：午餐
    2: [14, 15, 16, 17, 18, 19], // 第 3 行（07-07）：早餐
    4: [34, 35, 36, 37, 38, 39, 40, 41], // 第 5 行（07-09）：晚餐
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

  // 按餐时段随机设置20%为不可售，确保每个餐时段都有分布
  const mealSlots = [
    { start: 12, end: 13 },  // 06:00-07:00
    { start: 14, end: 19 },  // 早餐 07:00-10:00
    { start: 20, end: 21 },  // 10:00-11:00
    { start: 22, end: 27 },  // 午餐 11:00-14:00
    { start: 28, end: 33 },  // 下午茶 14:00-17:00
    { start: 34, end: 41 },  // 晚餐 17:00-21:00
    { start: 42, end: 47 },  // 夜宵 21:00-00:00
  ]
  
  // 对每个餐时段分别随机设置20%为不可售
  mealSlots.forEach((meal, mealIndex) => {
    const availableInMeal: number[] = []
    for (let i = meal.start; i <= meal.end; i++) {
      if (statuses[i] === TimeSlotStatus.AVAILABLE) {
        availableInMeal.push(i)
      }
    }
    
    if (availableInMeal.length > 0) {
      // 每个餐时段至少设置1个不可售（如果有可售时段）
      const unavailableCount = Math.max(1, Math.floor(availableInMeal.length * 0.2))
      
      // 使用不同的种子确保每个餐时段的随机性不同
      const mealSeed = inventoryId * 1000 + dateSeed * 100 + mealIndex * 10
      
      // Fisher-Yates 洗牌算法
      const shuffled = [...availableInMeal]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(pseudoRandom(mealSeed + i) * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      
      const selectedSlots = shuffled.slice(0, unavailableCount)
      
      selectedSlots.forEach(slotIndex => {
        statuses[slotIndex] = TimeSlotStatus.UNAVAILABLE
      })
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
  const rowIndex = getRowIndexByDate(date)

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