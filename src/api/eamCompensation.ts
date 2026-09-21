/**
 * 赔付管理 API
 *
 * 后端接口: /api/eam/compensations/*
 */
import request, { isBackendUnavailable } from './request'
import type { AssetParameterSource } from '../utils/assetParams'

/* ==================== 类型定义 ==================== */

export interface CompensationRow extends AssetParameterSource {
  id: number
  compNo: string
  returnId: number
  assetId: number
  assetName: string
  assetNo: string
  holderId: number
  holderName: string
  damageType: 'damage' | 'loss'
  cause?: 'human' | 'natural' | 'third_party' | 'quality'
  party?: 'employee' | 'department' | 'company' | 'none'
  responsibleId?: number
  responsibleName?: string
  department?: string
  amount: number
  netPaid: number
  status: 'pending' | 'confirmed' | 'partially_paid' | 'paid' | 'waived' | 'refund_pending'
  reviewRequired: number
  basis?: string
  reason?: string
  waiveReason?: string
  operatorName: string
  /** 所属品牌/公司品牌 ID */
  companyBrand?: number | null
  createdAt: string
  updatedAt: string
  payments?: PaymentRecord[]
  reviews?: ReviewRecord[]
}

export interface PaymentRecord {
  id: number
  type: 'payment' | 'refund'
  amount: number
  paymentDate: string
  reason?: string
  operatorName: string
  createdAt: string
  evidenceImageUrl?: string
}

export interface ReviewRecord {
  id: number
  reviewDate: string
  beforeAmount: number
  afterAmount: number
  reason: string
  operatorName: string
  createdAt: string
}

export interface CompensationQuery {
  page: number
  size: number
  compNo?: string
  assetName?: string
  holderName?: string
  status?: string
  damageType?: string
  party?: string
  reviewRequired?: boolean
  /** 所属品牌（sys_company_brand.id） */
  companyBrand?: number
}

export interface CompensationPage<T> {
  records: T[]
  total: number
}

export interface LiabilityDTO {
  party: 'employee' | 'department' | 'company' | 'none'
  responsibleId?: number
  responsibleName?: string
  department?: string
  cause: 'human' | 'natural' | 'third_party' | 'quality'
  amount: number
  basis?: string
}

export interface WaiveDTO {
  waiveReason: string
}

export interface PaymentDTO {
  type: 'payment' | 'refund'
  amount: number
  paymentDate: string
  reason?: string
  evidenceDataUrl?: string
  evidenceFileName?: string
}

export interface ReviewDTO {
  newAmount: number
  reason: string
}

/** 直接创建赔付单 DTO */
export interface CompensationSaveDTO {
  assetId: number
  damageType: 'damage' | 'loss'
  cause?: 'human' | 'natural' | 'third_party' | 'quality'
  party?: 'employee' | 'department' | 'company' | 'none'
  responsibleId?: number
  responsibleName?: string
  department?: string
  reason?: string
  returnId?: number
  lossId?: number
}

/* ==================== API 方法 ==================== */

/** 分页查询 */
export async function fetchCompensationList(query: CompensationQuery): Promise<CompensationPage<CompensationRow>> {
  try {
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('size', String(query.size))
    if (query.compNo) params.set('compNo', query.compNo)
    if (query.assetName) params.set('assetName', query.assetName)
    if (query.holderName) params.set('holderName', query.holderName)
    if (query.status) params.set('status', query.status)
    if (query.damageType) params.set('damageType', query.damageType)
    if (query.party) params.set('party', query.party)
    if (query.reviewRequired !== undefined) params.set('reviewRequired', String(query.reviewRequired))
    if (query.companyBrand) params.set('companyBrand', String(query.companyBrand))
    return await request.get<unknown, CompensationPage<CompensationRow>>(`/eam/compensations?${params}`)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { records: [], total: 0 }
    }
    throw err
  }
}

/** 详情 */
export async function fetchCompensationDetail(id: number): Promise<CompensationRow> {
  return request.get<unknown, CompensationRow>(`/eam/compensations/${id}`)
}

/** 定责 */
export async function setLiability(id: number, dto: LiabilityDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/compensations/${id}/liability`, dto)
}

/** 免赔 */
export async function waiveCompensation(id: number, dto: WaiveDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/compensations/${id}/waive`, dto)
}

/** 收款/退款 */
export async function addPayment(id: number, dto: PaymentDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/compensations/${id}/payment`, dto)
}

/** 找回复核 */
export async function reviewCompensation(id: number, dto: ReviewDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/compensations/${id}/review`, dto)
}

/** 直接创建赔付记录 */
export async function createCompensation(dto: CompensationSaveDTO): Promise<number> {
  return request.post<unknown, number>('/eam/compensations', dto)
}
