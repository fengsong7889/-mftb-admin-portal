/** 所属APP */
export enum AppType {
  SHANFENG = 1,
  MFOOD = 2,
}

export const APP_OPTIONS = [
  { label: '閃峰', value: AppType.SHANFENG },
  { label: 'mFood', value: AppType.MFOOD },
]

/** 业务频道（推荐瀑布流） */
export enum RecommendChannel {
  HOME = 1,       // 大首页瀑布流
  DELIVERY = 2,   // 外卖频道瀑布流
  GROUP_BUY = 3,  // 团购频道瀑布流
  SUPERMARKET = 4,// 超市频道瀑布流
}

export const RECOMMEND_CHANNEL_OPTIONS = [
  { label: '大首頁瀑布流', value: RecommendChannel.HOME },
  { label: '外賣頻道瀑布流', value: RecommendChannel.DELIVERY },
  { label: '團購頻道瀑布流', value: RecommendChannel.GROUP_BUY },
  { label: '超市頻道瀑布流', value: RecommendChannel.SUPERMARKET },
]

/** 算法类型 */
export enum AlgorithmType {
  INVINCIBLE_STAR = 1,    // 无敌星星
  NEW_STORE_AD = 2,       // 新店广告
  HOT_REVIVE_AD = 3,      // 盘活广告
  EXCLUSIVE_MERCHANT = 4, // 独家商家
  TRAFFIC_AD = 5,         // 流量广告
  GUESS_YOU_LIKE = 6,     // 猜你喜欢
  ORGANIC_TRAFFIC = 7,    // 自然流量
  SEARCH_ALGORITHM = 9,   // 搜索算法
}

export const ALGORITHM_TYPE_OPTIONS = [
  { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
  { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
  { label: '盤活廣告', value: AlgorithmType.HOT_REVIVE_AD },
  { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
  { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
  { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
  { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
  { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
]

/** 区域 */
export enum Region {
  MACAU = 1,
  TAIPA = 2,
  ZHUHAI = 3,
}

export const REGION_OPTIONS = [
  { label: '澳門', value: Region.MACAU },
  { label: '氹仔', value: Region.TAIPA },
  { label: '珠海', value: Region.ZHUHAI },
]

/** 订单状态 */
export enum OrderStatus {
  PENDING_PAYMENT = 1,
  PAID = 2,
  DELIVERING = 3,
  COMPLETED = 4,
  REFUNDED = 5,
}

export const ORDER_STATUS_OPTIONS = [
  { label: '待支付', value: OrderStatus.PENDING_PAYMENT },
  { label: '已支付', value: OrderStatus.PAID },
  { label: '投放中', value: OrderStatus.DELIVERING },
  { label: '已完成', value: OrderStatus.COMPLETED },
  { label: '已退款', value: OrderStatus.REFUNDED },
]

/** 服务状态 */
export enum ServiceStatus {
  ENABLED = 1,
  DISABLED = 2,
}

export const SERVICE_STATUS_OPTIONS = [
  { label: '啟用', value: ServiceStatus.ENABLED },
  { label: '停用', value: ServiceStatus.DISABLED },
]
