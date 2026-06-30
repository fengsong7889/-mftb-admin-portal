// 推广通报表分析 - 类型定义

/** 推荐类型枚举 */
export enum ReportRecommendType {
  INVINCIBLE_STAR = 1,      // 無敵星星
  REVITALIZATION_AD = 2,    // 盤活復蘇
  NEW_STORE_AD = 3,         // 新店廣告
  TRAFFIC_AD = 4,           // 流量廣告
}

export const REPORT_RECOMMEND_TYPE_LABEL: Record<ReportRecommendType, string> = {
  [ReportRecommendType.INVINCIBLE_STAR]: '無敵星星',
  [ReportRecommendType.REVITALIZATION_AD]: '盤活復蘇',
  [ReportRecommendType.NEW_STORE_AD]: '新店廣告',
  [ReportRecommendType.TRAFFIC_AD]: '流量廣告',
}

export const REPORT_RECOMMEND_TYPE_COLOR: Record<ReportRecommendType, string> = {
  [ReportRecommendType.INVINCIBLE_STAR]: 'gold',
  [ReportRecommendType.REVITALIZATION_AD]: 'green',
  [ReportRecommendType.NEW_STORE_AD]: 'blue',
  [ReportRecommendType.TRAFFIC_AD]: 'purple',
}

/** 所属品牌枚举 */
export enum ReportApp {
  SHANFENG = 1,
  MFOOD = 2,
}

export const REPORT_APP_LABEL: Record<ReportApp, string> = {
  [ReportApp.SHANFENG]: '閃峰',
  [ReportApp.MFOOD]: 'mFood',
}

/** 业务频道枚举 */
export enum ReportChannel {
  FOOD_DELIVERY = 1,      // 美食外賣
  RETAIL = 2,             // 零售閃購
  GROUP_BUY = 3,          // 團購到店
}

export const REPORT_CHANNEL_LABEL: Record<ReportChannel, string> = {
  [ReportChannel.FOOD_DELIVERY]: '美食外賣',
  [ReportChannel.RETAIL]: '零售閃購',
  [ReportChannel.GROUP_BUY]: '團購到店',
}

/** 商圈枚举 */
export enum ReportRegion {
  MACAU = 1,
  TAIPA = 2,
  ZHUHAI = 3,
}

export const REPORT_REGION_LABEL: Record<ReportRegion, string> = {
  [ReportRegion.MACAU]: '澳門',
  [ReportRegion.TAIPA]: '氹仔',
  [ReportRegion.ZHUHAI]: '珠海',
}

/** 广告状态枚举 */
export enum ReportAdStatus {
  ONLINE = 1,     // 上線
  PAUSED = 2,     // 暫停
  OFFLINE = 3,    // 下線
}

export const REPORT_AD_STATUS_LABEL: Record<ReportAdStatus, { label: string; color: string }> = {
  [ReportAdStatus.ONLINE]: { label: '上線', color: 'green' },
  [ReportAdStatus.PAUSED]: { label: '暫停', color: 'orange' },
  [ReportAdStatus.OFFLINE]: { label: '下線', color: 'red' },
}

/** 时段枚举 */
export enum ReportTimeSlot {
  BREAKFAST = 1,    // 早餐 07:00-10:00
  LUNCH = 2,        // 午餐 11:00-14:00
  DINNER = 3,       // 晚餐 17:00-20:00
  NIGHT_SNACK = 4,  // 夜宵 20:00-23:00
}

export const REPORT_TIME_SLOT_LABEL: Record<ReportTimeSlot, string> = {
  [ReportTimeSlot.BREAKFAST]: '早餐 07:00-10:00',
  [ReportTimeSlot.LUNCH]: '午餐 11:00-14:00',
  [ReportTimeSlot.DINNER]: '晚餐 17:00-20:00',
  [ReportTimeSlot.NIGHT_SNACK]: '夜宵 20:00-23:00',
}

/** 订单效果报表项 */
export interface OrderReportItem {
  id: string
  orderNo: string                    // 訂單編號
  promotionName: string              // 推廣活動名稱
  recommendType: ReportRecommendType // 推薦類型
  app: ReportApp                     // 所屬品牌
  channel: ReportChannel             // 業務頻道
  region: ReportRegion               // 商圈
  promotionPeriod: string            // 推廣期間 (開始-結束)
  startDate: string                  // 開始時間
  endDate: string                    // 結束時間
  
  // 核心指标
  impressions: number                // 曝光量
  clicks: number                     // 點擊量
  ctr: number                        // 點擊率 (%)
  cpc: number                        // 點擊成本
  conversions: number                // 轉化訂單數
  cvr: number                        // 轉化率 (%)
  cost: number                       // 消耗金額
  revenue: number                    // 產出金額
  roi: number                        // ROI (產出/消耗)
  
  adStatus: ReportAdStatus           // 廣告狀態
  orderTime: string                  // 訂單時間
  payTime: string                    // 支付時間
}

/** 时段效果数据 */
export interface TimeSlotReport {
  timeSlot: ReportTimeSlot
  timeSlotLabel: string
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  conversions: number
  cvr: number
  cost: number
}

/** 日趋势数据 */
export interface DailyTrend {
  date: string
  impressions: number
  clicks: number
  conversions: number
  cost: number
}

/** 推荐类型对比数据 */
export interface RecommendTypeCompare {
  recommendType: ReportRecommendType
  recommendTypeLabel: string
  
  // 总计数据
  totalImpressions: number
  totalClicks: number
  avgCtr: number
  avgCpc: number
  avgCvr: number
  totalCost: number
  totalRevenue: number
  avgRoi: number
  
  // 订单数量
  orderCount: number
}

/** 概览数据卡片 */
export interface OverviewMetrics {
  todayImpressions: number
  yesterdayImpressions: number
  todayClicks: number
  yesterdayClicks: number
  todayCpc: number
  todayCvr: number
  totalCost: number
  avgRoi: number
}

/** 查询参数 */
export interface ReportQueryParams {
  dateRange?: [string, string]       // 时间范围
  orderNo?: string                   // 订单编号
  promotionName?: string             // 推广活动名称
  recommendType?: ReportRecommendType[] // 推荐类型
  app?: ReportApp                    // 所属品牌
  channel?: ReportChannel            // 业务频道
  region?: ReportRegion              // 商圈
  adStatus?: ReportAdStatus          // 广告状态
}
