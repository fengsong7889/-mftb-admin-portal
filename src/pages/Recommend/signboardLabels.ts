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

/**
 * 收藏／顾客人数格式化（两类统计标签同一口径）：
 * 1~9 直接显示、10~99 取起始整十、100+ 用中文大数（百/千/萬/十萬/百萬/千萬）。
 * 算法库预览与购买页预览必须共用本函数，禁止各自内联一套写法。
 */
export const formatSignboardPeopleCount = (n: number): string => {
  if (n < 10) return `${n}`
  if (n < 100) return `${Math.floor(n / 10) * 10}`
  if (n < 1000) return '百'
  if (n < 10000) return '千'
  if (n < 100000) return '萬'
  if (n < 1000000) return '十萬'
  if (n < 10000000) return '百萬'
  return '千萬'
}

/** 统计类标签在无真实数据时的通用示例人数（收藏=1000→千人，顾客数=100→百人） */
export const SIGNBOARD_PLACEHOLDER_COUNT: Record<string, number> = {
  favorites: 1000,
  customers: 100,
}

/** 标签文案生成入参 */
export interface SignboardTagTextInput {
  labelType: string
  /** 场景：all_macau / district；统计类不传 */
  scenario?: string | null
  /** 商圈名（district 场景用；缺失时退回「商圈」） */
  regionName?: string | null
  /** 门店品类名（仅当对比范围含「品類」时参与文案） */
  categoryName?: string | null
  /** 资格条件对比范围；含 Category 时文案需带品类 */
  qualificationScope?: string | null
  /** 统计类真实人数（缺失时用通用示例值） */
  actualCount?: number | null
  /** 销量排名文案（如「第1名」/「前10%」；购买页无排名数据时用示例值） */
  rankText?: string
}

/**
 * 生成单个标签的展示文案（与算法库预览同源）。
 * - 热门/人气/好评：「{全澳｜商圈}{品類}{标签}店鋪」
 * - 复购：「{全澳｜商圈}{品類}回頭率超高店鋪」
 * - 销量：「{全澳｜商圈}{品類}銷量{排名}」
 * - 收藏：「{人數}人收藏好店」；顾客数：「近期{人數}人下單」
 */
export const signboardTagText = (input: SignboardTagTextInput): string => {
  const { labelType, scenario, regionName, categoryName, qualificationScope, actualCount, rankText } = input
  const meta = signboardLabelMeta(labelType)

  // 统计类：无场景，按人数档位展示
  if (!scenario) {
    const count = actualCount ?? SIGNBOARD_PLACEHOLDER_COUNT[labelType]
    if (labelType === 'favorites') return `${formatSignboardPeopleCount(count ?? 0)}人收藏好店`
    if (labelType === 'customers') return `近期${formatSignboardPeopleCount(count ?? 0)}人下單`
    return `${meta?.label ?? labelType}店鋪`
  }

  const region = scenario === 'all_macau' ? '全澳' : (regionName || '商圈')
  // 只有对比范围限定到品类时才带品类名；门店未配置品类则降级为不带
  const withCategory = !!qualificationScope && qualificationScope.includes('Category')
  const category = withCategory ? (categoryName ?? '') : ''

  if (labelType === 'sales') return `${region}${category}銷量${rankText ?? '第1名'}`
  if (labelType === 'repurchase') return `${region}${category}回頭率超高店鋪`
  return `${region}${category}${meta?.label ?? labelType}店鋪`
}
