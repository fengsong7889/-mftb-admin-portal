import request from './request'

export interface AiOverviewArea {
  key: string
  title: string
  description: string
  value: string | number
  unit: string
  route: string
}

export interface AiOverviewIssue {
  tone: 'info' | 'warning' | 'danger' | string
  text: string
  route: string
}

export interface AiOverviewChange {
  id: number
  configType: string
  configKey: string
  action: string
  operator: string
  createdAt?: string | number | null
}

export interface AiAssistantOverview {
  areas: AiOverviewArea[]
  issues: AiOverviewIssue[]
  recentChanges: AiOverviewChange[]
  canViewAudit: boolean
}

/** AI 助手概览：后端按当前用户权限收敛，无权限模块不会返回 */
export function fetchAssistantOverview() {
  return request.get<unknown, AiAssistantOverview>('/ai/prompt-config/overview')
}
