import request from './request'

/** AI 合规护栏规则：输入/输出关键词或正则 */
export interface AiGuardRule {
  id?: number
  ruleType: 'keyword' | 'regex'
  pattern: string
  action: 'block' | 'warn' | 'replace'
  scope: 'input' | 'output' | 'both'
  /** 作用域：common=共用，其余为业务系统编码 */
  systemCode?: string
  replacement?: string | null
  enabled: 0 | 1
  remark?: string | null
  updatedBy?: string
  updatedAt?: string
}

export function fetchGuardRules(systemCode?: string) {
  return request.get<unknown, AiGuardRule[]>('/ai/prompt-config/guardrails', {
    params: systemCode ? { systemCode } : {},
  })
}

export function saveGuardRule(rule: AiGuardRule) {
  return request.post<unknown, AiGuardRule>('/ai/prompt-config/guardrails', rule)
}

export function deleteGuardRule(id: number) {
  return request.delete(`/ai/prompt-config/guardrails/${id}`)
}
