/**
 * 借用管理 API
 *
 * 后端接口: /api/eam/borrows/*
 */
import request, { isBackendUnavailable } from './request'

/* ==================== 类型定义 ==================== */

export interface BorrowRow {
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
}

export interface BorrowQuery {
  page: number
  size: number
  keyword?: string
  status?: string
  department?: string
  startDate?: string
  endDate?: string
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
