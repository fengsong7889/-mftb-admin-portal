/**
 * 組織編制系統（organization）接口層。
 *
 * 為什麼單獨一個 api 文件：本域走版本化命名空間 `/api/hcm/v1/organization/**`（方案 13.4），
 * 與舊 `employee.ts` / `hr.ts` 的 `/api/employees`、`/api/hr/*` 不混用；舊路徑由兼容層承接，
 * 新代碼不得回頭調用舊接口，否則「新系統不得復用 hr 准入」的邊界會被悄悄打穿。
 */
import request from './request'
import type { PageResult } from './employee'

/** 法人主體 */
export interface OrgLegalEntity {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  jurisdiction: string
  registrationNo?: string | null
  registeredAddress?: string | null
  /** 0=待核實 1=已核實 */
  verifyStatus?: number
  status?: number
  sortOrder?: number
  remark?: string | null
  updatedBy?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

/** 管理組織樹節點 */
export interface OrgUnitNode {
  id: number
  code: string
  name: string
  nameEn?: string | null
  parentId?: number | null
  legalEntityId: number
  legalEntityName?: string | null
  unitType: string
  leaderName?: string | null
  path?: string | null
  status: number
  sortOrder?: number
  remark?: string | null
  children?: OrgUnitNode[]
}

export interface OrgUnitQuery {
  legalEntityId?: number
  keyword?: string
  status?: number
}

export interface OrgLegalEntityStats {
  total: number
  enabled: number
  pendingVerify: number
  jurisdictions: number
}

export const JURISDICTION_OPTIONS = [
  { value: 'CN', label: '中國內地' },
  { value: 'HK', label: '中國香港' },
  { value: 'MO', label: '中國澳門' },
] as const

export const UNIT_TYPE_OPTIONS = [
  { value: 'COMPANY', label: '公司' },
  { value: 'DEPARTMENT', label: '部門' },
  { value: 'BUSINESS_UNIT', label: '業務單元' },
] as const

/* ==================== 法人主體 ==================== */

export function listLegalEntities(params: {
  page: number
  size: number
  keyword?: string
  status?: number
  jurisdiction?: string
}) {
  return request.get<unknown, PageResult<OrgLegalEntity>>('/hcm/v1/organization/legal-entities', { params })
}

/** 統計口徑必須跟隨列表篩選，禁止不帶條件單獨取數 */
export function legalEntityStats(params: { keyword?: string; status?: number; jurisdiction?: string }) {
  return request.get<unknown, OrgLegalEntityStats>('/hcm/v1/organization/legal-entities/stats', { params })
}

export function getLegalEntity(id: number) {
  return request.get<unknown, OrgLegalEntity>(`/hcm/v1/organization/legal-entities/${id}`)
}

export function createLegalEntity(data: OrgLegalEntity) {
  return request.post<unknown, OrgLegalEntity>('/hcm/v1/organization/legal-entities', data)
}

export function updateLegalEntity(id: number, data: OrgLegalEntity) {
  return request.put<unknown, OrgLegalEntity>(`/hcm/v1/organization/legal-entities/${id}`, data)
}

export function deleteLegalEntity(id: number) {
  return request.delete(`/hcm/v1/organization/legal-entities/${id}`)
}

/* ==================== 管理組織 ==================== */

export function unitTree(params: OrgUnitQuery) {
  return request.get<unknown, OrgUnitNode[]>('/hcm/v1/organization/units/tree', { params })
}

export function getUnit(id: number) {
  return request.get<unknown, OrgUnitNode>(`/hcm/v1/organization/units/${id}`)
}

export function createUnit(data: Partial<OrgUnitNode>) {
  return request.post<unknown, OrgUnitNode>('/hcm/v1/organization/units', data)
}

export function updateUnit(id: number, data: Partial<OrgUnitNode>) {
  return request.put<unknown, OrgUnitNode>(`/hcm/v1/organization/units/${id}`, data)
}

export function deleteUnit(id: number) {
  return request.delete(`/hcm/v1/organization/units/${id}`)
}

/* ==================== 職位體系 ==================== */

/** 職務族 */
export interface OrgJobFamily {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  status?: number
  sortOrder?: number
  remark?: string | null
  updatedBy?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

/** 職位職級 */
export interface OrgJobGrade {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  jobFamilyId: number
  gradeLevel?: number
  status?: number
  sortOrder?: number
  remark?: string | null
  updatedBy?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

export function listJobFamilies(params: { page: number; size: number; keyword?: string; status?: number }) {
  return request.get<unknown, PageResult<OrgJobFamily>>('/hcm/v1/organization/job-families', { params })
}

export function getJobFamily(id: number) {
  return request.get<unknown, OrgJobFamily>(`/hcm/v1/organization/job-families/${id}`)
}

export function createJobFamily(data: OrgJobFamily) {
  return request.post<unknown, OrgJobFamily>('/hcm/v1/organization/job-families', data)
}

export function updateJobFamily(id: number, data: OrgJobFamily) {
  return request.put<unknown, OrgJobFamily>(`/hcm/v1/organization/job-families/${id}`, data)
}

export function deleteJobFamily(id: number) {
  return request.delete(`/hcm/v1/organization/job-families/${id}`)
}

export function listJobGrades(params: {
  page: number
  size: number
  keyword?: string
  status?: number
  jobFamilyId?: number
}) {
  return request.get<unknown, PageResult<OrgJobGrade>>('/hcm/v1/organization/job-grades', { params })
}

export function jobGradeOptions(jobFamilyId?: number) {
  return request.get<unknown, OrgJobGrade[]>('/hcm/v1/organization/job-grades/options', {
    params: { jobFamilyId },
  })
}

export function getJobGrade(id: number) {
  return request.get<unknown, OrgJobGrade>(`/hcm/v1/organization/job-grades/${id}`)
}

export function createJobGrade(data: OrgJobGrade) {
  return request.post<unknown, OrgJobGrade>('/hcm/v1/organization/job-grades', data)
}

export function updateJobGrade(id: number, data: OrgJobGrade) {
  return request.put<unknown, OrgJobGrade>(`/hcm/v1/organization/job-grades/${id}`, data)
}

export function deleteJobGrade(id: number) {
  return request.delete(`/hcm/v1/organization/job-grades/${id}`)
}

/* ==================== 崗位與編制 ==================== */

/** 崗位實例（本期只有核定編制，佔用待 C2 的任職事實反算） */
export interface OrgPosition {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  unitId: number
  jobGradeId: number
  /** 核定編制數；0 表示尚未核定 */
  headcount?: number
  /** 當前佔用（由任職事實反算，非手工維護） */
  occupiedCount?: number
  /** 空缺 = 編制 - 佔用；負數即超編 */
  vacancy?: number
  /** 超編（編制已核定且佔用 > 編制） */
  overHeadcount?: boolean
  status?: number
  sortOrder?: number
  remark?: string | null
  updatedBy?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

export function listPositions(params: {
  page: number
  size: number
  keyword?: string
  status?: number
  unitId?: number
  jobGradeId?: number
}) {
  return request.get<unknown, PageResult<OrgPosition>>('/hcm/v1/organization/positions', { params })
}

export function getPosition(id: number) {
  return request.get<unknown, OrgPosition>(`/hcm/v1/organization/positions/${id}`)
}

export function createPosition(data: OrgPosition) {
  return request.post<unknown, OrgPosition>('/hcm/v1/organization/positions', data)
}

export function updatePosition(id: number, data: OrgPosition) {
  return request.put<unknown, OrgPosition>(`/hcm/v1/organization/positions/${id}`, data)
}

export function deletePosition(id: number) {
  return request.delete(`/hcm/v1/organization/positions/${id}`)
}
