import { BRAND_SHANFENG_LABEL } from '../../constants/brand'

/** 所属APP */
export enum AppType {
  SHANFENG = 1,
  MFOOD = 2,
}

export const APP_OPTIONS = [
  { label: BRAND_SHANFENG_LABEL, value: AppType.SHANFENG },
  { label: 'mFood', value: AppType.MFOOD },
]

/** 业务频道（推荐瀑布流） */
export enum RecommendChannel {
  HOME = 1,           // 大首页
  DELIVERY = 2,       // 外卖频道
  SUPERMARKET = 3,    // 超市百货
  GROUP_BUY = 4,      // 团购到店
}

export const RECOMMEND_CHANNEL_OPTIONS = [
  { label: '大首頁', value: RecommendChannel.HOME },
  { label: '外賣頻道', value: RecommendChannel.DELIVERY },
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
  HOT_REVIVE_AD = 3,      // 盘活复苏
  EXCLUSIVE_MERCHANT = 4, // 独家商家
  TRAFFIC_AD = 5,         // 流量广告
  GUESS_YOU_LIKE = 6,     // 猜你喜欢
  ORGANIC_TRAFFIC = 7,    // 自然流量
  SEARCH_ALGORITHM = 9,   // 搜索算法
  POPULAR_MERCHANT_KA = 10, // 人气商家(KA)
}

export const ALGORITHM_TYPE_OPTIONS = [
  { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
  { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
  { label: '盤活復蘇', value: AlgorithmType.HOT_REVIVE_AD },
  { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
  { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
  { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
  { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
  { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
  { label: '人氣商家(KA)', value: AlgorithmType.POPULAR_MERCHANT_KA },
]

/** 算法类型对应卡片顶部装饰线颜色（与 CSS .algo-card-wrapper--* 类名一致） */
export const ALGO_CARD_COLOR_MAP: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.SEARCH_ALGORITHM]: 'magenta',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'red',
} as Record<AlgorithmType, string>

/** 区域（与地圖規劃商圈数据一致） */
export enum Region {
  // 澳門區域
  KOKSAA = 1,         // 黑沙環區
  COSTA = 2,          // 高士德區
  SANMA = 3,          // 新馬路區
  SANWONG = 4,        // 新皇朝區
  HKM = 5,            // 港珠澳區
  // 氹仔區域
  FAHUA = 6,          // 花城市區
  AIRPORT = 7,        // 北安機場
  LHOTEL = 8,         // 左酒店區
  RHOTEL = 9,         // 右酒店區
  UM = 10,            // 澳大專區
  HACS = 11,          // 黑沙灘區
}

export const REGION_OPTIONS = [
  { label: '黑沙環區', value: Region.KOKSAA },
  { label: '高士德區', value: Region.COSTA },
  { label: '新馬路區', value: Region.SANMA },
  { label: '新皇朝區', value: Region.SANWONG },
  { label: '港珠澳區', value: Region.HKM },
  { label: '花城市區', value: Region.FAHUA },
  { label: '北安機場', value: Region.AIRPORT },
  { label: '左酒店區', value: Region.LHOTEL },
  { label: '右酒店區', value: Region.RHOTEL },
  { label: '澳大專區', value: Region.UM },
  { label: '黑沙灘區', value: Region.HACS },
]

/** 区域父节点值（用于TreeSelect二级选择） */
export const AREA_PARENT_VALUES = {
  MACAU_AREA: 'macau_area',
  TAIPA_AREA: 'taipa_area',
} as const

/** 区域 → 商圈映射（用于选择区域时过滤） */
export const AREA_TO_REGIONS: Record<string, Region[]> = {
  [AREA_PARENT_VALUES.MACAU_AREA]: [Region.KOKSAA, Region.COSTA, Region.SANMA, Region.SANWONG, Region.HKM],
  [AREA_PARENT_VALUES.TAIPA_AREA]: [Region.FAHUA, Region.AIRPORT, Region.LHOTEL, Region.RHOTEL, Region.UM, Region.HACS],
}

/** 商圈树形数据（与地圖規劃一致，支持二级选择） */
export const REGION_TREE_DATA = [
  {
    value: AREA_PARENT_VALUES.MACAU_AREA,
    title: '澳門區域',
    selectable: true,
    children: [
      { value: Region.KOKSAA, title: '黑沙環區' },
      { value: Region.COSTA, title: '高士德區' },
      { value: Region.SANMA, title: '新馬路區' },
      { value: Region.SANWONG, title: '新皇朝區' },
      { value: Region.HKM, title: '港珠澳區' },
    ],
  },
  {
    value: AREA_PARENT_VALUES.TAIPA_AREA,
    title: '氹仔區域',
    selectable: true,
    children: [
      { value: Region.FAHUA, title: '花城市區' },
      { value: Region.AIRPORT, title: '北安機場' },
      { value: Region.LHOTEL, title: '左酒店區' },
      { value: Region.RHOTEL, title: '右酒店區' },
      { value: Region.UM, title: '澳大專區' },
      { value: Region.HACS, title: '黑沙灘區' },
    ],
  },
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
