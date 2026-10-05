/**
 * 推廣訂單共享常量
 */

import { AlgorithmType } from '../../Recommend/constants'

export type RecommendType = AlgorithmType
export const RecommendType = AlgorithmType

export const RECOMMEND_TYPE_LABEL: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '無敵星星',
  [RecommendType.HOT_REVIVE_AD]: '盤活復蘇',
  [RecommendType.NEW_STORE_AD]: '新店廣告',
  [RecommendType.TRAFFIC_AD]: '投流廣告',
  [RecommendType.POPULAR_MERCHANT_KA]: '人氣商家',
  [RecommendType.GOLDEN_SIGNBOARD]: '金字招牌',
}

export const RECOMMEND_TYPE_ICON: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '⭐',
  [RecommendType.HOT_REVIVE_AD]: '🔥',
  [RecommendType.NEW_STORE_AD]: '🏪',
  [RecommendType.TRAFFIC_AD]: '📊',
  [RecommendType.POPULAR_MERCHANT_KA]: '🏆',
  [RecommendType.GOLDEN_SIGNBOARD]: '🏅',
}

export const _RECOMMEND_TYPE_COLOR: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: 'gold',
  [RecommendType.HOT_REVIVE_AD]: 'green',
  [RecommendType.NEW_STORE_AD]: 'blue',
  [RecommendType.TRAFFIC_AD]: 'purple',
  [RecommendType.POPULAR_MERCHANT_KA]: 'geekblue',
}

export const SIGNBOARD_LABEL_CN: Record<string, { label: string; icon: string; color: string }> = {
  hot: { label: '熱門', icon: '��', color: '#FF4D4F' },
  popular: { label: '人氣', icon: '👑', color: '#FAAD14' },
  sales: { label: '銷量', icon: '📈', color: '#1890FF' },
  rating: { label: '好評', icon: '⭐', color: '#52C41A' },
  repurchase: { label: '復購', icon: '🔄', color: '#722ED1' },
  favorites: { label: '收藏', icon: '❤️', color: '#EB2F96' },
  customers: { label: '顧客數', icon: '👥', color: '#13C2C2' },
}

export const SIGNBOARD_SCENARIO_CN: Record<string, string> = {
  all_macau: '全澳對比',
  district: '商圈對比',
}

export function formatSignboardLabel(label: string, scenario?: string | null): string {
  const cfg = SIGNBOARD_LABEL_CN[label]
  const name = cfg?.label || label
  const suffix = scenario ? SIGNBOARD_SCENARIO_CN[scenario] : null
  return suffix ? `${name}-${suffix}` : name
}

export const SKIN_TIER_CN: Record<string, { label: string; color: string }> = {
  classic:  { label: '經典版', color: '#08979C' },
  premium:  { label: '精選版', color: '#2F54EB' },
  flagship: { label: '旗艦版', color: '#722ED1' },
  ultimate: { label: '至尊版', color: '#D48806' },
}
