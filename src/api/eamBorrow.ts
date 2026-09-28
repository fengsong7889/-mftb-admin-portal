/**
 * 借用管理 API
 *
 * 后端接口: /api/eam/borrows/*
 */
import request, { isBackendUnavailable, SILENT_HEADER } from './request'
import type { AssetParameterSource } from '../utils/assetParams'

/* ==================== 类型定义 ==================== */

export interface BorrowRow extends AssetParameterSource {
  id: number
  borrowNo: string
  assetId: number
  assetNo: string
  assetName: string
  holderId: number
  holderName: string
  department: string
  operatorName: string
  status: 'active' | 'overdue' | 'returned' | 'cancelled'
  startDate: string
  dueDate: string
  returnDate?: string
  purpose?: string
  renewCount: number
  returnId?: number
  createdAt: string
  updatedAt: string
  overdueDays?: number
  /** 所属品牌/公司品牌 ID */
  companyBrand?: number | null
}

export interface BorrowQuery {
  page: number
  size: number
  keyword?: string
  status?: string
  department?: string
  startDate?: string
  endDate?: string
  /** 所属品牌（sys_company_brand.id） */
  companyBrand?: number
}

export interface BorrowPage<T> {
  records: T[]
  total: number
}

export interface BorrowRegisterDTO {
  assetId: number
  holderId: number
  department: string
  startDate: string
  dueDate: string
  purpose?: string
}

export interface BorrowRenewDTO {
  newDueDate: string
}

/** 本人借用统计（“我的资产”借用页签） */
export interface BorrowStatsData {
  activeCount: number
  overdueCount: number
  returnedCount: number
  totalCount: number
}

/* ==================== API 方法 ==================== */

/** 分页查询 */
export async function fetchBorrowList(query: BorrowQuery): Promise<BorrowPage<BorrowRow>> {
  try {
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('size', String(query.size))
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.status) params.set('status', query.status)
    if (query.department) params.set('department', query.department)
    if (query.startDate) params.set('startDate', query.startDate)
    if (query.endDate) params.set('endDate', query.endDate)
    if (query.companyBrand) params.set('companyBrand', String(query.companyBrand))
    return await request.get<unknown, BorrowPage<BorrowRow>>(`/eam/borrows?${params}`)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { records: [], total: 0 }
    }
    throw err
  }
}

/** 详情 */
export async function fetchBorrowDetail(id: number): Promise<BorrowRow> {
  return request.get<unknown, BorrowRow>(`/eam/borrows/${id}`)
}

/* ==================== 本人自助视图（登录即可，后端强制本人口径） ==================== */

/** 本人借用分页（不授予 asset-borrow 菜单权限也能访问） */
export async function fetchMyBorrows(query: BorrowQuery): Promise<BorrowPage<BorrowRow>> {
  try {
    return await request.get<unknown, BorrowPage<BorrowRow>>('/eam/borrows/my', { params: query })
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { records: [], total: 0 }
    }
    throw err
  }
}

/** 本人借用统计（静默：失败由页面降级为 — 不弹全局错误提示） */
export function fetchMyBorrowStats(): Promise<BorrowStatsData> {
  return request.get<unknown, BorrowStatsData>('/eam/borrows/my/stats', { headers: { [SILENT_HEADER]: '1' } })
}

/** 本人借用详情（归属由服务端校验） */
export async function fetchMyBorrowDetail(id: number): Promise<BorrowRow> {
  return request.get<unknown, BorrowRow>(`/eam/borrows/my/${id}`)
}

/** 登记借用 */
export async function registerBorrow(dto: BorrowRegisterDTO): Promise<number> {
  return request.post<unknown, number>('/eam/borrows', dto)
}

/** 续借 */
export async function renewBorrow(id: number, dto: BorrowRenewDTO): Promise<void> {
  await request.post<unknown, void>(`/eam/borrows/${id}/renew`, dto)
}

/** 取消借用 */
export async function cancelBorrow(id: number, reason: string): Promise<void> {
  await request.post<unknown, void>(`/eam/borrows/${id}/cancel`, { reason })
}
