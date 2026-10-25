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
