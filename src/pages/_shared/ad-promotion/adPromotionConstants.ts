import { AlgorithmType } from '../../Recommend/constants'

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
]

export const GROUP_BUY_CARD_TYPES: AlgorithmType[] = [
  AlgorithmType.INVINCIBLE_STAR,
  AlgorithmType.HOT_REVIVE_AD,
]
