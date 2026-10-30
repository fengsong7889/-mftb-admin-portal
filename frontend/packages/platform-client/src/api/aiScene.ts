import request from './request'

/** 业务 AI 场景（试点：会议 AI 整理纪要）管理接口的前端类型与调用。 */

export interface AiSceneConfig {
  sceneKey: string
  systemCode: string
  enabled: boolean
  version: number
  reason?: string | null
  environmentAllowed: boolean
  environmentReasonCode?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

/** status 固定 passed / blocked / not_checked；action 是前端白名单入口标识，不是 URL。 */
export interface AiSceneCheck {
  key: string
  status: 'passed' | 'blocked' | 'not_checked'
  reasonCode?: string | null
  message?: string | null
  action?: string | null
}

export interface AiScenePermissionSource {
  menuKey: string
  actions: string[]
  sources: string[]
}

export interface AiSceneDiagnosis {
  sceneKey: string
  userId?: number | null
  name?: string | null
  empId?: string | null
  checkedAt: string
  ready: boolean
  authorized: boolean
  modelKey?: string | null
  reasonCode?: string | null
  message?: string | null
  checks: AiSceneCheck[]
  permissionSources: AiScenePermissionSource[]
}

export interface AiSceneEmployeeOption {
  id: number
  name: string
  empId?: string | null
}

/** 读会议 AI 场景配置。 */
export function fetchMeetingAiSceneConfig(): Promise<AiSceneConfig> {
  return request.get<unknown, AiSceneConfig>('/ai/scenes/meeting_minutes')
}

/** 保存会议 AI 场景开关（乐观锁 + 严格审计）；版本冲突由后端返回 409。 */
export function saveMeetingAiSceneConfig(body: {
  enabled: boolean
  expectedVersion: number
  reason: string
}): Promise<AiSceneConfig> {
  return request.put<unknown, AiSceneConfig>('/ai/scenes/meeting_minutes', body)
}

/** 诊断指定员工的会议 AI 可用性（只读，不调模型）。 */
export function diagnoseMeetingAi(userId: number): Promise<AiSceneDiagnosis> {
  return request.post<unknown, AiSceneDiagnosis>('/ai/scenes/meeting_minutes/diagnose', { userId })
}

/** 诊断员工下拉：按关键字搜索或按 ids 回显，只返回姓名 + 工号。 */
export function fetchMeetingAiDiagnoseEmployees(params: {
  keyword?: string
  ids?: string
}): Promise<{ records: AiSceneEmployeeOption[]; total: number }> {
  return request.get<unknown, { records: AiSceneEmployeeOption[]; total: number }>(
    '/ai/scenes/meeting_minutes/employee-options', { params })
}
