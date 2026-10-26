/**
 * 员工模型权控 API（职位授权策略 + 自定义角色授权）
 * 对应后端 AiEmpAuthController（/api/ai/emp-auth）
 * 类型与 empAuth/modelAuthCapability 的 PosAuthRule / RoleAuthConfig 同构，
 * id / roleId 均以字符串传递（角色授权按 roleCode 定位）。
 */
import request from './request'

/** 模型能力配置项 */
export interface ModelConfigItem {
  modelId: number
  visionSupport: number
  functionCalling: number
  jsonMode: number
  streaming: number
  thinkingMode: number
}

/** 职位授权策略（与前端 PosAuthRule 同构） */
export interface PosStrategyItem {
  id: string
  /** 配置ID（编号生成规则 ai_emp_pos_model_auth，如 ZWMX20260906000） */
  configCode?: string
  ruleName: string
  sequence: string[]
  jobLevels: string[]
  modelConfigs: ModelConfigItem[]
  dataResidency: number
  description?: string
  status: number
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 职位策略保存请求 */
export interface PosStrategySaveRequest {
  strategyName: string
  sequences: string[]
  jobLevels: string[]
  modelConfigs: ModelConfigItem[]
  dataResidency: number
  description?: string
  status: number
}

/** 自定义角色授权（与前端 RoleAuthConfig 同构） */
export interface RoleAuthItem {
  roleId: string
  /** 配置ID（编号生成规则 ai_emp_role_model_auth，如 JSMX20260906000） */
  configCode?: string
  roleName: string
  description?: string
  modelConfigs: ModelConfigItem[]
  userIds: number[]
  dataResidency: number
  status: number
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 角色授权保存请求（roleCode 选填，为空时后端生成） */
export interface RoleAuthSaveRequest {
  roleCode?: string
  roleName: string
  description?: string
  userIds: number[]
  modelConfigs: ModelConfigItem[]
  dataResidency: number
  status: number
}

/* ────────────────── 职位授权策略 ────────────────── */

/** 查询职位授权策略列表 */
export function fetchPosStrategies(params?: { name?: string }): Promise<PosStrategyItem[]> {
  return request.get('/ai/emp-auth/pos-strategies', { params })
}

/** 获取职位授权策略详情 */
export function getPosStrategyById(id: string): Promise<PosStrategyItem> {
  return request.get(`/ai/emp-auth/pos-strategies/${id}`)
}

/** 新增职位授权策略 */
export function createPosStrategy(data: PosStrategySaveRequest): Promise<number> {
  return request.post('/ai/emp-auth/pos-strategies', data)
}

/** 编辑职位授权策略 */
export function updatePosStrategy(id: string, data: PosStrategySaveRequest): Promise<boolean> {
  return request.put(`/ai/emp-auth/pos-strategies/${id}`, data)
}

/** 启停职位授权策略 */
export function togglePosStrategyStatus(id: string, status: number): Promise<boolean> {
  return request.put(`/ai/emp-auth/pos-strategies/${id}/status`, null, { params: { status } })
}

/** 删除职位授权策略 */
export function deletePosStrategy(id: string): Promise<boolean> {
  return request.delete(`/ai/emp-auth/pos-strategies/${id}`)
}

/* ────────────────── 自定义角色授权 ────────────────── */

/** 查询角色授权列表 */
export function fetchRoleAuths(params?: { name?: string }): Promise<RoleAuthItem[]> {
  return request.get('/ai/emp-auth/role-auths', { params })
}

/** 按角色编码获取角色授权详情 */
export function getRoleAuthByCode(roleCode: string): Promise<RoleAuthItem> {
  return request.get(`/ai/emp-auth/role-auths/by-code/${roleCode}`)
}

/** 新增角色授权（返回角色编码） */
export function createRoleAuth(data: RoleAuthSaveRequest): Promise<string> {
  return request.post('/ai/emp-auth/role-auths', data)
}

/** 编辑角色授权 */
export function updateRoleAuth(roleCode: string, data: RoleAuthSaveRequest): Promise<boolean> {
  return request.put(`/ai/emp-auth/role-auths/by-code/${roleCode}`, data)
}

/** 启停角色授权 */
export function toggleRoleAuthStatus(roleCode: string, status: number): Promise<boolean> {
  return request.put(`/ai/emp-auth/role-auths/by-code/${roleCode}/status`, null, { params: { status } })
}

/** 删除角色授权 */
export function deleteRoleAuth(roleCode: string): Promise<boolean> {
  return request.delete(`/ai/emp-auth/role-auths/by-code/${roleCode}`)
}
