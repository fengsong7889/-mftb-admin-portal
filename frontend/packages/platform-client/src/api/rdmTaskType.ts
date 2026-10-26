import request from './request'

/**
 * RDM 任务类型字典 API（业务可配置）。
 * <p>启用项下拉为任务表单/甘特图/图例共享只读；管理端点锚定 rdm-task-type-config 菜单。
 * 不提供删除：code 永续（仅停用），保护 rdm_work_task.task_type 历史引用。
 */

/** 聚合桶：design/qa/dev（默认 dev=研发） */
export const RDM_TASK_TYPE_CATEGORY = {
  DESIGN: 'design',
  QA: 'qa',
  DEV: 'dev',
} as const

export type RdmTaskTypeCategory = (typeof RDM_TASK_TYPE_CATEGORY)[keyof typeof RDM_TASK_TYPE_CATEGORY]

/** 任务类型字典项 */
export interface RdmTaskTypeOption {
  id: number
  code: string
  label: string
  color: string
  category: RdmTaskTypeCategory | string
  enabled: number
  sortOrder?: number
  remark?: string | null
  updatedBy?: string | null
}

/** 启用项下拉（表单/甘特图/图例共享只读） */
export function fetchTaskTypeOptions() {
  return request.get<unknown, RdmTaskTypeOption[]>('/rdm/task-types')
}

/** 全量含停用（管理页） */
export function fetchTaskTypeAll() {
  return request.get<unknown, RdmTaskTypeOption[]>('/rdm/task-types/all')
}

/** 新增/编辑请求（更新时 code 为身份键不可改） */
export interface RdmTaskTypePayload {
  code?: string
  label?: string
  color?: string
  category?: RdmTaskTypeCategory | string
  sortOrder?: number
  enabled?: number
  remark?: string
}

/** 新增任务类型 */
export function createTaskType(data: RdmTaskTypePayload) {
  return request.post<unknown, number>('/rdm/task-types', data)
}

/** 更新任务类型 */
export function updateTaskType(id: number, data: Partial<RdmTaskTypePayload>) {
  return request.put<unknown, void>(`/rdm/task-types/${id}`, data)
}

/** 启用/停用 */
export function updateTaskTypeStatus(id: number, enabled: number) {
  return request.put<unknown, void>(`/rdm/task-types/${id}/status`, null, { params: { enabled } })
}
