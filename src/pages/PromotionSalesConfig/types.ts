/**
 * PromotionSalesConfig 模块类型定义
 * 共享类型从 _shared/ad-promotion/types 重导出，本文件无独有项
 */

// 重导出所有共享类型（投流定價真值已收斂到後端，載入函數見 _shared/ad-promotion/trafficPricing）
export {
  TimeSlotStatus,
  TIME_SLOT_COLORS,
  TIME_SLOT_LABELS,
  type InventoryItem,
  type RecommendTypeConfig,
  type TimeSlotDef,
  generateTimeSlotDefs,
  RECOMMEND_TYPE_CONFIGS,
  CHANNEL_LABEL,
  getRowIndexByDate,
  generateMockInventory,
  generateTimeSlotStatuses,
  calcSlotPrice,
  getNoDiscountSlotsByRow,
  type TrafficPackageTier,
  type TrafficPriceLadderRow,
  type TrafficChannelPricing,
  generateDefaultTrafficPricing,
  findLadderUnitPrice,
  calcCustomAmount,
} from '../_shared/ad-promotion/types'
