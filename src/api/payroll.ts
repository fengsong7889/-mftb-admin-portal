/**
 * 薪酬福利系统接口层（payroll）。
 *
 * 为什么独立文件：薪酬是独立责任域，接口前缀 /api/hcm/v1/payroll/** 与组织编制、人事主档分开；
 * 混在一个 api 文件里会让「谁能看工资」的边界在代码层也变模糊。
 */
import request from './request'
import type { PageResult } from './employee'

/** 薪酬项目 */
export interface PayrollComponent {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  componentType: string
  taxable?: number
  currency?: string | null
  status?: number
  sortOrder?: number
  remark?: string | null
  updatedBy?: string | null
}

/** 薪酬标准（定调薪，日期生效） */
export interface PayrollSalaryStandard {
  id?: number
  employmentId: number
  baseAmount: string | number
  currency: string
  changeType?: string
  effectiveFrom: string
  effectiveTo?: string | null
  seqNo?: number
  reason?: string | null
  updatedBy?: string | null
}

export const COMPONENT_TYPE_OPTIONS = [
  { value: 'EARNING', label: '應發' },
  { value: 'DEDUCTION', label: '扣除' },
  { value: 'EMPLOYER_COST', label: '雇主成本' },
] as const

export const CHANGE_TYPE_OPTIONS = [
  { value: 'HIRE', label: '入職定薪' },
  { value: 'ADJUST', label: '調薪' },
  { value: 'PROMOTION', label: '晉升調薪' },
  { value: 'ANNUAL', label: '年度調薪' },
] as const

export const PAYROLL_CURRENCIES = [
  { value: 'CNY', label: 'CNY 人民幣' },
  { value: 'HKD', label: 'HKD 港幣' },
  { value: 'MOP', label: 'MOP 澳門幣' },
] as const

export function listComponents(params: {
  page: number
  size: number
  keyword?: string
  componentType?: string
  status?: number
}) {
  return request.get<unknown, PageResult<PayrollComponent>>('/hcm/v1/payroll/components', { params })
}

export function getComponent(id: number) {
  return request.get<unknown, PayrollComponent>(`/hcm/v1/payroll/components/${id}`)
}

export function createComponent(data: PayrollComponent) {
  return request.post<unknown, PayrollComponent>('/hcm/v1/payroll/components', data)
}

export function updateComponent(id: number, data: PayrollComponent) {
  return request.put<unknown, PayrollComponent>(`/hcm/v1/payroll/components/${id}`, data)
}

export function deleteComponent(id: number) {
  return request.delete(`/hcm/v1/payroll/components/${id}`)
}

export function listStandards(params: {
  employmentId?: number
  asOf?: string
  page: number
  size: number
}) {
  return request.get<unknown, PageResult<PayrollSalaryStandard>>('/hcm/v1/payroll/standards', { params })
}

export function getStandard(id: number) {
  return request.get<unknown, PayrollSalaryStandard>(`/hcm/v1/payroll/standards/${id}`)
}

export function createStandard(data: PayrollSalaryStandard) {
  return request.post<unknown, PayrollSalaryStandard>('/hcm/v1/payroll/standards', data)
}

export function updateStandard(id: number, data: PayrollSalaryStandard) {
  return request.put<unknown, PayrollSalaryStandard>(`/hcm/v1/payroll/standards/${id}`, data)
}

export function deleteStandard(id: number) {
  return request.delete(`/hcm/v1/payroll/standards/${id}`)
}

/* ==================== 福利參保（D2 第三批） ==================== */

/** 參保方案 */
export interface PayrollBenefitPlan {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  planType: string
  jurisdiction: string
  employerRatio: string | number
  employeeRatio: string | number
  minBase?: string | number | null
  maxBase?: string | number | null
  currency: string
  effectiveFrom: string
  effectiveTo?: string | null
  status?: number
  remark?: string | null
  updatedBy?: string | null
}

/** 人員參保 */
export interface PayrollEnrollment {
  id?: number
  employmentId: number
  planId: number
  baseAmount: string | number
  employeeAmount?: string | number | null
  employerAmount?: string | number | null
  currency?: string | null
  effectiveFrom: string
  effectiveTo?: string | null
  seqNo?: number
  stopReason?: string | null
  updatedBy?: string | null
  /* 以下为列表展示字段（后端 VO 批量补出，只读，不参与鉴权） */
  personName?: string | null
  personNo?: string | null
  employmentNo?: string | null
  planName?: string | null
  planType?: string | null
}

export const PLAN_TYPE_OPTIONS = [
  { value: 'SOCIAL_INSURANCE', label: '社會保險' },
  { value: 'HOUSING_FUND', label: '住房公積金' },
  { value: 'MEDICAL', label: '補充醫療' },
  { value: 'GROUP_LIFE', label: '團體壽險' },
  { value: 'OTHER', label: '其他' },
] as const

export const JURISDICTION_OPTIONS = [
  { value: 'CN', label: 'CN 中國內地' },
  { value: 'HK', label: 'HK 香港' },
  { value: 'MO', label: 'MO 澳門' },
] as const

export function listBenefitPlans(params: {
  page: number
  size: number
  keyword?: string
  planType?: string
  jurisdiction?: string
  status?: number
}) {
  return request.get<unknown, PageResult<PayrollBenefitPlan>>('/hcm/v1/payroll/plans', { params })
}

export function getBenefitPlan(id: number) {
  return request.get<unknown, PayrollBenefitPlan>(`/hcm/v1/payroll/plans/${id}`)
}

export function createBenefitPlan(data: PayrollBenefitPlan) {
  return request.post<unknown, PayrollBenefitPlan>('/hcm/v1/payroll/plans', data)
}

export function updateBenefitPlan(id: number, data: PayrollBenefitPlan) {
  return request.put<unknown, PayrollBenefitPlan>(`/hcm/v1/payroll/plans/${id}`, data)
}

export function deleteBenefitPlan(id: number) {
  return request.delete(`/hcm/v1/payroll/plans/${id}`)
}

export function listEnrollments(params: {
  page: number
  size: number
  employmentId?: number
  planId?: number
  asOf?: string
  activeOnly?: boolean
}) {
  return request.get<unknown, PageResult<PayrollEnrollment>>('/hcm/v1/payroll/enrollments', { params })
}

export function getEnrollment(id: number) {
  return request.get<unknown, PayrollEnrollment>(`/hcm/v1/payroll/enrollments/${id}`)
}

export function createEnrollment(data: PayrollEnrollment) {
  return request.post<unknown, PayrollEnrollment>('/hcm/v1/payroll/enrollments', data)
}

export function updateEnrollment(id: number, data: PayrollEnrollment) {
  return request.put<unknown, PayrollEnrollment>(`/hcm/v1/payroll/enrollments/${id}`, data)
}

export function deleteEnrollment(id: number) {
  return request.delete(`/hcm/v1/payroll/enrollments/${id}`)
}
