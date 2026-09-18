/**
 * 耗材管理（消耗品 / MRO）API
 *
 * 与资产域「单件化台账」分离，耗材按「数量型库存」管理：
 *   耗材档案(item) → 库存(stock) → 出入库流水(txn) → 领用(claim：申请→审批→出库核销，无归还)
 *   → 库存预警(alert) → 看板(dashboard)
 *
 * 复用 eam.ts 的分类(fetchCategoryList)、仓库(fetchLocationList) 基础数据。
 */
import request from './request'
import type { PageResult } from './asset'

/* ==================== 类型 ==================== */

/** 耗材主数据（含库存汇总与预警标记） */
export interface ConsumableItem {
  id: number
  itemCode: string
  name: string
  categoryId?: number | null
  categoryCode?: string
  categoryName?: string
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
  page?: number; size?: number; keyword?: string; categoryId?: number; status?: string; alertOnly?: boolean
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
