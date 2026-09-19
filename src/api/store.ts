import request from './request'
import type { OptionItem } from './types'

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
  /** 资产品牌 */
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
export async function fetchStores(params: StoreQueryParams) {
  return request.get<unknown, StorePageResult>('/stores', { params })
}

/** 按集团ID查询门店（下拉选项用） */
export async function fetchStoresByGroup(groupId: number) {
  return request.get<unknown, StoreItem[]>(`/stores/by-group/${groupId}`)
}

/** 按集团编码+品牌查询门店（充值扣款门店下拉用） */
export async function fetchStoresByGroupCode(groupCode: string, brand?: string) {
  return request.get<unknown, OptionItem[]>('/stores/by-group-code', { params: { groupCode, brand } })
}

/** 门店ID/名称搜索下拉选项（选项值为门店ID） */
export async function fetchStoreOptions(keyword: string) {
  return request.get<unknown, OptionItem[]>('/stores/options', { params: { keyword } })
}

/** 门店最后更新人搜索下拉选项 */
export async function fetchStoreUpdatedByOptions(keyword: string) {
  return request.get<unknown, OptionItem[]>('/stores/updated-by-options', { params: { keyword } })
}

/** 新增门店 */
export async function createStore(data: StorePayload) {
  return request.post<unknown, StoreItem>('/stores', data)
}

/** 编辑门店 */
export async function updateStore(id: number, data: StorePayload) {
  return request.put<unknown, StoreItem>(`/stores/${id}`, data)
}

/** 删除门店 */
export async function deleteStore(id: number) {
  return request.delete<unknown, void>(`/stores/${id}`)
}

/** 查询门店已绑定的BD列表（含部门/职位/职级） */
export async function fetchStoreBds(storeId: number) {
  return request.get<unknown, StoreBdItem[]>(`/stores/${storeId}/bds`)
}

/** 新增绑定BD */
export async function addStoreBd(storeId: number, bdEmpId: string) {
  return request.post<unknown, StoreBdItem>(`/stores/${storeId}/bds`, { bdEmpId })
}

/** 解除绑定BD */
export async function removeStoreBd(storeId: number, bindId: number) {
  return request.delete<unknown, void>(`/stores/${storeId}/bds/${bindId}`)
}

/** 按集团ID（group_code）查询集团下门店已绑定的BD选项 */
export async function fetchStoreBdOptions(groupCode: string) {
  return request.get<unknown, OptionItem[]>('/stores/bd-options', { params: { groupCode } })
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
  return request.get<unknown, StoreDataConfigPayload>(`/stores/${storeId}/data-config`)
}

/** 保存門店金字招牌數據配置 */
export async function updateStoreDataConfig(storeId: number, data: StoreDataConfigPayload) {
  return request.put<unknown, void>(`/stores/${storeId}/data-config`, data)
}
