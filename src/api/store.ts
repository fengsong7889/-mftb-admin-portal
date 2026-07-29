import request from './request'
import type { OptionItem } from './types'

/** 门店信息 */
export interface StoreItem {
  id: number
  groupId: number
  groupCode: string
  groupName: string
  storeCode: string
  storeName: string
  brand?: string
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

/** 分页查询门店 */
export function fetchStores(params: StoreQueryParams) {
  return request.get<unknown, StorePageResult>('/stores', { params })
}

/** 按集团查询门店（下拉选项用） */
export function fetchStoresByGroup(groupId: number) {
  return request.get<unknown, StoreItem[]>(`/stores/by-group/${groupId}`)
}

/** 门店ID/名称搜索下拉选项（选项值为门店ID） */
export function fetchStoreOptions(keyword: string) {
  return request.get<unknown, OptionItem[]>('/stores/options', { params: { keyword } })
}

/** 门店最后更新人搜索下拉选项 */
export function fetchStoreUpdatedByOptions(keyword: string) {
  return request.get<unknown, OptionItem[]>('/stores/updated-by-options', { params: { keyword } })
}

/** 新增门店 */
export function createStore(data: StorePayload) {
  return request.post<unknown, StoreItem>('/stores', data)
}

/** 编辑门店 */
export function updateStore(id: number, data: StorePayload) {
  return request.put<unknown, StoreItem>(`/stores/${id}`, data)
}
