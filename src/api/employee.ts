import request from './request'

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
  status?: number
}

/** 分页结果 */
export interface PageResult<T> {
  records: T[]
  total: number
}

/** 分页查询员工 */
export function fetchEmployees(params: EmployeeQuery) {
  return request.get<unknown, PageResult<EmployeeItem>>('/employees', { params })
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
