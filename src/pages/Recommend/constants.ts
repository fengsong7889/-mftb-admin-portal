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
  FOOD_DELIVERY = 1,   // 美食外卖
  SUPERMARKET = 2,     // 超市百货
  GROUP_BUY = 3,       // 团购到店
}

export const RECOMMEND_CHANNEL_OPTIONS = [
  { label: '美食外賣', value: RecommendChannel.FOOD_DELIVERY },
  { label: '超市百貨', value: RecommendChannel.SUPERMARKET },
  { label: '團購到店', value: RecommendChannel.GROUP_BUY },
]

/** 投放界面 */
export enum PlacementInterface {
  HOME = 1,           // 大首页
  DELIVERY = 2,       // 外卖频道
  SUPERMARKET = 3,    // 超市频道
  GROUP_BUY = 4,      // 团购频道
}

export const PLACEMENT_INTERFACE_OPTIONS = [
  { label: '大首頁-Feed', value: PlacementInterface.HOME },
  { label: '外賣頻道-Feed', value: PlacementInterface.DELIVERY },
  { label: '超市頻道-Feed', value: PlacementInterface.SUPERMARKET },
  { label: '團購頻道-Feed', value: PlacementInterface.GROUP_BUY },
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

/** 召回维度 */
export enum RecallDimension {
  MERCHANT = 1,    // 商家维度
  ITEM = 2,        // 商品维度
  COMMERCIAL = 3,  // 商业维度
  USER = 4,        // 用户维度
  PLATFORM = 5,    // 平台维度
}

export const RECALL_DIMENSION_OPTIONS = [
  { label: '商家維度', value: RecallDimension.MERCHANT },
  { label: '商品維度', value: RecallDimension.ITEM },
  { label: '商業維度', value: RecallDimension.COMMERCIAL },
  { label: '用戶維度', value: RecallDimension.USER },
  { label: '平台維度', value: RecallDimension.PLATFORM },
]

/** 召回维度颜色 */
export const RECALL_DIMENSION_COLOR: Record<RecallDimension, string> = {
  [RecallDimension.MERCHANT]: 'blue',
  [RecallDimension.ITEM]: 'green',
  [RecallDimension.COMMERCIAL]: 'gold',
  [RecallDimension.USER]: 'purple',
  [RecallDimension.PLATFORM]: 'cyan',
}

/** 排序阶段 */
export enum RankingStage {
  COARSE = 1,   // 粗排
  FINE = 2,     // 精排
  RERANK = 3,   // 重排
}

export const RANKING_STAGE_OPTIONS = [
  { label: '粗排', value: RankingStage.COARSE },
  { label: '精排', value: RankingStage.FINE },
  { label: '重排', value: RankingStage.RERANK },
]

/** 出价模式 */
export enum BidMode {
  CPC = 1,   // 按点击付费
  CPM = 2,   // 按展示付费
  OCPC = 3,  // 优化点击付费
}

export const BID_MODE_OPTIONS = [
  { label: 'CPC (按點擊付費)', value: BidMode.CPC },
  { label: 'CPM (按展示付費)', value: BidMode.CPM },
  { label: 'oCPC (優化點擊付費)', value: BidMode.OCPC },
]

/** 时段类型 */
export enum TimeSlot {
  ALL_DAY = 1,       // 全天
  BREAKFAST = 2,     // 早餐
  LUNCH = 3,         // 午餐
  AFTERNOON = 4,     // 下午茶
  DINNER = 5,        // 晚餐
  NIGHT_SNACK = 6,   // 夜宵
}

export const TIME_SLOT_OPTIONS = [
  { label: '全天', value: TimeSlot.ALL_DAY },
  { label: '早餐 (06:00-09:00)', value: TimeSlot.BREAKFAST },
  { label: '午餐 (11:00-14:00)', value: TimeSlot.LUNCH },
  { label: '下午茶 (14:00-17:00)', value: TimeSlot.AFTERNOON },
  { label: '晚餐 (17:00-20:00)', value: TimeSlot.DINNER },
  { label: '夜宵 (20:00-02:00)', value: TimeSlot.NIGHT_SNACK },
]
