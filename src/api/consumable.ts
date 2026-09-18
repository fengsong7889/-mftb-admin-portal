/**
 * 耗材管理（消耗品 / MRO）API
 *
 * 与资产域「单件化台账」分离，耗材按「数量型库存」管理：
 *   耗材档案(item) → 库存(stock) → 出入库流水(txn) → 领用(claim：申请→审批→出库核销，无归还)
 *   → 库存预警(alert) → 看板(dashboard)
 *
 * 分类/品牌/计量单位使用耗材域独立基础数据（见文件末尾「基础数据 API」），
 * 仅仓库位置(fetchLocationList)仍复用 eam.ts。
 */
import request from './request'
import type { PageResult } from './asset'

/* ==================== 基础数据类型 ==================== */

/** 耗材分类 */
export interface ConsumableCategory {
  id: number
  code: string
  name: string
  parentId: number
  parentName?: string
  sortOrder: number
  status: 'enabled' | 'disabled'
  remark?: string
  createdBy?: string
  updatedBy?: string
  updatedAt?: string
}

/** 耗材品牌 */
export interface ConsumableBrand {
  id: number
  name: string
  nameEn?: string
  categoryType: 'ASSET' | 'CONSUMABLE' | 'BOTH'
  logo?: string
  status: 'enabled' | 'disabled'
  remark?: string
  createdBy?: string
  updatedBy?: string
  updatedAt?: string
}

/** 计量单位 */
export interface ConsumableUnit {
  id: number
  name: string
  abbr?: string
  sortOrder: number
  status: 'enabled' | 'disabled'
  createdBy?: string
  updatedBy?: string
  updatedAt?: string
}

/* ==================== 类型 ==================== */

/** 耗材主数据（含库存汇总与预警标记） */
export interface ConsumableItem {
  id: number
  itemCode: string
  name: string
  categoryId?: number | null
  categoryCode?: string
  categoryName?: string
  consumableCategoryId?: number | null
  consumableCategoryName?: string
  brandId?: number | null
  brandName?: string
  brand?: string
  spec?: string
  unit: string
  refPrice?: number
  image?: string
  safetyStock: number
  maxStock: number
  perClaimLimit: number
  status: 'enabled' | 'disabled'
  remark?: string
  createdBy?: string
  updatedBy?: string
  updatedAt?: string
  /** 全部仓库实际库存合计 */
  totalQty: number
  /** 审批占用合计 */
  lockedQty: number
  /** 可用库存 = totalQty - lockedQty */
  availableQty: number
  /** 是否触发低库存预警 */
  alert: boolean
}

/** 耗材保存参数 */
export interface ConsumableItemSave {
  id?: number
  name: string
  categoryId?: number | null
  consumableCategoryId?: number | null
  brandId?: number | null
  brand?: string
  spec?: string
  unit: string
  refPrice?: number
  image?: string
  safetyStock?: number
  maxStock?: number
  perClaimLimit?: number
  status?: 'enabled' | 'disabled'
  remark?: string
}

/** 库存行 */
export interface ConsumableStock {
  id: number
  itemId: number
  itemCode?: string
  itemName?: string
  spec?: string
  unit?: string
  categoryName?: string
  locationId: number
  locationName?: string
  qty: number
  lockedQty: number
  availableQty: number
  safetyStock: number
  alert: boolean
}

/** 出入库流水 */
export interface ConsumableTxn {
  id: number
  txnNo: string
  itemId: number
  itemCode?: string
  itemName?: string
  locationId: number
  locationName?: string
  txnType: 'in_purchase' | 'in_manual' | 'in_adjust' | 'out_claim' | 'out_adjust'
  qty: number
  beforeQty: number
  afterQty: number
  unitCost?: number
  refType?: string
  refId?: number
  operator?: string
  remark?: string
  createdAt?: string
}

/** 领用单明细 */
export interface ConsumableClaimItem {
  id?: number
  itemId: number
  itemCode?: string
  itemName?: string
  spec?: string
  unit?: string
  qty: number
  locationId?: number
  locationName?: string
  unitCost?: number
}

/** 领用单 */
export interface ConsumableClaim {
  id: number
  claimNo: string
  applicantId: number
  applicantName: string
  applicantEmpId?: string
  department?: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'issued' | 'cancelled'
  approverId?: number
  approverName?: string
  approvedAt?: string
  approveRemark?: string
  issueOperator?: string
  issuedAt?: string
  cancelReason?: string
  createdBy?: string
  createdAt?: string
  updatedBy?: string
  updatedAt?: string
  items: ConsumableClaimItem[]
  totalKinds: number
  totalQty: number
}

/** 领用提交参数 */
export interface ConsumableClaimSave {
  reason: string
  remark?: string
  items: { itemId: number; qty: number; locationId?: number }[]
}

/** 看板数据 */
export interface ConsumableDashboard {
  itemKinds: number
  totalStockQty: number
  totalStockValue: number
  alertCount: number
  pendingApproveCount: number
  monthClaimCount: number
  alertItems: ConsumableItem[]
  recentTxns: ConsumableTxn[]
}

/** 入库参数 */
export interface ConsumableInbound {
  itemId: number
  locationId?: number
  qty: number
  unitCost?: number
  txnType?: 'in_purchase' | 'in_manual'
  remark?: string
}

/* ==================== 看板 ==================== */

export function fetchConsumableDashboard() {
  return request.get<unknown, ConsumableDashboard>('/eam/consumables/dashboard')
}

/* ==================== 主数据 ==================== */

export function fetchConsumableItems(params?: {
  page?: number; size?: number
  /** 关键字（编码/名称/规格/品牌，保留兼容） */
  keyword?: string
  /** 耗材编码（模糊） */
  itemCode?: string
  /** 耗材名称（模糊） */
  name?: string
  categoryId?: number
  /** 品牌（模糊） */
  brand?: string
  /** 计量单位 */
  unit?: string
  status?: string
  /** 最后更新人（模糊） */
  updatedBy?: string
  /** 更新时间范围起（yyyy-MM-dd） */
  updateTimeStart?: string
  /** 更新时间范围止（yyyy-MM-dd） */
  updateTimeEnd?: string
  alertOnly?: boolean
}) {
  return request.get<unknown, PageResult<ConsumableItem>>('/eam/consumables/items', { params })
}

/** 选品下拉（仅启用，登录即可） */
export function fetchConsumableItemOptions() {
  return request.get<unknown, ConsumableItem[]>('/eam/consumables/items/options')
}

export function fetchConsumableItemDetail(id: number) {
  return request.get<unknown, ConsumableItem>(`/eam/consumables/items/${id}`)
}

export function createConsumableItem(data: ConsumableItemSave) {
  return request.post<unknown, number>('/eam/consumables/items', data)
}

export function updateConsumableItem(id: number, data: ConsumableItemSave) {
  return request.put<unknown, void>(`/eam/consumables/items/${id}`, data)
}

export function toggleConsumableItemStatus(id: number, status: 'enabled' | 'disabled') {
  return request.put<unknown, void>(`/eam/consumables/items/${id}/status`, { status })
}

export function deleteConsumableItem(id: number) {
  return request.delete<unknown, void>(`/eam/consumables/items/${id}`)
}

/* ==================== 库存 / 流水 / 入库 ==================== */

export function fetchConsumableStock(params?: { itemId?: number; locationId?: number }) {
  return request.get<unknown, ConsumableStock[]>('/eam/consumables/stock', { params })
}

export function inboundConsumable(data: ConsumableInbound) {
  return request.post<unknown, void>('/eam/consumables/inbound', data)
}

export function fetchConsumableTxns(params?: { itemId?: number; locationId?: number; limit?: number }) {
  return request.get<unknown, ConsumableTxn[]>('/eam/consumables/txns', { params })
}

/* ==================== 预警 ==================== */

export function fetchConsumableAlerts() {
  return request.get<unknown, ConsumableItem[]>('/eam/consumables/alerts')
}

/* ==================== 领用 ==================== */

export function fetchConsumableClaims(params?: {
  page?: number; size?: number; keyword?: string; status?: string; applicantId?: number
}) {
  return request.get<unknown, PageResult<ConsumableClaim>>('/eam/consumables/claims', { params })
}

export function fetchConsumableClaimDetail(id: number) {
  return request.get<unknown, ConsumableClaim>(`/eam/consumables/claims/${id}`)
}

export function fetchMyConsumableClaims(params?: { page?: number; size?: number; status?: string }) {
  return request.get<unknown, PageResult<ConsumableClaim>>('/eam/consumables/claims/my', { params })
}

export function fetchMyConsumableClaimDetail(id: number) {
  return request.get<unknown, ConsumableClaim>(`/eam/consumables/claims/my/${id}`)
}

export function submitConsumableClaim(data: ConsumableClaimSave) {
  return request.post<unknown, number>('/eam/consumables/claims/my', data)
}

export function approveConsumableClaim(data: { claimId: number; pass: boolean; remark?: string }) {
  return request.post<unknown, void>('/eam/consumables/claims/approve', data)
}

export function issueConsumableClaim(id: number) {
  return request.post<unknown, void>(`/eam/consumables/claims/${id}/issue`)
}

export function cancelConsumableClaim(id: number, reason?: string) {
  return request.post<unknown, void>(`/eam/consumables/claims/${id}/cancel`, { reason })
}

/* ==================== 基础数据 API（分类 / 品牌 / 计量单位） ==================== */

/** 耗材分类列表 */
export function fetchConsumableCategories(keyword?: string) {
  return request.get<unknown, ConsumableCategory[]>('/eam/consumables/basic/categories', { params: { keyword } })
}

/** 耗材分类下拉选项 */
export function fetchConsumableCategoryOptions() {
  return request.get<unknown, ConsumableCategory[]>('/eam/consumables/basic/categories/options')
}

export function createConsumableCategory(data: Partial<ConsumableCategory>) {
  return request.post<unknown, number>('/eam/consumables/basic/categories', data)
}

export function updateConsumableCategory(id: number, data: Partial<ConsumableCategory>) {
  return request.put<unknown, void>(`/eam/consumables/basic/categories/${id}`, data)
}

export function deleteConsumableCategory(id: number) {
  return request.delete<unknown, void>(`/eam/consumables/basic/categories/${id}`)
}

/** 耗材品牌列表 */
export function fetchConsumableBrands(categoryType?: string, keyword?: string) {
  return request.get<unknown, ConsumableBrand[]>('/eam/consumables/basic/brands', { params: { categoryType, keyword } })
}

/** 耗材品牌下拉选项（只返回 CONSUMABLE + BOTH） */
export function fetchConsumableBrandOptions() {
  return request.get<unknown, ConsumableBrand[]>('/eam/consumables/basic/brands/options')
}

export function createConsumableBrand(data: Partial<ConsumableBrand>) {
  return request.post<unknown, number>('/eam/consumables/basic/brands', data)
}

export function updateConsumableBrand(id: number, data: Partial<ConsumableBrand>) {
  return request.put<unknown, void>(`/eam/consumables/basic/brands/${id}`, data)
}

export function deleteConsumableBrand(id: number) {
  return request.delete<unknown, void>(`/eam/consumables/basic/brands/${id}`)
}

/** 计量单位列表 */
export function fetchConsumableUnits(keyword?: string) {
  return request.get<unknown, ConsumableUnit[]>('/eam/consumables/basic/units', { params: { keyword } })
}

/** 计量单位下拉选项 */
export function fetchConsumableUnitOptions() {
  return request.get<unknown, ConsumableUnit[]>('/eam/consumables/basic/units/options')
}

export function createConsumableUnit(data: Partial<ConsumableUnit>) {
  return request.post<unknown, number>('/eam/consumables/basic/units', data)
}

export function updateConsumableUnit(id: number, data: Partial<ConsumableUnit>) {
  return request.put<unknown, void>(`/eam/consumables/basic/units/${id}`, data)
}

export function deleteConsumableUnit(id: number) {
  return request.delete<unknown, void>(`/eam/consumables/basic/units/${id}`)
}
