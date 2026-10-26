/**
 * 部门模型授权策略 API
 * 对应后端 AiDeptAuthGroupController
 */
import request from './request'

/* ────────────────── 类型定义 ────────────────── */

/** 模型配置项（含能力开关） */
export interface ModelConfigItem {
  modelId: number
  visionSupport: number
  functionCalling: number
  jsonMode: number
  streaming: number
  thinkingMode: number
}

/** 策略列表项 */
export interface DeptAuthGroupItem {
  id: number
  /** 配置ID（编号生成规则 ai_dept_model_auth，如 BMMX20260906000） */
  configCode?: string
  name: string
  description?: string
  dataResidency: number
  status: number
  totalEmployeeCount: number
  updatedBy: string
  createdAt: string
  updatedAt: string
  deptIds: number[]
  deptNames: string[]
  modelIds: number[]
  modelNames: string[]
  /** 模型授權配置（含能力開關，後端可選返回） */
  modelConfigs?: ModelConfigItem[]
}

/** 部门项（详情用） */
export interface DeptItem {
  deptId: number
  deptName: string
  employeeCount: number
}

/** 策略详情 */
export interface DeptAuthGroupDetail {
  id: number
  /** 配置ID（编号生成规则 ai_dept_model_auth） */
  configCode?: string
  name: string
  description?: string
  dataResidency: number
  status: number
  totalEmployeeCount: number
  updatedBy: string
  createdAt: string
  updatedAt: string
  departments: DeptItem[]
  modelConfigs: ModelConfigItem[]
}

/** 策略新增/编辑请求 */
export interface GroupSaveRequest {
  name: string
  description?: string
  dataResidency?: number
  status?: number
  deptIds: number[]
  modelConfigs: ModelConfigItem[]
  updatedBy?: string
}

/** 部门选项（树状选择组件用） */
export interface DeptOption {
  deptId: number
  deptName: string
  /** 部门编码（用于展示与搜索） */
  deptCode?: string
  /** 父部门 ID（用于构建树，根节点为 0 或 null） */
  parentId?: number | null
  employeeCount: number
}

/** 查询参数 */
export interface GroupQueryParams {
  name?: string
  dataResidency?: number
}

/* ────────────────── API 函数 ────────────────── */

/** 查询策略列表 */
export function fetchDeptAuthGroups(params?: GroupQueryParams): Promise<DeptAuthGroupItem[]> {
  return request.get('/ai/auth/dept-groups', { params })
}

/** 获取策略详情 */
export function getDeptAuthGroupById(id: number): Promise<DeptAuthGroupDetail> {
  return request.get(`/ai/auth/dept-groups/${id}`)
}

/** 新增策略 */
export function createDeptAuthGroup(data: GroupSaveRequest): Promise<boolean> {
  return request.post('/ai/auth/dept-groups', data)
}

/** 编辑策略 */
export function updateDeptAuthGroup(id: number, data: GroupSaveRequest): Promise<boolean> {
  return request.put(`/ai/auth/dept-groups/${id}`, data)
}

/** 启停策略 */
export function toggleDeptAuthGroupStatus(id: number, status: number): Promise<boolean> {
  return request.put(`/ai/auth/dept-groups/${id}/status`, null, { params: { status } })
}

/** 删除策略 */
export function deleteDeptAuthGroup(id: number): Promise<boolean> {
  return request.delete(`/ai/auth/dept-groups/${id}`)
}

/** 获取部门选项列表 */
export function fetchDeptOptions(): Promise<DeptOption[]> {
  return request.get('/ai/auth/dept-groups/dept-options')
}
