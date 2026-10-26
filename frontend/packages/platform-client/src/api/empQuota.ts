/**
 * 員工額度 API（職位額度 + 角色額度）
 * 對接後端 /api/ai/emp-quota/*
 */
import request from './request'

/* ══════════ 類型定義（與後端 VO 對齊） ══════════ */

export type QuotaPeriod = 'daily' | 'monthly'
export type QuotaType = 'token' | 'cost' | 'request'
export type OverLimitAction = 'reject' | 'approve' | 'downgrade'
export type Currency = 'CNY' | 'USD'

export interface PosQuotaVO {
  id: number
  /** 配置ID（编号生成规则 ai_emp_pos_quota，如 ZWED202609000） */
  configCode?: string
  name: string
  description: string
  sequences: string[]
  jobLevels: string[]
  totalEmployeeCount: number
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

export interface RoleQuotaVO {
  id: number
  /** 配置ID（编号生成规则 ai_emp_role_quota，如 JSED20260906000） */
  configCode?: string
  roleName: string
  description: string
  userIds: number[]
  userNames: string[]
  totalEmployeeCount: number
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

export interface PosQuotaRequest {
  id?: number
  name: string
  description?: string
  sequences: string[]
  jobLevels: string[]
  totalEmployeeCount?: number
  period: string
  quotaType: string
  quotaValue: number
  currency?: string
  softThreshold?: number
  overLimitAction: string
  downgradeModelId?: number | null
  status?: number
}

export interface RoleQuotaRequest {
  id?: number
  roleName: string
  description?: string
  userIds?: number[]
  userNames?: string[]
  totalEmployeeCount?: number
  period: string
  quotaType: string
  quotaValue: number
  currency?: string
  softThreshold?: number
  overLimitAction: string
  downgradeModelId?: number | null
  status?: number
}

export interface QuotaQueryParams {
  name?: string
  sequence?: string
  period?: string
  status?: number
}

/* ══════════ 職位額度 API ══════════ */

/** 查詢職位額度列表 */
export function fetchPosQuotas(params?: QuotaQueryParams) {
  return request.get<unknown, PosQuotaVO[]>('/ai/emp-quota/positions', { params })
}

/** 查詢職位額度詳情 */
export function fetchPosQuotaDetail(id: number) {
  return request.get<unknown, PosQuotaVO>(`/ai/emp-quota/positions/${id}`)
}

/** 新增/更新職位額度 */
export function savePosQuota(data: PosQuotaRequest) {
  return request.post<unknown, number>('/ai/emp-quota/positions', data)
}

/** 刪除職位額度 */
export function deletePosQuota(id: number) {
  return request.delete<unknown, boolean>(`/ai/emp-quota/positions/${id}`)
}

/** 切換職位額度啟用/停用 */
export function togglePosQuotaStatus(id: number, status: number) {
  return request.put<unknown, boolean>(`/ai/emp-quota/positions/${id}/status`, null, { params: { status } })
}

/* ══════════ 角色額度 API ══════════ */

/** 查詢角色額度列表 */
export function fetchRoleQuotas(params?: QuotaQueryParams) {
  return request.get<unknown, RoleQuotaVO[]>('/ai/emp-quota/roles', { params })
}

/** 查詢角色額度詳情 */
export function fetchRoleQuotaDetail(id: number) {
  return request.get<unknown, RoleQuotaVO>(`/ai/emp-quota/roles/${id}`)
}

/** 新增/更新角色額度 */
export function saveRoleQuota(data: RoleQuotaRequest) {
  return request.post<unknown, number>('/ai/emp-quota/roles', data)
}

/** 刪除角色額度 */
export function deleteRoleQuota(id: number) {
  return request.delete<unknown, boolean>(`/ai/emp-quota/roles/${id}`)
}

/** 切換角色額度啟用/停用 */
export function toggleRoleQuotaStatus(id: number, status: number) {
  return request.put<unknown, boolean>(`/ai/emp-quota/roles/${id}/status`, null, { params: { status } })
}
