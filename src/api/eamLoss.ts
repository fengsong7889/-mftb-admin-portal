/**
 * 遗失找回 API
 *
 * 后端接口: /api/eam/losses/*
 */
import request, { isBackendUnavailable } from './request'

/* ==================== 类型定义 ==================== */

/** 遗失单状态 */
export type LossStatus = 'searching' | 'found_pending' | 'recovered' | 'written_off'

/** 来源类型 */
export type LossSourceType = 'claim' | 'borrow' | 'return' | 'direct'

/** 验收结果 */
export type InspectionResult = 'normal' | 'damaged' | 'scrapped'

/** 遗失单列表行 */
export interface LossRow {
  id: number
  lossNo: string
  sourceType: LossSourceType
  sourceId: number
  returnId?: number
  assetId: number
  assetNo: string
  assetName: string
  assetType?: string
  brand?: string
  /** 遗失时资产状态快照（idle/in_use），用于判断是否展示「遗失时使用人」模块 */
  assetStatus?: string
  originalHolderId?: number
  originalHolderName?: string
  /** 原持有人工号 */
  originalHolderNo?: string
  originalDepartment?: string
  lastKnownLocation?: string
  lossDate: string
  lossReason: string
  reporterId?: number
  reporterName?: string
  /** 登记人工号 */
  reporterNo?: string
  status: LossStatus
  openDays?: number
  recoveredDate?: string
  recoveredLocation?: string
  recoveredById?: number
  recoveredByName?: string
  /** 找回登记人工号 */
  recoveredByNo?: string
  recoveredNote?: string
  inspectionResult?: InspectionResult
  inspectionDate?: string
  inspectionNote?: string
  writeOffDate?: string
  writeOffReason?: string
  compensationId?: number
  compensationNo?: string
  repairId?: number
  scrapId?: number
  followUpCount?: number
  lastFollowUpAt?: string
  createdAt: string
  updatedAt: string
  /** 最后更新人姓名 */
  updatedByName?: string
  fromMigration?: number
  /** 所属品牌/公司品牌 ID */
  companyBrand?: number | null
  events?: LossEventVO[]
}

/** 事件日志 */
export interface LossEventVO {
  id: number
  eventType: string
  eventDesc: string
  beforeValue?: string
  afterValue?: string
  changeReason?: string
  operatorId?: number
  operatorName?: string
  /** 操作人工号 */
  operatorNo?: string
  evidenceId?: number
  createdAt: string
}

/** 查询参数 */
export interface LossQuery {
  page: number
  size: number
  keyword?: string
  lossNo?: string
  assetKeyword?: string
  originalHolderName?: string
  sourceType?: string
  status?: string
  department?: string
  startDate?: string
  endDate?: string
  /** 最后更新人 */
  updatedBy?: string
  /** 最后更新开始日期 */
  updateStartDate?: string
  /** 最后更新结束日期 */
  updateEndDate?: string
  /** 所属品牌（sys_company_brand.id） */
  companyBrand?: number
}

/** 分页结果 */
export interface LossPage<T> {
  records: T[]
  total: number
}

/** 主动报失 DTO */
export interface LossSaveDTO {
  id?: number
  assetId: number
  lossDate: string
  lossReason: string
  lastKnownLocation?: string
  changeReason?: string
}

/** 编辑遗失单 DTO（assetId 不可修改） */
export interface LossUpdateDTO {
  lossDate?: string
  lossReason?: string
  lastKnownLocation?: string
  changeReason?: string
}

/** 登记找回 DTO */
export interface LossRecoverDTO {
  recoveredDate: string
  recoveredLocation?: string
  recoveredNote?: string
  evidenceDataUrl?: string
  evidenceFileName?: string
}

/** 验收处置 DTO */
export interface LossInspectDTO {
  inspectionResult: InspectionResult
  inspectionDate: string
  inspectionNote?: string
  receiveDepartment?: string
  receiveLocationId?: number
  evidenceDataUrl?: string
  evidenceFileName?: string
}

/** 遗失核销 DTO */
export interface LossWriteOffDTO {
  writeOffDate: string
  writeOffReason: string
  evidenceDataUrl?: string
  evidenceFileName?: string
}

/** 跟进事件 DTO */
export interface LossEventDTO {
  eventDesc: string
  evidenceDataUrl?: string
  evidenceFileName?: string
}

/* ==================== API 方法 ==================== */

/** 分页查询 */
export async function fetchLossList(query: LossQuery): Promise<LossPage<LossRow>> {
  try {
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('size', String(query.size))
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.lossNo) params.set('lossNo', query.lossNo)
    if (query.assetKeyword) params.set('assetKeyword', query.assetKeyword)
    if (query.originalHolderName) params.set('originalHolderName', query.originalHolderName)
    if (query.sourceType) params.set('sourceType', query.sourceType)
    if (query.status) params.set('status', query.status)
    if (query.department) params.set('department', query.department)
    if (query.startDate) params.set('startDate', query.startDate)
    if (query.endDate) params.set('endDate', query.endDate)
    if (query.updatedBy) params.set('updatedBy', query.updatedBy)
    if (query.updateStartDate) params.set('updateStartDate', query.updateStartDate)
    if (query.updateEndDate) params.set('updateEndDate', query.updateEndDate)
    if (query.companyBrand) params.set('companyBrand', String(query.companyBrand))
    return await request.get<unknown, LossPage<LossRow>>(`/eam/losses?${params}`)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { records: [], total: 0 }
    }
    throw err
  }
}

/** 详情（含事件日志） */
export async function fetchLossDetail(id: number): Promise<LossRow> {
  return request.get<unknown, LossRow>(`/eam/losses/${id}`)
}

/** 主动报失 */
export async function createLoss(dto: LossSaveDTO): Promise<number> {
  return request.post<unknown, number>('/eam/losses', dto)
}

/** 编辑遗失单 */
export async function updateLoss(id: number, dto: LossUpdateDTO): Promise<void> {
  await request.put<unknown, void>(`/eam/losses/${id}`, dto)
}

/** 登记找回 */
export async function recoverLoss(id: number, dto: LossRecoverDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/losses/${id}/recover`, dto)
}

/** 验收处置 */
export async function inspectLoss(id: number, dto: LossInspectDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/losses/${id}/inspect`, dto)
}

/** 遗失核销 */
export async function writeOffLoss(id: number, dto: LossWriteOffDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/losses/${id}/write-off`, dto)
}

/** 追加跟进 */
export async function addLossEvent(id: number, dto: LossEventDTO): Promise<number> {
  return request.post<unknown, number>(`/eam/losses/${id}/events`, dto)
}
