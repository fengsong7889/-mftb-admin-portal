import request from './request'
import type { OptionItem } from './types'

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
  /** 任职公司（新增时自动写入初始「入职」职务记录） */
  company?: string | null
  role?: string
  functionRoleIds?: number[]
}

/** 分页查询参数 */
export interface EmployeeQuery {
  page: number
  size: number
  keyword?: string
  employmentStatus?: string
  /** 部门ID（后端含子孙部门） */
  departmentId?: number | null
  sequence?: string
  jobLevel?: string
  rank?: string
  /** 功能角色ID */
  roleId?: number | null
  updatedBy?: string
  /** 最后更新时间范围（yyyy-MM-dd） */
  updatedAtFrom?: string
  updatedAtTo?: string
}

/** 分页结果 */
export interface PageResult<T> {
  records: T[]
  total: number
}

/** 分页查询员工 */
export async function fetchEmployees(params: EmployeeQuery) {
  return request.get<unknown, PageResult<EmployeeItem>>('/employees', { params })
}

/** 按 ID 查询单个员工详情（含派生在职状态） */
export function fetchEmployee(id: number) {
  return request.get<unknown, EmployeeItem>(`/employees/${id}`)
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

/** 基础信息响应（个人信息 + 证件信息 + 通讯信息 + 账号信息） */
export interface BasicInfoResponse {
  personalInfo: Record<string, unknown>
  idInfo: Record<string, unknown>
  contactInfo: Record<string, unknown>
  /** 账号信息（钉钉用户ID等三方通讯/邮箱账号绑定，后续可扩展企微ID、QQ邮箱等） */
  accountInfo?: Record<string, unknown>
}

/** 获取员工基础信息 */
export function fetchBasicInfo(employeeId: number) {
  return request.get<unknown, BasicInfoResponse>(`/employees/${employeeId}/basic-info`)
}

/** 明文查看证件号/住址（P1-D 受控：需 employee-management:edit，服务端留痕） */
export function fetchBasicInfoSensitive(employeeId: number) {
  return request.get<unknown, BasicInfoResponse>(`/employees/${employeeId}/basic-info/sensitive`)
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

/** 保存账号信息（钉钉用户ID等三方通讯/邮箱账号绑定） */
export function saveAccountInfo(employeeId: number, data: Record<string, unknown>) {
  return request.put<unknown, void>(`/employees/${employeeId}/basic-info/account`, data)
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

// ── 费用信息 ──

/** 费用信息-收入项 */
export interface SalaryIncomeItem {
  id: number
  userId?: number
  name: string
  amount: number
  type: 'fixed' | 'variable'
  remark?: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 费用信息-收入项请求 */
export interface SalaryIncomePayload {
  name: string
  amount: number
  type: 'fixed' | 'variable'
  remark?: string
}

/** 费用信息-扣除项 */
export interface SalaryDeductionItem {
  id: number
  userId?: number
  name: string
  rate: number
  amount: number
  remark?: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 费用信息-扣除项请求 */
export interface SalaryDeductionPayload {
  name: string
  rate: number
  amount: number
  remark?: string
}

/** 费用信息-薪资配置 */
export interface SalaryConfigItem {
  id?: number
  userId?: number
  salaryStructure?: string
  paymentMethod?: string
  payDay?: number | null
  bankName?: string
  bankAccount?: string
  taxCity?: string
  updatedBy?: string
  updatedAt?: string
}

/** 费用信息-薪资配置请求 */
export interface SalaryConfigPayload {
  salaryStructure: string
  paymentMethod: string
  payDay: number
  bankName?: string
  bankAccount?: string
  taxCity?: string
}

/** 获取费用信息-收入项列表 */
export function fetchSalaryIncomes(employeeId: number) {
  return request.get<unknown, SalaryIncomeItem[]>(`/employees/${employeeId}/salary/incomes`)
}

/** 新增费用信息-收入项 */
export function createSalaryIncome(employeeId: number, data: SalaryIncomePayload) {
  return request.post<unknown, SalaryIncomeItem>(`/employees/${employeeId}/salary/incomes`, data)
}

/** 编辑费用信息-收入项 */
export function updateSalaryIncome(employeeId: number, incomeId: number, data: SalaryIncomePayload) {
  return request.put<unknown, SalaryIncomeItem>(`/employees/${employeeId}/salary/incomes/${incomeId}`, data)
}

/** 删除费用信息-收入项 */
export function deleteSalaryIncome(employeeId: number, incomeId: number) {
  return request.delete<unknown, void>(`/employees/${employeeId}/salary/incomes/${incomeId}`)
}

/** 获取费用信息-扣除项列表 */
export function fetchSalaryDeductions(employeeId: number) {
  return request.get<unknown, SalaryDeductionItem[]>(`/employees/${employeeId}/salary/deductions`)
}

/** 新增费用信息-扣除项 */
export function createSalaryDeduction(employeeId: number, data: SalaryDeductionPayload) {
  return request.post<unknown, SalaryDeductionItem>(`/employees/${employeeId}/salary/deductions`, data)
}

/** 编辑费用信息-扣除项 */
export function updateSalaryDeduction(employeeId: number, deductionId: number, data: SalaryDeductionPayload) {
  return request.put<unknown, SalaryDeductionItem>(`/employees/${employeeId}/salary/deductions/${deductionId}`, data)
}

/** 删除费用信息-扣除项 */
export function deleteSalaryDeduction(employeeId: number, deductionId: number) {
  return request.delete<unknown, void>(`/employees/${employeeId}/salary/deductions/${deductionId}`)
}

/** 获取费用信息-薪资配置 */
export function fetchSalaryConfig(employeeId: number) {
  return request.get<unknown, SalaryConfigItem>(`/employees/${employeeId}/salary/config`)
}

/** 保存费用信息-薪资配置（存在则更新，不存在则新建） */
export function saveSalaryConfig(employeeId: number, data: SalaryConfigPayload) {
  return request.put<unknown, SalaryConfigItem>(`/employees/${employeeId}/salary/config`, data)
}

// ── 合同台账 (P1-B) ──

/** 合同记录（后端返回） */
export interface ContractItem {
  id: number
  userId?: number
  contractNo: string
  contractType?: string
  company?: string
  startDate?: string
  endDate?: string
  signDate?: string
  status?: string
  remark?: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 合同新增/编辑请求 */
export interface ContractPayload {
  contractNo: string
  contractType?: string
  company?: string
  startDate?: string
  endDate?: string
  signDate?: string
  status?: string
  remark?: string
}

/** 获取员工合同列表 */
export function fetchContracts(employeeId: number) {
  return request.get<unknown, ContractItem[]>(`/employees/${employeeId}/contracts`)
}

/** 新增合同 */
export function createContract(employeeId: number, data: ContractPayload) {
  return request.post<unknown, ContractItem>(`/employees/${employeeId}/contracts`, data)
}

/** 编辑合同 */
export function updateContract(employeeId: number, contractId: number, data: ContractPayload) {
  return request.put<unknown, ContractItem>(`/employees/${employeeId}/contracts/${contractId}`, data)
}

/** 删除合同 */
export function deleteContract(employeeId: number, contractId: number) {
  return request.delete<unknown, void>(`/employees/${employeeId}/contracts/${contractId}`)
}

/** 合同全局台账行（P1-B） */
export interface ContractLedgerItem {
  id: number
  userId: number
  empId?: string
  employeeName?: string
  department?: string
  contractNo: string
  contractType?: string
  company?: string
  startDate?: string
  endDate?: string
  signDate?: string
  status?: string
  remark?: string
  updatedBy?: string
  updatedAt?: string
}

/** 合同台账分页查询参数 */
export interface ContractLedgerQuery {
  page: number
  size: number
  keyword?: string
  company?: string
  contractType?: string
  status?: string
  /** 到期分桶（P0 合同到期预警）：all/expired/due30/due60/due90 */
  expiryBucket?: string
}

/** 合同全局台账分页查询 */
export function fetchContractLedger(params: ContractLedgerQuery) {
  return request.get<unknown, PageResult<ContractLedgerItem>>('/contracts', { params })
}

/** 合同到期预警汇总（后端 /contracts/expiry-summary） */
export interface ContractExpirySummary {
  days: number
  /** 合同总数（「全部」页签计数，不受状态/分桶过滤影响） */
  total: number
  /** 已过期未处理 */
  expired: number
  /** 30 天内到期（含 0 天） */
  due30: number
  /** 60 天内到期 */
  due60: number
  /** 90 天内到期 */
  due90: number
  /** 无固定期限（未填结束日期） */
  noEndDate: number
  /** 最近到期明细（最多 20 条，按到期日升序） */
  soonest: ContractLedgerItem[]
}

/** 查询合同到期预警汇总 */
export function fetchContractExpirySummary(days = 90) {
  return request.get<unknown, ContractExpirySummary>('/contracts/expiry-summary', { params: { days } })
}

/** 到期分桶选项（与后端 applyExpiryBucket 常量一致） */
export const CONTRACT_EXPIRY_BUCKET = {
  ALL: 'all',
  EXPIRED: 'expired',
  DUE_30: 'due30',
  DUE_60: 'due60',
  DUE_90: 'due90',
} as const

export type ContractExpiryBucket = (typeof CONTRACT_EXPIRY_BUCKET)[keyof typeof CONTRACT_EXPIRY_BUCKET]
