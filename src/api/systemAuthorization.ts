/**
 * 系统授权读写 API（Round 4 · 权限中心 UI）。
 *
 * 后端接口位于 {@code SystemAuthorizationController}：以「目标（角色/部门）× 系统」为最小
 * 原子保存单位，不影响其他系统的既有授权；与旧的 {@code /roles/{id}/permissions} 全量写接口共存。
 */
import request from './request'
import type { MenuPermission } from '../pages/Permission/types'

/** 系统目录项（对齐 PortalSystemVO；用于 UI Tab 数据源） */
export interface SystemCatalogItem {
  code: string
  name: string
  nameEn?: string | null
  description?: string | null
  icon?: string | null
  sort?: number | null
}

/** 单目标 × 单系统的授权快照 */
export interface SystemAuthorization {
  /** 'role' | 'department' */
  targetType: string
  targetId: number
  systemCode: string
  /** 目标是否拥有该系统准入 */
  systemAccess: boolean
  /** 该系统内的菜单授权（读侧 actions 空视为 view；写侧 actions 空 = 未授权） */
  permissions: MenuPermission[]
  /** 全局权限版本号；写请求带上以做乐观锁 */
  revision: number
}

/** 单目标 × 单系统的授权写入请求 */
export interface SystemAuthorizationPayload {
  systemAccess: boolean
  permissions: MenuPermission[]
  /** 建议始终传读取时的 revision；后端不匹配 → 1006 CONFLICT */
  expectedRevision?: number
}

/** 目标类型：与后端 SystemAuthorizationService.TARGET_* 常量对齐 */
export type AuthorizationTargetType = 'role' | 'department'

/** 启用系统目录（权限中心可见所有系统；不受当前用户系统准入限制） */
export function fetchSystemsCatalog() {
  return request.get<unknown, SystemCatalogItem[]>('/systems')
}

/** 读取目标在指定系统的授权快照 */
export function readRoleAuthorization(roleId: number, systemCode: string) {
  return request.get<unknown, SystemAuthorization>(`/roles/${roleId}/systems/${systemCode}/authorization`)
}

/** 保存角色在指定系统的授权（原子写） */
export function saveRoleAuthorization(roleId: number, systemCode: string, payload: SystemAuthorizationPayload) {
  return request.put<unknown, SystemAuthorization>(
    `/roles/${roleId}/systems/${systemCode}/authorization`,
    payload,
  )
}

/** 读取部门在指定系统的授权快照 */
export function readDepartmentAuthorization(deptId: number, systemCode: string) {
  return request.get<unknown, SystemAuthorization>(`/departments/${deptId}/systems/${systemCode}/authorization`)
}

/** 保存部门在指定系统的授权（原子写） */
export function saveDepartmentAuthorization(deptId: number, systemCode: string, payload: SystemAuthorizationPayload) {
  return request.put<unknown, SystemAuthorization>(
    `/departments/${deptId}/systems/${systemCode}/authorization`,
    payload,
  )
}
