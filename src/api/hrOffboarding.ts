import request from './request'

/**
 * 离职联动任务（资产交接 / OA 待办改派）。
 *
 * 真值在后端 `HrOffboardingTask` 常量上，这里逐值对齐只为界面能按类型与状态出文案；
 * 新增类型必须同时改后端常量 + 这里的联合类型，否则界面会显示原始 code。
 */

export const OFFBOARDING_TASK_TYPE = {
  ASSET_HANDOVER: 'EAM_ASSET_HANDOVER',
  OA_TODO_TRANSFER: 'OA_TODO_TRANSFER',
} as const

export type OffboardingTaskType = (typeof OFFBOARDING_TASK_TYPE)[keyof typeof OFFBOARDING_TASK_TYPE]

export const OFFBOARDING_TASK_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
} as const

export type OffboardingTaskStatus = (typeof OFFBOARDING_TASK_STATUS)[keyof typeof OFFBOARDING_TASK_STATUS]

export interface OffboardingTaskItem {
  id: number
  requestId: number
  reqNo?: string | null
  userId?: number | null
  empNo?: string | null
  taskType: OffboardingTaskType | string
  status: OffboardingTaskStatus | string
  attempts?: number | null
  lastError?: string | null
  resultSummary?: string | null
  targetRef?: string | null
  effectiveDate?: string | null
  updatedAt?: string | null
}

/** 某张离职单的联动任务 */
export function fetchOffboardingTasks(requestId: number) {
  return request.get<unknown, OffboardingTaskItem[]>(`/hr/offboarding/requests/${requestId}/tasks`)
}

/** 指定/变更交接接收人（服务端会校验接收人在操作者人员范围内） */
export function assignOffboardingReceiver(requestId: number, receiverUserId: number) {
  return request.post<unknown, void>(`/hr/offboarding/requests/${requestId}/receiver`, { receiverUserId })
}

/** 重试单个联动任务；终态任务会被后端拒绝（避免重复建交接单） */
export function retryOffboardingTask(taskId: number) {
  return request.post<unknown, string>(`/hr/offboarding/tasks/${taskId}/retry`)
}
