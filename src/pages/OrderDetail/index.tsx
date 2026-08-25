import { useEffect, useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { Button, Tag, Descriptions, Card, Empty, Modal, message, Tabs, Spin, Result } from 'antd'
import {
  ArrowLeftOutlined, CheckOutlined, ClockCircleOutlined, CloseOutlined,
  ShopOutlined, FileTextOutlined, DollarOutlined,
  ExclamationCircleOutlined, RollbackOutlined, DownOutlined, RightOutlined,
  BarChartOutlined, EyeOutlined, AimOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchAdOrderDetail,
  fetchAdPricingActive,
  fetchAdRevivePricingActive,
  fetchAdSignboardPricingActive,
  refundAdOrder,
  cancelAdOrder,
  brandToAppType,
  type AdOrderDetail,
} from '../../api/adPromotion'
import { AlgorithmType, REGION_LABEL_KEY } from '../Recommend/constants'
import dayjs from 'dayjs'

/* ---- 数字动画 Hook ---- */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

/* ---- 动画数字组件 ---- */
function AnimatedNumber({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const animated = useCountUp(value)
  return <>{prefix}{animated.toLocaleString()}{suffix}</>
}

/* ---- 动画百分比组件 ---- */
function AnimatedPercent({ values, suffix = '%' }: { values: number[]; suffix?: string }) {
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const duration = 1200
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setDisplay(+(avg * eased).toFixed(1))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [avg])
  return <>{display}{suffix}</>
}

/* ---- 枚举 ---- */
enum OrderStatus {
  PENDING_PROMOTION = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  CANCELLED = 4,
  ABORTED = 5,
  REFUNDED = 6,
}

enum AppType { SHANFENG = 1, MFOOD = 2 }

enum RecommendChannel { DELIVERY = 2, GROUP_BUY = 3, SUPERMARKET = 4 }

// 商圈名称映射：统一引用全局商圈数据（含珠海区域）

// 推荐类型枚举（统一引用 AlgorithmType，避免重复定义导致枚举值不一致）
type RecommendType = AlgorithmType
const RecommendType = AlgorithmType
const RECOMMEND_TYPE_ICON: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '⭐',
  [RecommendType.HOT_REVIVE_AD]: '🔥',
  [RecommendType.NEW_STORE_AD]: '🏪',
  [RecommendType.TRAFFIC_AD]: '📊',
  [RecommendType.POPULAR_MERCHANT_KA]: '🏆',
  [RecommendType.GOLDEN_SIGNBOARD]: '🌟',
}

/* ---- 接口 ---- */
interface SlotPriceItem {
  slot: string       // 时段名称，如「早餐」「午餐」
  date: string       // 日期，如「2026-07-16」
  originalPrice: number
  discount: number   // 折扣，10=无折扣，8=8折
  actualPrice: number
  region?: number    // 所属商圈（无敌星星多商圈用）
}

/* ---- 推广数据接口 ---- */
interface PromoRecord {
  date: string          // 统计日期
  region: string        // 商圈
  waterfallName: string // 瀑布流名称
  position: number      // 展示位置
  slot?: string         // 展示时段（无敌星星用）
  impressions: number   // 曝光量
  clicks: number        // 点击量
  clickRate: number     // 点击率（百分比）
}

interface OrderItem {
  id: string
  orderNo: string
  algorithmId: string
  promotionName: string
  app: AppType
  channel: RecommendChannel
  region: number | number[]  // 所屬商圈（無敵星星可能有多個）
  recommendType: RecommendType
  slotPosition: number
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  purchaseDate: string
  originalPrice: number
  discountPrice: number
  actualPrice: number
  status: OrderStatus
  orderTime: string
  payTime?: string
  slotPrices: SlotPriceItem[]
  gradientDiscount?: { count: number; discount: number } | null
  cancelFeeRules: { maxDays: number; feePercent: number }[]
  refundAmount?: number
  refundEnabled?: boolean // 是否允许退款
  promoStartDate?: string // 推广开始日期
  promoData?: PromoRecord[] // 推广数据
  purchaseDays?: string[] // 新店廣告/人氣商家：推廣日期列表
  skinName?: string // 人氣商家：皮膚套件名稱
  giftDays?: number // 贈送天數抵扣快照（抵扣天數）
  giftAmount?: number // 贈送抵扣金額快照
  terminalTime?: string // 終態（已退款/已取消/已中止/已完成）發生的日期時間
  operatorName?: string // 操作人姓名
  operatorId?: string // 操作人工號
  terminalActor?: 'staff' | 'merchant' // 終態操作發起方：業務人員 / 商家
  /** 数据来源：api=后端真实数据 mock=演示数据 */
  source?: 'api' | 'mock'
}

/* ---- 后端订单映射 ---- */

/** 餐段时段 key → 中文名称 */
const MEAL_SLOT_LABEL: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', afternoon: '下午茶', dinner: '晚餐', supper: '宵夜',
}

/** 后端频道 → 前端频道（3=超市百貨 4=團購到店，其余归美食外卖） */
function mapAdChannel(channel?: number): RecommendChannel {
  if (channel === 3) return RecommendChannel.SUPERMARKET
  if (channel === 4) return RecommendChannel.GROUP_BUY
  return RecommendChannel.DELIVERY
}

/** 后端订单状态 → 详情页状态（后端 4=已退款 5=已取消） */
function mapAdStatus(status: number): OrderStatus {
  if (status === 4) return OrderStatus.REFUNDED
  if (status === 5) return OrderStatus.CANCELLED
  return status as OrderStatus
}

/** 解析取消扣费梯度 JSON（[{remainDays,ratio}] → [{maxDays,feePercent}]） */
function parseCancelFeeTiers(json?: string): { maxDays: number; feePercent: number }[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return (arr as Array<{ remainDays?: number; ratio?: number }>)
      .filter(t => t && Number(t.remainDays) >= 0 && Number(t.ratio) >= 0)
      .map(t => ({ maxDays: Number(t.remainDays), feePercent: Number(t.ratio) }))
      .sort((a, b) => a.maxDays - b.maxDays)
  } catch {
    return []
  }
}

/** 解析多時段梯度折扣 JSON（[{minSlots,discount}]，百分比記法） */
function parseDiscountTiers(json?: string): { minSlots: number; discount: number }[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return (arr as Array<{ minSlots?: number; discount?: number }>)
      .filter(t => t && Number(t.minSlots) > 0 && Number(t.discount) > 0)
      .map(t => ({ minSlots: Number(t.minSlots), discount: Number(t.discount) }))
  } catch {
    return []
  }
}

/** 解析多天梯度折扣 JSON（[{minDays,discount}]，盤活復蘇，映射為 minSlots 口徑復用展示邏輯） */
function parseDayDiscountTiers(json?: string): { minSlots: number; discount: number }[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return (arr as Array<{ minDays?: number; discount?: number }>)
      .filter(t => t && Number(t.minDays) > 0 && Number(t.discount) > 0)
      .map(t => ({ minSlots: Number(t.minDays), discount: Number(t.discount) }))
  } catch {
    return []
  }
}

/** 后端订单详情 → 详情页 OrderItem（明细折扣还原为定价配置的时段折扣口径） */
function toDetailOrder(
  vo: AdOrderDetail,
  pricing?: {
    cancelFeeRules: { maxDays: number; feePercent: number }[]
    refundEnabled: boolean
    discountTiers: { minSlots: number; discount: number }[]
  },
): OrderItem {
  // 後端 LocalDateTime 統一序列化為毫秒時間戳，兼容字符串/數字兩種格式
  const fmt = (t?: string | number) => {
    if (t == null || t === '') return ''
    if (typeof t === 'number') return dayjs(t).format('YYYY-MM-DD HH:mm:ss')
    return String(t).replace('T', ' ').slice(0, 19)
  }
  // 匹配梯度折扣（与后端同算法: minSlots 降序取第一个满足格子数的梯度）
  const cellCount = vo.itemCount ?? vo.items.length
  const matchedTier = [...(pricing?.discountTiers ?? [])]
    .sort((a, b) => b.minSlots - a.minSlots)
    .find(t => cellCount >= t.minSlots)
  const tierPct = matchedTier ? matchedTier.discount : 100
  // 明细 salePrice 已是梯度折後價（含實付分攤）：還原為折前價再參與費用明細計算，
  // 避免梯度折扣在 finalPrice = subtotal × 梯度倍率 中被重複乘兩次
  // 贈送抵扣分攤還原：明細 salePrice 按抵扣後實付分攤，有抵扣時先還原為抵扣前（折後）價再還原梯度
  const actualTotalVo = vo.actualAmount ?? 0
  const giftTotalVo = vo.giftAmount ?? 0
  const sumSaleVo = vo.items.reduce((s, i) => s + i.salePrice, 0)
  const giftRatio = sumSaleVo > 0 && actualTotalVo + giftTotalVo > 0 ? (actualTotalVo + giftTotalVo) / sumSaleVo : 1
  const slotPrices: SlotPriceItem[] = vo.items.map(item => {
    // 純贈送抵扣時 salePrice=0，無法反推 → 直接用 originalPrice × 梯度折扣
    let afterSlot: number
    if (item.salePrice > 0) {
      afterSlot = tierPct > 0 ? (item.salePrice * giftRatio / tierPct) * 100 : item.salePrice * giftRatio
    } else {
      afterSlot = tierPct > 0 ? item.originalPrice * tierPct / 100 : item.originalPrice
    }
    const discount = item.originalPrice > 0
      ? Math.min(10, Math.max(1, Math.round((afterSlot / item.originalPrice) * 10)))
      : 10
    return {
      slot: item.mealSlot ? (MEAL_SLOT_LABEL[item.mealSlot] || item.mealSlot) : '全天',
      date: item.bizDate,
      originalPrice: item.originalPrice,
      discount,
      actualPrice: Math.round(afterSlot * 100) / 100,
      region: item.region,
    }
  })
  const regions = Array.from(new Set(vo.items.map(i => i.region)))
  const firstBizDate = vo.items.map(i => i.bizDate).sort()[0] || fmt(vo.orderTime).slice(0, 10)
  // 生成推廣數據：推廣中/已推廣/已退款（推廣後退款）的訂單才有推廣數據
  const mappedStatus = mapAdStatus(vo.status)
  const hasPromoData = mappedStatus === OrderStatus.PROMOTING
    || mappedStatus === OrderStatus.PROMOTED
    || mappedStatus === OrderStatus.REFUNDED
  let promoData: PromoRecord[] | undefined
  if (hasPromoData && slotPrices.length > 0) {
    const primaryRegion = regions[0] ?? 1
    const regionName = REGION_LABEL_KEY[primaryRegion] ? i18n.t(REGION_LABEL_KEY[primaryRegion]) : '未知'
    if (vo.algoType === AlgorithmType.NEW_STORE_AD) {
      const pDays = vo.purchaseDays && vo.purchaseDays.length > 0 ? vo.purchaseDays : slotPrices.map(s => s.date)
      promoData = genNewStorePromoData(regionName, pDays)
    } else if (vo.algoType === AlgorithmType.HOT_REVIVE_AD) {
      promoData = genRevivePromoData(regionName, slotPrices)
    } else {
      promoData = genInvincibleStarPromoData(regionName, slotPrices)
    }
  }
  return {
    id: vo.orderNo,
    orderNo: vo.orderNo,
    algorithmId: vo.algoCode || String(vo.algoId),
    promotionName: vo.algoName,
    app: (brandToAppType(vo.brand) ?? AppType.SHANFENG) as AppType,
    channel: mapAdChannel(vo.channel),
    region: regions.length === 1 ? regions[0] : regions,
    recommendType: vo.algoType as RecommendType,
    slotPosition: 0,
    groupId: vo.groupCode,
    groupName: vo.groupName || '-',
    storeId: vo.storeCode || '-',
    storeName: vo.storeName || '-',
    purchaseDate: fmt(vo.orderTime).slice(0, 10),
    originalPrice: vo.originalAmount,
    discountPrice: vo.originalAmount - vo.discountAmount,
    actualPrice: vo.actualAmount,
    status: mapAdStatus(vo.status),
    orderTime: fmt(vo.orderTime),
    payTime: vo.payTime ? fmt(vo.payTime) : undefined,
    slotPrices,
    gradientDiscount: matchedTier ? { count: matchedTier.minSlots, discount: matchedTier.discount / 10 } : null,
    cancelFeeRules: pricing?.cancelFeeRules ?? [],
    refundAmount: vo.refundAmount ? vo.refundAmount : undefined,
    refundEnabled: pricing?.refundEnabled ?? true,
    promoStartDate: firstBizDate,
    purchaseDays: vo.purchaseDays,
    skinName: vo.skinNames?.[0] || vo.items.find(i => i.skinName)?.skinName || undefined,
    giftDays: vo.giftDays ?? 0,
    giftAmount: vo.giftAmount ?? 0,
    promoData,
    source: 'api',
  }
}

/* ---- 推广数据 Mock ---- */
const WATERFALL_NAMES = ['推薦瀑布流A', '推薦瀑布流B', '精選瀑布流C']

function genInvincibleStarPromoData(regionName: string, slots: SlotPriceItem[]): PromoRecord[] {
  const dateMap = new Map<string, SlotPriceItem[]>()
  slots.forEach(sp => {
    if (!dateMap.has(sp.date)) dateMap.set(sp.date, [])
    dateMap.get(sp.date)!.push(sp)
  })
  const records: PromoRecord[] = []
  Array.from(dateMap.entries()).forEach(([date, daySlots]) => {
    daySlots.forEach((sp, i) => {
      const imp = 800 + i * 320 + Math.floor(Math.random() * 500)
      const clk = 60 + i * 25 + Math.floor(Math.random() * 40)
      const slotRegion = sp.region !== undefined ? (REGION_LABEL_KEY[sp.region] ? i18n.t(REGION_LABEL_KEY[sp.region]) : regionName) : regionName
      records.push({
        date, region: slotRegion,
        waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
        position: (i % 5) + 1, slot: sp.slot,
        impressions: imp, clicks: clk,
        clickRate: +((clk / imp) * 100).toFixed(1),
      })
    })
  })
  return records
}

function genRevivePromoData(regionName: string, slots: SlotPriceItem[]): PromoRecord[] {
  return slots.map((sp, i) => {
    const imp = 1200 + i * 280 + Math.floor(Math.random() * 600)
    const clk = 90 + i * 18 + Math.floor(Math.random() * 50)
    return {
      date: sp.date, region: regionName,
      waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
      position: (i % 3) + 1,
      impressions: imp, clicks: clk,
      clickRate: +((clk / imp) * 100).toFixed(1),
    }
  })
}

function genNewStorePromoData(regionName: string, purchaseDays: string[]): PromoRecord[] {
  return purchaseDays.map((date, i) => {
    const imp = 1000 + i * 250 + Math.floor(Math.random() * 500)
    const clk = 80 + i * 15 + Math.floor(Math.random() * 40)
    return {
      date, region: regionName,
      waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
      position: (i % 3) + 1,
      impressions: imp, clicks: clk,
      clickRate: +((clk / imp) * 100).toFixed(1),
    }
  })
}

/* ---- Mock ---- */
const slotDefs = [
  { slot: '早餐', originalPrice: 80 },
  { slot: '午餐', originalPrice: 150 },
  { slot: '下午茶', originalPrice: 90 },
  { slot: '晚餐', originalPrice: 180 },
  { slot: '宵夜', originalPrice: 60 },
] as const

const dates = ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']
const pastDates = ['2025-06-20', '2025-06-21', '2025-06-22', '2025-06-23', '2025-06-24']

// 操作人（用於終態訂單：已取消 / 已中止 / 已退款）
const OPERATORS = [
  { name: '陳嘉豪', id: 'EMP10086' },
  { name: '李詠欣', id: 'EMP10237' },
  { name: '黃俊傑', id: 'EMP10555' },
]

// 終態狀態（已退款 / 已取消 / 已中止）需要記錄發生時間與操作人
const TERMINAL_STATUSES = [OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.ABORTED]

// 無敵星星 / 盤活復蘇：這些已退款訂單為「未推廣即退款」，沒有推廣數據；其餘已退款訂單為「推廣後才退款」，有推廣數據
const REFUNDED_BEFORE_PROMO_IDS = new Set(['5', '105', '307', '311', '315'])

// 根據訂單生成終態時間與操作人信息（僅終態訂單使用）
function genTerminalInfo(id: string, baseTime: string): { terminalTime: string; operatorName: string; operatorId: string } {
  const op = OPERATORS[Number(id.replace(/\D/g, '')) % OPERATORS.length]
  const day = (baseTime || '').split(' ')[0]
  return { terminalTime: `${day} 18:32:45`, operatorName: op.name, operatorId: op.id }
}

function genOrder(
  id: string, orderNo: string, algoId: string, promoName: string,
  app: AppType, channel: RecommendChannel, region: number | number[],
  recType: RecommendType, slotPos: number, gid: string, gname: string,
  sid: string, sname: string, pdate: string, orig: number, disc: number,
  actual: number, status: OrderStatus, otime: string, ptime: string | undefined,
  slotPattern: number[], dateIdx: number, gradDisc: { count: number; discount: number } | null,
  refundAmt?: number,
  refundEnabled: boolean = true,
  dateRegions?: number[][],
): OrderItem {
  const isRevive = recType === RecommendType.HOT_REVIVE_AD
  const isPast = status !== OrderStatus.PENDING_PROMOTION && status !== OrderStatus.PROMOTING
  const baseDates = isPast ? pastDates : dates
  const slotPrices: SlotPriceItem[] = []
  if (isRevive) {
    slotPattern.forEach((di, i) => {
      const p = 1000 + (i * 100)
      const d = [10, 9, 8][i % 3]
      slotPrices.push({ slot: `Day${i + 1}`, date: baseDates[di % 5], originalPrice: p, discount: d, actualPrice: Math.round(p * d / 10) })
    })
  } else {
    slotPattern.forEach((si, i) => {
      const dateIdx = Math.floor(i / 5)
      const date = baseDates[dateIdx % 5]
      const def = slotDefs[si % 5]
      const d = [10, 9, 8, 8][i % 4]
      slotPrices.push({ slot: def.slot, date, originalPrice: def.originalPrice, discount: d, actualPrice: Math.round(def.originalPrice * d / 10) })
    })
  }
  // 多商圈：按日期分配商圈（所有订单类型通用）
  if (dateRegions && Array.isArray(region)) {
      // 按日期分组，每个日期使用指定的商圈列表
      const dateGroups = new Map<string, number[]>()
      slotPrices.forEach((sp, i) => {
        if (!dateGroups.has(sp.date)) dateGroups.set(sp.date, [])
        dateGroups.get(sp.date)!.push(i)
      })
      Array.from(dateGroups.entries()).forEach(([_date, indices], di) => {
        const dr = dateRegions[di] || dateRegions[0] || [Array.isArray(region) ? region[0] : region]
        const perR = Math.ceil(indices.length / dr.length)
        indices.forEach((slotIdx, i) => {
          slotPrices[slotIdx].region = dr[Math.min(Math.floor(i / perR), dr.length - 1)]
        })
      })
    } else if (Array.isArray(region) && region.length > 1) {
      const perRegion = Math.ceil(slotPrices.length / region.length)
      slotPrices.forEach((sp, i) => {
        sp.region = region[Math.min(Math.floor(i / perRegion), region.length - 1)]
      })
    } else {
      slotPrices.forEach(sp => { sp.region = Array.isArray(region) ? region[0] : region })
    }
  // 生成推广数据：推广中、已完成，以及「推廣後才退款」的已退款订单（未推廣即退款的除外）
  let promoData: PromoRecord[] | undefined
  const hasPromoData = status === OrderStatus.PROMOTING
    || status === OrderStatus.PROMOTED
    || (status === OrderStatus.REFUNDED && !REFUNDED_BEFORE_PROMO_IDS.has(id))
  if (hasPromoData) {
    const regionName = (REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region] ? i18n.t(REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region]) : '未知')
    promoData = isRevive
      ? genRevivePromoData(regionName, slotPrices)
      : genInvincibleStarPromoData(regionName, slotPrices)
  }
  const cancelFeeRules = [
    { maxDays: 0, feePercent: 100 },
    { maxDays: 3, feePercent: 80 },
    { maxDays: 7, feePercent: 50 },
  ]
  const isTerminal = TERMINAL_STATUSES.includes(status)
  // 已退款：部分為業務人員退款（顯示姓名+工號），部分為商家退款（顯示門店名稱+ID）；取消/中止統一為業務人員
  const terminalActor: 'staff' | 'merchant' = (status === OrderStatus.REFUNDED && Number(id) % 2 === 0) ? 'merchant' : 'staff'
  const lastPromoDate = slotPrices.length ? slotPrices[slotPrices.length - 1].date : (isPast ? pastDates[0] : dates[0])
  const terminalExtra = isTerminal
    ? { ...genTerminalInfo(id, otime), terminalActor }
    : (status === OrderStatus.PROMOTED ? { terminalTime: `${lastPromoDate} 22:10:30` } : {})
  return {
    id, orderNo, algorithmId: algoId, promotionName: promoName, app, channel, region,
    recommendType: recType, slotPosition: slotPos, groupId: gid, groupName: gname,
    storeId: sid, storeName: sname, purchaseDate: pdate, originalPrice: orig,
    discountPrice: disc, actualPrice: actual, status, orderTime: otime, payTime: ptime,
    promoStartDate: isPast ? '2025-06-15' : '2026-08-11',
    slotPrices, gradientDiscount: gradDisc, cancelFeeRules, promoData,
    ...(refundAmt !== undefined ? { refundAmount: refundAmt } : {}),
    refundEnabled,
    ...terminalExtra,
  }
}

const mockOrders: OrderItem[] = [
  // 無敵星星訂單 (id: 1-15)
  genOrder('1','ORD20250705001','ALG001','無敵星星·黃金展位',AppType.SHANFENG,RecommendChannel.DELIVERY,[1,6,4],RecommendType.INVINCIBLE_STAR,3,'G10001','澳門美食集團','S20001','澳門總店','2025-07-05',2000,1800,1440,OrderStatus.PENDING_PROMOTION,'2025-07-05 10:30:00','2025-07-05 10:35:00',[0,1,2,3,4,0,1,2,3,4],0,{count:10,discount:8},undefined,true,[[1,6,4],[2,3]]),
  genOrder('2','ORD20250706002','ALG002','無敵星星·首頁推薦',AppType.MFOOD,RecommendChannel.DELIVERY,6,RecommendType.INVINCIBLE_STAR,5,'G10002','閃蜂餐飲連鎖','S20002','氹仔分店','2025-07-06',1500,1350,1350,OrderStatus.PENDING_PROMOTION,'2025-07-06 14:20:00','2025-07-06 14:25:00',[3],0,null,undefined,false),
  genOrder('3','ORD20250707003','ALG003','盤活復蘇·外賣熱推',AppType.SHANFENG,RecommendChannel.GROUP_BUY,3,RecommendType.INVINCIBLE_STAR,2,'G10003','大灣區餐飲集團','S20003','珠海旗艦店','2025-07-08',3000,2700,2700,OrderStatus.PROMOTED,'2025-07-07 09:15:00',undefined,[0,1,2,3,4],0,null),
  genOrder('4','ORD20250703004','ALG004','流量廣告·團購精選',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,4,'G10001','澳門美食集團','S20004','黑沙環店','2025-07-03',1000,900,900,OrderStatus.REFUNDED,'2025-07-03 16:40:00','2025-07-03 16:45:00',[0],0,null,180),
  genOrder('5','ORD20250702005','ALG001','無敵星星·週末專場',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,RecommendType.INVINCIBLE_STAR,1,'G10002','閃蜂餐飲連鎖','S20005','新馬路店','2025-07-02',2500,2250,2250,OrderStatus.REFUNDED,'2025-07-02 11:20:00',undefined,[3,4],0,null,1125),
  genOrder('6','ORD20250701006','ALG001','無敵星星·早鳥優惠',AppType.MFOOD,RecommendChannel.GROUP_BUY,1,RecommendType.INVINCIBLE_STAR,2,'G10003','大灣區餐飲集團','S20001','澳門總店','2025-07-01',1800,1620,1620,OrderStatus.PENDING_PROMOTION,'2025-07-01 08:30:00','2025-07-01 08:35:00',[0,1,2,3,4],0,null),
  genOrder('7','ORD20250630007','ALG002','新店廣告·零售閃購',AppType.SHANFENG,RecommendChannel.DELIVERY,3,RecommendType.INVINCIBLE_STAR,3,'G10001','澳門美食集團','S20002','氹仔分店','2025-06-30',1200,1080,1080,OrderStatus.PENDING_PROMOTION,'2025-06-30 10:15:00','2025-06-30 10:20:00',[1],0,null,undefined,false),
  genOrder('8','ORD20250629008','ALG003','盤活復蘇·團購到店',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.INVINCIBLE_STAR,4,'G10002','閃蜂餐飲連鎖','S20003','珠海旗艦店','2025-06-29',2800,2520,2520,OrderStatus.PROMOTED,'2025-06-29 15:45:00',undefined,[0,1,2,3,4],0,null),
  genOrder('9','ORD20250628009','ALG004','流量廣告·大首頁推薦',AppType.SHANFENG,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,1,'G10003','大灣區餐飲集團','S20004','黑沙環店','2025-06-28',1600,1440,1440,OrderStatus.PROMOTED,'2025-06-28 09:20:00','2025-06-28 09:25:00',[0,2],0,null,1440),
  genOrder('10','ORD20250627010','ALG001','無敵星星·夜宵專場',AppType.MFOOD,RecommendChannel.DELIVERY,3,RecommendType.INVINCIBLE_STAR,5,'G10001','澳門美食集團','S20005','新馬路店','2025-06-27',2200,1980,1980,OrderStatus.PROMOTED,'2025-06-27 20:10:00','2025-06-27 20:15:00',[4],0,null),
  genOrder('11','ORD20250626011','ALG002','新店廣告·澳門專區',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.INVINCIBLE_STAR,2,'G10002','閃蜂餐飲連鎖','S20001','澳門總店','2025-06-26',1900,1710,1710,OrderStatus.PENDING_PROMOTION,'2025-06-26 11:30:00','2025-06-26 11:35:00',[1,3],0,null,undefined,false),
  genOrder('12','ORD20250625012','ALG003','盤活復蘇·氹仔熱推',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.INVINCIBLE_STAR,3,'G10003','大灣區餐飲集團','S20002','氹仔分店','2025-06-25',1400,1260,1260,OrderStatus.PROMOTED,'2025-06-25 13:50:00',undefined,[1,3],0,null,1260),
  genOrder('13','ORD20250624013','ALG004','流量廣告·珠海精選',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,RecommendType.INVINCIBLE_STAR,4,'G10001','澳門美食集團','S20003','珠海旗艦店','2025-06-24',2100,1890,1890,OrderStatus.PROMOTED,'2025-06-24 07:40:00',undefined,[0,1],0,null),
  genOrder('14','ORD20250623014','ALG001','無敵星星·全時段推廣',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,1,'G10002','閃蜂餐飲連鎖','S20004','黑沙環店','2025-06-23',3500,3150,3150,OrderStatus.PROMOTED,'2025-06-23 06:20:00','2025-06-23 06:25:00',[0,1,2,3,4,0,1],0,null,3150),
  genOrder('15','ORD20250622015','ALG002','新店廣告·閃購特惠',AppType.SHANFENG,RecommendChannel.DELIVERY,6,RecommendType.INVINCIBLE_STAR,5,'G10003','大灣區餐飲集團','S20005','新馬路店','2025-06-22',1700,1530,1530,OrderStatus.PROMOTED,'2025-06-22 10:05:00','2025-06-22 10:10:00',[0,1,2],0,null,1530),
  // 盤活復甦訂單 (id: 101-115)
  genOrder('101','ORD20250715101','ALG003','盤活復甦·黃金展位',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.HOT_REVIVE_AD,3,'G10001','澳門美食集團','S20001','澳門總店','2025-07-15',3000,2700,2700,OrderStatus.PROMOTING,'2025-07-15 10:30:00','2025-07-15 10:35:00',[0,1,2],0,{count:3,discount:9}),
  genOrder('102','ORD20250714102','ALG003','盤活復甦·首頁推薦',AppType.MFOOD,RecommendChannel.DELIVERY,6,RecommendType.HOT_REVIVE_AD,5,'G10002','閃蜂餐飲連鎖','S20002','氹仔分店','2025-07-14',2500,2250,2250,OrderStatus.PENDING_PROMOTION,'2025-07-14 14:20:00','2025-07-14 14:25:00',[0,1],0,null,undefined,false),
  genOrder('103','ORD20250713103','ALG003','盤活復甦·外賣熱推',AppType.SHANFENG,RecommendChannel.GROUP_BUY,3,RecommendType.HOT_REVIVE_AD,2,'G10003','大灣區餐飲集團','S20003','珠海旗艦店','2025-07-13',4000,3600,3600,OrderStatus.PROMOTED,'2025-07-13 09:15:00',undefined,[0,1,2,3],0,null),
  genOrder('104','ORD20250712104','ALG003','盤活復甦·團購精選',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.HOT_REVIVE_AD,4,'G10001','澳門美食集團','S20004','黑沙環店','2025-07-12',1500,1350,1350,OrderStatus.REFUNDED,'2025-07-12 16:40:00','2025-07-12 16:45:00',[0],0,null,270),
  genOrder('105','ORD20250711105','ALG003','盤活復甦·週末專場',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,RecommendType.HOT_REVIVE_AD,1,'G10002','閃蜂餐飲連鎖','S20005','新馬路店','2025-07-11',5000,4500,4500,OrderStatus.REFUNDED,'2025-07-11 11:20:00',undefined,[0,1,2,3,4],0,null,2250),
  genOrder('106','ORD20250710106','ALG003','盤活復甦·早鳥優惠',AppType.MFOOD,RecommendChannel.GROUP_BUY,1,RecommendType.HOT_REVIVE_AD,2,'G10003','大灣區餐飲集團','S20001','澳門總店','2025-07-10',2000,1800,1800,OrderStatus.PENDING_PROMOTION,'2025-07-10 08:30:00','2025-07-10 08:35:00',[0,1],0,null),
  genOrder('107','ORD20250709107','ALG003','盤活復·零售閃購',AppType.SHANFENG,RecommendChannel.DELIVERY,3,RecommendType.HOT_REVIVE_AD,3,'G10001','澳門美食集團','S20002','氹仔分店','2025-07-09',3500,3150,3150,OrderStatus.PENDING_PROMOTION,'2025-07-09 10:15:00','2025-07-09 10:20:00',[0,1,2],0,null,undefined,false),
  genOrder('108','ORD20250708108','ALG003','盤活復甦·團購到店',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.HOT_REVIVE_AD,4,'G10002','閃蜂餐飲連鎖','S20003','珠海旗艦店','2025-07-08',2800,2520,2520,OrderStatus.PROMOTED,'2025-07-08 15:45:00',undefined,[0,1],0,null),
  genOrder('109','ORD20250707109','ALG003','盤活復甦·大首頁推薦',AppType.SHANFENG,RecommendChannel.SUPERMARKET,1,RecommendType.HOT_REVIVE_AD,1,'G10003','大灣區餐飲集團','S20004','黑沙環店','2025-07-07',4500,4050,4050,OrderStatus.PROMOTED,'2025-07-07 09:20:00','2025-07-07 09:25:00',[0,1,2,3],0,null,4050),
  genOrder('110','ORD20250706110','ALG003','盤活復甦·夜宵專場',AppType.MFOOD,RecommendChannel.DELIVERY,3,RecommendType.HOT_REVIVE_AD,5,'G10001','澳門美食集團','S20005','新馬路店','2025-07-06',2200,1980,1980,OrderStatus.PROMOTED,'2025-07-06 20:10:00','2025-07-06 20:15:00',[0,1],0,null),
  genOrder('111','ORD20250705111','ALG003','盤活復甦·澳門專區',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.HOT_REVIVE_AD,2,'G10002','閃蜂餐飲連鎖','S20001','澳門總店','2025-07-05',6000,5400,5400,OrderStatus.PENDING_PROMOTION,'2025-07-05 11:30:00','2025-07-05 11:35:00',[0,1,2,3,4,0],0,null,undefined,false),
  genOrder('112','ORD20250704112','ALG003','盤活復甦·氹仔熱推',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.HOT_REVIVE_AD,3,'G10003','大灣區餐飲集團','S20002','氹仔分店','2025-07-04',1400,1260,1260,OrderStatus.PROMOTED,'2025-07-04 13:50:00',undefined,[0,1],0,null,1260),
  genOrder('113','ORD20250703113','ALG003','盤活復甦·珠海精選',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,RecommendType.HOT_REVIVE_AD,4,'G10001','澳門美食集團','S20003','珠海旗艦店','2025-07-03',3200,2880,2880,OrderStatus.PROMOTED,'2025-07-03 07:40:00',undefined,[0,1,2],0,null),
  genOrder('114','ORD20250702114','ALG003','盤活復甦·全時段推廣',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.HOT_REVIVE_AD,1,'G10002','閃蜂餐飲連鎖','S20004','黑沙環店','2025-07-02',7000,6300,6300,OrderStatus.PROMOTED,'2025-07-02 06:20:00','2025-07-02 06:25:00',[0,1,2,3,4,0,1],0,null,6300),
  genOrder('115','ORD20250701115','ALG003','盤活復甦·閃購特惠',AppType.SHANFENG,RecommendChannel.DELIVERY,6,RecommendType.HOT_REVIVE_AD,5,'G10003','大灣區餐飲集團','S20005','新馬路店','2025-07-01',3800,3420,3420,OrderStatus.PROMOTED,'2025-07-01 10:05:00','2025-07-01 10:10:00',[0,1,2],0,null,3420),
]

/* ---- 新店廣告 Mock ---- */
function genNewStoreOrder(
  id: string, orderNo: string, app: AppType, channel: RecommendChannel,
  region: number | number[], status: OrderStatus, groupName: string, storeName: string,
  purchaseDays: string[], orderTime: string, payTime?: string,
): OrderItem {
  const pDays = purchaseDays
  const regionName = (REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region] ? i18n.t(REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region]) : '未知')
  return {
    id, orderNo, algorithmId: 'ALG-NS001', promotionName: '新店廣告·開業推廣',
    app, channel, region, recommendType: RecommendType.NEW_STORE_AD,
    slotPosition: 1, groupId: 'G10001', groupName, storeId: 'S-NS' + id, storeName,
    purchaseDate: pDays[0], originalPrice: 0, discountPrice: 0, actualPrice: 0,
    status, orderTime, payTime, slotPrices: [], gradientDiscount: null,
    cancelFeeRules: [], promoData: genNewStorePromoData(regionName, pDays),
    purchaseDays: pDays, refundEnabled: true, promoStartDate: '2026-07-16',
    ...(TERMINAL_STATUSES.includes(status)
      ? { ...genTerminalInfo(id, orderTime), terminalActor: 'staff' as const }
      : (status === OrderStatus.PROMOTED ? { terminalTime: `${pDays[pDays.length - 1]} 22:10:30` } : {})),
  }
}

const newStoreOrders: OrderItem[] = [
  genNewStoreOrder('201','ORD20250716201',AppType.SHANFENG,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTING,'澳門美食集團','澳門總店',['2026-07-16','2026-07-17','2026-07-18'],'2025-07-16 10:30:00','2025-07-16 10:35:00'),
  genNewStoreOrder('202','ORD20250715202',AppType.MFOOD,RecommendChannel.DELIVERY,3,OrderStatus.PENDING_PROMOTION,'閃蜂餐飲連鎖','氹仔分店',['2026-07-15','2026-07-16','2026-07-17'],'2025-07-15 14:20:00','2025-07-15 14:25:00'),
  genNewStoreOrder('203','ORD20250714203',AppType.SHANFENG,RecommendChannel.GROUP_BUY,6,OrderStatus.PROMOTED,'大灣區餐飲集團','珠海旗艦店',['2025-06-20','2025-06-21','2025-06-22'],'2025-07-14 09:15:00',undefined),
  genNewStoreOrder('204','ORD20250713204',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,OrderStatus.PROMOTED,'澳門美食集團','黑沙環店',['2025-06-18','2025-06-19','2025-06-20','2025-06-21'],'2025-07-13 16:40:00','2025-07-13 16:45:00'),
  genNewStoreOrder('205','ORD20250712205',AppType.SHANFENG,RecommendChannel.DELIVERY,3,OrderStatus.PROMOTING,'閃蜂餐飲連鎖','新馬路店',['2026-07-12','2026-07-13','2026-07-14'],'2025-07-12 11:20:00',undefined),
  genNewStoreOrder('206','ORD20250711206',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,OrderStatus.PENDING_PROMOTION,'大灣區餐飲集團','澳門總店',['2026-07-11','2026-07-12'],'2025-07-11 08:30:00','2025-07-11 08:35:00'),
  genNewStoreOrder('207','ORD20250710207',AppType.SHANFENG,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTED,'澳門美食集團','氹仔分店',['2025-06-22','2025-06-23','2025-06-24'],'2025-07-10 10:15:00','2025-07-10 10:20:00'),
  genNewStoreOrder('208','ORD20250709208',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,OrderStatus.PROMOTED,'閃蜂餐飲連鎖','珠海旗艦店',['2025-06-25','2025-06-26'],'2025-07-09 15:45:00',undefined),
  genNewStoreOrder('209','ORD20250708209',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,OrderStatus.PENDING_PROMOTION,'大灣區餐飲集團','黑沙環店',['2026-07-08','2026-07-09','2026-07-10'],'2025-07-08 09:20:00','2025-07-08 09:25:00'),
  genNewStoreOrder('210','ORD20250707210',AppType.MFOOD,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTING,'澳門美食集團','新馬路店',['2026-07-07','2026-07-08','2026-07-09','2026-07-10'],'2025-07-07 20:10:00','2025-07-07 20:15:00'),
  // 5天推廣期（當天±2天）- 覆蓋所有狀態
  genNewStoreOrder('211','ORD20260723211',AppType.SHANFENG,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTING,'新澳茶餐廳','黑沙環旗艦店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-20 10:00:00','2026-07-20 10:05:00'),
  genNewStoreOrder('212','ORD20260723212',AppType.MFOOD,RecommendChannel.GROUP_BUY,3,OrderStatus.PENDING_PROMOTION,'灣仔海鮮坊','氹仔新店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-20 14:30:00','2026-07-20 14:35:00'),
  genNewStoreOrder('213','ORD20260723213',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,OrderStatus.PROMOTED,'珠海美食居','珠海旗艦店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-18 09:00:00','2026-07-18 09:10:00'),
  genNewStoreOrder('214','ORD20260723214',AppType.MFOOD,RecommendChannel.DELIVERY,4,OrderStatus.CANCELLED,'澳門甜品屋','高士德新店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-19 11:00:00','2026-07-19 11:05:00'),
  genNewStoreOrder('215','ORD20260723215',AppType.SHANFENG,RecommendChannel.DELIVERY,2,OrderStatus.ABORTED,'新澳茶餐廳','新馬路旗艦店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-17 16:00:00','2026-07-17 16:10:00'),
]

/* ---- 人氣商家 Mock ---- */
// 生成連續購買日期（起始日 + 天數）
function genPopularDays(startDate: string, days: number): string[] {
  const start = new Date(startDate)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

// 人氣商家訂單：皮膚套件按天計價（參考盤活復蘇按天模式），滿7天享95折梯度；付費購買，支持退款
function genPopularOrder(
  id: string, orderNo: string, algoId: string, promoName: string,
  app: AppType, channel: RecommendChannel, region: number, slotPos: number,
  gid: string, gname: string, sid: string, sname: string,
  skinName: string, pricePerDay: number, startDate: string, days: number,
  status: OrderStatus, otime: string, ptime?: string,
  refundAmt?: number,
): OrderItem {
  const pDays = genPopularDays(startDate, days)
  const slotPrices: SlotPriceItem[] = pDays.map((date, i) => ({
    slot: `Day${i + 1}`, date, originalPrice: pricePerDay, discount: 10, actualPrice: pricePerDay, region,
  }))
  const originalPrice = pricePerDay * days
  const actualPrice = days >= 7 ? Math.round(originalPrice * 0.95) : originalPrice
  const regionName = (REGION_LABEL_KEY[region] ? i18n.t(REGION_LABEL_KEY[region]) : '未知')
  // 推廣中：僅已推廣日期產生數據；已完成：全部日期；待推廣/已退款：無數據
  const today = new Date().toISOString().split('T')[0]
  const promoData = status === OrderStatus.PROMOTED
    ? genRevivePromoData(regionName, slotPrices)
    : status === OrderStatus.PROMOTING
      ? genRevivePromoData(regionName, slotPrices.filter(sp => sp.date <= today))
      : undefined
  // 退款規則（與盤活復蘇一致）
  const cancelFeeRules = [
    { maxDays: 0, feePercent: 100 },
    { maxDays: 3, feePercent: 80 },
    { maxDays: 7, feePercent: 50 },
  ]
  return {
    id, orderNo, algorithmId: algoId, promotionName: promoName, app, channel, region,
    recommendType: RecommendType.POPULAR_MERCHANT_KA, slotPosition: slotPos,
    groupId: gid, groupName: gname, storeId: sid, storeName: sname, skinName,
    purchaseDate: otime.split(' ')[0], originalPrice,
    discountPrice: actualPrice, actualPrice, status, orderTime: otime, payTime: ptime,
    promoStartDate: pDays[0], purchaseDays: pDays,
    slotPrices, gradientDiscount: days >= 7 ? { count: 7, discount: 9.5 } : null,
    cancelFeeRules, promoData, refundEnabled: true,
    ...(refundAmt !== undefined ? { refundAmount: refundAmt } : {}),
    ...(status === OrderStatus.REFUNDED
      ? { ...genTerminalInfo(id, otime), terminalActor: 'staff' as const }
      : (status === OrderStatus.PROMOTED ? { terminalTime: `${pDays[pDays.length - 1]} 22:10:30` } : {})),
  }
}

// 與訂單列表一致的15條人氣商家訂單（待推廣×4、推廣中×4、已完成×4、已退款×3）
const popularOrders: OrderItem[] = [
  // 推廣中 ×4
  genPopularOrder('301','ORD20260725301','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.DELIVERY,1,1,'G10008','威尼斯人餐飲集團','S30021','威尼斯人酒店','紅運當頭',28,'2026-07-26',7,OrderStatus.PROMOTING,'2026-07-25 10:20:00','2026-07-25 10:21:00'),
  genPopularOrder('305','ORD20260724305','ALG_KA_004','人氣商家-外賣版',AppType.MFOOD,RecommendChannel.DELIVERY,2,2,'G10011','肯德基餐飲集團','S30025','肯德基','碧海藍天',20,'2026-07-25',7,OrderStatus.PROMOTING,'2026-07-24 11:10:00','2026-07-24 11:12:00'),
  genPopularOrder('308','ORD20260726308','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.GROUP_BUY,4,3,'G10012','澳門塔餐飲集團','S30028','澳門塔旋轉餐廳','青峰翡翠',24,'2026-07-27',7,OrderStatus.PROMOTING,'2026-07-26 09:30:00','2026-07-26 09:32:00'),
  genPopularOrder('312','ORD20260723312','ALG_KA_004','人氣商家-外賣版',AppType.MFOOD,RecommendChannel.DELIVERY,5,4,'G10013','高士德飲食集團','S30032','高士德麵家','極光幻彩',36,'2026-07-24',7,OrderStatus.PROMOTING,'2026-07-23 16:05:00','2026-07-23 16:06:00'),
  // 待推廣 ×4
  genPopularOrder('302','ORD20260725302','ALG_KA_004','人氣商家-外賣版',AppType.MFOOD,RecommendChannel.DELIVERY,6,2,'G10009','皇朝飲食集團','S30022','皇朝廣場店','橙意滿滿',18,'2026-07-28',7,OrderStatus.PENDING_PROMOTION,'2026-07-24 15:40:00','2026-07-24 15:42:00'),
  genPopularOrder('304','ORD20260726304','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.DELIVERY,3,1,'G10014','麥當勞餐飲集團','S30024','麥當勞','紫氣東來',22,'2026-08-03',7,OrderStatus.PENDING_PROMOTION,'2026-07-26 14:00:00','2026-07-26 14:02:00'),
  genPopularOrder('309','ORD20260726309','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.GROUP_BUY,8,5,'G10015','巴黎人餐飲集團','S30029','巴黎人法餐廳','粉黛甜心',26,'2026-08-05',7,OrderStatus.PENDING_PROMOTION,'2026-07-26 17:45:00','2026-07-26 17:46:00'),
  genPopularOrder('313','ORD20260727313','ALG_KA_004','人氣商家-外賣版',AppType.MFOOD,RecommendChannel.DELIVERY,1,2,'G10016','黑沙環飲食集團','S30033','黑沙環燒臘','紅運當頭',28,'2026-08-02',7,OrderStatus.PENDING_PROMOTION,'2026-07-27 08:50:00','2026-07-27 08:52:00'),
  // 已完成 ×4
  genPopularOrder('303','ORD20260710303','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.DELIVERY,3,3,'G10010','澳門美食集團','S30023','黑馬仕美食街','金碧輝煌',32,'2026-07-11',7,OrderStatus.PROMOTED,'2026-07-10 09:05:00','2026-07-10 09:06:00'),
  genPopularOrder('306','ORD20260704306','ALG_KA_004','人氣商家-外賣版',AppType.MFOOD,RecommendChannel.SUPERMARKET,10,1,'G10017','新濠餐飲集團','S30026','新濠天地食府','簡約無框',8,'2026-07-05',7,OrderStatus.PROMOTED,'2026-07-04 10:30:00','2026-07-04 10:31:00'),
  genPopularOrder('310','ORD20260705310','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.DELIVERY,9,4,'G10018','銀河餐飲集團','S30030','新馬路茶餐廳','暗夜黑金',30,'2026-07-06',7,OrderStatus.PROMOTED,'2026-07-05 13:20:00','2026-07-05 13:21:00'),
  genPopularOrder('314','ORD20260713314','ALG_KA_004','人氣商家-外賣版',AppType.MFOOD,RecommendChannel.GROUP_BUY,11,5,'G10019','港珠澳飲食集團','S30034','港珠澳漁港','碧海藍天',20,'2026-07-14',7,OrderStatus.PROMOTED,'2026-07-13 19:10:00','2026-07-13 19:11:00'),
  // 已退款 ×3（未推廣即退款，全額退款）
  genPopularOrder('307','ORD20260724307','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.DELIVERY,7,2,'G10020','銀河酒店集團','S30027','銀河酒店餐廳','翠綠生機',20,'2026-08-01',7,OrderStatus.REFUNDED,'2026-07-24 09:40:00','2026-07-24 09:41:00',133),
  genPopularOrder('311','ORD20260725311','ALG_KA_004','人氣商家-外賣版',AppType.MFOOD,RecommendChannel.DELIVERY,6,3,'G10021','氹仔飲食集團','S30031','氹仔小食店','橘光暮色',25,'2026-07-30',7,OrderStatus.REFUNDED,'2026-07-25 11:25:00','2026-07-25 11:26:00',166),
  genPopularOrder('315','ORD20260726315','ALG_KA_001','人氣商家-首頁版',AppType.SHANFENG,RecommendChannel.GROUP_BUY,2,1,'G10022','花城市餐飲集團','S30035','花城市甜品','橙意滿滿',18,'2026-08-04',7,OrderStatus.REFUNDED,'2026-07-26 20:15:00','2026-07-26 20:16:00',119),
]

function getStageIndex(status: OrderStatus): number {
  switch (status) {
    case OrderStatus.PENDING_PROMOTION: return 1
    case OrderStatus.PROMOTING: return 2
    case OrderStatus.PROMOTED: return 3
    case OrderStatus.CANCELLED: return 3
    case OrderStatus.ABORTED: return 3
    case OrderStatus.REFUNDED: return 3
    default: return 0
  }
}

function getStageTime(status: OrderStatus, stageIdx: number, order: OrderItem): string {
  if (stageIdx === 0) return order.orderTime
  if (stageIdx === 1) return order.payTime || ''
  if (stageIdx === 2) return order.promoStartDate ? `${order.promoStartDate} 09:00:00` : ''
  if (stageIdx === 3) {
    return order.terminalTime || ''
  }
  return ''
}

/* ---- 卡片标题组件 ---- */
function CardTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6, background: '#e6f7ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{text}</span>
    </div>
  )
}

/* ---- 主组件 ---- */
export default function OrderDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // 枚舉標籤（依賴 t，定義在組件內以便響應語言切換）
  const statusLabel = (v: OrderStatus) => {
    const map: Partial<Record<OrderStatus, { label: string; color: string }>> = {
      [OrderStatus.PENDING_PROMOTION]: { label: t('promotionOrderManage.statusPending'), color: 'blue' },
      [OrderStatus.PROMOTING]: { label: t('promotionOrderManage.statusPromoting'), color: 'green' },
      [OrderStatus.PROMOTED]: { label: t('promotionOrderManage.statusCompleted'), color: 'purple' },
      [OrderStatus.CANCELLED]: { label: t('promotionOrderManage.statusCancelled'), color: 'red' },
      [OrderStatus.ABORTED]: { label: t('promotionOrderManage.statusAborted'), color: 'orange' },
      [OrderStatus.REFUNDED]: { label: t('promotionOrderManage.statusRefunded'), color: 'red' },
    }
    return map[v] || { label: String(v), color: 'default' }
  }
  const appLabel = (v: AppType) => (v === AppType.SHANFENG ? t('common.flashBee') : 'mFood')
  const channelLabel = (v: RecommendChannel) => ({
    [RecommendChannel.DELIVERY]: t('promotionOrderManage.chDelivery'),
    [RecommendChannel.GROUP_BUY]: t('promotionOrderManage.chGroupBuy'),
    [RecommendChannel.SUPERMARKET]: t('promotionOrderManage.chSupermarket'),
  }[v])
  const recommendTypeLabel = (v: RecommendType) => {
    const map: Partial<Record<RecommendType, string>> = {
      [RecommendType.INVINCIBLE_STAR]: t('promotionReport.recTypeInvincibleStar'),
      [RecommendType.HOT_REVIVE_AD]: t('promotionReport.recTypeHotRevive'),
      [RecommendType.NEW_STORE_AD]: t('promotionReport.recTypeNewStore'),
      [RecommendType.TRAFFIC_AD]: t('promotionReport.recTypeTraffic'),
      [RecommendType.POPULAR_MERCHANT_KA]: t('promotionOrderManage.recTypePopular'),
      [RecommendType.GOLDEN_SIGNBOARD]: t('recommend.algoGoldenSignboard'),
    }
    return map[v] || String(v)
  }
  // 餐段時段名（數據層 key → 展示名，響應語言切換）
  const slotLabel = (v: string) => {
    // 1. 全天
    if (v === '全天' || v === 'All Day') return t('orderDetail.allDay')
    // 2. API 原始 key（breakfast/lunch/afternoon/dinner/supper）→ 直接翻譯
    const keyMap: Record<string, string> = {
      breakfast: t('orderDetail.slotBreakfast'),
      lunch: t('orderDetail.slotLunch'),
      afternoon: t('orderDetail.slotAfternoon'),
      dinner: t('orderDetail.slotDinner'),
      supper: t('orderDetail.slotSupper'),
    }
    if (keyMap[v]) return keyMap[v]
    // 3. 中文標籤（mock 數據 / 已轉換數據）→ 反查 key 再翻譯
    const key = Object.entries(MEAL_SLOT_LABEL).find(([, label]) => label === v)?.[0]
    if (key && keyMap[key]) return keyMap[key]
    // 4. 無法識別 → 原樣返回
    return v
  }
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('id')
  const orderType = searchParams.get('type') || ''
  // 来源标识：透传回訂單列表，保證返回鏈路（廣告銷售 vs 店鋪推廣）不丟失
  const fromSource = searchParams.get('from') || ''
  const backToListPath = `/promotion-order-manage?type=${encodeURIComponent(orderType)}${fromSource ? `&from=${encodeURIComponent(fromSource)}` : ''}`
  const [order, setOrder] = useState<OrderItem | null>(null)
  const [refundModalVisible, setRefundModalVisible] = useState(false)
  const [slotsCollapsed, setSlotsCollapsed] = useState(false)
  const [promoAnimKey, setPromoAnimKey] = useState(0)
  /** 真實訂單後端加載中（初始即為 true，避免首幀閃現「訂單不存在」） */
  const [apiLoading, setApiLoading] = useState(() => {
    const oid = new URLSearchParams(window.location.hash.split('?')[1] || '').get('id')
    return !!oid
  })
  /** 加載失敗原因：not-found=訂單不存在 transient=後端暫不可用/網絡異常 */
  const [loadError, setLoadError] = useState<'not-found' | 'transient' | null>(null)
  /** 重試計數: 臨時失敗時點「重新加載」觸發重新請求 */
  const [retryKey, setRetryKey] = useState(0)

  // 从后端加载真实订单详情（id 即订单号），含计价配置中的退款规则与梯度折扣
  const loadApiOrder = async (orderNo: string): Promise<OrderItem> => {
    const detail = await fetchAdOrderDetail(orderNo)
    let pricing: {
      cancelFeeRules: { maxDays: number; feePercent: number }[]
      refundEnabled: boolean
      discountTiers: { minSlots: number; discount: number }[]
    } | undefined
    try {
      // 按算法類型取對應計價配置：盤活復蘇(3)用 revive 定價，金字招牌(13)用 signboard 定價，其餘用星星定價
      const p = detail.algoType === 3
        ? await fetchAdRevivePricingActive(detail.algoId).catch(() => null)
        : detail.algoType === 13
          ? await fetchAdSignboardPricingActive(detail.algoId).catch(() => null)
          : await fetchAdPricingActive(detail.algoId).catch(() => null)
      if (p) {
        pricing = {
          cancelFeeRules: parseCancelFeeTiers(p.cancelFeeTiers),
          refundEnabled: p.refundEnabled === 1,
          discountTiers: detail.algoType === 3
            ? parseDayDiscountTiers(p.discountTiers)
            : parseDiscountTiers(p.discountTiers),
        }
      }
    } catch {
      // 计价配置缺失时使用默认规则
    }
    return toDetailOrder(detail, pricing)
  }

  useEffect(() => {
    if (!orderId) return
    const local = [...mockOrders, ...newStoreOrders, ...popularOrders].find(o => o.id === orderId)
    if (local) {
      setOrder(local)
      setApiLoading(false)
      return
    }
    // 真實訂單：id 即訂單號，從後端加載（區分加載中 / 訂單不存在 / 臨時失敗）
    let cancelled = false
    setApiLoading(true)
    setLoadError(null)
    loadApiOrder(orderId)
      .then(o => { if (!cancelled) setOrder(o) })
      .catch((err: unknown) => {
        if (cancelled) return
        setOrder(null)
        const msg = err instanceof Error ? err.message : ''
        setLoadError(msg.includes('訂單不存在') ? 'not-found' : 'transient')
      })
      .finally(() => { if (!cancelled) setApiLoading(false) })
    return () => { cancelled = true }
  }, [orderId, retryKey])

  // 计算退款信息
  const refundInfo = useMemo(() => {
    if (!order) return null
    const rules = [...order.cancelFeeRules].sort((a, b) => a.maxDays - b.maxDays)
    const today = new Date()
    const promoStart = order.promoStartDate ? new Date(order.promoStartDate) : null

    // 已退款 → 以退款金額為源，反推扣費比例並匹配到對應規則
    if (order.status === OrderStatus.REFUNDED) {
      const refundAmount = order.refundAmount ?? 0
      const feePercent = order.actualPrice > 0
        ? Math.round((1 - refundAmount / order.actualPrice) * 100)
        : 0
      // 根據扣費比例匹配到對應的規則（feePercent 為0表示超出規則全額退款）
      const matchedRule = rules.find(r => r.feePercent === feePercent) ?? null
      const daysBefore = matchedRule?.maxDays ?? 0
      return { daysBefore, feePercent, refundAmount, matchedRule, isPromoting: false }
    }

    // 推广中或已完成 → 退款金额为0
    if (order.status === OrderStatus.PROMOTING || order.status === OrderStatus.PROMOTED) {
      return { daysBefore: 0, feePercent: 100, refundAmount: 0, matchedRule: null, isPromoting: true }
    }

    // 待推广 → 基于规则计算
    if (promoStart) {
      const diffMs = promoStart.getTime() - today.getTime()
      const daysBefore = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
      // 找到匹配的扣费规则
      let feePercent = 100
      let matchedRule: { maxDays: number; feePercent: number } | null = null
      for (const rule of rules) {
        if (daysBefore <= rule.maxDays) {
          feePercent = rule.feePercent
          matchedRule = rule
          break
        }
      }
      // 如果天数大于所有规则的maxDays，不扣费
      if (daysBefore > rules[rules.length - 1]?.maxDays) {
        feePercent = 0
      }
      const refundAmount = Math.round(order.actualPrice * (1 - feePercent / 100))
      const refundGiftDays = Math.round((order.giftDays ?? 0) * (1 - feePercent / 100))
      return { daysBefore, feePercent, refundAmount, refundGiftDays, matchedRule, isPromoting: false }
    }
    return null
  }, [order])

  if (!order) {
    return (
      <div className="content-area" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {apiLoading ? (
          <Spin size="large" tip={t('orderDetail.loading')}>
            <div style={{ width: 200, height: 80 }} />
          </Spin>
        ) : loadError === 'transient' ? (
          <Result
            status="warning"
            title={t('orderDetail.loadFailed')}
            subTitle={t('orderDetail.loadFailedSub')}
            extra={<Button type="primary" onClick={() => setRetryKey(k => k + 1)}>{t('orderDetail.reload')}</Button>}
          />
        ) : (
          <Empty description={t('orderDetail.notFound')} />
        )}
      </div>
    )
  }

  const statusInfo = statusLabel(order.status)
  const isRefunded = order.status === OrderStatus.REFUNDED
  const isNewStore = order.recommendType === RecommendType.NEW_STORE_AD
  const isPopular = order.recommendType === RecommendType.POPULAR_MERCHANT_KA
  const isRevive = order.recommendType === RecommendType.HOT_REVIVE_AD
  const isGoldenSignboard = order.recommendType === RecommendType.GOLDEN_SIGNBOARD

  /** 金字招牌標籤類型 → 中文翻譯映射 */
  const SIGNBOARD_LABEL_CN: Record<string, { label: string; icon: string; color: string }> = {
    hot: { label: '熱門', icon: '\uD83D\uDD25', color: '#FF4D4F' },
    popular: { label: '人氣', icon: '\uD83D\uDC51', color: '#FAAD14' },
    sales: { label: '銷量', icon: '\uD83D\uDCC8', color: '#1890FF' },
    rating: { label: '好評', icon: '\u2B50', color: '#52C41A' },
    repurchase: { label: '復購', icon: '\uD83D\uDD04', color: '#722ED1' },
    favorites: { label: '收藏', icon: '\u2764\uFE0F', color: '#EB2F96' },
    customers: { label: '顧客數', icon: '\uD83D\uDC65', color: '#13C2C2' },
  }

  // 新店廣告已取消：保留「待推廣 / 推廣中」節點展示，但因未推廣即取消，兩節點以另色標記並打叉
  const isCancelledBeforePromo = isNewStore && order.status === OrderStatus.CANCELLED
  const progressStagesBase = [
    { key: 'ordered', label: t('orderDetail.stageOrdered') },
    { key: 'pending', label: t('orderDetail.stagePending') },
    { key: 'promoting', label: t('orderDetail.stagePromoting') },
    { key: 'done', label: t('orderDetail.stageDone') },
  ]
  const progressStages = isCancelledBeforePromo
    ? [
        { key: 'ordered', label: t('orderDetail.stageOrdered') },
        { key: 'pending', label: t('orderDetail.stagePending') },
        { key: 'promoting', label: t('orderDetail.stagePromoting') },
        { key: 'cancelled', label: t('orderDetail.stageCancelled') },
      ]
    : progressStagesBase
  const lastStageIdx = progressStages.length - 1
  const currentStage = isCancelledBeforePromo ? lastStageIdx : getStageIndex(order.status)
  // 無敵星星 / 盤活復蘇：部分已退款訂單為「未推廣即退款」，待推廣 + 推廣中節點需打叉
  const isRefundedBeforePromo = isRefunded && REFUNDED_BEFORE_PROMO_IDS.has(order.id)
  // 未推廣即結束（已取消 / 未推廣即退款）：待推廣(1)、推廣中(2) 兩節點以叉號 + 另色標記
  const skipStageIdxs: number[] = (isCancelledBeforePromo || isRefundedBeforePromo) ? [1, 2] : []

  // 最後一個節點（終態）的主題色：已完成維持橙色，已退款/已取消/已中止分別區分
  const terminalTheme = (() => {
    switch (order.status) {
      case OrderStatus.REFUNDED:  // 已退款（無敵星星、盤活復蘇）→ 紅色
        return { grad: 'linear-gradient(135deg, #FF4D4F, #FF7875)', main: '#FF4D4F', shadow: 'rgba(255,77,79,', ripple: 'rgba(255,77,79,' }
      case OrderStatus.CANCELLED: // 已取消（新店廣告）→ 灰色
        return { grad: 'linear-gradient(135deg, #8C8C8C, #BFBFBF)', main: '#8C8C8C', shadow: 'rgba(140,140,140,', ripple: 'rgba(140,140,140,' }
      case OrderStatus.ABORTED:   // 已中止（新店廣告）→ 紅色
        return { grad: 'linear-gradient(135deg, #FF4D4F, #FF7875)', main: '#FF4D4F', shadow: 'rgba(255,77,79,', ripple: 'rgba(255,77,79,' }
      default:                    // 已完成（維持橙色）
        return { grad: 'linear-gradient(135deg, #E8720C, #F59432)', main: '#E8720C', shadow: 'rgba(232,114,12,', ripple: 'rgba(232,114,12,' }
    }
  })()

  // 新店廣告：計算每推廣日的狀態
  const getDayStatus = (day: string): OrderStatus => {
    const today = new Date().toISOString().split('T')[0]
    if (order.status === OrderStatus.PROMOTED) return OrderStatus.PROMOTED
    if (order.status === OrderStatus.CANCELLED) {
      return day < today ? OrderStatus.PROMOTED : OrderStatus.CANCELLED
    }
    if (order.status === OrderStatus.ABORTED) {
      return day < today ? OrderStatus.PROMOTED : OrderStatus.ABORTED
    }
    if (order.status === OrderStatus.PROMOTING) {
      if (day < today) return OrderStatus.PROMOTED
      if (day === today) return OrderStatus.PROMOTING
      return OrderStatus.PENDING_PROMOTION
    }
    // PENDING_PROMOTION
    return day < today ? OrderStatus.PROMOTED : OrderStatus.PENDING_PROMOTION
  }

  // 按日期分组时段（普通计算，不用 useMemo，因为已在条件返回之后）
  const slotsByDateMap = new Map<string, SlotPriceItem[]>()
  order.slotPrices.forEach(sp => {
    if (!slotsByDateMap.has(sp.date)) slotsByDateMap.set(sp.date, [])
    slotsByDateMap.get(sp.date)!.push(sp)
  })
  const slotsByDate = Array.from(slotsByDateMap.entries())

  const totalOriginal = order.slotPrices.reduce((s, sp) => s + sp.originalPrice, 0)
  const slotSubtotal = order.slotPrices.reduce((s, sp) => s + sp.actualPrice, 0)
  const gradientMultiplier = order.gradientDiscount ? order.gradientDiscount.discount / 10 : 1
  // finalPrice = 梯度折後總額（贈送抵扣前）；明細已還原為抵扣前口徑，梯度步得出折後總額
  const finalPrice = Math.round(slotSubtotal * gradientMultiplier)
  // 贈送天數抵扣快照：區分純推廣金 / 純贈送抵扣 / 混合支付三種展示
  const giftDays = order.giftDays ?? 0
  const giftAmount = order.giftAmount ?? 0
  // 實付推廣金（贈送抵扣後）
  const actualPaid = Math.max(0, finalPrice - giftAmount)
  const totalSaved = totalOriginal - actualPaid
  // 支付方式检测：直接使用后端存储的 actualAmount 判断，避免 slot 价格反推精度误差
  const payMode: 'promo' | 'gift' | 'mixed' = giftDays > 0 ? (order.actualPrice > 0 ? 'mixed' : 'gift') : 'promo'

  // 已退款：以「實付推廣金額」(actualPaid) 為基準計算退款，保證與費用明細一致，一目了然
  const refundAmountByPaid = Math.round(actualPaid * (1 - (refundInfo?.feePercent ?? 0) / 100))

  const handleRefund = () => {
    setRefundModalVisible(true)
  }

  const confirmRefund = async () => {
    // 真實訂單：調用後端退款/取消接口
    if (order?.source === 'api') {
      try {
        // 新店廣告調用取消接口（狀態→已取消），其它類型調用退款接口（狀態→已退款）
        if (isNewStore) {
          await cancelAdOrder(order.orderNo)
        } else {
          await refundAdOrder(order.orderNo)
        }
        const fresh = await loadApiOrder(order.orderNo)
        setOrder(fresh)
        setRefundModalVisible(false)
        message.success(isNewStore ? t('orderDetail.cancelSuccess') : t('orderDetail.refundSuccess'))
      } catch (err) {
        message.error((err as Error).message || (isNewStore ? t('orderDetail.cancelFail') : t('orderDetail.refundFail')))
      }
      return
    }
    const newStatus = isNewStore ? OrderStatus.CANCELLED : OrderStatus.PROMOTED
    setOrder(prev => prev ? { ...prev, status: newStatus } : null)
    setRefundModalVisible(false)
    message.success(isNewStore ? t('orderDetail.cancelSuccess') : t('orderDetail.refundSuccessShort'))
  }

  return (
    <div className="content-area">
      {/* 顶部导航栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* 顶部渐变装饰线 */}
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          {/* 左侧：返回 + 标题 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate(backToListPath)}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common.back')}</Button>
            {/* 分隔线 */}
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            {/* 标题区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('orderDetail.detailTitle')}</h2>
              <Tag color={statusInfo.color} style={{
                fontSize: 12, padding: '2px 10px', borderRadius: 4,
                fontWeight: 500, animation: 'statusPulse 2.5s ease-in-out infinite',
                margin: 0,
              }}>{statusInfo.label}</Tag>
            </div>
          </div>
        </div>
      </div>

      {/* 订单状态流程 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 32px 20px', animation: 'headerFadeSlideIn 0.5s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {progressStages.map((stage, idx) => {
              const isPast = idx < currentStage
              const isCurrent = idx === currentStage
              const isFuture = idx > currentStage
              const isSkip = skipStageIdxs.includes(idx)
              const stageTime = isSkip ? '' : getStageTime(order.status, idx, order)
              // 終態節點（已退款/已取消/已中止）：展示發起方信息（業務人員：姓名+工號；商家：門店名稱+ID）
              const isTerminalNode = idx === lastStageIdx && TERMINAL_STATUSES.includes(order.status)
              const isMerchantActor = order.terminalActor === 'merchant'
              const showActor = isTerminalNode && (isMerchantActor ? !!order.storeName : !!order.operatorName)
              const terminalActionWord = order.status === OrderStatus.REFUNDED ? t('orderDetail.actionRefund')
                : order.status === OrderStatus.CANCELLED ? t('orderDetail.actionCancel')
                : order.status === OrderStatus.ABORTED ? t('orderDetail.actionAbort') : ''
              const terminalActorTypeLabel = (isMerchantActor ? t('orderDetail.actorMerchant') : t('orderDetail.actorStaff')) + terminalActionWord

              /** 阶段图标 */
              const stageIcon = () => {
                if (isSkip) return <CloseOutlined style={{ fontSize: 15, color: '#fff' }} />
                if (isRefunded && idx === lastStageIdx) return <RollbackOutlined style={{ fontSize: 15, color: '#fff' }} />
                if (isPast) return <CheckOutlined style={{ fontSize: 15, color: '#fff' }} />
                if (isCurrent) return (
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', background: '#fff',
                    animation: 'nodeBreath 1.5s ease-in-out infinite',
                  }} />
                )
                return <ClockCircleOutlined style={{ fontSize: 14, color: '#BFBFBF' }} />
              }

              /** 阶段背景渐变 */
              const nodeBg = isSkip
                ? 'linear-gradient(135deg, #FF7875, #FFA39E)'
                : isPast
                  ? 'linear-gradient(135deg, #52C41A, #73D13D)'
                  : isCurrent
                    ? terminalTheme.grad
                    : '#fff'

              return (
                <div key={stage.key} style={{
                  display: 'flex', alignItems: 'flex-start',
                  flex: idx < lastStageIdx ? 1 : 'none',
                }}>
                  {/* 阶段节点 + 标签 */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    minWidth: 90, position: 'relative',
                  }}>
                    {/* 圆形节点 */}
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: nodeBg,
                      border: isFuture ? '2px solid #E8E8E8' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isCurrent
                        ? `0 0 0 4px ${terminalTheme.shadow}0.12), 0 2px 8px ${terminalTheme.shadow}0.25)`
                        : isSkip
                          ? '0 2px 6px rgba(255,77,79,0.25)'
                          : isPast
                            ? '0 2px 6px rgba(82,196,26,0.25)'
                            : '0 1px 3px rgba(0,0,0,0.06)',
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                      zIndex: 2,
                      animation: isCurrent
                        ? 'nodeBreath 2s ease-in-out infinite'
                        : (idx === currentStage + 1 ? 'nextNodeReact 2s ease-in-out infinite' : 'none'),
                    }}>
                      {stageIcon()}
                    </div>
                    {/* 阶段标签 */}
                    <div style={{
                      marginTop: 10, fontSize: 13,
                      fontWeight: isCurrent ? 700 : (isSkip || isPast) ? 600 : 400,
                      color: isSkip ? '#FF4D4F' : isPast ? '#52C41A' : isCurrent ? terminalTheme.main : '#8C8C8C',
                      whiteSpace: 'nowrap', transition: 'color 0.3s',
                      animation: isCurrent ? 'nodeBreath 2s ease-in-out infinite' : 'none',
                      textShadow: isCurrent ? `0 0 8px ${terminalTheme.ripple}0.3)` : 'none',
                    }}>
                      {idx === lastStageIdx
                        ? (isRefunded ? t('promotionOrderManage.statusRefunded')
                          : order.status === OrderStatus.CANCELLED ? t('promotionOrderManage.statusCancelled')
                          : order.status === OrderStatus.ABORTED ? t('promotionOrderManage.statusAborted')
                          : stage.label)
                        : stage.label}
                    </div>
                    {/* 时间信息 */}
                    {stageTime && (
                      <div style={{
                        fontSize: 11, color: '#8C8C8C',
                        whiteSpace: 'nowrap', textAlign: 'center',
                        padding: '2px 8px', background: '#FAFAFA',
                        borderRadius: 4, marginTop: 6,
                      }}>
                        {stageTime}
                      </div>
                    )}
                    {/* 發起方信息（終態節點：已退款/已取消/已中止） */}
                    {showActor && (
                      <div style={{
                        marginTop: 6, textAlign: 'center', whiteSpace: 'nowrap',
                        padding: '3px 10px', background: '#FFF1F0',
                        border: '1px solid #FFCCC7', borderRadius: 4,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#cf1322', marginBottom: 2 }}>
                          {terminalActorTypeLabel}
                        </div>
                        {isMerchantActor ? (
                          <>
                            <div style={{ fontSize: 11, color: '#595959' }}>
                              {t('orderDetail.storeLabel', { name: order.storeName })}
                            </div>
                            <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                              {t('orderDetail.storeIdLabel', { id: order.storeId })}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 11, color: '#595959' }}>
                              {t('orderDetail.operatorLabel', { name: order.operatorName })}
                            </div>
                            <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                              {t('orderDetail.empIdLabel', { id: order.operatorId })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {/* 当前阶段波纹动效 */}
                    {isCurrent && (
                      <>
                        {/* 波纹 1 - 从节点边缘向外扩散 */}
                        <div style={{
                          position: 'absolute', top: -4, left: '50%',
                          width: 46, height: 46, borderRadius: '50%',
                          border: `2px solid ${terminalTheme.ripple}0.35)`,
                          marginLeft: -23,
                          animation: 'rippleExpand 2s ease-out infinite',
                          pointerEvents: 'none',
                        }} />
                        {/* 波纹 2（延迟） */}
                        <div style={{
                          position: 'absolute', top: -4, left: '50%',
                          width: 46, height: 46, borderRadius: '50%',
                          border: `2px solid ${terminalTheme.ripple}0.25)`,
                          marginLeft: -23,
                          animation: 'rippleExpand 2s ease-out infinite 0.8s',
                          pointerEvents: 'none',
                        }} />
                      </>
                    )}
                  </div>
                  {/* 连接线 */}
                  {idx < lastStageIdx && (
                    <div style={{
                      flex: 1, height: 3, marginTop: 18, minWidth: 32,
                      background: skipStageIdxs.length > 0
                        ? '#F0F0F0'
                        : idx < currentStage
                          ? 'linear-gradient(90deg, #52C41A, #73D13D)'
                          : idx === currentStage
                            ? 'linear-gradient(90deg, #E8720C, #F59432)'
                            : '#F0F0F0',
                      borderRadius: 2,
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      {/* 当前阶段前进动画线条 */}
                      {idx === currentStage && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%',
                          width: '40%', borderRadius: 2,
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                          animation: 'progressShimmer 2s ease-in-out infinite',
                        }} />
                      )}
                      {/* 下一阶段连接线渐变流动 */}
                      {idx === currentStage && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%',
                          width: '50%', borderRadius: 2,
                          background: 'linear-gradient(90deg, transparent, rgba(232,114,12,0.5), rgba(245,148,50,0.3), transparent)',
                          animation: 'lineGlow 2s ease-in-out infinite',
                        }} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab 切换区域 */}
      <div style={{
        background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden', marginBottom: 16,
      }}>
        <Tabs
          defaultActiveKey="orderInfo"
          onChange={(key) => { if (key === 'promoData') setPromoAnimKey(k => k + 1) }}
          style={{ padding: '0 24px' }}
          items={[
            {
              key: 'orderInfo',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <FileTextOutlined style={{ color: '#1890ff' }} /> {t('orderDetail.tabOrderInfo')}
                </span>
              ),
              children: (
                <div style={{ padding: '8px 0 0' }}>
                  {/* 购买商家信息 */}
                  <Card title={<CardTitle icon={<ShopOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text={t('orderDetail.buyMerchantInfo')} />}
                    style={{ marginBottom: 16, borderRadius: 8, border: 'none' }} styles={{ body: { padding: '16px 24px' } }}>
        <Descriptions column={2} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
          <Descriptions.Item label={t('orderDetail.colGroup')}>
            <span>{order.groupName}</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('orderDetail.idSuffix', { id: order.groupId })}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('orderDetail.colStore')}>
            <span>{order.storeName}</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('orderDetail.idSuffix', { id: order.storeId })}</span>
          </Descriptions.Item>
        </Descriptions>
                  </Card>

                  {/* 订单信息 */}
      <Card title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CardTitle icon={<FileTextOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text={t('orderDetail.orderInfo')} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', background: '#FFF7E6',
            borderRadius: 4, border: '1px solid #FFD591',
            marginLeft: 4,
          }}>
            <span style={{ fontSize: 11, color: '#E8720C', fontWeight: 600 }}>{t('orderDetail.orderNo')}</span>
            <span style={{ fontSize: 13, color: '#262626', fontWeight: 700, letterSpacing: 0.5 }}>
              {order.orderNo}
            </span>
          </div>
        </div>
      }
        style={{ marginBottom: 16, borderRadius: 8, border: 'none' }} styles={{ body: { padding: '16px 24px' } }}>
        <Descriptions column={3} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
          <Descriptions.Item label={t('orderDetail.colAdType')}>
            <Tag color="gold">{RECOMMEND_TYPE_ICON[order.recommendType]} {recommendTypeLabel(order.recommendType)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('common.colBrand')}>{appLabel(order.app)}</Descriptions.Item>
          <Descriptions.Item label={t('common.colChannel')}>{channelLabel(order.channel)}</Descriptions.Item>
          <Descriptions.Item label={isPopular ? '配置ID' : t('orderDetail.colAlgorithmId')}>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{order.algorithmId}</span>
          </Descriptions.Item>
          <Descriptions.Item label={isPopular ? '人氣名稱' : t('orderDetail.colAlgorithmName')}>{order.promotionName}</Descriptions.Item>
          {order.skinName && (
            <Descriptions.Item label={isGoldenSignboard ? '購買標籤' : t('orderDetail.skinKit')}>
              {isGoldenSignboard && SIGNBOARD_LABEL_CN[order.skinName] ? (
                <Tag color={SIGNBOARD_LABEL_CN[order.skinName].color}>
                  {SIGNBOARD_LABEL_CN[order.skinName].icon} {SIGNBOARD_LABEL_CN[order.skinName].label}
                </Tag>
              ) : (
                <Tag color="geekblue">{order.skinName}</Tag>
              )}
            </Descriptions.Item>
          )}
        </Descriptions>
                  </Card>

                  {/* 购买时段与价格明细 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => setSlotsCollapsed(!slotsCollapsed)}>
            <CardTitle icon={<DollarOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text={isNewStore ? t('orderDetail.slotTitleNewStore') : (isPopular || isRevive) ? t('orderDetail.slotTitlePopular') : isGoldenSignboard ? t('orderDetail.slotTitleGoldenSignboard') : t('orderDetail.slotTitleStar')} />
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>
              {slotsCollapsed ? <RightOutlined /> : <DownOutlined />}
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{slotsCollapsed ? t('orderDetail.expand') : t('orderDetail.collapse')}</span>
          </div>
        }
        style={{ marginBottom: 16, borderRadius: 8, border: 'none' }} styles={{ body: { padding: slotsCollapsed ? '0 24px' : '16px 24px' } }}>

        {!slotsCollapsed && (<>
        {/* 无敌星星：按日期分组，每天展示商圈、时段、原价、折扣、折后价 */}
        {order.recommendType === RecommendType.INVINCIBLE_STAR && slotsByDate.map(([date, slots]) => (
          <div key={date} style={{
            border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden',
          }}>
            <div style={{
              background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
              fontSize: 13, fontWeight: 600, color: '#262626',
            }}>
              {date}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('promotionOrderManage.colRegion')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colSlot')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colOriginalPrice')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colDiscount')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colFinalPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // 按商圈分组，同一商圈的时段连续排列并用 rowSpan 合并
                  const defaultRegion = Array.isArray(order.region) ? order.region[0] : order.region
                  const regionGroups: { region: number; slots: typeof slots }[] = []
                  const regionMap = new Map<number, typeof slots>()
                  slots.forEach(sp => {
                    const r = sp.region ?? defaultRegion
                    if (!regionMap.has(r)) {
                      regionMap.set(r, [])
                      regionGroups.push({ region: r, slots: regionMap.get(r)! })
                    }
                    regionMap.get(r)!.push(sp)
                  })
                  let rowIdx = 0
                  return regionGroups.map(({ region: r, slots: rSlots }) => {
                    return rSlots.map((sp, si) => {
                      const idx = rowIdx++
                      return (
                        <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid #f0f0f0' : 'none' }}>
                          {si === 0 && (
                            <td rowSpan={rSlots.length} style={{
                              padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                              background: '#FAFAFA', borderRight: '1px solid #f0f0f0',
                            }}>
                              <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[r])}</Tag>
                            </td>
                          )}
                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>{slotLabel(sp.slot)}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                            {sp.discount < 10 ? <Tag color="green">{t('orderDetail.discountFold', { n: sp.discount })}</Tag> : <span style={{ color: '#8C8C8C' }}>{t('orderDetail.noDiscount')}</span>}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>
                        </tr>
                      )
                    })
                  })
                })()}
              </tbody>
            </table>
          </div>
        ))}

        {/* 盘活复苏/人氣商家（按天計價）：单商圈，商圈为标题，下方平铺推广日期 */}
        {(order.recommendType === RecommendType.HOT_REVIVE_AD || isPopular) && (() => {
          const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
          return (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                fontSize: 13, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {isPopular ? (
                  <>
                    {/* 人氣商家：商圈與皮膚套件分屬不同維度，各自加字段標籤前綴並用豎線分隔，避免混淆 */}
                    <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.investRegion')}</span>
                    <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
                    {order.skinName && (
                      <>
                        <span style={{ width: 1, height: 14, background: '#E0E0E0' }} />
                        <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.skinKit')}</span>
                        <Tag style={{ margin: 0, color: '#E8720C', background: '#FFF7E6', borderColor: '#FFD591' }}>🎨 {order.skinName}</Tag>
                      </>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.skinDailyNote')}</span>
                  </>
                ) : (
                  <>
                    {/* 盤活復蘇：同樣標註投放商圈字段前綴，與人氣商家保持一致 */}
                    <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.investRegion')}</span>
                    <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
                  </>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  {isPopular ? (
                    <>
                      <col style={{ width: '30%' }} />
                      <col style={{ width: '30%' }} />
                      <col style={{ width: '40%' }} />
                    </>
                  ) : (
                    <>
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '30%' }} />
                    </>
                  )}
                </colgroup>
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{(isPopular || isRevive) ? t('orderDetail.promoDate') : t('orderDetail.colSlot')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{isPopular ? t('orderDetail.dailyPrice') : isRevive ? t('orderDetail.dayPrice') : t('orderDetail.colOriginalPrice')}</th>
                    {!isPopular && <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colDiscount')}</th>}
                    {!isPopular && <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colFinalPrice')}</th>}
                    {isPopular && <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoStatus')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {order.slotPrices.map((sp, i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                      <td style={{ padding: '8px 16px', textAlign: 'center' }}>{(isPopular || isRevive) ? sp.date : slotLabel(sp.slot)}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                      {!isPopular && <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                        {sp.discount < 10 ? <Tag color="green">{t('orderDetail.discountFold', { n: sp.discount })}</Tag> : <span style={{ color: '#8C8C8C' }}>{t('orderDetail.noDiscount')}</span>}
                      </td>}
                      {!isPopular && <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>}
                      {isPopular && (() => {
                        const dayStatus = getDayStatus(sp.date)
                        return (
                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                            <Tag color={statusLabel(dayStatus).color} style={{ margin: 0 }}>
                              {statusLabel(dayStatus).label}
                            </Tag>
                          </td>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 新店廣告：推廣商圈與日期（無價格） */}
        {isNewStore && (() => {
          const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
          return (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                fontSize: 13, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {/* 新店廣告：同樣標註投放商圈字段前綴，與人氣商家保持一致 */}
                <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.investRegion')}</span>
                <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoDate')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.deductDays')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.purchaseDays || []).map((day, i) => {
                    const dayStatus = getDayStatus(day)
                    return (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>{day}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>1</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                          <Tag color={statusLabel(dayStatus).color} style={{ margin: 0 }}>
                            {statusLabel(dayStatus).label}
                          </Tag>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 金字招牌：標籤類型 + 購買日期與價格 */}
        {isGoldenSignboard && (() => {
          const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
          const labelCfg = order.skinName ? SIGNBOARD_LABEL_CN[order.skinName] : null
          return (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                fontSize: 13, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.investRegion')}</span>
                <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
                {labelCfg && (
                  <>
                    <span style={{ width: 1, height: 14, background: '#E0E0E0' }} />
                    <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.skinKit')}</span>
                    <Tag style={{ margin: 0, color: labelCfg.color, background: `${labelCfg.color}10`, borderColor: `${labelCfg.color}40` }}>
                      {labelCfg.icon} {labelCfg.label}
                    </Tag>
                  </>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '35%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '35%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoDate')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.dailyPrice')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.slotPrices.map((sp, i) => {
                    const dayStatus = getDayStatus(sp.date)
                    return (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>{sp.date}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                          <Tag color={statusLabel(dayStatus).color} style={{ margin: 0 }}>
                            {statusLabel(dayStatus).label}
                          </Tag>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 費用明細（新店廣告：贈送天數抵扣，無現金支付） */}
        {isNewStore && (() => {
          const days = order.purchaseDays || []
          const deductDays = days.length
          return (
            <div style={{
              padding: '20px', background: 'linear-gradient(135deg, #FFF9F0, #FFF4E6)', borderRadius: 12,
              border: '1px solid #FFE0B2',
            }}>
              {/* 标题 */}
              <div style={{ fontSize: 14, fontWeight: 700, color: '#E8720C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>💰</span> {t('orderDetail.feeDetail')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* 推廣天數 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{t('orderDetail.promoDays')}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('orderDetail.daysUnit', { count: deductDays })}</span>
                  {deductDays > 0 && (
                    <span style={{ fontSize: 11, color: '#BFBFBF' }}>{t('orderDetail.dateRangeTip', { start: days[0], end: days[deductDays - 1] })}</span>
                  )}
                </div>

                {/* 分隔线 */}
                <div style={{ height: 1, background: '#FFE0B2', margin: '4px 0' }} />

                {/* 使用抵扣天數 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{t('orderDetail.useDeductDays')}</span>
                    <span style={{ fontSize: 11, color: '#8C8C8C' }}>{t('orderDetail.deductRule')}</span>
                  </div>
                  <div style={{
                    padding: '6px 20px', background: 'linear-gradient(135deg, #E8720C, #F59432)',
                    borderRadius: 8, boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
                  }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{t('orderDetail.daysUnit', { count: deductDays })}</span>
                  </div>
                </div>
              </div>

              {/* 计算公式详解 */}
              <div style={{
                marginTop: 16, padding: '10px 14px', background: '#fff', borderRadius: 8,
                border: '1px dashed #FFD591', fontSize: 12, color: '#8C8C8C', lineHeight: 2,
              }}>
                <div style={{ fontWeight: 600, color: '#595959', marginBottom: 4 }}>{t('orderDetail.calcFormula')}</div>
                {t('orderDetail.perDayCalc', { count: deductDays })}<strong style={{ color: '#E8720C' }}>{deductDays}</strong>
                <span style={{ color: '#BFBFBF' }}>{t('orderDetail.dayUnit')}</span>
              </div>
            </div>
          )
        })()}

        {/* 费用汇总 */}
        {!isNewStore && <div style={{
          padding: '20px', background: 'linear-gradient(135deg, #FFF9F0, #FFF4E6)', borderRadius: 12,
          border: '1px solid #FFE0B2',
        }}>
          {/* 标题 */}
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E8720C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>💰</span> {t('orderDetail.feeDetail')}
            {/* 盤活復蘇/人氣商家：標註支付方式（純推廣金 / 純贈送抵扣 / 混合支付） */}
            {(isRevive || isPopular) && (
              <Tag color={payMode === 'gift' ? 'orange' : payMode === 'mixed' ? 'green' : 'gold'} style={{ margin: 0, fontSize: 11, borderRadius: 4, padding: '0 8px', lineHeight: '20px' }}>
                {payMode === 'gift' ? t('orderDetail.payModeGift') : payMode === 'mixed' ? t('orderDetail.payModeMixed') : t('orderDetail.payModePromo')}
              </Tag>
            )}
          </div>

          {/* 分步计算 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 第1步：时段小计 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{(isPopular || isRevive) ? t('orderDetail.step1DailyTotal') : t('orderDetail.step1SlotTotal')}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>MOP {totalOriginal}</span>
            </div>

            {/* ② 梯度折扣（所有訂單類型統一展示，固定第二步） */}
            {!order.gradientDiscount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'②'} {t('orderDetail.gradientDiscountLabel')}</span>
                <span style={{ fontSize: 13, color: '#8C8C8C' }}>{t('orderDetail.noDiscount')}</span>
              </div>
            )}

            {order.gradientDiscount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'②'} {t('orderDetail.gradientDiscountLabel')}</span>
                <span style={{ fontSize: 13, color: '#595959' }}>
                  {t('orderDetail.gradientRulePrefix', { count: order.gradientDiscount.count, unit: (isPopular || isRevive) ? t('orderDetail.daysSuffix') : t('orderDetail.slotsSuffix') })} <strong style={{ color: '#E8720C' }}>{order.gradientDiscount.discount}{t('orderDetail.foldSuffix')}</strong>
                </span>
              </div>
            )}

            {/* ③ 訂單優惠（折扣金額，無折扣時顯示 0） */}
            {!isNewStore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'③'} {t('orderDetail.orderDiscountLabel')}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fa8c16' }}>
                  {order.gradientDiscount ? `MOP ${totalOriginal - finalPrice}` : 'MOP 0'}
                </span>
              </div>
            )}

            {/* ④ 折後價格（所有訂單類型統一展示） */}
            {!isNewStore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'④'} {t('orderDetail.step3FinalPrice')}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#E8720C' }}>MOP {order.gradientDiscount ? finalPrice : totalOriginal}</span>
                {(order.gradientDiscount ? totalSaved > 0 : false) && (
                  <span style={{ fontSize: 11, color: '#52C41A', background: '#F6FFED', padding: '1px 8px', borderRadius: 4, border: '1px solid #B7EB8F' }}>
                    {t('orderDetail.savedAmount', { amount: totalSaved })}
                  </span>
                )}
              </div>
            )}



            {/* 分隔线 */}
            <div style={{ height: 1, background: '#FFE0B2', margin: '4px 0' }} />

            {/* 混合支付：贈送天數抵扣 + 抵扣現金（獨立展示） */}
            {payMode === 'mixed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 使用赠送天数抵扣 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{t('orderDetail.giftDeductDaysLabel')}</span>
                    <span style={{ fontSize: 11, color: '#8C8C8C' }}>{t('orderDetail.giftDeductTip', { days: giftDays })}</span>
                  </div>
                  <div style={{
                    padding: '4px 16px', background: '#FFF7E6', border: '1px solid #FFD591',
                    borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
                  </div>
                </div>
                {/* 赠送天数抵扣现金（仅人气商家定价配置了现金价值） */}
                {isPopular && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{t('orderDetail.giftDeductCashLabel')}</span>
                  </div>
                  <div style={{
                    padding: '4px 16px', background: '#FFF7E6', border: '1px solid #FFD591',
                    borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#E8720C' }}>MOP {giftAmount}</span>
                  </div>
                </div>}
              </div>
            )}

            {/* 最终实付 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{payMode === 'gift' ? t('orderDetail.giftDeductLabel') : t('orderDetail.actualPaid')}</span>
                {payMode !== 'gift' && <span style={{ fontSize: 11, color: '#8C8C8C' }}>
                  {order.gradientDiscount
                    ? ((isPopular || isRevive)
                      ? t(order.gradientDiscount.count > order.slotPrices.length ? 'orderDetail.paidCalcDetailNoGrad' : 'orderDetail.paidCalcDetailGrad', { count: order.slotPrices.length, discount: order.gradientDiscount.discount })
                      : t(order.gradientDiscount.count > order.slotPrices.length ? 'orderDetail.paidCalcSlotNoGrad' : 'orderDetail.paidCalcSlotGrad', { count: order.slotPrices.length, discount: order.gradientDiscount.discount }))
                    : ((isPopular || isRevive) ? t('orderDetail.paidCalcDetail', { count: order.slotPrices.length }) : t('orderDetail.paidCalcSlot', { count: order.slotPrices.length }))
                  }
                </span>}
              </div>
              {payMode === 'gift' ? (
                <div style={{
                  padding: '6px 20px', background: 'linear-gradient(135deg, #E8720C, #F59432)',
                  borderRadius: 8, boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
                </div>
              ) : isRefunded ? (
                <div style={{
                  padding: '5px 18px', background: '#FFF7E6', border: '1px solid #FFD591',
                  borderRadius: 8,
                }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#E8720C' }}>MOP {actualPaid}</span>
                </div>
              ) : (
                <div style={{
                  padding: '6px 20px', background: 'linear-gradient(135deg, #E8720C, #F59432)',
                  borderRadius: 8, boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>MOP {actualPaid}</span>
                </div>
              )}
            </div>
          </div>

          {/* 计算公式详解 */}
          <div style={{
            marginTop: 16, padding: '10px 14px', background: '#fff', borderRadius: 8,
            border: '1px dashed #FFD591', fontSize: 12, color: '#8C8C8C', lineHeight: 2,
          }}>
            <div style={{ fontWeight: 600, color: '#595959', marginBottom: 4 }}>{t('orderDetail.calcFormula')}</div>
            {(isPopular || isRevive) ? (
              // 人氣商家/盤活復蘇：按天計價
              <>
                {t('orderDetail.dailyCalc', { count: order.slotPrices.length, price: order.slotPrices[0]?.originalPrice || 0 })}<strong style={{ color: '#262626' }}>{totalOriginal}</strong>
                {order.gradientDiscount && (
                  <> × {order.gradientDiscount.discount / 10} = <strong style={{ color: '#E8720C' }}>{finalPrice}</strong>
                    {giftDays > 0 && (
                      <> → {t('orderDetail.giftDeductShort', { days: giftDays })}
                        {payMode === 'mixed' && isPopular ? (
                          <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong> + <strong style={{ color: '#FF4D4F' }}>MOP {actualPaid}</strong></>
                        ) : (
                          <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong></>
                        )}
                      </>
                    )}
                  </>
                )}
                {!order.gradientDiscount && giftDays > 0 && (
                  <> → {t('orderDetail.giftDeductShort', { days: giftDays })}
                    {payMode === 'mixed' && isPopular ? (
                      <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong> + <strong style={{ color: '#FF4D4F' }}>MOP {actualPaid}</strong></>
                    ) : (
                      <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong></>
                    )}
                  </>
                )}
                <span style={{ color: '#BFBFBF' }}>{t('orderDetail.mopUnit')}</span>
              </>
            ) : (
              // 其他類型：顯示各時段明細
              <>
                {order.slotPrices.map((sp, i) => (
                  <span key={i}>
                    {sp.slot} {sp.originalPrice}×{sp.discount / 10}{i < order.slotPrices.length - 1 ? ' + ' : ''}
                  </span>
                ))}
                {' = '}
                <strong style={{ color: '#52C41A' }}>{slotSubtotal}</strong>
                {order.gradientDiscount && (
                  <> × {order.gradientDiscount.discount / 10} = <strong style={{ color: '#E8720C' }}>{finalPrice}</strong></>
                )}
                <span style={{ color: '#BFBFBF' }}>{t('orderDetail.mopUnit')}</span>
              </>
            )}
          </div>
        </div>}

        </>
                  )}
                  </Card>

                  {/* 訂單退款扣費比例 - 独立区块，新店廣告不顯示 */}
                  {!isNewStore && <div style={{
                    marginBottom: 16, padding: '14px 20px', borderRadius: 8,
                    background: order.refundEnabled === false ? '#fff2f0' : '#FAFAFA',
                    border: order.refundEnabled === false ? '1px solid #ffccc7' : '1px solid #F0F0F0',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 4, height: 14, background: '#FF4D4F', borderRadius: 2, display: 'inline-block' }} />
                      {t('orderDetail.refundRuleTitle')}
                      {order.refundEnabled === false && (
                        <Tag color="error" style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 6px', lineHeight: '18px' }}>
                          {t('orderDetail.refundNotAllowed')}
                        </Tag>
                      )}
                      {isRefunded && (
                        <Tag color="red" style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 6px', lineHeight: '18px' }}>
                          {t('orderDetail.refundedTag')}
                        </Tag>
                      )}
                    </div>
                    {order.refundEnabled === false ? (
                      <div style={{ fontSize: 12, color: '#cf1322' }}>
                        {t('orderDetail.refundNotAllowedTip')}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                          {order.cancelFeeRules.map((rule, i) => (
                            <span key={i}>
                              {i > 0 && ' | '}
                              {t('orderDetail.refundRuleText', { days: rule.maxDays, percent: rule.feePercent })}
                            </span>
                          ))}
                        </div>
                        {/* 已退款訂單：展示退款金額與匹配到的規則 */}
                        {isRefunded && (
                          <div style={{
                            marginTop: 12, padding: '12px 16px', borderRadius: 8,
                            background: '#fff2f0', border: '1px solid #ffccc7',
                            display: 'flex', flexDirection: 'column', gap: 8,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('orderDetail.matchedRule')}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#cf1322' }}>
                                {refundInfo?.matchedRule
                                  ? t('orderDetail.refundRuleText', { days: refundInfo.matchedRule.maxDays, percent: refundInfo.matchedRule.feePercent })
                                  : t('orderDetail.refundNoFee', { days: refundInfo?.daysBefore ?? 0 })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('orderDetail.feePercentLabel')}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{refundInfo?.feePercent ?? 0}%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #ffccc7', paddingTop: 12, marginTop: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#cf1322' }}>{t('orderDetail.refundAmountLabel')}</span>
                              <div style={{
                                padding: '6px 20px', background: 'linear-gradient(135deg, #FF4D4F, #FF7875)',
                                borderRadius: 8, boxShadow: '0 2px 8px rgba(255,77,79,0.35)',
                              }}>
                                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>MOP {refundAmountByPaid}</span>
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#bfbfbf' }}>
                              {t('orderDetail.refundFormula', { paid: finalPrice, percent: refundInfo?.feePercent ?? 0, amount: refundAmountByPaid })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>}
                </div>
              ),
            },
            // 人氣商家僅購買皮膚套件、無具體展示位置，不展示推廣數據 Tab
            ...(isPopular ? [] : [{
              key: 'promoData',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <BarChartOutlined style={{ color: '#E8720C' }} /> {t('orderDetail.tabPromoData')}
                </span>
              ),
              children: (
                <div style={{ padding: '8px 0 0' }}>
                  {/* 待推广状态：显示全0 + 提醒 */}
                  {order.status === OrderStatus.PENDING_PROMOTION && (
                    <div style={{
                      background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8,
                      padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <ExclamationCircleOutlined style={{ fontSize: 16, color: '#faad14' }} />
                      <span style={{ fontSize: 13, color: '#8c6e00' }}>{t('orderDetail.promoWaitTip')}</span>
                    </div>
                  )}
                  {/* 汇总统计 */}
                  <div key={promoAnimKey} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                    {(() => {
                      const isStar = order.recommendType === RecommendType.INVINCIBLE_STAR
                      const data = order.promoData || []
                      const uniqueDates = new Set(data.map(d => d.date)).size
                      const uniqueSlots = new Set(data.filter(d => d.slot).map(d => `${d.date}-${d.slot}`)).size
                      const totalImpressions = data.reduce((s, d) => s + d.impressions, 0)
                      const totalClicks = data.reduce((s, d) => s + d.clicks, 0)
                      return [
                        { label: t('orderDetail.statTotalImpressions'), value: <AnimatedNumber value={totalImpressions} />, icon: <EyeOutlined />, color: '#1890ff', bg: '#E6F7FF' },
                        { label: t('orderDetail.statTotalClicks'), value: <AnimatedNumber value={totalClicks} />, icon: <AimOutlined />, color: '#52C41A', bg: '#F6FFED' },
                        { label: isStar ? t('orderDetail.statPromoSlots') : t('orderDetail.statPromoDays'), value: isStar ? <AnimatedNumber value={uniqueSlots} suffix={t('orderDetail.slotsSuffix')} /> : <AnimatedNumber value={uniqueDates} suffix={t('orderDetail.daysSuffix')} />, icon: <ClockCircleOutlined />, color: '#722ED1', bg: '#F9F0FF' },
                        { label: t('orderDetail.statAvgCtr'), value: data.length > 0 ? <AnimatedPercent values={data.map(d => d.clickRate)} /> : <span>0%</span>, icon: <BarChartOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                      ].map((stat, i) => (
                        <div key={i} style={{
                          padding: '16px', borderRadius: 12, background: stat.bg,
                          border: `1px solid ${stat.color}22`, textAlign: 'center',
                          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
                          position: 'relative', overflow: 'hidden',
                        }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-4px)'
                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
                        </div>
                      ))
                    })()}
                  </div>

                  {/* 推广数据明细 - 按日期分组，商圈 rowSpan 合并 */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 4, height: 14, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
                    {RECOMMEND_TYPE_ICON[order.recommendType]} {recommendTypeLabel(order.recommendType)} · {t('orderDetail.promoDetailTitle')}
                  </div>
                  {(order.promoData || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#8C8C8C', fontSize: 13 }}>{t('orderDetail.noPromoData')}</div>
                  ) : order.recommendType === RecommendType.HOT_REVIVE_AD || order.recommendType === RecommendType.NEW_STORE_AD || isPopular ? (
                    /* 盘活复苏：单商圈标题 + 平铺推广日期 */
                    (() => {
                      const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
                      const data = order.promoData || []
                      return (
                        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                          <div style={{
                            background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                            fontSize: 13, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '25%' }} />
                              <col style={{ width: '25%' }} />
                              <col style={{ width: '25%' }} />
                              <col style={{ width: '25%' }} />
                            </colgroup>
                            <thead>
                              <tr style={{ background: '#FAFAFA' }}>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoDate')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colImpressions')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colClicks')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colCtr')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.map((rec, i) => (
                                <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>{rec.date}</td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500 }}>{rec.impressions.toLocaleString()}</td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center', color: '#52C41A', fontWeight: 500 }}>{rec.clicks}</td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                    <span style={{
                                      color: rec.clickRate >= 8 ? '#52C41A' : rec.clickRate >= 5 ? '#E8720C' : '#FF4D4F',
                                      fontWeight: 600,
                                    }}>{rec.clickRate}%</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()
                  ) : (
                    /* 无敌星星：按日期分组，商圈 rowSpan 合并 */
                    (() => {
                      const data = order.promoData || []
                      const dateGroups = new Map<string, PromoRecord[]>()
                      data.forEach(rec => {
                        if (!dateGroups.has(rec.date)) dateGroups.set(rec.date, [])
                        dateGroups.get(rec.date)!.push(rec)
                      })
                      return Array.from(dateGroups.entries()).map(([date, recs]) => (
                        <div key={date} style={{ border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                          <div style={{
                            background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                            fontSize: 13, fontWeight: 600, color: '#262626',
                          }}>
                            {date}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '20%' }} />
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '16%' }} />
                            </colgroup>
                            <thead>
                              <tr style={{ background: '#FAFAFA' }}>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('promotionOrderManage.colRegion')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colSlot')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colImpressions')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colClicks')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colCtr')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const regionGroups: { region: string; recs: PromoRecord[] }[] = []
                                const regionMap = new Map<string, PromoRecord[]>()
                                recs.forEach(rec => {
                                  if (!regionMap.has(rec.region)) {
                                    regionMap.set(rec.region, [])
                                    regionGroups.push({ region: rec.region, recs: regionMap.get(rec.region)! })
                                  }
                                  regionMap.get(rec.region)!.push(rec)
                                })
                                let rowIdx = 0
                                return regionGroups.map(({ region: r, recs: rRecs }) => {
                                  // 按時段分組
                                  const slotGroups: { slot: string; recs: PromoRecord[] }[] = []
                                  const slotMap = new Map<string, PromoRecord[]>()
                                  rRecs.forEach(rec => {
                                    const slotName = rec.slot || t('orderDetail.fullDaySlot')
                                    if (!slotMap.has(slotName)) {
                                      slotMap.set(slotName, [])
                                      slotGroups.push({ slot: slotName, recs: slotMap.get(slotName)! })
                                    }
                                    slotMap.get(slotName)!.push(rec)
                                  })
                                  const regionRowCount = rRecs.length
                                  return slotGroups.flatMap(({ slot: s, recs: sRecs }, slotIdx) => {
                                    return sRecs.map((rec, si) => {
                                      const idx = rowIdx++
                                      return (
                                        <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid #f0f0f0' : 'none' }}>
                                          {si === 0 && slotIdx === 0 && (
                                            <td rowSpan={regionRowCount} style={{
                                              padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                                              background: '#FAFAFA', borderRight: '1px solid #f0f0f0',
                                            }}>
                                              <Tag color="blue" style={{ margin: 0 }}>{r}</Tag>
                                            </td>
                                          )}
                                          {si === 0 && (
                                            <td rowSpan={sRecs.length} style={{
                                              padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                                              borderRight: '1px solid #f0f0f0',
                                            }}>
                                              <Tag color="default" style={{ margin: 0 }}>{s}</Tag>
                                            </td>
                                          )}
                                          <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500 }}>{rec.impressions.toLocaleString()}</td>
                                          <td style={{ padding: '8px 16px', textAlign: 'center', color: '#52C41A', fontWeight: 500 }}>{rec.clicks}</td>
                                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                            <span style={{
                                              color: rec.clickRate >= 8 ? '#52C41A' : rec.clickRate >= 5 ? '#E8720C' : '#FF4D4F',
                                              fontWeight: 600,
                                            }}>{rec.clickRate}%</span>
                                          </td>
                                        </tr>
                                      )
                                    })
                                  })
                                })
                              })()}
                            </tbody>
                          </table>
                        </div>
                      ))
                    })()
                  )}
                </div>
              ),
            }]),
          ]}
        />
      </div>

      {/* 底部操作栏 */}
      <div className="form-footer">
        <Button onClick={() => navigate(backToListPath)}>
          {t('orderDetail.backToList')}
        </Button>
        {(order.status === OrderStatus.PENDING_PROMOTION || order.status === OrderStatus.PROMOTING) && order.refundEnabled !== false && (
          <Button type="primary" danger icon={<RollbackOutlined />}
            onClick={handleRefund}>
            {isNewStore ? t('orderDetail.cancelPromo') : t('orderDetail.applyRefund')}
          </Button>
        )}
      </div>

      {/* 退款/取消推廣确认弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationCircleOutlined style={{ color: '#FF4D4F', fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>{isNewStore ? t('orderDetail.confirmCancelTitle') : t('orderDetail.confirmRefundTitle')}</span>
          </div>
        }
        open={refundModalVisible}
        onOk={confirmRefund}
        onCancel={() => setRefundModalVisible(false)}
        okText={isNewStore ? t('orderDetail.okCancel') : t('orderDetail.okRefund')}
        cancelText={t('orderDetail.cancel')}
        okButtonProps={{ danger: true }}
      >
        {isNewStore ? (
          <div>
            <div style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 2 }}>
                <div style={{ marginBottom: 8 }}>
                  {t('orderDetail.newStoreTip1Prefix')}<strong style={{ color: '#E8720C' }}>{t('orderDetail.daysUnit', { count: 60 })}</strong>{t('orderDetail.newStoreTip1Suffix')}
                </div>
                <div style={{ paddingLeft: 8 }}>
                  {t('orderDetail.newStoreTip2')}<br />
                  {t('orderDetail.newStoreTip3')}<br />
                  {t('orderDetail.newStoreTip4', { count: 60 })}
                </div>
              </div>
            </div>
            <div style={{
              background: '#FFF1F0', border: '1px solid #FFA39E', borderRadius: 8,
              padding: 12, marginBottom: 12,
            }}>
              <div style={{ fontSize: 13, color: '#FF4D4F', fontWeight: 600 }}>
                ⚠️ {t('orderDetail.newStoreWarn')}
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.remainingDays')}>
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{t('orderDetail.daysUnit', { count: order.purchaseDays?.length || 0 })}</span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : payMode === 'gift' && refundInfo?.isPromoting ? (
          <div>
            <div style={{
              background: '#FFF1F0', border: '1px solid #FFA39E', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FF4D4F', marginBottom: 8 }}>
                {t('orderDetail.refundGiftZeroTitle')}
              </div>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundGiftPromotingTip')}
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.giftDeductLabel')}>
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundGiftDaysLabel')}><span style={{ color: '#FF4D4F', fontSize: 16, fontWeight: 700 }}>0 {t('orderDetail.daysSuffix')}</span></Descriptions.Item>
            </Descriptions>
          </div>
        ) : payMode === 'gift' ? (
          <div>
            <div style={{
              background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundGiftDaysTip')}<strong style={{ color: '#52C41A' }}>{t('orderDetail.daysUnit', { count: refundInfo?.refundGiftDays ?? 0 })}</strong>
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.giftDeductLabel')}>
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.feePercentLabel')}>{refundInfo?.feePercent ?? 0}%</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundGiftDaysLabel')}>
                <span style={{ color: '#52C41A', fontSize: 16, fontWeight: 700 }}>
                  {refundInfo?.refundGiftDays ?? 0} {t('orderDetail.daysSuffix')}
                </span>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              {t('orderDetail.refundGiftFormula', { total: giftDays, percent: refundInfo?.feePercent ?? 0, days: refundInfo?.refundGiftDays ?? 0 })}
            </div>
          </div>
        ) : refundInfo?.isPromoting ? (
          <div>
            <div style={{
              background: '#FFF1F0', border: '1px solid #FFA39E', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FF4D4F', marginBottom: 8 }}>
                {t('orderDetail.refundZeroTitle')}
              </div>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundPromotingTip1')}<strong style={{ color: '#FF4D4F' }}>{t('orderDetail.refundPromotingTip1Strong')}</strong>{t('orderDetail.refundPromotingTip2')}
                <br />
                <strong>{t('orderDetail.refundPromotingTip3')}</strong>
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.paidAmount')}>MOP {order.actualPrice}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundAmountLabel')}><span style={{ color: '#FF4D4F', fontSize: 16, fontWeight: 700 }}>MOP 0</span></Descriptions.Item>
            </Descriptions>
          </div>
        ) : (
          <div>
            <div style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundPendingTip1')}<strong style={{ color: '#E8720C' }}>{t('orderDetail.daysUnit', { count: refundInfo?.daysBefore ?? 0 })}</strong>{t('orderDetail.refundPendingTip2', { percent: refundInfo?.feePercent ?? 0 })}
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.paidAmount')}>MOP {order.actualPrice}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.feePercentLabel')}>{refundInfo?.feePercent ?? 0}%</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundAmountLabel')}>
                <span style={{ color: '#52C41A', fontSize: 16, fontWeight: 700 }}>
                  MOP {refundInfo?.refundAmount ?? 0}
                </span>
              </Descriptions.Item>
              {payMode === 'mixed' && (
                <Descriptions.Item label={t('orderDetail.refundGiftDaysLabel')}>
                  <span style={{ color: '#E8720C', fontSize: 16, fontWeight: 700 }}>
                    {refundInfo?.refundGiftDays ?? 0} {t('orderDetail.daysSuffix')}
                  </span>
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              {t('orderDetail.refundFormula2', { paid: order.actualPrice, percent: refundInfo?.feePercent ?? 0, amount: refundInfo?.refundAmount ?? 0 })}
              {payMode === 'mixed' && (
                <> <br />{t('orderDetail.refundGiftFormula', { total: giftDays, percent: refundInfo?.feePercent ?? 0, days: refundInfo?.refundGiftDays ?? 0 })}</>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
