/**
 * 部門額度 API
 * 對接後端 /api/ai/dept-quota/*
 */
import request from './request'

/* ══════════ 類型定義（與後端 VO 對齊） ══════════ */

export type QuotaPeriod = 'daily' | 'monthly'
export type QuotaType = 'token' | 'cost' | 'request'
export type OverLimitAction = 'reject' | 'approve' | 'downgrade'
export type AllocateMode = 'total' | 'per_capita'
export type Currency = 'CNY' | 'USD'

export interface DeptQuotaVO {
  id: number
  /** 配置ID（编号生成规则 ai_dept_quota，如 BMED20260906000） */
  configCode?: string
  name: string
  description: string
  deptIds: number[]
  deptNames: string[]
  totalEmployeeCount: number
  allocateMode: AllocateMode
  period: QuotaPeriod
  quotaType: QuotaType
  quotaValue: number
  currency: Currency
  softThreshold: number
  overLimitAction: OverLimitAction
  downgradeModelId: number | null
  usedValue: number
  status: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface DeptQuotaRequest {
  id?: number
  name: string
  description?: string
  deptIds: number[]
  deptNames: string[]
  totalEmployeeCount?: number
  allocateMode: string
  period: string
  quotaType: string
  quotaValue: number
  currency?: string
  softThreshold?: number
  overLimitAction: string
  downgradeModelId?: number | null
  status?: number
}

export interface DeptQuotaQueryParams {
  name?: string
  period?: string
  status?: number
}

/* ══════════ API ══════════ */

/** 查詢部門額度列表 */
export function fetchDeptQuotas(params?: DeptQuotaQueryParams) {
  return request.get<unknown, DeptQuotaVO[]>('/ai/dept-quota', { params })
}

/** 查詢部門額度詳情 */
export function fetchDeptQuotaDetail(id: number) {
  return request.get<unknown, DeptQuotaVO>(`/ai/dept-quota/${id}`)
}

/** 新增/更新部門額度 */
export function saveDeptQuota(data: DeptQuotaRequest) {
  return request.post<unknown, number>('/ai/dept-quota', data)
}

/** 刪除部門額度 */
export function deleteDeptQuota(id: number) {
  return request.delete<unknown, boolean>(`/ai/dept-quota/${id}`)
}

/** 切換部門額度啟用/停用 */
export function toggleDeptQuotaStatus(id: number, status: number) {
  return request.put<unknown, boolean>(`/ai/dept-quota/${id}/status`, null, { params: { status } })
}
