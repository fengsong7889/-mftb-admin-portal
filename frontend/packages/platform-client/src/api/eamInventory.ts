/**
 * 资产盘点 v2 API 契约
 *
 * 后端：/api/eam/inventory/v2/*，权限统一 asset-inventory（view/create/export）。
 * 差异仅生成报告，不自动创建遗失/维修/报废单，也不改变资产台账。
 */
import request from './request'
import { TOKEN_KEY } from './request'

/* ==================== 枚举 ==================== */

export type InventoryTaskStatus = 'in_progress' | 'completed' | 'partially_completed' | 'cancelled'
export type InventoryItemStatus = 'pending' | 'normal' | 'lost' | 'damaged'
export type InventoryCheckResult = 'CONSISTENT' | 'DIFF' | 'PENDING' | 'NA'
export type InventoryHolderType = 'EMPLOYEE' | 'NONE' | 'EXTERNAL' | 'PENDING'
export type InventoryCloseType = 'COMPLETE' | 'PARTIAL'
export type InventoryScopeMode = 'CONDITION' | 'ALL'

/* ==================== 类型 ==================== */

export interface InventoryScope {
  scopeMode: InventoryScopeMode
  locationIds?: number[]
  categoryIds?: number[]
  departmentId?: number | null
  companyBrand?: number | null
  statuses?: string[]
}

export interface InventoryStats {
  expectedCount: number
  checkedCount: number
  confirmedCount: number
  notCheckedCount: number
  anomalyCount: number
  missingCount: number
  damagedCount: number
  locationDiffCount: number
  holderDiffCount: number
  recheckCount: number
}

export interface InventoryScopeSummary {
  scopeMode?: string
  locationNames?: string[]
  categoryNames?: string[]
  departmentNames?: string[]
  companyBrand?: number | null
  statuses?: string[]
}

export interface InventoryTaskRecord {
  id: number
  contractVersion: number
  taskNo: string
  taskName: string
  inventoryDate: string
  operator: string
  ownerId?: number | null
  ownerName?: string | null
  ownerEmpNo?: string | null
  scopeMode?: string | null
  scopeSummary?: InventoryScopeSummary
  expectedCount: number
  actualCount: number
  diffCount: number
  stats: InventoryStats
  status: InventoryTaskStatus
  closeType?: string | null
  closeReason?: string | null
  closedAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  taskRevision: number
  snapshotAt?: string | null
  remark?: string
  createdBy?: string
  createdAt?: string
  updatedBy?: string
  updatedAt?: string
}

export interface InventoryItemRecord {
  id: number
  taskId: number
  contractVersion: number
  assetId: number
  assetNo: string
  assetName: string
  assetType: string
  location: string
  status: InventoryItemStatus
  remark?: string
  // 发起时账面快照
  bookStatus?: string
  bookHoldType?: string
  bookLocationId?: number | null
  bookDept?: string
  holderName?: string
  holderEmpNo?: string
  holderId?: number | null
  companyBrand?: number | null
  // 实际核对
  actualLocationId?: number | null
  actualLocationName?: string | null
  actualLocationOther?: string | null
  locationCheckResult?: InventoryCheckResult | null
  actualHolderType?: InventoryHolderType | null
  actualHolderId?: number | null
  actualHolderEmpNo?: string | null
  actualHolderName?: string | null
  actualHolderExternal?: string | null
  holderCheckResult?: InventoryCheckResult | null
  checkMethod?: string | null
  checkedAt?: string | null
  checkedBy?: string | null
  checkedByEmpNo?: string | null
  // 期间变更
  recheckRequired?: number
  currentStatus?: string
  currentLocationName?: string
  currentHolderName?: string
  anomalyFlag?: number
  itemRevision: number
  createdAt?: string
  updatedAt?: string
}

export interface InventoryPreviewResult {
  total: number
  statusCounts: Record<string, number>
  scopeHash: string
  scopeSummary: InventoryScopeSummary
  sample: InventoryItemRecord[]
}

export interface InventoryPrepareClose {
  taskRevision: number
  prepareHash: string
  notCheckedCount: number
  recheckCount: number
  checkedCount: number
  canComplete: boolean
  canPartial: boolean
  stats: InventoryStats
}

export interface InventoryEventRecord {
  id: number
  itemId?: number | null
  action: string
  reason?: string
  operatorId?: number | null
  operatorName?: string
  operatorEmpNo?: string
  createdAt?: string
}

export interface PageResult<T> {
  records: T[]
  total: number
}

export interface InventoryTaskQuery {
  page?: number
  size?: number
  keyword?: string
  taskNo?: string
  ownerKeyword?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  /** 操作日期区间（按任务最后更新时间过滤）yyyy-MM-dd */
  opDateFrom?: string
  opDateTo?: string
}

export interface InventoryItemQuery {
  page?: number
  size?: number
  keyword?: string
  checkProgress?: string
  anomaly?: string
  locationId?: number
}

export interface CreateInventoryPayload {
  taskName: string
  ownerId?: number | null
  remark?: string
  scope: InventoryScope
  scopeHash?: string
  requestKey: string
}

export interface SaveItemPayload {
  itemRevision: number
  status: InventoryItemStatus
  actualLocationId?: number | null
  actualLocationOther?: string | null
  actualHolderType?: InventoryHolderType
  actualHolderId?: number | null
  actualHolderExternal?: string | null
  checkMethod?: string
  checkedAt?: string
  remark?: string
  requestKey: string
}

export interface InventoryEmployeeOption {
  id: number
  name: string
  username?: string
  empId?: string
  departmentId?: number | null
  department?: string
}

export interface InventoryOptions {
  locations: { id: number; name: string; parentId?: number }[]
  departments: { id: number; parentId?: number; name: string; status?: number }[]
  categories: { id: number; parentId?: number; name: string; code?: string; status?: number }[]
  statuses: string[]
}

/* ==================== 接口 ==================== */

const BASE = '/eam/inventory/v2'

/** 盘点选项（仓库/分类/部门/状态） */
export function fetchInventoryOptions(): Promise<InventoryOptions> {
  return request.get<unknown, InventoryOptions>(`${BASE}/options`)
}

/** 员工检索（负责人 / 实际持有人） */
export function searchInventoryEmployees(keyword?: string): Promise<InventoryEmployeeOption[]> {
  return request.get<unknown, InventoryEmployeeOption[]>(`${BASE}/employees`, { params: { keyword } })
}

/** 范围预览 */
export function previewInventory(scope: InventoryScope): Promise<InventoryPreviewResult> {
  return request.post<unknown, InventoryPreviewResult>(`${BASE}/preview`, scope)
}

/** 任务分页 */
export function fetchInventoryTasks(params: InventoryTaskQuery): Promise<PageResult<InventoryTaskRecord>> {
  return request.get<unknown, PageResult<InventoryTaskRecord>>(`${BASE}/tasks`, { params })
}

/** 任务详情 */
export function fetchInventoryTask(id: number): Promise<InventoryTaskRecord> {
  return request.get<unknown, InventoryTaskRecord>(`${BASE}/tasks/${id}`)
}

/** 明细分页 */
export function fetchInventoryItems(id: number, params: InventoryItemQuery): Promise<PageResult<InventoryItemRecord>> {
  return request.get<unknown, PageResult<InventoryItemRecord>>(`${BASE}/tasks/${id}/items`, { params })
}

/** 操作日志 */
export function fetchInventoryEvents(id: number): Promise<InventoryEventRecord[]> {
  return request.get<unknown, InventoryEventRecord[]>(`${BASE}/tasks/${id}/events`)
}

/** 创建任务 */
export function createInventoryTask(payload: CreateInventoryPayload): Promise<{ id: number; taskNo: string }> {
  return request.post<unknown, { id: number; taskNo: string }>(`${BASE}/tasks`, payload)
}

/** 保存/重置单条明细 */
export function saveInventoryItem(taskId: number, itemId: number, payload: SaveItemPayload): Promise<InventoryItemRecord> {
  return request.put<unknown, InventoryItemRecord>(`${BASE}/tasks/${taskId}/items/${itemId}`, payload)
}

/** 批量核对 */
export function batchCheckInventory(taskId: number, itemIds: number[], requestKey: string): Promise<number> {
  return request.post<unknown, number>(`${BASE}/tasks/${taskId}/items/batch-check`, { itemIds, requestKey })
}

/** 结束预检查 */
export function prepareCloseInventory(id: number): Promise<InventoryPrepareClose> {
  return request.post<unknown, InventoryPrepareClose>(`${BASE}/tasks/${id}/prepare-close`)
}

/** 结束任务（完整/部分完成） */
export function completeInventory(id: number, payload: {
  closeType: InventoryCloseType; reason?: string; expectedTaskRevision: number; prepareHash: string; requestKey: string
}): Promise<void> {
  return request.post<unknown, void>(`${BASE}/tasks/${id}/complete`, payload)
}

/** 取消任务 */
export function cancelInventoryTask(id: number, payload: { reason: string; expectedTaskRevision: number; requestKey: string }): Promise<void> {
  return request.post<unknown, void>(`${BASE}/tasks/${id}/cancel`, payload)
}

/* ==================== 导出（后端产出 CSV，fetch 直连绕过 Result 拦截器） ==================== */

function resolveApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!raw) return '/api'
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

/** 触发后端 CSV 下载 */
export async function downloadInventoryCsv(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY)
  const res = await fetch(`${resolveApiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    let msg = '導出失敗'
    try {
      const body = await res.json()
      msg = body?.message || msg
    } catch { /* 非 JSON 响应 */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** 生成前端幂等键（UUID，16~64 位） */
export function newInventoryRequestKey(): string {
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  return uuid.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)
}
