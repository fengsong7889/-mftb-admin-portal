import request from './request'

/** 数据授权记录（后端 VO） */
export interface DataAuthorizationItem {
  id: number
  targetType: string       // 'role' | 'department'
  targetId: number
  targetName?: string      // 角色/部门名称（后端填充）
  groupCode: string        // 商家集团编码
  groupName?: string       // 商家集团名称（后端填充）
  status: number           // 1=启用 0=停用
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 数据授权新增/编辑请求 */
export interface DataAuthorizationPayload {
  targetType: string
  targetId: number
  groupCode: string
  status?: number
}

/** 查询参数 */
export interface DataAuthorizationQueryParams {
  targetType?: string
  targetId?: number
}

/** 查询数据授权列表 */
export function fetchDataAuthorizations(params?: DataAuthorizationQueryParams) {
  return request.get<unknown, DataAuthorizationItem[]>('/data-authorizations', { params })
}

/** 新增数据授权 */
export function createDataAuthorization(data: DataAuthorizationPayload) {
  return request.post<unknown, DataAuthorizationItem>('/data-authorizations', data)
}

/** 编辑数据授权 */
export function updateDataAuthorization(id: number, data: DataAuthorizationPayload) {
  return request.put<unknown, DataAuthorizationItem>(`/data-authorizations/${id}`, data)
}

/** 删除数据授权 */
export function deleteDataAuthorization(id: number) {
  return request.delete<unknown, void>(`/data-authorizations/${id}`)
}

/** 批量新增数据授权 */
export function batchCreateAuthorizations(data: { targetType: string; targetId: number; groupCodes: string[] }) {
  return request.post<unknown, DataAuthorizationItem[]>('/data-authorizations/batch', data)
}

/** 批量删除数据授权 */
export function batchDeleteAuthorizations(ids: number[]) {
  return request.delete<unknown, void>('/data-authorizations/batch', { data: { ids } })
}

/** 诊断：检查数据授权相关表与字段是否就绪 */
export function diagnoseDataAuth() {
  return request.get<unknown, Record<string, unknown>[]>('/data-authorizations/diagnose')
}

/* ==================== 数据权限页面专用下拉选项 ==================== */

/** 角色下拉选项（仅启用状态） */
export interface DataAuthRoleOption {
  id: number
  name: string
  userCount: number
}

/** 部门下拉选项（全量，前端构建树） */
export interface DataAuthDeptOption {
  id: number
  name: string
  nameEn?: string
  parentId?: number | null
  status: number
  userCount: number
}

/** 商家集团下拉选项 */
export interface DataAuthGroupOption {
  groupCode: string
  groupName: string
}

/** 角色下拉选项（仅启用状态，数据权限页面专用） */
export function fetchDataAuthRoleOptions() {
  return request.get<unknown, DataAuthRoleOption[]>('/data-authorizations/role-options')
}

/** 部门下拉选项（数据权限页面专用） */
export function fetchDataAuthDepartmentOptions() {
  return request.get<unknown, DataAuthDeptOption[]>('/data-authorizations/department-options')
}

/** 商家集团下拉选项（数据权限页面专用） */
export function fetchDataAuthMerchantGroupOptions() {
  return request.get<unknown, DataAuthGroupOption[]>('/data-authorizations/merchant-group-options')
}
