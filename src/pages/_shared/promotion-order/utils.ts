/**
 * 推廣訂單共享工具函數
 */

import dayjs from 'dayjs'
import { AppType, RecommendChannel, Region } from '../../Recommend/constants'
import { fetchAdOrders, brandToAppType, MEAL_SLOT_TIME_LABEL, type AdOrder, type DateSlotGroup } from '../../../api/adPromotion'
import { RecommendType } from './constants'
import { OrderStatus, type OrderOperatorType } from './enums'
import type { BaseOrderItem } from './types'

/**
 * 格式化時間戳（後端 LocalDateTime 統一序列化為毫秒時間戳，兼容字符串/數字兩種格式）
 */
export function formatTimestamp(t?: string | number): string {
  if (t == null || t === '') return ''
  if (typeof t === 'number') return dayjs(t).format('YYYY-MM-DD HH:mm:ss')
  return String(t).replace('T', ' ').slice(0, 19)
}

/** 餐段 key → 中文名稱映射 */
export const MEAL_SLOT_CN: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', afternoon: '下午茶', dinner: '晚餐', supper: '宵夜',
}

/**
 * 將後端 AdOrder 轉換為前端訂單行（公共邏輯）
 *
 * 各頁面可在調用後自行補充額外字段（如 mock 數據、額外狀態映射等）。
 */
export function toBaseOrderItem(vo: AdOrder): BaseOrderItem {
  const channelMap: Record<number, RecommendChannel> = {
    2: RecommendChannel.DELIVERY,
    3: RecommendChannel.SUPERMARKET,
    4: RecommendChannel.GROUP_BUY,
  }

  // 所屬商圈: 後端由訂單明細去重聚合返回
  const regions = (vo.regions || []).map((r: number) => r as Region)

  // 購買時段: 餐段 key → 中文名稱
  const mealSlots = (vo.mealSlots || []).map((s: string) => MEAL_SLOT_CN[s] || MEAL_SLOT_TIME_LABEL[s] || s)

  // 按日期分組時段：後端返回每個日期對應的時段列表
  const dateSlots: DateSlotGroup[] | undefined = vo.dateSlots?.map((g: DateSlotGroup) => ({
    region: g.region,
    date: g.date,
    slots: g.slots.map((s: string) => MEAL_SLOT_CN[s] || MEAL_SLOT_TIME_LABEL[s] || s),
  }))

  // 購買日期: 無敵星星和按天售賣類型均傳遞日期列表
  const hasNoMealSlots = (vo.mealSlots || []).length === 0
  const isDayBasedType = vo.algoType === 2 || vo.algoType === 3 || vo.algoType === 5 || vo.algoType === 13
  const isStarType = vo.algoType === 1
  const purchaseDays = (isDayBasedType && hasNoMealSlots) || isStarType
    ? ((vo.purchaseDays && vo.purchaseDays.length > 0)
        ? vo.purchaseDays
        : isDayBasedType ? Array.from({ length: vo.itemCount || 0 }, () => '') : undefined)
    : undefined

  return {
    id: vo.orderNo,
    orderNo: vo.orderNo,
    algorithmId: vo.algoCode || String(vo.algoId),
    promotionName: vo.algoName,
    app: (brandToAppType(vo.brand) ?? AppType.SHANFENG) as AppType,
    channel: channelMap[vo.channel ?? 2] ?? RecommendChannel.DELIVERY,
    region: regions.length === 1 ? regions[0] : regions,
    recommendType: vo.algoType as RecommendType,
    slotPosition: 0,
    groupId: vo.groupCode,
    groupName: vo.groupName || '-',
    storeId: vo.storeCode || '-',
    storeName: vo.storeName || '-',
    mealSlots,
    dateSlots,
    purchaseDays,
    skinName: vo.algoType === 5 ? vo.skinNames?.[0] : undefined,
    skinTiers: vo.skinTiers,
    labelDates: vo.labelDates,
    purchaseDate: formatTimestamp(vo.orderTime).slice(0, 10),
    originalPrice: vo.originalAmount,
    discountPrice: vo.originalAmount - vo.discountAmount,
    actualPrice: vo.actualAmount,
    discountAmount: vo.discountAmount,
    giftDays: vo.giftDays ?? undefined,
    giftAmount: vo.giftAmount ?? undefined,
    status: vo.status as OrderStatus,
    orderTime: formatTimestamp(vo.orderTime),
    payTime: vo.payTime ? formatTimestamp(vo.payTime) : undefined,
    refundAmount: vo.refundAmount || undefined,
    refundGiftDays: vo.refundGiftDays ?? undefined,
    operatorType: vo.operatorType as OrderOperatorType | undefined,
    operatorId: vo.operatorId,
    operatorName: vo.operatorName,
    source: 'api',
  }
}

/**
 * 加載訂單數據（公共 API 調用邏輯）
 */
export function fetchOrderItems(): Promise<BaseOrderItem[]> {
  return fetchAdOrders({ page: 1, size: 200 })
    .then(res => (res.records ?? []).map(toBaseOrderItem))
    .catch(() => [])
}
