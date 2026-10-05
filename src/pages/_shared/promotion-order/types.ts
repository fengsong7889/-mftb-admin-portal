/**
 * 推廣訂單共享類型定義
 */

import type { AppType, RecommendChannel, Region } from '../../Recommend/constants'
import type { DateSlotGroup, LabelDateGroup } from '../../../api/adPromotion'
import type { RecommendType } from './constants'
import type { OrderStatus, OrderOperatorType } from './enums'

/**
 * 基礎訂單行類型（兩個頁面的公共字段）
 *
 * PromotionOrderManage 直接使用此類型；
 * PromotionOrderManageStandalone 可通過 interface extension 補充額外字段。
 */
export interface BaseOrderItem {
  id: string
  orderNo: string
  algorithmId: string
  promotionName: string
  app: AppType
  channel: RecommendChannel
  region: Region | Region[]
  recommendType: RecommendType
  slotPosition: number
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  mealSlots: string[]
  dateSlots?: DateSlotGroup[]
  purchaseDays?: string[]
  skinName?: string
  skinTiers?: string[]
  labelDates?: LabelDateGroup[]
  trafficMode?: 'tier' | 'custom'
  trafficPackageName?: string
  trafficImpressions?: number
  purchaseDate: string
  originalPrice: number
  discountPrice: number
  actualPrice: number
  discountAmount?: number
  giftDays?: number
  giftAmount?: number
  status: OrderStatus
  orderTime: string
  payTime?: string
  refundAmount?: number
  refundGiftDays?: number
  refundTime?: string
  refundOperatorType?: OrderOperatorType
  refundOperatorId?: string
  refundOperatorName?: string
  cancelTime?: string
  cancelOperatorId?: string
  cancelOperatorName?: string
  operatorType?: OrderOperatorType
  operatorId?: string
  operatorName?: string
  source?: 'api' | 'mock'
}
