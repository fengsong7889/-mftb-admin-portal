import request, { SILENT_HEADER, isBackendUnavailable } from './request'
import type { OptionItem } from './types'
import {
  mockFetchStores,
  mockFetchStoresByGroup,
  mockFetchStoresByGroupCode,
  mockFetchStoreOptions,
  mockFetchStoreUpdatedByOptions,
  mockCreateStore,
  mockUpdateStore,
  mockDeleteStore,
  mockFetchStoreBds,
  mockAddStoreBd,
  mockRemoveStoreBd,
  mockFetchStoreBdOptions,
} from './mock/merchantMock'

/** 门店已绑定的BD（含员工部门/职位/职级） */
export interface StoreBdItem {
  /** 绑定记录ID */
  id: number
  /** BD员工工号 */
  bdEmpId: string
  /** BD员工姓名 */
  bdName?: string
  /** 所在部门 */
  department?: string
  /** 职位 */
  position?: string
  /** 职级 (如 M3 / T5 / P2) */
  jobLevel?: string
}

/** 门店信息 */
export interface StoreItem {
  id: number
  groupId: number
  groupCode: string
  groupName: string
  storeCode: string
  storeName: string
  brand?: string
  bizType?: string
  bizChannel?: string
  loginAccount?: string
  /** 所在区域/商圈: 1=黑沙环区 … 11=黑沙滩区（盘活复苏按商圈售卖时跟随门店） */
  region?: number | null
  /** 门店地址（用户手动输入） */
  address?: string
  /** 已绑定的BD列表（一家门店可绑定多个） */
  bdList?: StoreBdItem[]
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 门店分页结果 */
export interface StorePageResult {
  records: StoreItem[]
  total: number
}

/** 门店新增/编辑请求（门店ID 由后端自增生成，不可提交） */
export interface StorePayload {
  groupId: number
  storeName: string
  brand?: string
  bizType?: string
  bizChannel?: string
  loginAccount?: string
  /** 所在区域/商圈 */
  region?: number | null
  /** 门店地址 */
  address?: string
}

/** 门店列表查询参数 */
export interface StoreQueryParams {
  page?: number
  size?: number
  /** 所属集团主键（精确匹配） */
  groupId?: number
  /** 所属集团ID/名称 */
  groupKeyword?: string
  /** 门店ID/名称 */
  keyword?: string
  /** 所属品牌 */
  brand?: string
  /** 业务频道 */
  bizChannel?: string
  /** 最后更新人 */
  updatedBy?: string
  /** 最后更新时间-开始日期 YYYY-MM-DD */
  updatedFrom?: string
  /** 最后更新时间-结束日期 YYYY-MM-DD */
  updatedTo?: string
  /** 创建时间-开始日期 YYYY-MM-DD */
  createdFrom?: string
  /** 创建时间-结束日期 YYYY-MM-DD */
  createdTo?: string
}

/** 静默请求头：后端不可用时降级到 Mock，不弹全局错误提示 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 分页查询门店（后端不可用时自动降级到本地 Mock 数据） */
export async function fetchStores(params: StoreQueryParams) {
  try {
    return await request.get<unknown, StorePageResult>('/stores', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStores(params)
    throw err
  }
}

/** 按集团ID查询门店（下拉选项用） */
export async function fetchStoresByGroup(groupId: number) {
  try {
    return await request.get<unknown, StoreItem[]>(`/stores/by-group/${groupId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStoresByGroup(groupId)
    throw err
  }
}

/** 按集团编码+品牌查询门店（充值扣款门店下拉用） */
export async function fetchStoresByGroupCode(groupCode: string, brand?: string) {
  try {
    return await request.get<unknown, OptionItem[]>('/stores/by-group-code', { params: { groupCode, brand }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStoresByGroupCode(groupCode, brand)
    throw err
  }
}

/** 门店ID/名称搜索下拉选项（选项值为门店ID） */
export async function fetchStoreOptions(keyword: string) {
  try {
    return await request.get<unknown, OptionItem[]>('/stores/options', { params: { keyword }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStoreOptions(keyword)
    throw err
  }
}

/** 门店最后更新人搜索下拉选项 */
export async function fetchStoreUpdatedByOptions(keyword: string) {
  try {
    return await request.get<unknown, OptionItem[]>('/stores/updated-by-options', { params: { keyword }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStoreUpdatedByOptions(keyword)
    throw err
  }
}

/** 新增门店 */
export async function createStore(data: StorePayload) {
  try {
    return await request.post<unknown, StoreItem>('/stores', data)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockCreateStore(data)
    throw err
  }
}

/** 编辑门店 */
export async function updateStore(id: number, data: StorePayload) {
  try {
    return await request.put<unknown, StoreItem>(`/stores/${id}`, data)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockUpdateStore(id, data)
    throw err
  }
}

/** 删除门店 */
export async function deleteStore(id: number) {
  try {
    return await request.delete<unknown, void>(`/stores/${id}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockDeleteStore(id)
    throw err
  }
}

/** 查询门店已绑定的BD列表（含部门/职位/职级） */
export async function fetchStoreBds(storeId: number) {
  try {
    return await request.get<unknown, StoreBdItem[]>(`/stores/${storeId}/bds`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStoreBds(storeId)
    throw err
  }
}

/** 新增绑定BD */
export async function addStoreBd(storeId: number, bdEmpId: string) {
  try {
    return await request.post<unknown, StoreBdItem>(`/stores/${storeId}/bds`, { bdEmpId }, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockAddStoreBd(storeId, bdEmpId)
    throw err
  }
}

/** 解除绑定BD */
export async function removeStoreBd(storeId: number, bindId: number) {
  try {
    return await request.delete<unknown, void>(`/stores/${storeId}/bds/${bindId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockRemoveStoreBd(storeId, bindId)
    throw err
  }
}

/** 按集团ID（group_code）查询集团下门店已绑定的BD选项（推广金充值归属BD用） */
export async function fetchStoreBdOptions(groupCode: string) {
  try {
    return await request.get<unknown, OptionItem[]>('/stores/bd-options', { params: { groupCode }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStoreBdOptions(groupCode)
    throw err
  }
}

/* ==================== 門店金字招牌數據配置 ==================== */

/** 門店金字招牌數據配置 */
export interface StoreDataConfigPayload {
  /** 月訂單數 */
  monthlyOrders?: number
  /** 月復購訂單數據 */
  monthlyRepurchaseOrders?: number
  /** 月好評訂單數據 */
  monthlyPositiveOrders?: number
  /** 月訪問量 */
  monthlyVisits?: number
  /** 門店收藏數 */
  storeFavorites?: number
  /** 顧客數 */
  monthlyCustomers?: number
}

/** 查詢門店金字招牌數據配置 */
export async function fetchStoreDataConfig(storeId: number) {
  try {
    return await request.get<unknown, StoreDataConfigPayload>(`/stores/${storeId}/data-config`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      // Mock：系統按門店ID預生成一批隨機數據，避免逐個手工配置
      return generateStoreDataConfig(storeId)
    }
    throw err
  }
}

/**
 * 系統預生成門店數據配置：以 storeId 為種子的確定性隨機（mulberry32），
 * 同一門店每次生成的數據保持一致，不同門店數據各異，免去逐個手工配置。
 */
export function generateStoreDataConfig(storeId: number): StoreDataConfigPayload {
  let seed = (storeId * 2654435761) >>> 0
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const between = (min: number, max: number) => Math.round(min + rnd() * (max - min))

  const monthlyOrders = between(300, 2000)
  return {
    monthlyOrders,
    // 復購訂單約佔月訂單 10%~30%
    monthlyRepurchaseOrders: Math.round(monthlyOrders * (0.1 + rnd() * 0.2)),
    // 好評訂單約佔月訂單 40%~80%
    monthlyPositiveOrders: Math.round(monthlyOrders * (0.4 + rnd() * 0.4)),
    // 訪問量約為月訂單 2~5 倍
    monthlyVisits: monthlyOrders * between(2, 5),
    storeFavorites: between(100, 1000),
    // 顧客數約佔月訂單 50%~90%
    monthlyCustomers: Math.round(monthlyOrders * (0.5 + rnd() * 0.4)),
  }
}

/** 保存門店金字招牌數據配置 */
export async function updateStoreDataConfig(storeId: number, data: StoreDataConfigPayload) {
  try {
    return await request.put<unknown, void>(`/stores/${storeId}/data-config`, data)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      // Mock：靜默成功
      return
    }
    throw err
  }
}
