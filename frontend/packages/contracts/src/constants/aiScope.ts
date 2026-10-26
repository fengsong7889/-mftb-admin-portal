import { useCallback, useState } from 'react'

/**
 * AI 配置的「作用域」：共用（对所有系统生效）+ 各业务系统。
 *
 * <p>约定：`common` 表示共用，其余值与后端 system_code/domain 一致（rdm/finance/eam/hr/oa）。
 * 新增系统时只在这里补一项，页面与过滤逻辑不用改。
 */
export const AI_SCOPE_OPTIONS = [
  { value: 'common', label: '共用' },
  { value: 'rdm', label: '產研交付' },
  { value: 'finance', label: '財務' },
  { value: 'eam', label: '物資' },
  { value: 'hr', label: '人事' },
  { value: 'oa', label: 'OA' },
] as const

export type AiScope = string

export function aiScopeLabel(value?: string | null): string {
  if (!value) return '共用'
  return AI_SCOPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

/**
 * 页面级作用域记忆：同一页面下次进入仍停在原系统，避免每次重新选。
 * 存 localStorage 而不是后端：这是纯展示偏好，不需要跨设备同步。
 */
export function useAiScope(pageKey: string, fallback: AiScope = 'common') {
  const storageKey = `ai-scope:${pageKey}`
  const [scope, setScope] = useState<AiScope>(() => {
    try {
      return localStorage.getItem(storageKey) || fallback
    } catch {
      return fallback
    }
  })

  const update = useCallback((next: AiScope) => {
    setScope(next)
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      /* 隐私模式禁用 localStorage 时忽略 */
    }
  }, [storageKey])

  return [scope, update] as const
}
