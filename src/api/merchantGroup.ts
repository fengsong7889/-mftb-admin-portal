import request from './request'
import type { OptionItem } from './types'

/** 商户集团信息 */
export interface MerchantGroupItem {
  id: number
  groupCode: string
  groupName: string
  loginAccount?: string
  storeCount: number
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 集团分页结果 */
export interface MerchantGroupPageResult {
  records: MerchantGroupItem[]
  total: number
}

/** 集团新增/编辑请求（集团ID 由后端自增生成，不可提交） */
export interface MerchantGroupPayload {
  groupName: string
  loginAccount?: string
}

/** 集团列表查询参数 */
export interface MerchantGroupQueryParams {
  page?: number
  size?: number
  /** 集团ID/名称 */
  keyword?: string
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

/** 分页查询集团 */
export function fetchMerchantGroups(params: MerchantGroupQueryParams) {
  return request.get<unknown, MerchantGroupPageResult>('/merchant-groups', { params })
}

/** 查询全部集团（下拉选项用） */
export function fetchAllMerchantGroups() {
  return request.get<unknown, MerchantGroupItem[]>('/merchant-groups/all')
}

/** 集团ID/名称搜索下拉选项（选项值为集团ID） */
export function fetchMerchantGroupOptions(keyword: string) {
  return request.get<unknown, OptionItem[]>('/merchant-groups/options', { params: { keyword } })
}

/** 集团最后更新人搜索下拉选项 */
export function fetchMerchantGroupUpdatedByOptions(keyword: string) {
  return request.get<unknown, OptionItem[]>('/merchant-groups/updated-by-options', { params: { keyword } })
}

/** 新增集团 */
export function createMerchantGroup(data: MerchantGroupPayload) {
  return request.post<unknown, MerchantGroupItem>('/merchant-groups', data)
}

/** 编辑集团 */
export function updateMerchantGroup(id: number, data: MerchantGroupPayload) {
  return request.put<unknown, MerchantGroupItem>(`/merchant-groups/${id}`, data)
}
