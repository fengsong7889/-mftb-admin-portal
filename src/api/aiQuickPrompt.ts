import request from './request'

/** AI 助手快捷提问（首页对话底部展示，最多 6 条） */
export interface AiQuickPrompt {
  id?: number
  domain: string
  systemCode?: string | null
  roleCode?: string | null
  question: string
  sort?: number
  /** 1=啟用 0=停用 */
  enabled?: number
  updatedBy?: string
  updatedAt?: string
}

export function fetchQuickPrompts(params: { systemCode?: string; keyword?: string } = {}) {
  return request.get<unknown, AiQuickPrompt[]>('/ai/prompt-config/quick-prompts', { params })
}

export function saveQuickPrompt(row: AiQuickPrompt) {
  return request.post<unknown, AiQuickPrompt>('/ai/prompt-config/quick-prompts', row)
}

export function deleteQuickPrompt(id: number) {
  return request.delete(`/ai/prompt-config/quick-prompts/${id}`)
}

/** 首页：按系统/角色收敛的快捷提问（登录即可，无需配置权限） */
export function fetchVisibleQuickPrompts(systemCode?: string) {
  return request.get<unknown, Array<{ id: number; question: string }>>('/ai/quick-prompts', {
    params: systemCode ? { systemCode } : {},
  })
}
