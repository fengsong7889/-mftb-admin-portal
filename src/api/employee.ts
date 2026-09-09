import request, { isBackendUnavailable } from './request'
import type { OptionItem } from './types'
import { mockFetchEmployees } from './mock/hr-mock'

/** 员工信息（后端返回，不含密码） */
export interface EmployeeItem {
  id: number
  username: string
  name: string
  empId: string
  role: string
  departmentId?: number | null
  department?: string
  positionId?: number | null
  /** 职位名称(中文) */
  position?: string
  /** 职位名称(英文) */
  positionEn?: string
  /** 职级序列 (M/T/P, 随职位带出) */
  sequence?: string
  jobLevel?: string
  /** 职等 (R1~R5) */
  rank?: string
  status: number
  /** 在职状态（由职务数据派生：active=在职, resigned=离职） */
  employmentStatus?: string

  // ── 个人信息 ──
  nationality?: string
  ethnicity?: string
  birthDate?: string
  maritalStatus?: string
  politicalStatus?: string
  religion?: string

  // ── 证件信息 ──
  idType?: string
  idNumber?: string
  idAddress?: string
  householdType?: string
  householdLocation?: string
  nativePlace?: string

  // ── 通讯信息 ──
  addressCountry?: string
  addressCity?: string
  addressDetail?: string

  functionRoleIds: number[]
  createdAt?: string
  /** 最后更新人 */
  updatedBy?: string
  /** 最后更新时间 */
  updatedAt?: string
}

/** 员工新增/编辑请求参数（工号/登录账号由后端自动生成） */
export interface EmployeePayload {
  username?: string // 后端自动生成，无需传入
  password?: string // 仅新增时使用
  name: string
  empId?: string // 后端按 MT 前缀自增生成，无需传入
  departmentId?: number | null
  positionId?: number | null
  /** 职等 (R1~R5) */
  rank?: string | null
  role?: string
  functionRoleIds?: number[]
}

/** 分页查询参数 */
export interface EmployeeQuery {
  page: number
  size: number
  keyword?: string
  employmentStatus?: string
}

/** 分页结果 */
export interface PageResult<T> {
  records: T[]
  total: number
}

/** 分页查询员工 */
export async function fetchEmployees(params: EmployeeQuery) {
  try {
    return await request.get<unknown, PageResult<EmployeeItem>>('/employees', { params })
  } catch (err) {
    if (isBackendUnavailable(err)) return mockFetchEmployees(params)
    throw err
  }
}

/** 员工搜索下拉选项（选项值为工号，仅在职状态；门店绑定BD选择员工用，附带部门/职位/职级信息） */
export async function fetchEmployeeOptions(keyword: string): Promise<OptionItem[]> {
  const res = await fetchEmployees({ page: 1, size: 50, keyword: keyword || undefined, employmentStatus: 'active' })
  return (res.records || []).map(e => {
    const extra = [e.department, e.position, e.jobLevel].filter(Boolean).join(' / ')
    return { value: e.empId, label: `${e.name}(${e.empId})${extra ? ` · ${extra}` : ''}` }
  })
}

/** 新增员工 */
export function createEmployee(data: EmployeePayload) {
  return request.post<unknown, EmployeeItem>('/employees', data)
}

/** 编辑员工 */
export function updateEmployee(id: number, data: EmployeePayload) {
  return request.put<unknown, EmployeeItem>(`/employees/${id}`, data)
}

/** 重置密码 */
export function resetEmployeePassword(id: number, password: string) {
  return request.put<unknown, void>(`/employees/${id}/password`, { password })
}

/** 启用/停用员工 */
export function updateEmployeeStatus(id: number, status: number) {
  return request.put<unknown, void>(`/employees/${id}/status`, null, { params: { status } })
}

/** 删除员工 */
export function deleteEmployee(id: number) {
  return request.delete<unknown, void>(`/employees/${id}`)
}

// ── 基础信息 ──

/** 基础信息响应（个人信息 + 证件信息 + 通讯信息） */
export interface BasicInfoResponse {
  personalInfo: Record<string, unknown>
  idInfo: Record<string, unknown>
  contactInfo: Record<string, unknown>
}

/** 获取员工基础信息 */
export function fetchBasicInfo(employeeId: number) {
  return request.get<unknown, BasicInfoResponse>(`/employees/${employeeId}/basic-info`)
}

/** 保存个人信息 */
export function savePersonalInfo(employeeId: number, data: Record<string, unknown>) {
  return request.put<unknown, void>(`/employees/${employeeId}/basic-info/personal`, data)
}

/** 保存证件信息 */
export function saveIdInfo(employeeId: number, data: Record<string, unknown>) {
  return request.put<unknown, void>(`/employees/${employeeId}/basic-info/id-info`, data)
}

/** 保存通讯信息 */
export function saveContactInfo(employeeId: number, data: Record<string, unknown>) {
  return request.put<unknown, void>(`/employees/${employeeId}/basic-info/contact`, data)
}

// ── 紧急联系人 ──

/** 紧急联系人 */
export interface EmergencyContactItem {
  id: number
  userId: number
  name: string
  phone: string
  relation: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 紧急联系人请求 */
export interface EmergencyContactPayload {
  name: string
  phone: string
  relation: string
}

/** 获取紧急联系人列表 */
export function fetchEmergencyContacts(employeeId: number) {
  return request.get<unknown, EmergencyContactItem[]>(`/employees/${employeeId}/emergency-contacts`)
}

/** 新增紧急联系人 */
export function createEmergencyContact(employeeId: number, data: EmergencyContactPayload) {
  return request.post<unknown, EmergencyContactItem>(`/employees/${employeeId}/emergency-contacts`, data)
}

/** 编辑紧急联系人 */
export function updateEmergencyContact(employeeId: number, contactId: number, data: EmergencyContactPayload) {
  return request.put<unknown, EmergencyContactItem>(`/employees/${employeeId}/emergency-contacts/${contactId}`, data)
}

/** 删除紧急联系人 */
export function deleteEmergencyContact(employeeId: number, contactId: number) {
  return request.delete<unknown, void>(`/employees/${employeeId}/emergency-contacts/${contactId}`)
}

// ── 职务记录 ──

/** 职务记录 */
export interface PositionRecordItem {
  id: number
  userId: number
  effectiveDate: string
  effectiveSeq: number
  operation: string
  reason?: string
  serviceDept?: string
  sequenceType?: string
  positionLevel?: string
  rankCode?: string
  company?: string
  employeeCategory?: string
  workSystem?: string
  positionName?: string
  directSuperior?: string
  mentor?: string
  workCountry?: string
  workCity?: string
  officeAddress?: string
  contractLocation?: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 职务记录请求 */
export interface PositionRecordPayload {
  effectiveDate: string
  operation: string
  reason?: string
  serviceDept?: string
  sequenceType?: string
  positionLevel?: string
  rankCode?: string
  company?: string
  employeeCategory?: string
  workSystem?: string
  positionName?: string
  directSuperior?: string
  mentor?: string
  workCountry?: string
  workCity?: string
  officeAddress?: string
  contractLocation?: string
}

/** 获取职务记录列表 */
export function fetchPositionRecords(employeeId: number) {
  return request.get<unknown, PositionRecordItem[]>(`/employees/${employeeId}/position-records`)
}

/** 新增职务记录 */
export function createPositionRecord(employeeId: number, data: PositionRecordPayload) {
  return request.post<unknown, PositionRecordItem>(`/employees/${employeeId}/position-records`, data)
}

/** 编辑职务记录 */
export function updatePositionRecord(employeeId: number, recordId: number, data: PositionRecordPayload) {
  return request.put<unknown, PositionRecordItem>(`/employees/${employeeId}/position-records/${recordId}`, data)
}

/** 删除职务记录 */
export function deletePositionRecord(employeeId: number, recordId: number) {
  return request.delete<unknown, void>(`/employees/${employeeId}/position-records/${recordId}`)
}
