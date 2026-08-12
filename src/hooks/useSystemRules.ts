/**
 * 通用系統規則 Hook
 *
 * 提供規則的讀取、更新、重置、持久化能力。
 * 存儲後端：localStorage（後續可替換為後端 API）。
 */
import { useState, useCallback, useMemo } from 'react'
import {
  DEFAULT_RULE_GROUPS,
  SYSTEM_RULE_STORAGE_KEY,
  type RuleGroup,
  type RuleItem,
} from '../constants/ruleConfig'

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

  /** 更新單條規則的值（表格類型支持更新 dateFormat / min 字段） */
  const updateRule = useCallback((key: string, value: unknown, field?: string) => {
    setGroups(prev =>
      prev.map(g => {
        if (g.type === 'table' && field) {
          return {
            ...g,
            rules: g.rules.map(r => {
              if (r.key !== key) return r
              if (field === 'dateFormat') return { ...r, dateFormat: value as string }
              if (field === 'min') return { ...r, min: value as number }
              return r
            }),
          }
        }
        return {
          ...g,
          rules: g.rules.map(r => r.key === key ? { ...r, value } : r),
        }
      }),
    )
  }, [])

  /** 恢復所有規則為默認值 */
  const resetAll = useCallback(() => {
    setGroups(buildGroups())
    localStorage.removeItem(SYSTEM_RULE_STORAGE_KEY)
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

  return { groups, updateRule, resetAll, saveAll, getRuleValue, valueMap }
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
