/** 所属APP */
export enum AppType {
  SHANFENG = 1,
  MFOOD = 2,
}

export const APP_OPTIONS = [
  { labelKey: 'recommend.appShanfeng', value: AppType.SHANFENG },
  { labelKey: 'recommend.appMfood', value: AppType.MFOOD },
]

/** 业务频道（推荐瀑布流） */
export enum RecommendChannel {
  HOME = 1,           // 大首页
  DELIVERY = 2,       // 外卖频道
  SUPERMARKET = 3,    // 超市百货
  GROUP_BUY = 4,      // 团购到店
}

export const RECOMMEND_CHANNEL_OPTIONS = [
  { labelKey: 'recommend.channelHome', value: RecommendChannel.HOME },
  { labelKey: 'recommend.channelDelivery', value: RecommendChannel.DELIVERY },
  { labelKey: 'recommend.channelSupermarket', value: RecommendChannel.SUPERMARKET },
  { labelKey: 'recommend.channelGroupBuy', value: RecommendChannel.GROUP_BUY },
]

/** 投放界面 */
export enum PlacementInterface {
  HOME = 1,           // 大首页
  DELIVERY = 2,       // 外卖频道
  SUPERMARKET = 3,    // 超市频道
  GROUP_BUY = 4,      // 团购频道
}

export const PLACEMENT_INTERFACE_OPTIONS = [
  { labelKey: 'recommend.placementHomeFeed', value: PlacementInterface.HOME },
  { labelKey: 'recommend.placementDeliveryFeed', value: PlacementInterface.DELIVERY },
  { labelKey: 'recommend.placementSupermarketFeed', value: PlacementInterface.SUPERMARKET },
  { labelKey: 'recommend.placementGroupBuyFeed', value: PlacementInterface.GROUP_BUY },
]

/** 算法类型 */
export enum AlgorithmType {
  INVINCIBLE_STAR = 1,    // 无敌星星
  NEW_STORE_AD = 2,       // 新店广告
  HOT_REVIVE_AD = 3,      // 盘活复苏
  EXCLUSIVE_MERCHANT = 4, // 独家商家
  TRAFFIC_AD = 15,        // 投流廣告
  GUESS_YOU_LIKE = 6,     // 猜你喜欢
  ORGANIC_TRAFFIC = 7,    // 自然流量
  POPULAR_MERCHANT_KA = 5, // 人气商家
  BRAND_MERCHANT = 11,       // 品牌商家(KA)
  GOLD_AD = 12,              // 点金广告
  GOLDEN_SIGNBOARD = 13,     // 金字招牌
  PRODUCT_PROMO = 14,        // 商品促销
}

export const ALGORITHM_TYPE_OPTIONS = [
  { labelKey: 'recommend.algoInvincibleStar', value: AlgorithmType.INVINCIBLE_STAR },
  { labelKey: 'recommend.algoNewStoreAd', value: AlgorithmType.NEW_STORE_AD },
  { labelKey: 'recommend.algoHotReviveAd', value: AlgorithmType.HOT_REVIVE_AD },
  { labelKey: 'recommend.algoExclusiveMerchant', value: AlgorithmType.EXCLUSIVE_MERCHANT },
  { labelKey: 'recommend.algoTrafficAd', value: AlgorithmType.TRAFFIC_AD },
  { labelKey: 'recommend.algoGuessYouLike', value: AlgorithmType.GUESS_YOU_LIKE },
  { labelKey: 'recommend.algoOrganicTraffic', value: AlgorithmType.ORGANIC_TRAFFIC },
  { labelKey: 'recommend.algoPopularMerchant', value: AlgorithmType.POPULAR_MERCHANT_KA },
  { labelKey: 'recommend.algoBrandMerchant', value: AlgorithmType.BRAND_MERCHANT },
  { labelKey: 'recommend.algoGoldAd', value: AlgorithmType.GOLD_AD },
  { labelKey: 'recommend.algoGoldenSignboard', value: AlgorithmType.GOLDEN_SIGNBOARD },
  { labelKey: 'recommend.algoProductPromo', value: AlgorithmType.PRODUCT_PROMO },
]

/** 算法类型对应卡片顶部装饰线颜色（与 CSS .algo-card-wrapper--* 类名一致） */
export const ALGO_CARD_COLOR_MAP: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'magenta',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.TRAFFIC_AD]: 'teal',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'red',
  [AlgorithmType.BRAND_MERCHANT]: 'orange',
  [AlgorithmType.GOLD_AD]: 'cyan',
  [AlgorithmType.GOLDEN_SIGNBOARD]: 'geekblue',
  [AlgorithmType.PRODUCT_PROMO]: 'volcano',
} as Record<AlgorithmType, string>

/** 区域（全系统唯一商圈枚举：定价/门店/购买/订单等所有商圈相关数据均引用此处） */
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
  // 珠海區域
  GONGBEI = 12,       // 拱北區域
  HENGQIN = 13,       // 横琴區域
}

export const REGION_OPTIONS = [
  { labelKey: 'recommend.regionKoksaa', value: Region.KOKSAA },
  { labelKey: 'recommend.regionCosta', value: Region.COSTA },
  { labelKey: 'recommend.regionSanma', value: Region.SANMA },
  { labelKey: 'recommend.regionSanwong', value: Region.SANWONG },
  { labelKey: 'recommend.regionHkm', value: Region.HKM },
  { labelKey: 'recommend.regionFahua', value: Region.FAHUA },
  { labelKey: 'recommend.regionAirport', value: Region.AIRPORT },
  { labelKey: 'recommend.regionLHotel', value: Region.LHOTEL },
  { labelKey: 'recommend.regionRHotel', value: Region.RHOTEL },
  { labelKey: 'recommend.regionUm', value: Region.UM },
  { labelKey: 'recommend.regionHacs', value: Region.HACS },
  { labelKey: 'recommend.regionGongbei', value: Region.GONGBEI },
  { labelKey: 'recommend.regionHengqin', value: Region.HENGQIN },
]

/** 商圈值 → i18n key 映射（由 REGION_OPTIONS 派生，唯一来源） */
export const REGION_LABEL_KEY: Record<number, string> = Object.fromEntries(
  REGION_OPTIONS.map(o => [o.value, o.labelKey]),
)

/** 区域父节点值（用于TreeSelect二级选择） */
export const AREA_PARENT_VALUES = {
  MACAU_AREA: 'macau_area',
  TAIPA_AREA: 'taipa_area',
  ZH_AREA: 'zh_area',
} as const

/** 区域 → 商圈映射（用于选择区域时过滤） */
export const AREA_TO_REGIONS: Record<string, Region[]> = {
  [AREA_PARENT_VALUES.MACAU_AREA]: [Region.KOKSAA, Region.COSTA, Region.SANMA, Region.SANWONG, Region.HKM],
  [AREA_PARENT_VALUES.TAIPA_AREA]: [Region.FAHUA, Region.AIRPORT, Region.LHOTEL, Region.RHOTEL, Region.UM, Region.HACS],
  [AREA_PARENT_VALUES.ZH_AREA]: [Region.GONGBEI, Region.HENGQIN],
}

/** 商圈树形数据（全系统唯一来源：定价选商圈/门店所在区域等二级选择均引用此处） */
export const REGION_TREE_DATA = [
  {
    value: AREA_PARENT_VALUES.MACAU_AREA,
    titleKey: 'recommend.areaMacau',
    selectable: true,
    children: [
      { value: Region.KOKSAA, titleKey: 'recommend.regionKoksaa' },
      { value: Region.COSTA, titleKey: 'recommend.regionCosta' },
      { value: Region.SANMA, titleKey: 'recommend.regionSanma' },
      { value: Region.SANWONG, titleKey: 'recommend.regionSanwong' },
      { value: Region.HKM, titleKey: 'recommend.regionHkm' },
    ],
  },
  {
    value: AREA_PARENT_VALUES.TAIPA_AREA,
    titleKey: 'recommend.areaTaipa',
    selectable: true,
    children: [
      { value: Region.FAHUA, titleKey: 'recommend.regionFahua' },
      { value: Region.AIRPORT, titleKey: 'recommend.regionAirport' },
      { value: Region.LHOTEL, titleKey: 'recommend.regionLHotel' },
      { value: Region.RHOTEL, titleKey: 'recommend.regionRHotel' },
      { value: Region.UM, titleKey: 'recommend.regionUm' },
      { value: Region.HACS, titleKey: 'recommend.regionHacs' },
    ],
  },
  {
    value: AREA_PARENT_VALUES.ZH_AREA,
    titleKey: 'recommend.areaZh',
    selectable: true,
    children: [
      { value: Region.GONGBEI, titleKey: 'recommend.regionGongbei' },
      { value: Region.HENGQIN, titleKey: 'recommend.regionHengqin' },
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
  { labelKey: 'recommend.orderPendingPayment', value: OrderStatus.PENDING_PAYMENT },
  { labelKey: 'recommend.orderPaid', value: OrderStatus.PAID },
  { labelKey: 'recommend.orderDelivering', value: OrderStatus.DELIVERING },
  { labelKey: 'recommend.orderCompleted', value: OrderStatus.COMPLETED },
  { labelKey: 'recommend.orderRefunded', value: OrderStatus.REFUNDED },
]

/** 服务状态 */
export enum ServiceStatus {
  ENABLED = 1,
  DISABLED = 2,
}

export const SERVICE_STATUS_OPTIONS = [
  { labelKey: 'recommend.statusEnabled', value: ServiceStatus.ENABLED },
  { labelKey: 'recommend.statusDisabled', value: ServiceStatus.DISABLED },
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
  { labelKey: 'recommend.recallMerchant', value: RecallDimension.MERCHANT },
  { labelKey: 'recommend.recallItem', value: RecallDimension.ITEM },
  { labelKey: 'recommend.recallCommercial', value: RecallDimension.COMMERCIAL },
  { labelKey: 'recommend.recallUser', value: RecallDimension.USER },
  { labelKey: 'recommend.recallPlatform', value: RecallDimension.PLATFORM },
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
  { labelKey: 'recommend.stageCoarse', value: RankingStage.COARSE },
  { labelKey: 'recommend.stageFine', value: RankingStage.FINE },
  { labelKey: 'recommend.stageRerank', value: RankingStage.RERANK },
]

/** 出价模式 */
export enum BidMode {
  CPC = 1,   // 按点击付费
  CPM = 2,   // 按展示付费
  OCPC = 3,  // 优化点击付费
}

export const BID_MODE_OPTIONS = [
  { labelKey: 'recommend.bidCpc', value: BidMode.CPC },
  { labelKey: 'recommend.bidCpm', value: BidMode.CPM },
  { labelKey: 'recommend.bidOcpc', value: BidMode.OCPC },
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
  { labelKey: 'recommend.slotAllDay', value: TimeSlot.ALL_DAY },
  { labelKey: 'recommend.slotBreakfast', value: TimeSlot.BREAKFAST },
  { labelKey: 'recommend.slotLunch', value: TimeSlot.LUNCH },
  { labelKey: 'recommend.slotAfternoon', value: TimeSlot.AFTERNOON },
  { labelKey: 'recommend.slotDinner', value: TimeSlot.DINNER },
  { labelKey: 'recommend.slotNightSnack', value: TimeSlot.NIGHT_SNACK },
]
