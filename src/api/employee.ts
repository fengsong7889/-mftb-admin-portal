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
  position?: string
  jobLevel?: string
  status: number
  functionRoleIds: number[]
  createdAt?: string
}

/** 员工新增/编辑请求参数 */
export interface EmployeePayload {
  username?: string // 新增必填，编辑不可修改
  password?: string // 仅新增时使用
  name: string
  empId: string
  departmentId?: number | null
  positionId?: number | null
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
