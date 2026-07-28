import request from './request'
import type { MenuPermission } from '../pages/Permission/types'

/** 功能角色（后端返回） */
export interface RoleItem {
  id: number
  name: string
  description?: string
  status: number
  permissions: MenuPermission[]
  userCount: number
  createdAt?: string
  /** 最后更新人 */
  updatedBy?: string
  /** 最后更新时间 */
  updatedAt?: string
}

/** 角色新增/编辑请求参数 */
export interface RolePayload {
  name: string
  description?: string
  permissions?: MenuPermission[]
}

/** 查询全部角色 */
export function fetchRoles() {
  return request.get<unknown, RoleItem[]>('/roles')
}

/** 新增角色 */
export function createRole(data: RolePayload) {
  return request.post<unknown, RoleItem>('/roles', data)
}

/** 编辑角色基础信息 */
export function updateRole(id: number, data: RolePayload) {
  return request.put<unknown, RoleItem>(`/roles/${id}`, data)
}

/** 保存角色菜单权限 */
export function updateRolePermissions(id: number, permissions: MenuPermission[]) {
  return request.put<unknown, void>(`/roles/${id}/permissions`, permissions)
}

/** 启用/停用角色 */
export function updateRoleStatus(id: number, status: number) {
  return request.put<unknown, void>(`/roles/${id}/status`, null, { params: { status } })
}

/** 删除角色 */
export function deleteRole(id: number) {
  return request.delete<unknown, void>(`/roles/${id}`)
}

/** 查询绑定该角色的用户ID */
export function fetchRoleBoundUsers(id: number) {
  return request.get<unknown, number[]>(`/roles/${id}/users`)
}

/** 全量设置绑定该角色的用户 */
export function bindRoleUsers(id: number, userIds: number[]) {
  return request.put<unknown, void>(`/roles/${id}/users`, { userIds })
}
