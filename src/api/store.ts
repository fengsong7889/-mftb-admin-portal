import request, { SILENT_HEADER, isBackendUnavailable } from './request'
import type { OptionItem } from './types'
import {
  mockFetchStores,
  mockFetchStoresByGroup,
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

/** 按集团查询门店（下拉选项用） */
export async function fetchStoresByGroup(groupId: number) {
  try {
    return await request.get<unknown, StoreItem[]>(`/stores/by-group/${groupId}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchStoresByGroup(groupId)
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
    return await request.post<unknown, StoreItem>('/stores', data, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockCreateStore(data)
    throw err
  }
}

/** 编辑门店 */
export async function updateStore(id: number, data: StorePayload) {
  try {
    return await request.put<unknown, StoreItem>(`/stores/${id}`, data, SILENT)
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
