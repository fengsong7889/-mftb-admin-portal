/**
 * 金字招牌标签元数据（系统级枚举，集中定义）。
 * 标签的满足条件由算法库「金字招牌」算法配置（可多套、可启停），只有达标的商家才能购买；
 * 售卖侧（定价/订单）与自然流量计分侧共用本清单，禁止在各页面重复内联枚举。
 */

/** 标签分组：对比类（按全澳/商圈场景配置）与统计类（全量数据门槛，不划分场景） */
export type SignboardLabelGroup = 'comparison' | 'aggregate'

export interface SignboardLabelMeta {
  /** 后端存储值（biz_ad_order_item_signboard.label_type） */
  value: string
  /** 界面展示名 */
  label: string
  icon: string
  group: SignboardLabelGroup
}

export const SIGNBOARD_LABELS: SignboardLabelMeta[] = [
  { value: 'hot', label: '熱門', icon: '🔥', group: 'comparison' },
  { value: 'popular', label: '人氣', icon: '👑', group: 'comparison' },
  { value: 'sales', label: '銷量', icon: '📈', group: 'comparison' },
  { value: 'rating', label: '好評', icon: '⭐', group: 'comparison' },
  { value: 'repurchase', label: '復購', icon: '🔄', group: 'comparison' },
  { value: 'favorites', label: '收藏', icon: '❤️', group: 'aggregate' },
  { value: 'customers', label: '顧客數', icon: '👥', group: 'aggregate' },
]

export const SIGNBOARD_LABEL_GROUP_LABELS: Record<SignboardLabelGroup, string> = {
  comparison: '對比類標籤',
  aggregate: '統計類標籤',
}

/** 按存储值取标签元数据（找不到时返回 undefined，由调用方决定兜底展示） */
export const signboardLabelMeta = (value?: string): SignboardLabelMeta | undefined =>
  SIGNBOARD_LABELS.find(item => item.value === value)

/** 标签展示文案（含图标）；未知编码时退回原始值，避免界面出现空白 */
export const signboardLabelText = (value?: string): string => {
  const meta = signboardLabelMeta(value)
  return meta ? `${meta.icon} ${meta.label}` : value ?? ''
}
