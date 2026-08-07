import request from './request'
import type { MenuPermission } from '../pages/Permission/types'

/** 部门状态枚举 */
export const DEPT_STATUS = {
  ENABLED: 1,
  DISABLED: 0,
} as const

/** 部门信息（后端返回，平铺结构） */
export interface DepartmentItem {
  id: number
  code: string
  name: string
  nameEn?: string
  parentId?: number | null
  parentName?: string
  leader?: string
  status: number
  sort?: number
  permissions: MenuPermission[]
  userCount: number
  createdAt?: string
  /** 最后更新人 */
  updatedBy?: string
  /** 最后更新时间 */
  updatedAt?: string
}

/** 部门新增/编辑请求参数 */
export interface DepartmentPayload {
  name: string
  nameEn?: string
  parentId?: number | null
  leader?: string
  sort?: number
}

/** 查询全部部门 */
export function fetchDepartments() {
  return request.get<unknown, DepartmentItem[]>('/departments')
}

/** 新增部门 */
export function createDepartment(data: DepartmentPayload) {
  return request.post<unknown, DepartmentItem>('/departments', data)
}

/** 编辑部门 */
export function updateDepartment(id: number, data: DepartmentPayload) {
  return request.put<unknown, DepartmentItem>(`/departments/${id}`, data)
}

/** 启用/停用部门 */
export function updateDepartmentStatus(id: number, status: number) {
  return request.put<unknown, void>(`/departments/${id}/status`, null, { params: { status } })
}

/** 保存部门菜单权限（部门授权） */
export function updateDepartmentPermissions(id: number, permissions: MenuPermission[]) {
  return request.put<unknown, void>(`/departments/${id}/permissions`, permissions)
}

/** 删除部门 */
export function deleteDepartment(id: number) {
  return request.delete<unknown, void>(`/departments/${id}`)
}
