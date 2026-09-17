/**
 * 领用管理 API
 *
 * 后端接通后使用真实接口，后端不可用时降级到空态数据。
 * 管理端: /api/eam/claims/*
 * 个人端: /api/eam/claims/my
 */
import request, { isBackendUnavailable } from './request'
import type {
  ClaimPage,
  ClaimQuery,
  ClaimRegistration,
  ClaimRow,
  ClaimStatsData,
  ClaimEmployeeSummary,
  ClaimSummaryData,
} from '../pages/AssetManagement/AssetClaim/claimViewTypes'

/* ==================== 管理端 ==================== */

/** 管理视图分页查询 */
export async function fetchClaimList(query: ClaimQuery): Promise<ClaimPage<ClaimRow>> {
  try {
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('size', String(query.size))
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.departmentId) params.set('departmentId', String(query.departmentId))
    if (query.status) params.set('status', query.status)
    if (query.pendingSignature) params.set('pendingSignature', 'true')
    if (query.employeeId) params.set('employeeId', String(query.employeeId))
    return await request.get<unknown, ClaimPage<ClaimRow>>(`/eam/claims?${params}`)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { records: [], total: 0 }
    }
    throw err
  }
}

/** 领用统计 */
export async function fetchClaimStats(query: Partial<ClaimQuery>): Promise<ClaimStatsData> {
  try {
    const params = new URLSearchParams()
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.departmentId) params.set('departmentId', String(query.departmentId))
    if (query.employeeId) params.set('employeeId', String(query.employeeId))
    return await request.get<unknown, ClaimStatsData>(`/eam/claims/stats?${params}`)
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return { employeeCount: 0, claimedCount: 0, returnedCount: 0, pendingSignatureCount: 0 }
    }
    throw err
  }
}

/** 员工领用汇总 */
export async function fetchEmployeeSummary(query: ClaimQuery): Promise<ClaimSummaryData> {
  try {
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('size', String(query.size))
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.departmentId) params.set('departmentId', String(query.departmentId))
    const data = await request.get<unknown, ClaimPage<ClaimEmployeeSummary>>(`/eam/claims/employee-summary?${params}`)
    const stats = await fetchClaimStats(query)
    return { ...data, stats }
  } catch (err) {
    if (isBackendUnavailable(err)) {
      return {
        records: [],
        total: 0,
        stats: { employeeCount: 0, claimedCount: 0, returnedCount: 0, pendingSignatureCount: 0 },
      }
    }
    throw err
  }
}

/** 领用详情 */
export async function fetchClaimDetail(claimId: number): Promise<ClaimRow> {
  return request.get<unknown, ClaimRow>(`/eam/claims/${claimId}`)
}

/** 领用事件流水 */
export interface ClaimEvent {
  id: number
  claimId: number
  eventType: string
  operatorName: string
  remark?: string
  createdAt: string
}

export async function fetchClaimEvents(claimId: number): Promise<ClaimEvent[]> {
  try {
    return await request.get<unknown, ClaimEvent[]>(`/eam/claims/${claimId}/events`)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 登记领用 */
export async function registerClaim(registration: ClaimRegistration): Promise<number> {
  return request.post<unknown, number>('/eam/claims', {
    assetId: registration.assetId,
    employeeId: registration.employeeId,
    claimDate: registration.claimDate,
    claimReason: registration.claimReason,
    remark: registration.remark,
    mode: registration.mode,
    proxyReason: registration.proxyReason,
  })
}

/** 员工签署 */
export async function signClaim(claimId: number, signatureImage: string): Promise<void> {
  await request.post<unknown, void>('/eam/claims/sign', { claimId, signatureImage })
}

/** 取消领用 */
export async function cancelClaim(claimId: number, reason: string): Promise<void> {
  await request.post<unknown, void>(`/eam/claims/${claimId}/cancel`, { reason })
}

/** 归还资产 */
export async function returnClaim(claimId: number, returnDate: string, returnReason?: string, conditionNote?: string): Promise<number> {
  return request.post<unknown, number>('/eam/claims/return', {
    claimId,
    returnDate,
    returnReason,
    conditionNote,
  })
}

/* ==================== 个人端 ==================== */

/** 个人领用列表 */
export async function fetchMyClaims(query: ClaimQuery): Promise<ClaimPage<ClaimRow>> {
  return request.get<unknown, ClaimPage<ClaimRow>>('/eam/claims/my', { params: query })
}

export function fetchMyClaim(id: number): Promise<ClaimRow> {
  return request.get<unknown, ClaimRow>(`/eam/claims/my/${id}`)
}

export function signMyClaim(claimId: number, signatureImage: string): Promise<void> {
  return request.post<unknown, void>('/eam/claims/my/sign', { claimId, signatureImage })
}
