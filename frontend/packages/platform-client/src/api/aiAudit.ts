import request from './request'

/** AI 配置变更审计记录（before/after 后端已截断到 4000 字） */
export interface AiConfigChangeRow {
  id: number
  configType: string
  configKey: string
  action: string
  beforeJson?: string | null
  afterJson?: string | null
  operator: string
  createdAt?: string | number | null
}

export interface AiConfigChangePage {
  records: AiConfigChangeRow[]
  total: number
  page: number
  size: number
}

export interface AiConfigChangeQuery {
  configType?: string
  action?: string
  operator?: string
  keyword?: string
  from?: string
  to?: string
  page?: number
  size?: number
}

/** 配置变更审计（需 ai-assistant-audit:view） */
export function fetchConfigChanges(params: AiConfigChangeQuery = {}) {
  return request.get<unknown, AiConfigChangePage>('/ai/prompt-config/changes', { params })
}
