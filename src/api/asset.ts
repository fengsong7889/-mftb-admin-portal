/**
 * 物资管理 API
 *
 * 前端 mock 数据驱动，待后端接口就绪后切换为真实接口。
 * 物资管理菜单提供：资产台账 / 资产入库 / 资产领用 / 资产转移 / 资产归还 / 资产报废 / 资产维修 / 资产盘点 / 统计报表
 *
 * 支持双模式：
 *  - 物资部直操作（无需审批，直接落库）
 *  - 流程申请（走 OA 审批流，落库由审批通过触发）
 */
import request from './request'
import { normalizeAssetParams, type AssetParameterSource } from '../utils/assetParams'

/* ==================== 枚举类型 ==================== */

/** 资产状态 */
export type AssetStatus = 'idle' | 'in_use' | 'in_repair' | 'scrapped'

/** 自购/租用 */
export type AssetSource = 'self' | 'lease'

/** 操作类型（资产动态） */
export type AssetOpType =
  | 'create'        // 入库
  | 'inbound'       // 批量入库（采购验收）
  | 'claim'         // 领用
  | 'borrow'        // 借用
  | 'renew'         // 续借
  | 'transfer'      // 转移
  | 'return'        // 归还
  | 'handover'      // 交接
  | 'repair'        // 维修
  | 'repair_done'   // 维修完成
  | 'compensation'  // 损坏赔付
  | 'scrap'         // 报废
  | 'inventory'     // 盘点

/* ==================== 类型定义 ==================== */

/** 资产主信息 */
export interface AssetItem {
  id: number
  /** 资产编号（人工输入，唯一） */
  assetNo: string
  /** 资产名称 */
  assetName: string
  /** 资产类型 */
  assetType: string
  /** 资产品牌 */
  brand: string
  /** 单位 */
  unit: string
  /** 数量 */
  quantity: number
  /** 购买时价值（澳门元） */
  purchaseValue: number
  /** 购买日期 */
  purchaseDate: string | null
  /** 使用日期（首次投入使用） */
  usageDate: string | null
  /** 资产来源：自购/租用 */
  source: AssetSource
  /** 所属公司 */
  company: string
  /** 存放地点 */
  location: string
  /** 所在部门 */
  department: string
  /** 使用人 */
  userName: string
  /** 只读持有人 ID（sys_user.id）；无人持有为 null，兼容旧响应缺省。 */
  readonly currentHolderId?: number | null
  readonly activeClaimId?: number | null
  readonly holdVersion?: number
  readonly claimDate?: string | null
  readonly transferable?: boolean
  readonly transferBlockedReason?: string | null
  /** 资产状态 */
  status: AssetStatus
  /** 资产图片（base64 dataUrl，可多张逗号分隔） */
  images: string | null
  /** 备注 */
  remark: string | null
  /** 申请人（最后操作人） */
  applicant: string
  /** 报废时间 */
  scrapTime: string | null
  /** 关联品牌型号 ID（EAM 型号库） */
  modelId?: number | null
  /** 关联存放仓库 ID（EAM 位置树） */
  locationId?: number | null
  /** 存放仓库-省份 */
  province?: string
  /** 存放仓库-城市 */
  city?: string
  /** 存放仓库-区县 */
  district?: string
  /** 存放仓库-详细地址 */
  address?: string
  /** 持有方式：自有领用/借用（借用语义由 BorrowRecord 承载） */
  holdType?: 'owned' | 'borrowed'
  /** 型号参数实例（如 CPU/内存/硬盘） */
  params?: Record<string, string>
  categoryId?: number | null
  categoryCode?: string | null
  brandId?: number | null
  orderId?: number | null
  batchId?: number | null
  /** 公司品牌 ID（sys_company_brand.id，从后端动态加载） */
  companyBrand?: number | null
  purchaseType?: 'purchase' | 'lease'
  /** 下单日期（来自采购订单 orderDate） */
  orderDate?: string | null
  updatedBy?: string
  inboundBatchNo?: string | null
  inboundDate?: string | null
  inboundQty?: number
  inspector?: string | null
  leaseCompany?: string | null
  rentalCost?: number | null
  rentalPeriod?: string[] | null
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/** 资产操作动态 */
export interface AssetLog {
  id: number
  assetId: number
  assetNo: string
  assetName: string
  opType: AssetOpType
  /** 操作人 */
  operator: string
  /** 操作时间 */
  operateTime: string
  /** 操作描述/说明 */
  description: string
  /** 关联流程编号（走流程时有值） */
  flowNo?: string
  /** 变更前部门 */
  fromDepartment?: string
  /** 变更后部门 */
  toDepartment?: string
  /** 变更前使用人 */
  fromUser?: string
  /** 变更后使用人 */
  toUser?: string
  /** 变更前位置 */
  fromLocation?: string
  /** 变更后位置 */
  toLocation?: string
}

/** 资产盘点记录 */
export interface AssetInventoryRecord {
  id: number
  /** 盘点任务编号 */
  taskNo: string
  /** 盘点任务名称 */
  taskName: string
  /** 盘点日期 */
  inventoryDate: string
  /** 盘点人 */
  operator: string
  /** 应盘数量 */
  expectedCount: number
  /** 实盘数量 */
  actualCount: number
  /** 差异数（实盘-应盘） */
  diffCount: number
  /** 状态：in_progress/completed/cancelled */
  status: 'in_progress' | 'completed' | 'cancelled'
  /** 备注 */
  remark: string
  /** 盘点明细列表（详情接口返回） */
  items?: InventoryItemRecord[]
}

/** 盘点明细记录 */
export interface InventoryItemRecord {
  id: number
  taskId: number
  assetId: number
  assetNo: string
  assetName: string
  assetType: string
  location: string
  /** 盘点状态：pending/normal/lost/damaged */
  status: 'pending' | 'normal' | 'lost' | 'damaged'
  remark: string
  createdAt: string
  updatedAt: string
}

/** 资产报废记录 */
export interface ScrapRecord {
  id: number
  assetId: number
  assetNo: string
  assetName: string
  assetType: string
  brand: string
  /** 报废日期 */
  scrapDate: string
  /** 申请人 */
  applyBy: string
  /** 申请人工号 */
  empId: string
  /** 报废原因 */
  reason: string
  /** 残值（MOP） */
  residualValue: number
  /** 处置方式 */
  disposeType: 'sale' | 'donate' | 'recycle' | 'destroy' | null
  /** 鉴定意见 */
  appraisal: string
  /** 备注 */
  remark: string
  /** 状态：pending / approved / rejected / cancelled */
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/** 报废记录查询参数 */
export interface ScrapQuery {
  page?: number
  size?: number
  keyword?: string
  status?: ScrapRecord['status']
  disposeType?: ScrapRecord['disposeType']
  startDate?: string
  endDate?: string
}

/** 资产维修记录 */
export interface AssetRepairRecord {
  id: number
  assetId: number
  assetNo: string
  assetName: string
  /** 维修日期 */
  repairDate: string
  /** 故障描述 */
  faultDesc: string
  /** 维修内容 */
  repairContent: string
  /** 维修费用 */
  cost: number
  /** 维修方 */
  repairBy: string
  /** 完成日期 */
  finishDate: string | null
  /** 状态：repairing/done */
  status: 'repairing' | 'done'
  /** 申请人 */
  applicant: string
  /** 损坏原因分类（EAM 增强） */
  causeType?: 'human' | 'natural' | 'third_party' | 'quality'
}

/* ==================== 查询参数 ==================== */

export interface AssetListQuery {
  orderId?: number
  batchId?: number
  page?: number
  size?: number
  keyword?: string
  assetNo?: string
  assetName?: string
  assetType?: string
  brand?: string
  brandId?: number
  categoryId?: number
  departmentId?: number
  holdType?: 'owned' | 'borrowed'
  status?: AssetStatus | 'all'
  company?: string
  department?: string
  userName?: string
  source?: AssetSource
  /** 购买日期范围 [start, end] */
  purchaseDate?: [string, string]
  /** 报废日期范围 [start, end] */
  scrapDate?: [string, string]
  /** 最后更新人 */
  updatedBy?: string
  /** 最后更新时间范围 [start, end] */
  updatedAt?: [string, string]
}

export interface PageResult<T> {
  records: T[]
  total: number
}

/* ==================== 后端 API（占位，前端 mock 实现） ==================== */

/** 资产分页列表 */
export async function fetchAssetList(params?: AssetListQuery): Promise<PageResult<AssetItem>> {
  const result = await request.get<unknown, PageResult<AssetItem>>('/eam/assets', { params: assetQueryParams(params) })
  return { ...result, records: result.records.map(normalizeAsset) }
}

export type AssetStatusCounts = Record<AssetStatus | 'all', number>

export function fetchAssetStatusCounts(params?: AssetListQuery): Promise<AssetStatusCounts> {
  return request.get<unknown, AssetStatusCounts>('/eam/assets/status-counts', { params: assetQueryParams(params) })
}

function assetQueryParams(params: AssetListQuery = {}) {
  const { purchaseDate, scrapDate, updatedAt, status, ...rest } = params
  return {
    ...rest, status: status === 'all' ? undefined : status,
    purchaseDateStart: purchaseDate?.[0], purchaseDateEnd: purchaseDate?.[1],
    scrapDateStart: scrapDate?.[0], scrapDateEnd: scrapDate?.[1],
    updatedAtStart: updatedAt?.[0], updatedAtEnd: updatedAt?.[1],
  }
}

function normalizeAsset(asset: AssetItem): AssetItem {
  return {
    ...asset,
    brand: asset.brand || '', unit: asset.unit || '', company: asset.company || '',
    department: asset.department || '', userName: asset.userName || '', location: asset.location || '',
    purchaseDate: asset.purchaseDate || null, usageDate: asset.usageDate || null,
    scrapTime: asset.scrapTime || null, params: normalizeAssetParams(asset.params),
    applicant: asset.updatedBy || asset.applicant || '',
  }
}

/** 可编辑字段白名单：不允许由客户端覆盖采购来源、批次和审计信息。 */
export type AssetSaveData = Partial<Pick<AssetItem,
  'assetNo' | 'assetName' | 'assetType' | 'categoryId' | 'categoryCode' | 'brand' | 'brandId' |
  'modelId' | 'params' | 'images' | 'unit' | 'quantity' | 'purchaseValue' | 'purchaseDate' |
  'usageDate' | 'source' | 'company' | 'location' | 'locationId' | 'department' | 'userName' |
  'status' | 'holdType' | 'scrapTime' | 'leaseCompany' | 'rentalCost' | 'rentalPeriod' | 'remark' | 'companyBrand'>>

/** 支持历史逗号拼接与 JSON 数组；保留 Data URL 自带的 base64 逗号。 */
export function parseAssetImages(images?: string | null): string[] {
  if (!images) return []
  const trimmed = images.trim()
  if (trimmed.startsWith('[')) {
    try {
      const values: unknown = JSON.parse(trimmed)
      return Array.isArray(values)
        ? values.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())
        : []
    } catch { return [] }
  }
  // 逗号拼接：仅在下一段以 data: / http(s):// 起始处切分，
  // 避免误切 Data URL 内部 base64（如 JPEG 的 "/9j" 以斜杠开头）。
  return trimmed
    .split(/,(?=\s*(?:data:|https?:\/\/))/i)
    .map((url) => url.trim().replace(/,+$/, ''))
    .filter(Boolean)
}

/** 资产详情 */
export async function fetchAssetDetail(id: number): Promise<AssetItem> {
  return normalizeAsset(await request.get<unknown, AssetItem>(`/eam/assets/${id}`))
}

/** 新增资产 */
export function createAsset(data: AssetSaveData): Promise<number> {
  return request.post<unknown, number>('/eam/assets', data)
}

/** 更新资产 */
export function updateAsset(id: number, data: AssetSaveData): Promise<void> {
  return request.put<unknown, void>(`/eam/assets/${id}`, data)
}

/** 删除资产（软删除） */
export function deleteAsset(id: number): Promise<void> {
  return request.delete<unknown, void>(`/eam/assets/${id}`)
}

/** 批量入库（采购验收调用）：按传入条目生成资产编号并写入台账，返回生成的编号列表 */
export function bulkCreateAssets(items: Omit<AssetItem, 'id' | 'createdAt' | 'updatedAt' | 'assetNo'>[]): Promise<string[]> {
  return unavailableAssetOperation('批量建档：请通过采购验收入库提交')
}

/** 校验资产编号唯一性 */
export function checkAssetNoUnique(assetNo: string, excludeId?: number): Promise<boolean> {
  return request.get<unknown, boolean>('/eam/assets/check-no', { params: { assetNo, excludeId } })
}

/** 资产操作动态查询参数（EAM 变更历史页共用） */
export interface AssetLogQuery {
  assetId?: number
  assetNo?: string
  /** 资产名称/使用人等模糊关键字 */
  keyword?: string
  opType?: AssetOpType | 'all'
  /** 操作时间范围 [start, end]（按日期比较） */
  dateRange?: [string, string]
  page?: number
  size?: number
}

/** 资产操作动态 */
export function fetchAssetLogs(params?: AssetLogQuery): Promise<PageResult<AssetLog>> {
  return unavailableAssetOperation('资产操作流水查询')
}

/** 写入一条资产操作流水（EAM 业务模块共用：借用/续借/交接/赔付等） */
export function logAssetOperation(data: Omit<AssetLog, 'id'>): Promise<void> {
  return unavailableAssetOperation('资产操作流水')
}

/** 资产领用 */
export function claimAsset(data: { assetId: number; userName: string; department: string; usageDate: string; remark?: string }): Promise<void> {
  return unavailableAssetOperation('资产领用')
}

/* ==================== 资产调拨（真实 API） ==================== */

/** 调拨记录（对应后端 EamAssetTransferVO） */
export interface TransferRecord extends AssetParameterSource {
  id: number
  transferNo: string
  assetId: number
  assetNo: string
  assetName: string
  brandId?: number | null
  brand?: string | null
  brandBackfilled?: number
  fromClaimId?: number | null
  toClaimId?: number | null
  cancellable: boolean
  cancelBlockedReason?: string | null
  cancelReason?: string | null
  cancelledBy?: string | null
  cancelledAt?: string | null
  fromUserId: number | null
  fromUserName: string
  fromUserEmpId: string | null
  fromDepartment: string
  toUserId: number | null
  toUserName: string
  toUserEmpId: string | null
  toDepartment: string
  transferDate: string
  reason: string
  status: 'done' | 'cancelled'
  operatorName: string
  remark: string | null
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

/** 调拨查询参数 */
export interface TransferQuery {
  page?: number
  size?: number
  transferNo?: string
  brandId?: number
  fromDepartmentId?: number
  toDepartmentId?: number
  assetNo?: string
  assetName?: string
  fromUserName?: string
  toUserName?: string
  fromDepartment?: string
  toDepartment?: string
  status?: TransferRecord['status']
  operatorName?: string
  startDate?: string
  endDate?: string
}

/** 资产调拨（调拨登记 → POST /eam/transfers） */
export interface TransferRegistration {
  assetId: number
  toUserId: number
  toDepartmentId: number
  expectedVersion: number
  requestKey: string
  toUserName?: string
  toUserEmpId?: string
  transferDate: string
  reason: string
  remark?: string
}

export function transferAsset(data: TransferRegistration): Promise<number> {
  return request.post<unknown, number>('/eam/transfers', data)
}

export interface TransferDepartment { id: number; parentId?: number | null; name: string; status: number }
export interface TransferCategory { id: number; parentId?: number | null; name: string; code: string; status: string }
export interface TransferBrand { id: number; brandZh: string; brandEn?: string; categoryCode?: string }
export interface TransferEmployee { id: number; name: string; empId: string; departmentId?: number; department?: string }
export interface TransferOptions {
  departments: TransferDepartment[]
  categories: TransferCategory[]
  brands: TransferBrand[]
}
export function fetchTransferOptions(): Promise<TransferOptions> {
  return request.get<unknown, TransferOptions>('/eam/transfers/options')
}
export function fetchTransferEmployees(keyword?: string): Promise<TransferEmployee[]> {
  return request.get<unknown, TransferEmployee[]>('/eam/transfers/employees', { params: { keyword } })
}
export function fetchTransferCandidates(params: AssetListQuery): Promise<PageResult<AssetItem>> {
  return request.get<unknown, PageResult<AssetItem>>('/eam/transfers/candidates', { params })
}
export function fetchTransferAsset(id: number): Promise<AssetItem> {
  return request.get<unknown, AssetItem>(`/eam/transfers/assets/${id}`)
}
export function cancelTransfer(id: number, reason: string): Promise<void> {
  return request.post<unknown, void>(`/eam/transfers/${id}/cancel`, { reason })
}

/** 调拨记录分页查询 */
export function fetchTransferList(params?: TransferQuery): Promise<PageResult<TransferRecord>> {
  return request.get<unknown, PageResult<TransferRecord>>('/eam/transfers', { params })
}

/** 调拨详情 */
export function fetchTransferDetail(id: number): Promise<TransferRecord> {
  return request.get<unknown, TransferRecord>(`/eam/transfers/${id}`)
}

/** 资产归还 */
export function returnAsset(data: { assetId: number; returnDate: string; condition: string; applyBy: string }): Promise<void> {
  return unavailableAssetOperation('资产归还')
}

/** 资产报废 */
export function scrapAsset(data: { assetId: number; reason: string; scrapDate: string; applyBy: string }): Promise<void> {
  return unavailableAssetOperation('资产报废')
}

/* ==================== 报废记录 API（Mock） ==================== */

/** 报废记录列表 */
export async function fetchScrapList(params?: ScrapQuery): Promise<PageResult<ScrapRecord>> {
  return { records: [], total: 0 }
}

/** 报废记录详情 */
export async function fetchScrapDetail(id: number): Promise<ScrapRecord> {
  return unavailableAssetOperation('报废记录详情')
}

/** 新增报废记录 */
export async function createScrapRecord(data: Omit<ScrapRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<number> {
  return unavailableAssetOperation('新增报废记录')
}

/** 删除报废记录（仅允许待审批状态） */
export async function deleteScrapRecord(id: number): Promise<void> {
  return unavailableAssetOperation('删除报废记录')
}

/** 资产维修 */
export function repairAsset(data: Omit<AssetRepairRecord, 'id'>): Promise<number> {
  return request.post<unknown, number>('/eam/repairs', {
    assetId: data.assetId,
    repairDate: data.repairDate,
    faultDesc: data.faultDesc,
    repairContent: data.repairContent,
    repairBy: data.repairBy,
    cost: data.cost,
    applicant: data.applicant,
    causeType: data.causeType,
  })
}

/** 维修记录列表（按资产ID过滤） */
export function fetchRepairList(params?: { assetId?: number; status?: 'repairing' | 'done' }): Promise<AssetRepairRecord[]> {
  return request.get<unknown, AssetRepairRecord[]>('/eam/repairs', { params })
}

/** 维修完成 */
export function finishRepair(id: number, finishDate: string): Promise<void> {
  return request.post<unknown, void>(`/eam/repairs/${id}/finish`, { finishDate })
}

/** 更新维修记录（仅允许维修中状态） */
export function updateRepair(id: number, data: Partial<Omit<AssetRepairRecord, 'id' | 'assetId' | 'assetNo' | 'assetName' | 'status' | 'finishDate'>>): Promise<void> {
  return request.put<unknown, void>(`/eam/repairs/${id}`, data)
}

/** 删除维修记录（仅允许维修中状态） */
export function deleteRepair(id: number): Promise<void> {
  return request.delete<unknown, void>(`/eam/repairs/${id}`)
}

/** 资产盘点列表（分页） */
export function fetchInventoryList(params?: { page?: number; size?: number; keyword?: string; status?: string }): Promise<PageResult<AssetInventoryRecord>> {
  return request.get<unknown, PageResult<AssetInventoryRecord>>('/eam/inventory', { params })
}

/** 盘点任务详情（含明细列表） */
export function fetchInventoryDetail(id: number): Promise<AssetInventoryRecord> {
  return request.get<unknown, AssetInventoryRecord>(`/eam/inventory/${id}`)
}

/** 发起盘点 */
export function createInventory(taskName: string, operator: string): Promise<string> {
  return request.post<unknown, string>('/eam/inventory', { taskName, operator })
}

/** 提交盘点结果 */
export function submitInventoryResult(taskNo: string, items: { assetId: number; status: 'normal' | 'lost' | 'damaged'; remark?: string }[]): Promise<void> {
  return request.post<unknown, void>('/eam/inventory/submit', { taskNo, items })
}

/** 取消盘点任务 */
export function cancelInventory(id: number): Promise<void> {
  return request.post<unknown, void>(`/eam/inventory/${id}/cancel`)
}

/** 资产统计 */
export function fetchAssetStatistics(): Promise<AssetStatistics> {
  return unavailableAssetOperation('资产看板统计')
}

/* ==================== 统计 ==================== */

export interface AssetStatistics {
  /** 资产总数 */
  totalCount: number
  /** 在用数 */
  inUseCount: number
  /** 闲置数 */
  idleCount: number
  /** 维修中数 */
  inRepairCount: number
  /** 已报废数 */
  scrappedCount: number
  /** 资产总价值 */
  totalValue: number
  /** 资产类型分布 */
  typeDistribution: { type: string; count: number }[]
  /** 部门分布 */
  departmentDistribution: { department: string; count: number }[]
  /** 来源分布 */
  sourceDistribution: { source: AssetSource; count: number }[]
  /** 月度入库趋势 */
  monthlyTrend: { month: string; count: number; value: number }[]
}

/** 未接入后端的周边模块必须明确失败，不能拿真实资产 ID 操作模拟台账。 */
function unavailableAssetOperation<T>(operation: string): Promise<T> {
  return Promise.reject(new Error(`${operation}尚未接入真实 API`))
}

