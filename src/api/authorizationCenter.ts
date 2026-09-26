/**
 * 授权中心扩展 API（权限中心重构）。
 *
 * 后端接口：
 *  - GET  /api/authorization/trace/{userId}   员工权限透视（最终并集 + 来源）
 *  - GET  /api/authorization/audit            授权变更审计分页查询
 *  - GET  /api/authorization/audit/recent     指定目标最近变更
 *  - GET  /api/roles/{id}/authorization-overview / departments 同名端点
 *      单目标 × 全部启用系统的授权快照（工作台一次性载入 + 角色复制预填）
 *  - POST /api/roles/{id}/copy                复制角色（克隆菜单授权 + 系统准入）
 */
import request from './request'
import type { MenuPermission } from '../pages/Permission/types'
import type { SystemAuthorization } from './systemAuthorization'

/** 授权总览：单目标在全部启用系统的快照 */
export function fetchRoleOverview(roleId: number) {
  return request.get<unknown, SystemAuthorization[]>(`/roles/${roleId}/authorization-overview`)
}

/** 部门授权总览 */
export function fetchDepartmentOverview(deptId: number) {
  return request.get<unknown, SystemAuthorization[]>(`/departments/${deptId}/authorization-overview`)
}

/** 复制角色摘要 */
export interface TraceRole {
  id: number
  name: string
  code?: string
  /** 1=启用 0=停用（停用角色的授权不参与并集） */
  status: number
}

/** 系统准入条目（含来源） */
export interface TraceSystem {
  code: string
  name: string
  /** 来源，如 "角色:财务专员" / "部门:财务部" */
  sources: string[]
}

/** 菜单动作条目（含来源） */
export interface TraceMenu {
  menuKey: string
  menuName: string
  menuNameEn?: string | null
  systemCode?: string | null
  sort?: number | null
  actions: string[]
  sources: string[]
}

/** 员工权限透视响应 */
export interface EmpPermissionTrace {
  userId: number
  username: string
  name: string
  /** 内置超管直通（true 时明细为空，前端展示超管提示） */
  superAdmin: boolean
  departmentName?: string | null
  roles: TraceRole[]
  systems: TraceSystem[]
  menus: TraceMenu[]
}

/** 透视指定员工的最终权限与来源 */
export function fetchPermissionTrace(userId: number) {
  return request.get<unknown, EmpPermissionTrace>(`/authorization/trace/${userId}`)
}

/** 审计变更类型（与后端 PermissionAuditService.CHANGE_* 对齐） */
export const AUDIT_CHANGE_TYPES = {
  GRANT: 'GRANT',
  REVOKE: 'REVOKE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  COPY: 'COPY',
  BIND: 'BIND',
  STATUS: 'STATUS',
} as const

export type AuditChangeType = typeof AUDIT_CHANGE_TYPES[keyof typeof AUDIT_CHANGE_TYPES]

/** 审计日志条目（快照为 JSON 字符串原文，前端解析展示） */
export interface PermissionAuditItem {
  id: number
  targetType: string
  targetId: number
  targetName?: string | null
  systemCode?: string | null
  changeType: string
  beforeSnapshot?: string | null
  afterSnapshot?: string | null
  operator?: string | null
  /** epoch 毫秒（全局 Jackson 时间约定） */
  createdAt?: number | null
}

/** 审计分页查询参数 */
export interface PermissionAuditQuery {
  targetType?: string
  targetId?: number
  changeType?: string
  operator?: string
  /** epoch 毫秒 */
  start?: number
  /** epoch 毫秒 */
  end?: number
  page: number
  pageSize: number
}

/** 审计分页响应（对齐后端 PageResult） */
export interface PermissionAuditPage {
  records: PermissionAuditItem[]
  total: number
}

/** 分页查询授权变更审计 */
export function fetchPermissionAudit(params: PermissionAuditQuery) {
  return request.get<unknown, PermissionAuditPage>('/authorization/audit', { params })
}

/** 指定目标的最近审计记录 */
export function fetchRecentAudit(targetType: string, targetId: number, limit = 10) {
  return request.get<unknown, PermissionAuditItem[]>('/authorization/audit/recent', {
    params: { targetType, targetId, limit },
  })
}

/** 复制角色请求（新名称 + 可选描述） */
export interface CopyRolePayload {
  name: string
  description?: string
}

/** 复制角色响应（对齐后端 RoleVO 精简字段） */
export interface CopyRoleResult {
  id: number
  name: string
  code?: string
  permissions: MenuPermission[]
  userCount: number
}

/** 复制角色：克隆菜单授权与系统准入 */
export function copyRole(roleId: number, payload: CopyRolePayload) {
  return request.post<unknown, CopyRoleResult>(`/roles/${roleId}/copy`, payload)
}
