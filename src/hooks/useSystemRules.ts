/**
 * 通用系統規則 Hook
 *
 * 提供規則的讀取、更新、重置、持久化能力。
 * 存儲後端：localStorage（主要）+ 後端 DB（系統安全規則同步）。
 */
import { useState, useCallback, useMemo } from 'react'
import {
  DEFAULT_RULE_GROUPS,
  SYSTEM_RULE_STORAGE_KEY,
  type RuleGroup,
} from '../constants/ruleConfig'
import { updateSystemConfig, getSystemConfigSilent } from '../api/systemConfig'

/* ==================== 工具函數 ==================== */

/** 從 localStorage 加載已保存的規則值（key → value 映射） */
function loadSavedValues(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SYSTEM_RULE_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

/** 將規則值映射持久化到 localStorage */
function persistValues(values: Record<string, unknown>) {
  localStorage.setItem(SYSTEM_RULE_STORAGE_KEY, JSON.stringify(values))
}

/** 解析表格類型規則的復合配置 */
function parseTableCfg(v: unknown): { prefix: string; dateFormat: string; min: number } {
  if (v && typeof v === 'object') return v as { prefix: string; dateFormat: string; min: number }
  return { prefix: String(v ?? '-'), dateFormat: '', min: 4 }
}
/** 序列化表格類型規則的復合配置 */
function stringifyTableCfg(prefix: string, dateFormat: string, min: number) {
  return JSON.stringify({ prefix, dateFormat, min })
}

/** 構建帶當前值的規則分組（合併 localStorage 已存值與默認值） */
function buildGroups(): RuleGroup[] {
  const saved = loadSavedValues()
  return DEFAULT_RULE_GROUPS.map(group => ({
    ...group,
    rules: group.rules.map(rule => {
      if (group.type === 'table') {
        const raw = saved[rule.key]
        if (raw && typeof raw === 'object' && raw !== null) {
          const cfg = parseTableCfg(raw)
          return { ...rule, value: cfg.prefix, dateFormat: cfg.dateFormat, min: cfg.min }
        }
        return { ...rule }
      }
      return {
        ...rule,
        value: rule.key in saved ? saved[rule.key] : rule.defaultValue,
      }
    }),
  }))
}

/* ==================== Hook ==================== */

export function useSystemRules() {
  const [groups, setGroups] = useState<RuleGroup[]>(buildGroups)

  /** 更新單條規則的值（表格類型支持更新 dateFormat / min 字段；互斥分組開啟時自動關閉同組其它） */
  const updateRule = useCallback((key: string, value: unknown, field?: string) => {
    setGroups(prev => {
      // 互斥分組處理：開啟某個 switch 時，同組其它規則全部設為 false
      let mutexKeys: string[] = []
      if (value === true) {
        const target = prev.flatMap(g => g.rules).find(r => r.key === key)
        if (target?.mutexGroup) {
          const grp = target.mutexGroup
          mutexKeys = prev.flatMap(g => g.rules)
            .filter(r => r.mutexGroup === grp && r.key !== key)
            .map(r => r.key)
        }
      }
      return prev.map(g => ({
        ...g,
        rules: g.rules.map(r => {
          if (g.type === 'table' && field) {
            if (r.key !== key) return r
            if (field === 'dateFormat') return { ...r, dateFormat: value as string }
            if (field === 'min') return { ...r, min: value as number }
            return r
          }
          if (r.key === key) return { ...r, value }
          if (mutexKeys.includes(r.key)) return { ...r, value: false }
          return r
        }),
      }))
    })
  }, [])

  /** 恢復所有規則為默認值 */
  const resetAll = useCallback(() => {
    setGroups(buildGroups())
    localStorage.removeItem(SYSTEM_RULE_STORAGE_KEY)
  }, [])

  /** 从 localStorage 重建（用于取消编辑后恢复） */
  const refresh = useCallback(() => {
    setGroups(buildGroups())
  }, [])

  /** 持久化當前所有規則到 localStorage */
  const saveAll = useCallback(() => {
    const values: Record<string, unknown> = {}
    groups.forEach(g => g.rules.forEach(r => {
      if (g.type === 'table') {
        values[r.key] = stringifyTableCfg(
          (r.value as string) || '-',
          r.dateFormat || '',
          r.min ?? 4,
        )
      } else {
        values[r.key] = r.value
      }
    }))
    persistValues(values)
  }, [groups])

  /** 按 key 快速查找單條規則的值（供其他組件消費） */
  const getRuleValue = useCallback(<T = unknown>(key: string): T | undefined => {
    for (const g of groups) {
      const found = g.rules.find(r => r.key === key)
      if (found) return found.value as T
    }
    return undefined
  }, [groups])

  /** 所有規則的 key→value 平坦映射（緩存） */
  const valueMap = useMemo(() => {
    const map: Record<string, unknown> = {}
    groups.forEach(g => g.rules.forEach(r => { map[r.key] = r.value }))
    return map
  }, [groups])

  return { groups, updateRule, refresh, resetAll, saveAll, getRuleValue, valueMap }
}

/* ==================== 後端同步（系統安全規則） ==================== */

/**
 * 將空閒超時配置同步到後端 DB（分鐘 → 毫秒轉換）
 * 供 RuleConfig 頁面保存「系統安全規則」時調用
 * @returns Promise，成功時 resolve，失敗時 reject（調用方決定是否提示用戶）
 */
export async function syncIdleTimeoutToBackend(minutes: number): Promise<void> {
  const ms = String(minutes * 60 * 1000)
  await updateSystemConfig('session_idle_timeout_ms', ms)
}

/* ==================== AI 模型使用權限（賬號白名單） ==================== */

/** AI 模型賬號白名單規則 key（localStorage 與後端 sys_config 共用同名 key） */
export const AI_MODEL_ACCOUNT_RULE_KEYS = {
  QW: 'ai_model_qw_accounts',
  DS: 'ai_model_ds_accounts',
} as const

export type AiModelKey = keyof typeof AI_MODEL_ACCOUNT_RULE_KEYS

/**
 * sys_config.config_value 可存長度上限（對應後端表結構 VARCHAR(2000)）
 * 白名單以 JSON 數組存放，賬號過多會超出字段長度導致後端寫入失敗（限制靜默失效）
 */
export const SYS_CONFIG_VALUE_MAX_LENGTH = 2000

/** 解析賬號白名單：兼容 JSON 數組與逗號分隔字符串，異常值按「不限制」處理 */
export function parseAccountWhitelist(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(item => String(item))
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(item => String(item))
    } catch { /* 非 JSON，按逗號分隔處理 */ }
    return raw.split(',').map(item => item.trim()).filter(Boolean)
  }
  return []
}

/** 賬號是否在白名單內（空白名單 = 全部賬號可用） */
export function isAccountAllowed(accounts: string[], username?: string): boolean {
  if (accounts.length === 0) return true
  return Boolean(username && accounts.includes(username))
}

/** 讀取各模型的賬號白名單：後端優先（跨賬號/跨設備生效），後端不可用時回退 localStorage */
export async function fetchAiModelAccounts(): Promise<Record<AiModelKey, string[]>> {
  const models = Object.keys(AI_MODEL_ACCOUNT_RULE_KEYS) as AiModelKey[]
  const entries = await Promise.all(models.map(async model => {
    const key = AI_MODEL_ACCOUNT_RULE_KEYS[model]
    const remote = await getSystemConfigSilent(key)
    const accounts = remote === null ? parseAccountWhitelist(getSystemRuleValue(key)) : parseAccountWhitelist(remote)
    return [model, accounts] as const
  }))
  return Object.fromEntries(entries) as Record<AiModelKey, string[]>
}

/* ==================== 同步讀取（供非組件場景使用） ==================== */

/** 同步讀取某條規則的當前值（優先 localStorage，回退默認值） */
export function getSystemRuleValue<T = unknown>(key: string): T {
  const saved = loadSavedValues()
  if (key in saved) return saved[key] as T
  // 從默認定義中查找
  for (const g of DEFAULT_RULE_GROUPS) {
    const rule = g.rules.find(r => r.key === key)
    if (rule) return rule.defaultValue as T
  }
  return undefined as unknown as T
}
