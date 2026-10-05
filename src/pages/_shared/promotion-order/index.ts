/**
 * 推廣訂單共享模塊
 *
 * 將 PromotionOrderManage 和 PromotionOrderManageStandalone 的公共邏輯集中管理：
 * - 枚舉（OrderStatus / OrderOperatorType）
 * - 常量（推薦類型標籤/圖標、金字招牌、人氣商家皮膚）
 * - 類型（BaseOrderItem）
 * - 工具函數（formatTimestamp / toBaseOrderItem / fetchOrderItems）
 *
 * AppType / RecommendChannel / Region / AlgorithmType 統一引用 Recommend/constants，
 * 不再在各頁面重複定義。
 */

export { OrderStatus, OrderOperatorType } from './enums'

export {
  RecommendType,
  RECOMMEND_TYPE_LABEL,
  RECOMMEND_TYPE_ICON,
  _RECOMMEND_TYPE_COLOR,
  SIGNBOARD_LABEL_CN,
  SIGNBOARD_SCENARIO_CN,
  formatSignboardLabel,
  SKIN_TIER_CN,
} from './constants'

export type { BaseOrderItem } from './types'

export { formatTimestamp, MEAL_SLOT_CN, toBaseOrderItem, fetchOrderItems } from './utils'

export { usePromotionOrderLabels, type PromotionOrderLabels } from './usePromotionOrderLabels'

export { getSharedOrderColumns, type SharedColumnDeps } from './sharedColumns'

export { PromotionOrderPageHeader, type PromotionOrderPageHeaderProps } from './PromotionOrderPageHeader'

export { createPurchaseContentRenderer, type PurchaseContentDeps } from './purchaseContentColumn'
