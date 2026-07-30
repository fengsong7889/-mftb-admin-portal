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
} from './mock/merchantMock'

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
