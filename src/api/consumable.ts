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
  code?: string
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

/**
 * 计量单位：不再是独立字典（biz_consumable_unit 已废弃），
 * 单位作为耗材档案/产品型号记录上的文本属性（unit 字段）由表单直接录入
 */

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
  updatedBy?: string
  updatedAt?: string
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
  /** 领用人 ID（管理员代领时指定，为空则取当前登录人） */
  applicantId?: number
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
  /** 品牌 ID（精确，用于品牌页两级视图） */
  brandId?: number
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

export function fetchConsumableStock(params?: {
  itemCode?: string
  itemName?: string
  locationId?: number
  updatedBy?: string
  updateTimeStart?: string
  updateTimeEnd?: string
}) {
  return request.get<unknown, ConsumableStock[]>('/eam/consumables/stock', { params })
}

export function inboundConsumable(data: ConsumableInbound) {
  return request.post<unknown, void>('/eam/consumables/inbound', data)
}

export function fetchConsumableTxns(params?: { itemId?: number; locationId?: number; limit?: number }) {
  return request.get<unknown, ConsumableTxn[]>('/eam/consumables/txns', { params })
}

/** 流水分页查询（独立菜单页用） */
export function fetchConsumableTxnPage(params?: {
  page?: number
  size?: number
  itemCode?: string
  itemName?: string
  txnType?: string
  operator?: string
  txnTimeStart?: string
  txnTimeEnd?: string
}) {
  return request.get<unknown, PageResult<ConsumableTxn>>('/eam/consumables/txns/page', { params })
}

/** 流水统计聚合（指标卡用，与分页查询同过滤条件） */
export interface ConsumableTxnStats {
  total: number
  inCount: number
  outCount: number
  netQty: number
}

export function fetchConsumableTxnStats(params?: {
  itemCode?: string
  itemName?: string
  txnType?: string
  operator?: string
  txnTimeStart?: string
  txnTimeEnd?: string
}) {
  return request.get<unknown, ConsumableTxnStats>('/eam/consumables/txns/stats', { params })
}

/* ==================== 预警 ==================== */

export function fetchConsumableAlerts(params?: {
  itemCode?: string
  name?: string
  categoryId?: number
}) {
  return request.get<unknown, ConsumableItem[]>('/eam/consumables/alerts', { params })
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

export function toggleConsumableCategoryStatus(id: number) {
  return request.put<unknown, void>(`/eam/consumables/basic/categories/${id}/status`)
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

export function fetchConsumableBrandDetail(id: number) {
  return request.get<unknown, ConsumableBrand>(`/eam/consumables/basic/brands/${id}`)
}

export function toggleConsumableBrandStatus(id: number) {
  return request.put<unknown, void>(`/eam/consumables/basic/brands/${id}/status`)
}
