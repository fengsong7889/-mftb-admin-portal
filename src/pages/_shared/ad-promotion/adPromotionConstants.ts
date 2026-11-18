import { AlgorithmType } from '@mftb/contracts/recommendConstants'

/**
 * 广告推广 / 促销配置 各 Tab 展示的卡片默认类型顺序
 *
 * 提取自 AdSales/index.tsx 与 PromotionSalesConfig/index.tsx 的重复常量
 */
export const DELIVERY_CARD_TYPES: AlgorithmType[] = [
  AlgorithmType.INVINCIBLE_STAR,
  AlgorithmType.HOT_REVIVE_AD,
  AlgorithmType.NEW_STORE_AD,
  AlgorithmType.TRAFFIC_AD,
  AlgorithmType.POPULAR_MERCHANT_KA,
  AlgorithmType.GOLDEN_SIGNBOARD,
  AlgorithmType.TIME_SLOT_AD,
]

export const GROUP_BUY_CARD_TYPES: AlgorithmType[] = [
  AlgorithmType.INVINCIBLE_STAR,
  AlgorithmType.TRAFFIC_AD,
]

// 注：团购到店的盤活復甦入口已下线（2026-11-18 用户拍板），不要把 HOT_REVIVE_AD 加回此数组；
// 投流广告按同日用户要求加入团购 tab（与算法库/销售定价同口径）。
