import dayjs from 'dayjs'
import { AlgorithmType } from '../Recommend/constants'
import { BIZ_CHANNEL } from '../../constants/bizChannel'
import {
} from '../../api/adPromotion'

/* ---- 枚举 ---- */
export enum OrderStatus {
  PENDING_PROMOTION = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  CANCELLED = 4,
  ABORTED = 5,
  REFUNDED = 6,
}

export enum AppType { SHANFENG = 1, MFOOD = 2 }

export enum RecommendChannel { DELIVERY = 2, GROUP_BUY = 3, SUPERMARKET = 4 }

/** 投流廣告：訂單業務頻道 → 定價配置業務頻道（讀取退款開關/手續費比例配置） */
export const ORDER_CHANNEL_TO_TRAFFIC_BIZ: Record<number, string> = {
  [RecommendChannel.DELIVERY]: BIZ_CHANNEL.FOOD_DELIVERY,
  [RecommendChannel.SUPERMARKET]: BIZ_CHANNEL.SUPERMARKET,
  [RecommendChannel.GROUP_BUY]: BIZ_CHANNEL.GROUP_BUY,
}

// 商圈名称映射：统一引用全局商圈数据（含珠海区域）

// 推荐类型枚举（统一引用 AlgorithmType，避免重复定义导致枚举值不一致）
export type RecommendType = AlgorithmType
export const RecommendType = AlgorithmType
export const RECOMMEND_TYPE_ICON: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '⭐',
  [RecommendType.HOT_REVIVE_AD]: '🔥',
  [RecommendType.NEW_STORE_AD]: '🏪',
  [RecommendType.TRAFFIC_AD]: '📊',
  [RecommendType.POPULAR_MERCHANT_KA]: '🏆',
  [RecommendType.GOLDEN_SIGNBOARD]: '🌟',
}

/* ---- 接口 ---- */
export interface SlotPriceItem {
  slot: string       // 时段名称，如「早餐」「午餐」
  date: string       // 日期，如「2026-07-16」
  originalPrice: number
  discount: number   // 折扣，10=无折扣，8=8折
  actualPrice: number
  region?: number    // 所属商圈（无敌星星多商圈用）
}

/* ---- 推广数据接口 ---- */
export interface PromoRecord {
  date: string          // 统计日期
  region: string        // 商圈
  waterfallName: string // 瀑布流名称
  position: number      // 展示位置
  slot?: string         // 展示时段（无敌星星用）
  labelName?: string    // 标签名称（金字招牌用）
  scenario?: string | null // 场景（金字招牌用: all_macau/district/null）
  impressions: number   // 曝光量
  clicks: number        // 点击量
  clickRate: number     // 点击率（百分比）
}

export interface OrderItem {
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
  storeAddress?: string  // 门店地址（来自 biz_store.address）
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
  skinName?: string // 人氣商家：皮膚名稱
  giftDays?: number // 贈送天數抵扣快照（抵扣天數）
  giftAmount?: number // 贈送抵扣金額快照
  terminalTime?: string // 終態（已退款/已取消/已中止/已完成）發生的日期時間
  operatorName?: string // 操作人姓名
  operatorId?: string // 操作人工號
  terminalActor?: 'staff' | 'merchant' // 終態操作發起方：業務人員 / 商家
  /** 数据来源：api=后端真实数据 mock=演示数据 */
  source?: 'api' | 'mock'
  /** 金字招牌：按标签分组的购买日期 */
  labelDates?: { label: string; scenario?: string | null; dates: string[] }[]
  /** 投流廣告：購買方式（預設檔位 / 自定義） */
  trafficMode?: 'tier' | 'custom'
  /** 投流廣告：流量包名稱（檔位購買時） */
  trafficPackageName?: string
  /** 投流廣告：購買曝光次數 */
  trafficImpressions?: number
}


/* ---- 后端订单映射 ---- */

/** 餐段时段 key → 中文名称 */
export const MEAL_SLOT_LABEL: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', afternoon: '下午茶', dinner: '晚餐', supper: '宵夜',
}

/** 后端频道 → 前端频道（3=超市百貨 4=團購到店，其余归美食外卖） */
export function mapAdChannel(channel?: number): RecommendChannel {
  if (channel === 3) return RecommendChannel.SUPERMARKET
  if (channel === 4) return RecommendChannel.GROUP_BUY
  return RecommendChannel.DELIVERY
}

/** 后端订单状态 → 详情页状态（后端 4=已退款 5=已取消） */
export function mapAdStatus(status: number): OrderStatus {
  if (status === 4) return OrderStatus.REFUNDED
  if (status === 5) return OrderStatus.CANCELLED
  return status as OrderStatus
}

/** 解析取消扣费梯度 JSON（[{remainDays,ratio}] → [{maxDays,feePercent}]） */
export function parseCancelFeeTiers(json?: string): { maxDays: number; feePercent: number }[] {
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
export function parseDiscountTiers(json?: string): { minSlots: number; discount: number }[] {
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
export function parseDayDiscountTiers(json?: string): { minSlots: number; discount: number }[] {
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

export function getStageIndex(status: OrderStatus): number {
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

export function getStageTime(status: OrderStatus, stageIdx: number, order: OrderItem): string {
  if (stageIdx === 0) return order.orderTime
  if (stageIdx === 1) return order.payTime || ''
  if (stageIdx === 2) return order.promoStartDate ? `${order.promoStartDate} 09:00:00` : ''
  if (stageIdx === 3) {
    return order.terminalTime || ''
  }
  return ''
}

