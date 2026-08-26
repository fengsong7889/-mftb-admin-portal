import request, { SILENT_HEADER, isBackendUnavailable } from './request'
import {
  mockPeriods,
  mockFetchRegisters,
  mockImportRegisters,
  mockFetchStats,
  mockImportStats,
  mockFetchOverview,
  mockImportSummary,
} from './mock/flashSaleMock'

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/**
 * 业务层服务端异常（HTTP 200 + code 500，如后端未完整重启导致新表缺失）
 * 也视为后端不可用，GET 类接口降级到 mock，保证一期演示体验
 */
const isServerSideFailure = (err: unknown): boolean =>
  err instanceof Error && (err.message.includes('数据库操作异常') || err.message.includes('系统繁忙'))

const shouldFallback = (err: unknown): boolean => isBackendUnavailable(err) || isServerSideFailure(err)

/* ─────────────── 类型定义 ─────────────── */

/** 阶梯（价+库存+补贴） */
export interface FlashSaleTier {
  tierNo: number
  tierPrice: number
  tierStock: number
  /** 阶梯补贴（统计来源可为 null） */
  tierSubsidy?: number | null
}

/** 期数 */
export interface FlashSalePeriod {
  id: number
  periodNo: number
  startDate?: string | null
  endDate?: string | null
  status: number
  remark?: string | null
}

/** 登记列表视图 */
export interface FlashSaleRegisterVO {
  id: number
  periodNo: number
  seqNo?: number | null
  subsidyType: string
  storeCodes?: string | null
  storeNames?: string | null
  bdNames?: string | null
  productId: string
  productName?: string | null
  productType?: string | null
  maxPurchase?: string | null
  priceType: string
  originalPrice?: number | null
  groupPrice?: number | null
  flashSalePrice?: number | null
  /** 秒杀库存（单一价格） */
  flashSaleStock?: number | null
  currentSales: number
  /** 近3期销量黑榜 */
  blacklist: boolean
  tiers: FlashSaleTier[]
}

/** 登记导入行 */
export interface FlashSaleRegisterRow {
  seqNo?: number | null
  subsidyType: string
  storeNames?: string | null
  productId: string
  productName?: string | null
  productType?: string | null
  maxPurchase?: string | null
  priceType?: string | null
  originalPrice?: number | null
  groupPrice?: number | null
  flashSalePrice?: number | null
  /** 秒杀库存（单一价格） */
  flashSaleStock?: number | null
  currentSales?: number | null
  tiers?: FlashSaleTier[]
}

/** 统计列表视图 */
export interface FlashSaleStatsVO {
  id: number
  periodNo: number
  productId: string
  productName?: string | null
  storeNames?: string | null
  priceType: string
  /** 秒杀价（单一价格） */
  flashSalePrice?: number | null
  orderUsers?: number | null
  totalPrice?: number | null
  totalOrders?: number | null
  totalSales?: number | null
  actualAmount?: number | null
  orderUsersChange?: number | null
  totalPriceChange?: number | null
  totalOrdersChange?: number | null
  totalSalesChange?: number | null
  actualAmountChange?: number | null
  subsidyType?: string | null
  discountRate?: number | null
  lastPeriodSubsidy?: string | null
  bdName?: string | null
  tiers: FlashSaleTier[]
}

/** 统计导入行 */
export interface FlashSaleStatsRow {
  productId: string
  productName?: string | null
  storeNames?: string | null
  priceType?: string | null
  /** 秒杀价（单一价格） */
  flashSalePrice?: number | null
  orderUsers?: number | null
  totalPrice?: number | null
  totalOrders?: number | null
  totalSales?: number | null
  actualAmount?: number | null
  orderUsersChange?: number | null
  totalPriceChange?: number | null
  totalOrdersChange?: number | null
  totalSalesChange?: number | null
  actualAmountChange?: number | null
  subsidyType?: string | null
  discountRate?: number | null
  lastPeriodSubsidy?: string | null
  bdName?: string | null
  tiers?: FlashSaleTier[]
}

/** 汇总导入行（statDate 为 null 表示整期合计行） */
export interface FlashSaleSummaryRow {
  statDate?: string | null
  totalPayable?: number | null
  totalActual?: number | null
  totalOrders?: number | null
  totalSales?: number | null
  totalProducts?: number | null
  soldProducts?: number | null
  buyers?: number | null
  repurchaseBuyers?: number | null
  repurchaseRate?: number | null
  avgOrderValue?: number | null
}

/** 总览每日行 */
export interface FlashSaleSummaryDayVO {
  statDate: string | null
  totals: boolean
  totalPayable?: number | null
  totalActual?: number | null
  totalOrders?: number | null
  totalSales?: number | null
  totalProducts?: number | null
  soldProducts?: number | null
  soldRate?: number | null
  buyers?: number | null
  repurchaseBuyers?: number | null
  repurchaseRate?: number | null
  avgOrderValue?: number | null
  payableChange?: number | null
  actualChange?: number | null
  ordersChange?: number | null
  salesChange?: number | null
  buyersChange?: number | null
}

/** 总览视图 */
export interface FlashSaleOverviewVO {
  periodNo?: number | null
  totals?: FlashSaleSummaryDayVO | null
  daily: FlashSaleSummaryDayVO[]
}

/** 导入结果 */
export interface FlashSaleImportResult {
  successCount: number
  errors: Array<{ rowIndex: number; reason: string }>
}

/** 分页结果 */
export interface FlashSalePageResult<T> {
  records: T[]
  total: number
}

/* ─────────────── 接口 ─────────────── */

/** 期数下拉 */
export async function fetchFlashSalePeriods(): Promise<FlashSalePeriod[]> {
  try {
    return await request.get<unknown, FlashSalePeriod[]>('/flash-sale/periods', SILENT)
  } catch (err) {
    if (shouldFallback(err)) return mockPeriods
    throw err
  }
}

/** 登记分页列表 */
export async function fetchFlashSaleRegisters(params: {
  periodNo?: number; subsidyType?: string; productType?: string; bd?: string; keyword?: string
  page?: number; size?: number
}): Promise<FlashSalePageResult<FlashSaleRegisterVO>> {
  try {
    return await request.get<unknown, FlashSalePageResult<FlashSaleRegisterVO>>('/flash-sale/registers', { params, ...SILENT })
  } catch (err) {
    if (shouldFallback(err)) return mockFetchRegisters(params)
    throw err
  }
}

/** 登记导入 */
export async function importFlashSaleRegisters(periodNo: number, rows: FlashSaleRegisterRow[]): Promise<FlashSaleImportResult> {
  try {
    return await request.post<unknown, FlashSaleImportResult>('/flash-sale/registers/import', { periodNo, rows }, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockImportRegisters(rows)
    throw err
  }
}

/** 统计分页列表 */
export async function fetchFlashSaleStats(params: {
  periodNo?: number; subsidyType?: string; bd?: string; keyword?: string; page?: number; size?: number
}): Promise<FlashSalePageResult<FlashSaleStatsVO>> {
  try {
    return await request.get<unknown, FlashSalePageResult<FlashSaleStatsVO>>('/flash-sale/stats', { params, ...SILENT })
  } catch (err) {
    if (shouldFallback(err)) return mockFetchStats(params)
    throw err
  }
}

/** 统计导入 */
export async function importFlashSaleStats(periodNo: number, rows: FlashSaleStatsRow[]): Promise<FlashSaleImportResult> {
  try {
    return await request.post<unknown, FlashSaleImportResult>('/flash-sale/stats/import', { periodNo, rows }, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockImportStats(rows)
    throw err
  }
}

/** 每日汇总导入 */
export async function importFlashSaleSummary(periodNo: number, rows: FlashSaleSummaryRow[]): Promise<FlashSaleImportResult> {
  try {
    return await request.post<unknown, FlashSaleImportResult>('/flash-sale/summary/import', { periodNo, rows }, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockImportSummary(rows)
    throw err
  }
}

/** 数据总览 */
export async function fetchFlashSaleOverview(periodNo?: number): Promise<FlashSaleOverviewVO> {
  try {
    return await request.get<unknown, FlashSaleOverviewVO>('/flash-sale/overview', { params: { periodNo }, ...SILENT })
  } catch (err) {
    if (shouldFallback(err)) return mockFetchOverview(periodNo)
    throw err
  }
}
