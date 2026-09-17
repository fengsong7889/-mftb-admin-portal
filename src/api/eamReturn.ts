/**
 * 归还管理 API
 *
 * 后端接口: /api/eam/returns/*
 */
import request, { isBackendUnavailable } from './request'
import type { AssetParameterSource } from '../utils/assetParams'

/* ==================== 类型定义 ==================== */

export interface ReturnRow extends AssetParameterSource {
  id: number
  returnNo: string
  sourceType: 'claim' | 'borrow'
  sourceId: number
  claimId?: number
  borrowId?: number
  assetId: number
  assetNo: string
  assetName: string
  employeeId: number
  empName: string
  operatorName: string
  returnDate: string
  returnReason?: string
  conditionNote?: string
  returnStatus: 'completed' | 'exception_pending' | 'exception_closed'
  assetCondition: 'normal' | 'damaged' | 'lost'
  exceptionReason?: string
  disposition?: 'idle' | 'scrapped' | 'written_off'
  dispositionDate?: string
  recovered: number
  recoveredDate?: string
  recoveredNote?: string
  actualReturneeId?: number
  actualReturneeName?: string
  compensationId?: number
  createdAt: string
  updatedAt: string
  evidenceImageUrl?: string
}

export interface ReturnQuery {
  page: number
  size: number
  keyword?: string
  sourceType?: string
  returnStatus?: string
  assetCondition?: string
  startDate?: string
  endDate?: string
}

export interface ReturnPage<T> {
  records: T[]
  total: number
}

export interface ReturnRegisterDTO {
  claimId?: number
  borrowId?: number
  returnDate: string
  returnReason?: string
  conditionNote?: string
  assetCondition?: 'normal' | 'damaged' | 'lost'
  exceptionReason?: string
  actualReturneeId?: number
  actualReturneeName?: string
  evidenceDataUrl?: string
  evidenceFileName?: string
  /** 接收管理部门（正常归还归位用，空则保持原归属部门） */
  receiveDepartment?: string
  /** 归还位置 ID（空则保持原位置） */
  receiveLocationId?: number
}

export interface ReturnDispositionDTO {
  disposition: 'idle' | 'scrapped' | 'written_off'
  dispositionDate: string
  evidenceDataUrl?: string
  evidenceFileName?: string
}

export interface ReturnRecoverDTO {
  recoveredNote?: string
}

/* ==================== API 方法 ==================== */

/** 分页查询 */
export async function fetchReturnList(query: ReturnQuery): Promise<ReturnPage<ReturnRow>> {
  try {
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('size', String(query.size))
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.sourceType) params.set('sourceType', query.sourceType)
    if (query.returnStatus) params.set('returnStatus', query.returnStatus)
    if (query.assetCondition) params.set('assetCondition', query.assetCondition)
    if (query.startDate) params.set('startDate', query.startDate)
    if (query.endDate) params.set('endDate', query.endDate)
    return await request.get<unknown, ReturnPage<ReturnRow>>(`/eam/returns?${params}`)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { records: [], total: 0 }
    }
    throw err
  }
}

/** 详情 */
export async function fetchReturnDetail(id: number): Promise<ReturnRow> {
  return request.get<unknown, ReturnRow>(`/eam/returns/${id}`)
}

/** 登记归还 */
export async function registerReturn(dto: ReturnRegisterDTO): Promise<number> {
  return request.post<unknown, number>('/eam/returns', dto)
}

/** 处置登记 */
export async function disposeReturn(id: number, dto: ReturnDispositionDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/returns/${id}/dispose`, dto)
}

/** 遗失找回 */
export async function recoverReturn(id: number, dto: ReturnRecoverDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/returns/${id}/recover`, dto)
}
