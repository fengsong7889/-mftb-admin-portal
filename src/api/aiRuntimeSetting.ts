import request from './request'

/** AI 运行参数（记忆策略）：defaultValue 为未落库时的系统默认 */
export interface AiRuntimeSettingRow {
  key: string
  value: string
  defaultValue: string
  type: 'int' | 'bool' | 'string'
  remark: string
  min: number
  max: number
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface AiMemoryStats {
  total: number
  active: number
  disabled: number
  expired: number
  expiring7d: number
  users: number
}

export function fetchRuntimeSettings() {
  return request.get<unknown, AiRuntimeSettingRow[]>('/ai/prompt-config/settings')
}

export function saveRuntimeSettings(values: Record<string, string>) {
  return request.put('/ai/prompt-config/settings', values)
}

export function fetchMemoryStats() {
  return request.get<unknown, AiMemoryStats>('/ai/prompt-config/memory-stats')
}
