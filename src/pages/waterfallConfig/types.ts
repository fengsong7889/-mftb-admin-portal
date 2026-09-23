/**
 * 瀑布流策略前端改造 - 共享类型与常量
 *
 * 背景：本期只改前端，后端 `biz_ad_waterfall` / `AdWaterfallRequest` 无法保存新增字段
 * （业务线、展示内容、单/双列布局、团购分类兜底、团购固定内容坑位）。
 * 因此新增字段统一走本地扩展存储（见 waterfallExtStore.ts），并与后端 DTO 严格分离。
 *
 * 约定：
 * - 外卖到家（delivery）：兜底仍为真实「自然流量算法」，坑位绑定真实算法编码，走后端接口。
 * - 团购到店（groupBuy）：兜底为「按分类自动获取」，人工内容只配置在固定坑位；
 *   门店/商品/分类来自外部系统，本期用 Mock（waterfallCatalog.ts），整体策略存本地。
 */

/** 业务线：外卖到家 / 团购到店 */
export type WaterfallBusinessType = 'delivery' | 'groupBuy'

/** 展示内容类型：门店 / 商品（团购二选一；外卖固定 store） */
export type WaterfallContentType = 'store' | 'product'

/** 展示布局：单列（一行 1 个）/ 双列（一行 2 个） */
export type WaterfallLayoutColumns = 1 | 2

/** 服务状态：1=启用 2=停用（与后端 status 对齐） */
export type WaterfallStatus = 1 | 2

/** 过滤用户不喜欢：1=开启 2=关闭（与后端 filterDislike 对齐） */
export type WaterfallFilterDislike = 1 | 2

/** 外卖到家的业务频道：美食外卖 / 超市百货（后端不支持，落本地扩展） */
export type WaterfallBizChannel = 'food' | 'supermarket'

/** 外卖算法坑位草稿（沿用后端 slots 语义） */
export interface AlgoSlotDraft {
  position: number
  algorithmId: string
  algorithmName: string
  algorithmType: number
  brand?: string
  status: WaterfallStatus
}

/** 团购固定内容坑位草稿（门店或商品） */
export interface FixedContentSlot {
  position: number
  contentType: WaterfallContentType
  /** 外部资源 ID（Mock 阶段为字符串编码；真实接入后为外部系统 ID） */
  itemId: string
  itemName: string
  brand?: string
  categoryId?: string
  categoryName?: string
  status: WaterfallStatus
}

/**
 * 完整瀑布流策略草稿：表单页与坑位配置页之间通过 sessionStorage 传递，
 * 取代旧版仅传递算法坑位数组的方式，避免不同策略草稿串用。
 */
export interface WaterfallDraft {
  /** 稳定 key：后端记录 server_<id>，本地记录 local_<uuid> */
  key: string
  source: 'server' | 'local'
  /** 后端策略主键（server 记录） */
  id?: number
  /** 本地策略标识（local 记录） */
  localId?: string
  strategyCode?: string
  strategyName: string
  brand?: string
  businessType: WaterfallBusinessType
  contentType: WaterfallContentType
  layoutColumns: WaterfallLayoutColumns
  /** 外卖到家业务频道（美食外卖/超市百货）；团购不使用 */
  bizChannel: WaterfallBizChannel
  filterDislike: WaterfallFilterDislike
  status?: WaterfallStatus
  remark?: string
  /** 外卖：自然流量兜底算法编码 */
  naturalAlgoId?: string | null
  naturalAlgoName?: string
  /** 外卖：算法坑位 */
  algoSlots: AlgoSlotDraft[]
  /** 团购：分类兜底（选中的分类 ID 列表，至少一个） */
  fallbackCategoryIds: string[]
  /** 团购：固定内容坑位 */
  fixedSlots: FixedContentSlot[]
  /** 业务线是否已由人工确认（旧记录推断场景用于标记「待确认」） */
  businessConfirmed: boolean
}

/** 列表合并视图（后端策略 + 本地扩展 + 本地新建策略统一渲染） */
export interface WaterfallListView {
  key: string
  source: 'server' | 'local'
  id?: number
  localId?: string
  strategyCode?: string
  strategyName: string
  brand?: string
  status?: number
  updatedBy?: string
  updatedAt?: string
  businessType: WaterfallBusinessType
  contentType: WaterfallContentType
  layoutColumns: WaterfallLayoutColumns
  filterDislike?: number
  naturalAlgoName?: string
  businessConfirmed: boolean
}

/** 算法类型标签 i18n key（与算法库 algo_type 对齐） */
export const ALGO_TYPE_LABEL: Record<number, string> = {
  1: 'recommend:algoInvincibleStar', 2: 'recommend:algoNewStoreAd', 3: 'recommend:algoHotReviveAd',
  4: 'recommend:algoExclusiveMerchant', 5: 'recommend:algoPopularMerchant', 6: 'recommend:algoGuessYouLike',
  7: 'recommend:algoOrganicTraffic', 11: 'recommend:algoBrandMerchant', 12: 'recommend:algoGoldAd',
  13: 'recommend:algoGoldenSignboard', 14: 'recommend:algoProductPromo', 15: 'recommend:algoTrafficAd',
}

/** 算法类型颜色 */
export const ALGO_TYPE_COLOR: Record<number, string> = {
  1: 'gold', 2: 'green', 3: 'magenta', 4: 'purple', 5: 'red', 6: 'blue',
  7: 'lime', 11: 'orange', 12: 'cyan', 13: 'geekblue', 14: 'volcano', 15: 'yellow',
}

/** 内容类型标签 i18n key */
export const CONTENT_TYPE_LABEL_KEY: Record<WaterfallContentType, string> = {
  store: 'promotionSlotConfig:contentTypeStore',
  product: 'promotionSlotConfig:contentTypeProduct',
}

/** 业务线标签 i18n key */
export const BUSINESS_TYPE_LABEL_KEY: Record<WaterfallBusinessType, string> = {
  delivery: 'promotionSlotConfig:bizDelivery',
  groupBuy: 'promotionSlotConfig:bizGroupBuy',
}

/** 展示布局选项（单选，语义明确，不使用含义模糊的开关） */
export const LAYOUT_OPTIONS: { value: WaterfallLayoutColumns; labelKey: string }[] = [
  { value: 1, labelKey: 'promotionSlotConfig:layoutSingle' },
  { value: 2, labelKey: 'promotionSlotConfig:layoutDouble' },
]

/** 内容类型下拉选项 */
export const CONTENT_TYPE_OPTIONS: { value: WaterfallContentType; labelKey: string }[] = [
  { value: 'store', labelKey: CONTENT_TYPE_LABEL_KEY.store },
  { value: 'product', labelKey: CONTENT_TYPE_LABEL_KEY.product },
]

/** 外卖到家业务频道下拉选项 */
export const BIZ_CHANNEL_OPTIONS: { value: WaterfallBizChannel; labelKey: string }[] = [
  { value: 'food', labelKey: 'promotionSlotConfig:bizChannelFood' },
  { value: 'supermarket', labelKey: 'promotionSlotConfig:bizChannelSupermarket' },
]

/** 默认扩展配置（旧后端记录无本地扩展时的兜底） */
export function defaultExtension(businessType: WaterfallBusinessType = 'delivery'): {
  businessType: WaterfallBusinessType
  contentType: WaterfallContentType
  layoutColumns: WaterfallLayoutColumns
  bizChannel: WaterfallBizChannel
  fallbackCategoryIds: string[]
  fixedSlots: FixedContentSlot[]
  confirmed: boolean
} {
  return {
    businessType,
    // 外卖本期固定门店；团购默认门店，新增时由用户显式选择
    contentType: 'store',
    layoutColumns: 1,
    bizChannel: 'food',
    fallbackCategoryIds: [],
    fixedSlots: [],
    confirmed: false,
  }
}

/** 生成稳定的列表 key */
export function serverKey(id: number): string {
  return `server_${id}`
}

/** 生成本地策略 key */
export function localKey(localId: string): string {
  return `local_${localId}`
}

/** 从列表 key 解析 localId（非本地记录返回 undefined） */
export function parseLocalIdFromKey(key: string): string | undefined {
  return key.startsWith('local_') ? key.slice('local_'.length) : undefined
}
