/**
 * 員工AI權額管理 API
 * 對應後端 AiEmpPermissionController（/api/ai/emp-permission）
 */
import request from './request'

/* ══════════ 共用类型定义（原在 mock 文件，现统一在此导出） ══════════ */

/** 授權來源 */
export type PermissionSource = 'department' | 'position' | 'role' | 'approval'

/** 授權來源標籤 */
export const SOURCE_LABEL: Record<PermissionSource, string> = {
  department: '部門配置',
  position: '職位配置',
  role: '角色配置',
  approval: '審批授予',
}

/** 授權來源 Tag 顏色 */
export const SOURCE_TAG_COLOR: Record<PermissionSource, string> = {
  department: 'blue',
  position: 'purple',
  role: 'cyan',
  approval: 'orange',
}

/** 額度狀態 */
export type QuotaStatus = 'normal' | 'exhausted' | 'frozen'

/** 額度狀態標籤 */
export const QUOTA_STATUS_LABEL: Record<QuotaStatus, string> = {
  normal: '正常',
  exhausted: '已用完',
  frozen: '凍結',
}

/** 額度狀態 Tag 顏色 */
export const QUOTA_STATUS_COLOR: Record<QuotaStatus, string> = {
  normal: 'success',
  exhausted: 'error',
  frozen: 'default',
}

/** 模型權限項 */
export interface EmpModelPermission {
  modelId: number
  modelName: string
  source: PermissionSource
  sourceDesc: string
  visionSupport: boolean
  functionCalling: boolean
  jsonMode: boolean
  streaming: boolean
  thinkingMode: boolean
  status: number
  grantedAt: string
}

/** 額度記錄項 */
export interface EmpQuotaGrant {
  id: number
  source: PermissionSource
  sourceDesc: string
  quotaType: 'token' | 'request'
  quotaValue: number
  quotaPeriod: 'daily' | 'monthly'
  usedValue: number
  effectiveType: 'permanent' | 'temporary'
  effectiveAt: string
  expireAt: string | null
  overLimitAction: 'reject' | 'approve' | 'downgrade' | null
  status: number
  createdAt: string
}

/** 員工權限聚合記錄 */
export interface EmpPermissionSummary {
  employeeId: number
  employeeName: string
  empId: string
  department: string
  deptId: number
  position: string
  jobLevel: string
  modelCount: number
  modelPermissions: EmpModelPermission[]
  quotaGrants: EmpQuotaGrant[]
  lastUpdatedBy: string
  lastUpdatedAt: string
}

/** 根據額度記錄計算員工額度狀態 */
export function calcQuotaStatus(grants: EmpQuotaGrant[]): QuotaStatus {
  if (!grants.length) return 'frozen'
  const active = grants.filter((g) => g.status === 1)
  if (!active.length) return 'frozen'
  const allExhausted = active.every((g) => g.usedValue >= g.quotaValue)
  if (allExhausted) return 'exhausted'
  return 'normal'
}

/* ══════════ 後端 VO 類型（與 AiEmpPermissionDTO 同構） ══════════ */

export interface EmpPermissionSummaryVO {
  employeeId: number
  employeeName: string
  empId: string
  department: string
  deptId: number
  position: string
  jobLevel: string
  modelCount: number
  models: { modelId: number; modelName: string; source: string }[]
  quotas: {
    source: string; sourceDesc: string; quotaType: string; quotaPeriod: string
    quotaValue: number; usedValue: number; status: number
  }[]
  lastUpdatedBy: string
  lastUpdatedAt: string
}

export interface ModelPermissionVO {
  modelId: number
  modelName: string
  source: string
  sourceDesc: string
  visionSupport: number
  functionCalling: number
  jsonMode: number
  streaming: number
  thinkingMode: number
  status: number
  grantedAt: string
}

export interface QuotaGrantVO {
  id: number
  source: string
  sourceDesc: string
  quotaType: string
  quotaPeriod: string
  quotaValue: number
  usedValue: number
  effectiveType: string
  effectiveAt: string
  expireAt: string | null
  overLimitAction: string | null
  status: number
}

export interface DetailVO {
  basic: EmpPermissionSummaryVO
  models: ModelPermissionVO[]
  quotas: QuotaGrantVO[]
}

export interface AdjustLogVO {
  time: string
  source: string
  sourceDesc: string
  quotaType: string
  quotaPeriod: string
  oldValue: number
  newValue: number
  operator: string
  reason: string
}

export interface SaveReq {
  employeeId: number
  modelToggles: { modelId: number; field: string; value: number }[]
  quotaAdjusts: {
    quotaId: number; source: string; sourceDesc: string
    quotaType: string; quotaPeriod: string
    oldValue: number; newValue: number
  }[]
  reason: string
}

/* ══════════ 後端 VO → 前端類型轉換 ══════════ */

/** 後端 SummaryVO → 前端 EmpPermissionSummary */
function toSummary(vo: EmpPermissionSummaryVO): EmpPermissionSummary {
  const modelPermissions: EmpModelPermission[] = vo.models.map((m) => ({
    modelId: m.modelId,
    modelName: m.modelName,
    source: m.source as EmpPermissionSummary['modelPermissions'][0]['source'],
    sourceDesc: m.source,
    visionSupport: false,
    functionCalling: false,
    jsonMode: false,
    streaming: false,
    thinkingMode: false,
    status: 1,
    grantedAt: vo.lastUpdatedAt,
  }))
  const quotaGrants: EmpQuotaGrant[] = vo.quotas.map((q, idx) => ({
    id: idx + 1,
    source: q.source as EmpPermissionSummary['modelPermissions'][0]['source'],
    sourceDesc: q.sourceDesc,
    quotaType: q.quotaType as 'token' | 'request',
    quotaValue: q.quotaValue,
    quotaPeriod: q.quotaPeriod as 'daily' | 'monthly',
    usedValue: q.usedValue,
    effectiveType: 'permanent' as const,
    effectiveAt: vo.lastUpdatedAt,
    expireAt: null,
    overLimitAction: null,
    status: q.status,
    createdAt: vo.lastUpdatedAt,
  }))
  return {
    employeeId: vo.employeeId,
    employeeName: vo.employeeName,
    empId: vo.empId,
    department: vo.department,
    deptId: vo.deptId,
    position: vo.position,
    jobLevel: vo.jobLevel,
    modelCount: vo.modelCount,
    modelPermissions,
    quotaGrants,
    lastUpdatedBy: vo.lastUpdatedBy,
    lastUpdatedAt: vo.lastUpdatedAt,
  }
}

/** 後端 DetailVO → 前端 EmpPermissionSummary + 模型/額度數據 */
function toDetailData(detail: DetailVO): { summary: EmpPermissionSummary; models: EmpModelPermission[]; quotas: EmpQuotaGrant[] } {
  const summary = toSummary(detail.basic)
  const models: EmpModelPermission[] = detail.models.map((m) => ({
    modelId: m.modelId,
    modelName: m.modelName,
    source: m.source as EmpModelPermission['source'],
    sourceDesc: m.sourceDesc,
    visionSupport: m.visionSupport === 1,
    functionCalling: m.functionCalling === 1,
    jsonMode: m.jsonMode === 1,
    streaming: m.streaming === 1,
    thinkingMode: m.thinkingMode === 1,
    status: m.status,
    grantedAt: m.grantedAt,
  }))
  const quotas: EmpQuotaGrant[] = detail.quotas.map((q) => ({
    id: q.id,
    source: q.source as EmpQuotaGrant['source'],
    sourceDesc: q.sourceDesc,
    quotaType: q.quotaType as 'token' | 'request',
    quotaValue: q.quotaValue,
    quotaPeriod: q.quotaPeriod as 'daily' | 'monthly',
    usedValue: q.usedValue,
    effectiveType: q.effectiveType as 'permanent' | 'temporary',
    effectiveAt: q.effectiveAt,
    expireAt: q.expireAt,
    overLimitAction: q.overLimitAction as EmpQuotaGrant['overLimitAction'],
    status: q.status,
    createdAt: q.effectiveAt,
  }))
  summary.modelPermissions = models
  summary.quotaGrants = quotas
  return { summary, models, quotas }
}

/* ══════════ API 函數 ══════════ */

/** 列表：查詢員工權額概要 */
export async function fetchEmpPermissionList(params?: {
  queryName?: string; queryDept?: string; queryUpdatedBy?: string
  queryUpdateTimeStart?: string; queryUpdateTimeEnd?: string
}): Promise<EmpPermissionSummary[]> {
  const data = await request.get<EmpPermissionSummaryVO[]>('/ai/emp-permission/list', { params }) as unknown as EmpPermissionSummaryVO[]
  return data.map(toSummary)
}

/** 詳情：查詢員工權額明細 */
export async function fetchEmpPermissionDetail(empId: number): Promise<{
  summary: EmpPermissionSummary; models: EmpModelPermission[]; quotas: EmpQuotaGrant[]
}> {
  const data = await request.get<DetailVO>(`/ai/emp-permission/${empId}`) as unknown as DetailVO
  return toDetailData(data)
}

/** 保存編輯 */
export async function saveEmpPermission(empId: number, req: SaveReq): Promise<boolean> {
  return request.put(`/ai/emp-permission/${empId}`, req) as unknown as Promise<boolean>
}

/** 查詢調整日誌 */
export async function fetchAdjustLogs(empId: number): Promise<AdjustLogVO[]> {
  const data = await request.get<AdjustLogVO[]>(`/ai/emp-permission/${empId}/adjust-log`) as unknown as AdjustLogVO[]
  return data
}
