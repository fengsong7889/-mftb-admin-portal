import { AppType, RecommendChannel, AlgorithmType, Region, ServiceStatus, OrderStatus, RecallDimension, RankingStage, BidMode, TimeSlot } from './constants'

// ---- 召回层类型 ----

export interface RecallStrategy {
  id: number
  name: string
  dimension: RecallDimension
  source: string
  priority: number
  recallCount: number
  app: AppType
  channel: RecommendChannel
  status: ServiceStatus
  createdAt: string
  updatedAt: string
}

export interface RecallSource {
  id: number
  name: string
  type: string
  dimension: RecallDimension
  config: Record<string, any>
  strategyCount?: number
  status: ServiceStatus
}

// ---- 排序层类型 ----

export interface RankingConfig {
  id: number
  stage: RankingStage
  name: string
  modelVersion: string
  threshold?: number
  candidateCount?: number
  features: string[]
  app: AppType
  channel: RecommendChannel
  status: ServiceStatus
  createdAt: string
  updatedAt: string
}

export interface RerankRule {
  id: number
  name: string
  type: 'diversity' | 'scatter' | 'business' | 'traffic'
  config: Record<string, any>
  priority: number
  status: ServiceStatus
}

// ---- 策略层类型 ----

export interface AdTypeStrategy {
  id: number
  algorithmType: AlgorithmType
  name: string
  config: Record<string, any>
  app: AppType
  channel: RecommendChannel
  timeSlot: TimeSlot
  status: ServiceStatus
  createdAt: string
  updatedAt: string
}

export interface StrategyOrchestration {
  id: number
  name: string
  strategies: number[]
  priority: number
  conflictResolution: string
  scope: {
    app: AppType
    channel: RecommendChannel
    region: Region
    timeSlot: TimeSlot
  }
  status: ServiceStatus
}

export interface ABTest {
  id: number
  name: string
  description: string
  trafficSplit: { control: number; experiment: number }
  variables: Record<string, any>
  startDate: string
  endDate: string
  status: 'running' | 'completed' | 'stopped'
  results?: {
    metric: string
    control: number
    experiment: number
    pValue: number
    significant: boolean
  }[]
}

// ---- 投放层类型 ----

/** 瀑布流坑位配置 */
export interface WaterfallSlotConfig {
  id: number
  adId?: string                         // 广告ID
  promotionName?: string                // 广告名称
  app: AppType                        // 所属品牌
  channel: RecommendChannel           // 业务频道
  slotPosition: number                // 展示位置(坑位序号)
  region?: Region                     // 展示区域
  algorithmId: number                 // 关联算法ID
  algorithmName: string               // 关联算法名称(冗余字段,便于展示)
  algorithmType: AlgorithmType        // 算法类型(冗余字段,便于筛选)
  
  // 销售日期范围
  salesStartDate?: string             // 销售日期起
  salesEndDate?: string               // 销售日期止
  
  // 坑位级别覆盖的关键参数
  purchaseLimit?: {                   // 购买上限(仅当算法支持连续购买时有效)
    days: number
    quantity: number
  }
  purchaseInterval?: number           // 间隔天数(仅当算法不支持连续购买时有效)
  merchantLimit: 'limited' | 'unlimited'  // 商家限制
  merchantIds?: number[]              // 限制的商家ID列表
  regionLimit: 'limited' | 'unlimited'    // 区域限制
  regionIds?: number[]                // 限制的区域ID列表
  
  status: ServiceStatus               // 启用/停用
  updatedBy: string                   // 最后更新人
  updatedAt: string                   // 最后更新时间
  createdAt: string
}

export interface WaterfallConfig {
  id: number
  app: AppType
  channel: RecommendChannel
  name: string
  slots: {
    position: number
    algorithmType: AlgorithmType
    priority: number
  }[]
  status: ServiceStatus
  createdAt: string
  updatedAt: string
}

export interface MerchantRule {
  id: number
  name: string
  type: 'newStore' | 'rating' | 'business' | 'region' | 'blacklist' | 'whitelist'
  config: Record<string, any>
  status: ServiceStatus
}

// ---- 效果分析类型 ----

export interface UserProfile {
  id: number
  userId: string
  tags: {
    basic: Record<string, any>
    behavior: Record<string, any>
    preference: Record<string, any>
  }
  browseHistory: string[]
  purchasePreference: {
    categories: string[]
    priceRange: [number, number]
    frequency: 'high' | 'medium' | 'low'
  }
}

// ---- 查询参数类型 ----

export interface RecallQueryParams {
  app?: AppType
  name?: string
  dimension?: RecallDimension
  status?: ServiceStatus
  channel?: RecommendChannel
}

export interface RankingQueryParams {
  app?: AppType
  name?: string
  stage?: RankingStage
  status?: ServiceStatus
  channel?: RecommendChannel
}

export interface StrategyQueryParams {
  app?: AppType
  name?: string
  algorithmType?: AlgorithmType
  status?: ServiceStatus
  channel?: RecommendChannel
  timeSlot?: TimeSlot
}

export interface WaterfallQueryParams {
  app?: AppType
  name?: string
  status?: ServiceStatus
  channel?: RecommendChannel
}

// ---- 通用类型 ----

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface UseListResult<T, Q> {
  data: T[]
  loading: boolean
  error: Error | null
  pagination: { current: number; pageSize: number; total: number }
  query: Q
  fetchData: (params?: Partial<Q>) => void
  reset: () => void
}
