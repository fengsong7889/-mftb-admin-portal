import request from './request'
import type { MenuPermission } from '@mftb/contracts/menuPermission'
import type { DataScope } from '@/constants/dataScope'

/** 功能角色（后端返回） */
export interface RoleItem {
  id: number
  name: string
  /** 角色编码（用于审批人解析匹配 sys_user.function_roles） */
  code?: string
  description?: string
  /**
   * 是否开放员工自助申请：1=出现在门户「系統權限申請」的参考角色目录，0=不开放。
   * 它不授予任何权限，只决定角色在自助目录里是否可见；内置 admin 角色后端强制为 0。
   */
  selfServiceRequestable?: number
  status: number
  permissions: MenuPermission[]
  /** 数据范围档位 */
  dataScope?: DataScope
  /** 自定部门 id（仅 dataScope=CUSTOM_DEPT 时有值） */
  deptIds?: number[]
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
  /** 不传表示本次不修改该开关（后端 null-skip）；传 0/1 才会真的改 */
  selfServiceRequestable?: number
  permissions?: MenuPermission[]
  dataScope?: DataScope
  deptIds?: number[]
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
