import request, { SILENT_HEADER, isBackendUnavailable } from './request'
import type { OptionItem } from './types'
import {
  mockFetchMerchantGroups,
  mockFetchAllMerchantGroups,
  mockFetchMerchantGroupOptions,
  mockFetchMerchantGroupUpdatedByOptions,
  mockCreateMerchantGroup,
  mockUpdateMerchantGroup,
  mockDeleteMerchantGroup,
} from './mock/merchantMock'

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

/** 静默请求头：后端不可用时降级到 Mock，不弹全局错误提示 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 分页查询集团（后端不可用时自动降级到本地 Mock 数据） */
export async function fetchMerchantGroups(params: MerchantGroupQueryParams) {
  try {
    return await request.get<unknown, MerchantGroupPageResult>('/merchant-groups', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchMerchantGroups(params)
    throw err
  }
}

/** 查询全部集团（下拉选项用） */
export async function fetchAllMerchantGroups() {
  try {
    return await request.get<unknown, MerchantGroupItem[]>('/merchant-groups/all', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchAllMerchantGroups()
    throw err
  }
}

/** 集团ID/名称搜索下拉选项（选项值为集团ID） */
export async function fetchMerchantGroupOptions(keyword: string) {
  try {
    return await request.get<unknown, OptionItem[]>('/merchant-groups/options', { params: { keyword }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchMerchantGroupOptions(keyword)
    throw err
  }
}

/** 集团最后更新人搜索下拉选项 */
export async function fetchMerchantGroupUpdatedByOptions(keyword: string) {
  try {
    return await request.get<unknown, OptionItem[]>('/merchant-groups/updated-by-options', { params: { keyword }, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchMerchantGroupUpdatedByOptions(keyword)
    throw err
  }
}

/** 新增集团 */
export async function createMerchantGroup(data: MerchantGroupPayload) {
  try {
    return await request.post<unknown, MerchantGroupItem>('/merchant-groups', data, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockCreateMerchantGroup(data)
    throw err
  }
}

/** 编辑集团 */
export async function updateMerchantGroup(id: number, data: MerchantGroupPayload) {
  try {
    return await request.put<unknown, MerchantGroupItem>(`/merchant-groups/${id}`, data, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockUpdateMerchantGroup(id, data)
    throw err
  }
}

/** 删除集团 */
export async function deleteMerchantGroup(id: number) {
  try {
    return await request.delete<unknown, void>(`/merchant-groups/${id}`, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return mockDeleteMerchantGroup(id)
    throw err
  }
}
