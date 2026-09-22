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
  /** 所属品牌 ID（sys_company_brand：閃蜂/mFood） */
  companyBrand?: number | null
  /** 所属品牌名称 */
  companyBrandName?: string
  /** 购买公司 ID */
  purchaseCompanyId?: number | null
  /** 购买公司名称 */
  purchaseCompanyName?: string
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
  /** 所属品牌 ID（sys_company_brand） */
  companyBrand?: number | null
  /** 购买公司 ID（sys_purchase_company） */
  purchaseCompanyId?: number | null
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
  /** 所属品牌 ID 快照 */
  companyBrand?: number
  /** 购买公司名称快照 */
  purchaseCompanyName?: string
  locationId: number
  locationName?: string
  qty: number
  lockedQty: number
  availableQty: number
  safetyStock: number
  /** 移动加权平均单位成本 */
  avgCost?: number
  /** 库存账面成本金额 */
  totalCost?: number
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
  /** 变动成本金额（入库正/出库负） */
  amount?: number
  companyBrand?: number
  purchaseCompanyId?: number
  department?: string
  applicantEmpId?: string
  applicantName?: string
  bizDate?: string
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
  /** 实际出库加权均价 */
  actualUnitCost?: number
  /** 出库成本金额 */
  amount?: number
  /** 已退料数量 */
  returnedQty?: number
}

/** 领用单 */
export interface ConsumableClaim {
  id: number
  claimNo: string
  applicantId: number
  applicantName: string
  applicantEmpId?: string
  department?: string
  /** 承担部门 ID */
  departmentId?: number
  /** 所属品牌 ID 快照 */
  companyBrand?: number
  /** 购买公司 ID 快照 */
  purchaseCompanyId?: number
  /** 购买公司名称快照 */
  purchaseCompany?: string
  /** 出库成本合计 */
  costAmount?: number
  reason: string
  /** pending=待發放(新流程), approved=待出庫(历史), issued=已出庫 */
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
  /** 本月消耗金额（领用出库实际成本） */
  monthConsumeAmount: number
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

/** 购买公司字典选项（耗材/资产表单用） */
export interface PurchaseCompany {
  id: number
  code: string
  name: string
  shortName?: string
}

/** 启用购买公司下拉（登录即可） */
export function fetchPurchaseCompanyOptions() {
  return request.get<unknown, PurchaseCompany[]>('/purchase-companies')
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
  /** 所属品牌 ID（精确） */
  companyBrand?: number
  /** 购买公司 ID（精确） */
  purchaseCompanyId?: number
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

/* ==================== 退料 ==================== */

/** 退料单 */
export interface ConsumableReturn {
  id: number
  returnNo: string
  claimId?: number
  claimItemId?: number
  itemId: number
  itemCode?: string
  itemName?: string
  spec?: string
  unit?: string
  locationId: number
  locationName?: string
  qty: number
  unitCost?: number
  amount?: number
  applicantId?: number
  applicantName?: string
  departmentId?: number
  department?: string
  reason?: string
  operator?: string
  createdBy?: string
  createdAt?: string
}

export interface ConsumableReturnSave {
  claimId?: number
  claimItemId?: number
  itemId: number
  locationId?: number
  qty: number
  unitCost?: number
  departmentId?: number
  reason?: string
}

export function fetchConsumableReturns(params?: {
  page?: number; size?: number; itemCode?: string; itemName?: string
  returnNo?: string; applicantName?: string; startTime?: string; endTime?: string
}) {
  return request.get<unknown, PageResult<ConsumableReturn>>('/eam/consumables/returns', { params })
}

export function createConsumableReturn(data: ConsumableReturnSave) {
  return request.post<unknown, number>('/eam/consumables/returns', data)
}

/* ==================== 库存调整 ==================== */

/** 库存调整单 */
export interface ConsumableAdjust {
  id: number
  adjustNo: string
  itemId: number
  itemCode?: string
  itemName?: string
  spec?: string
  unit?: string
  locationId: number
  locationName?: string
  direction: 'in' | 'out'
  qty: number
  unitCost?: number
  amount?: number
  reason?: string
  operator?: string
  createdBy?: string
  createdAt?: string
}

export interface ConsumableAdjustSave {
  itemId: number
  locationId?: number
  direction: 'in' | 'out'
  qty: number
  unitCost?: number
  reason?: string
}

export function fetchConsumableAdjusts(params?: {
  page?: number; size?: number; itemCode?: string; itemName?: string
  adjustNo?: string; direction?: string; startTime?: string; endTime?: string
}) {
  return request.get<unknown, PageResult<ConsumableAdjust>>('/eam/consumables/adjusts', { params })
}

export function createConsumableAdjust(data: ConsumableAdjustSave) {
  return request.post<unknown, number>('/eam/consumables/adjusts', data)
}

/* ==================== 仓库调拨 ==================== */

/** 库存调拨单 */
export interface ConsumableTransfer {
  id: number
  transferNo: string
  itemId: number
  itemCode?: string
  itemName?: string
  spec?: string
  unit?: string
  fromLocationId: number
  fromLocationName?: string
  toLocationId: number
  toLocationName?: string
  qty: number
  unitCost?: number
  amount?: number
  operator?: string
  createdBy?: string
  createdAt?: string
}

export interface ConsumableTransferSave {
  itemId: number
  fromLocationId: number
  toLocationId: number
  qty: number
}

export function fetchConsumableTransfers(params?: {
  page?: number; size?: number; itemCode?: string; itemName?: string
  transferNo?: string; startTime?: string; endTime?: string
}) {
  return request.get<unknown, PageResult<ConsumableTransfer>>('/eam/consumables/transfers', { params })
}

export function createConsumableTransfer(data: ConsumableTransferSave) {
  return request.post<unknown, number>('/eam/consumables/transfers', data)
}

/* ==================== 入库单（独立 CRUD） ==================== */

/** 入库单明细 */
export interface ConsumableInboundItem {
  id: number
  inboundId: number
  itemId: number
  itemCode?: string
  itemName?: string
  spec?: string
  unit?: string
  locationId: number
  locationName?: string
  qty: number
  unitPrice?: number
  amount?: number
}

/** 入库单 */
export interface ConsumableInboundOrder {
  id: number
  inboundNo: string
  inboundType: string
  companyBrand?: number
  companyBrandName?: string
  purchaseCompanyId?: number
  purchaseCompany?: string
  supplierId?: number
  supplierName?: string
  poId?: number
  poNo?: string
  bizDate?: string
  remark?: string
  createdBy?: string
  createdAt?: string
  items: ConsumableInboundItem[]
  totalQty: number
  totalAmount?: number
}

export interface ConsumableInboundOrderSave {
  inboundType?: string
  companyBrand?: number
  purchaseCompanyId?: number
  supplierId?: number
  supplierName?: string
  poId?: number
  bizDate?: string
  remark?: string
  items: { itemId: number; locationId?: number; qty: number; unitPrice: number }[]
}

export function fetchConsumableInboundOrders(params?: {
  page?: number; size?: number; inboundNo?: string; inboundType?: string
  companyBrand?: number; purchaseCompanyId?: number; startTime?: string; endTime?: string
}) {
  return request.get<unknown, PageResult<ConsumableInboundOrder>>('/eam/consumables/inbound-orders', { params })
}

export function fetchConsumableInboundOrderDetail(id: number) {
  return request.get<unknown, ConsumableInboundOrder>(`/eam/consumables/inbound-orders/${id}`)
}

export function createConsumableInboundOrder(data: ConsumableInboundOrderSave) {
  return request.post<unknown, number>('/eam/consumables/inbound-orders', data)
}

/* ==================== 消耗统计报表 ==================== */

/** 报表查询参数 */
export interface ConsumableReportQuery {
  /** 统计起始日期 yyyy-MM-dd */
  startDate?: string
  /** 统计截止日期 yyyy-MM-dd */
  endDate?: string
  /** 所属品牌 ID */
  companyBrand?: number
  /** 购买公司 ID */
  purchaseCompanyId?: number
}

/** 报表汇总指标 */
export interface ConsumableReportSummary {
  purchaseAmount: number
  purchaseQty: number
  manualInboundAmount: number
  inboundTotalAmount: number
  consumeAmount: number
  consumeQty: number
  returnAmount: number
  adjustOutAmount: number
  stockAmount: number
  stockQty: number
  deptCount: number
  applicantCount: number
}

/** 按公司统计行 */
export interface ConsumableCompanyStat {
  companyBrand?: number
  companyBrandName?: string
  purchaseCompanyId?: number
  purchaseCompanyName?: string
  inboundQty: number
  inboundAmount: number
  consumeQty: number
  consumeAmount: number
  returnQty: number
  returnAmount: number
  stockQty: number
  stockAmount: number
}

/** 按部门统计行 */
export interface ConsumableDeptStat {
  departmentId?: number
  department?: string
  consumeQty: number
  consumeAmount: number
  claimCount: number
}

/** 按员工统计行 */
export interface ConsumableApplicantStat {
  applicantId?: number
  applicantEmpId?: string
  applicantName?: string
  department?: string
  consumeQty: number
  consumeAmount: number
  claimCount: number
}

/** 按耗材统计行 */
export interface ConsumableItemStat {
  itemId: number
  itemCode?: string
  itemName?: string
  spec?: string
  unit?: string
  inboundQty: number
  inboundAmount: number
  consumeQty: number
  consumeAmount: number
  stockQty: number
  stockAmount: number
}

export function fetchConsumableReportSummary(params?: ConsumableReportQuery) {
  return request.get<unknown, ConsumableReportSummary>('/eam/consumables/report/summary', { params })
}

export function fetchConsumableReportByCompany(params?: ConsumableReportQuery) {
  return request.get<unknown, ConsumableCompanyStat[]>('/eam/consumables/report/by-company', { params })
}

export function fetchConsumableReportByDept(params?: ConsumableReportQuery) {
  return request.get<unknown, ConsumableDeptStat[]>('/eam/consumables/report/by-dept', { params })
}

export function fetchConsumableReportByApplicant(params?: ConsumableReportQuery) {
  return request.get<unknown, ConsumableApplicantStat[]>('/eam/consumables/report/by-applicant', { params })
}

export function fetchConsumableReportByItem(params?: ConsumableReportQuery) {
  return request.get<unknown, ConsumableItemStat[]>('/eam/consumables/report/by-item', { params })
}
