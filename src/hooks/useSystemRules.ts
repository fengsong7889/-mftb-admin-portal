/**
 * 通用系統規則 Hook
 *
 * 提供規則的讀取、更新、持久化能力。
 * 存儲策略（規則菜单拆分 + 持久化改造）：
 * - 后端 sys_config 为「规则编辑页」的唯一真值（跨账号/跨设备生效）；
 * - localStorage 作为同步缓存，供各消费端（DayPicker/GiftAdd 等）同步读取，并在加载后端值后刷新；
 * - 编号生成规则（id_generation）由后端 biz_seq_rule 表管理，不经本 Hook 的 sys_config 读写。
 */
import { useState, useCallback } from 'react'
import {
  DEFAULT_RULE_GROUPS,
  RULE_MENU_TO_GROUP,
  SYSTEM_RULE_STORAGE_KEY,
  type RuleGroup,
  type RuleItem,
} from '../constants/ruleConfig'
import {
  updateSystemConfig,
  getSystemConfigSilent,
  batchGetSystemConfigSilent,
  batchUpdateSystemConfig,
} from '../api/systemConfig'

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

/* ==================== sys_config 持久编解码 ==================== */

/** 支持独立配置支付方式的广告类型（与 paymentModeRules 一致） */
const AD_PAYMENT_TYPES = ['revival', 'popular_merchant', 'golden_signboard', 'traffic_ad'] as const

/** 4 个互斥布尔 → 聚合支付模式（后端 sys_config 落库形态） */
function deriveMode(promoOnly: boolean, giftOnly: boolean, switchable: boolean): string {
  if (promoOnly) return 'promo_only'
  if (giftOnly) return 'gift_only'
  if (switchable) return 'switchable'
  return 'mixed'
}

/** 聚合支付模式 → 4 个互斥布尔 */
function modeToBools(mode: string): { promo_only: boolean; gift_only: boolean; mixed: boolean; switchable: boolean } {
  return {
    promo_only: mode === 'promo_only',
    gift_only: mode === 'gift_only',
    mixed: mode === 'mixed',
    switchable: mode === 'switchable',
  }
}

/** 值序列化为字符串（落 sys_config） */
function toConfigValue(value: unknown): string {
  return typeof value === 'boolean' ? String(value) : String(value ?? '')
}

/** 按规则控件类型把后端字符串值转回运行态 */
function coerceFromConfig(rule: RuleItem, raw: string): unknown {
  switch (rule.type) {
    case 'number': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : rule.defaultValue
    }
    case 'switch':
      return raw === 'true'
    case 'select': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : rule.defaultValue
    }
    default:
      return raw
  }
}

/** 判断是否为编辑器专用的广告类型支付互斥布尔 key（不落库） */
function isAdPaymentBool(rule: RuleItem): boolean {
  return !!rule.mutexGroup && rule.mutexGroup.startsWith('payment_mode_')
}

/**
 * 将某个版块当前规则值序列化为待落库的 sys_config 载荷。
 * - id_generation（表格）不经 sys_config，返回空；
 * - 广告销售：4 个互斥布尔折叠为 payment_mode_{type} 单 key，其余（加购锁定/赠送天数单价）直存；
 * - 系统安全：分钟 → 毫秒写 session_idle_timeout_ms。
 */
export function serializeGroupToConfig(group: RuleGroup): Record<string, string> {
  if (group.key === 'id_generation') return {}
  const out: Record<string, string> = {}
  for (const rule of group.rules) {
    if (isAdPaymentBool(rule)) continue
    if (rule.key === 'session_idle_timeout_minutes') continue
    out[rule.key] = toConfigValue(rule.value)
  }
  if (group.key === 'ad_sales') {
    const find = (key: string) => group.rules.find(r => r.key === key)?.value === true
    for (const type of AD_PAYMENT_TYPES) {
      out[`payment_mode_${type}`] = deriveMode(
        find(`payment_${type}_promo_only`),
        find(`payment_${type}_gift_only`),
        find(`payment_${type}_switchable`),
      )
    }
  }
  if (group.key === 'system_security') {
    const mins = group.rules.find(r => r.key === 'session_idle_timeout_minutes')?.value
    if (typeof mins === 'number' && mins > 0) {
      out['session_idle_timeout_ms'] = String(mins * 60000)
    }
  }
  return out
}

/** 某版块需要从后端读取的 config key 列表 */
export function groupConfigKeys(group: RuleGroup): string[] {
  return Object.keys(serializeGroupToConfig(group))
}

/** 用后端返回值覆盖运行态规则值（后端优先）；返回新规则数组 */
function applyRemoteValues(group: RuleGroup, remote: Record<string, string>): RuleItem[] {
  const rules = group.rules.map(rule => {
    if (rule.key === 'session_idle_timeout_minutes') {
      const ms = Number(remote['session_idle_timeout_ms'])
      if (Number.isFinite(ms) && ms > 0) return { ...rule, value: Math.round(ms / 60000) }
      return rule
    }
    if (isAdPaymentBool(rule)) return rule
    if (rule.key in remote) return { ...rule, value: coerceFromConfig(rule, remote[rule.key]) }
    return rule
  })
  if (group.key === 'ad_sales') {
    for (const type of AD_PAYMENT_TYPES) {
      const mode = remote[`payment_mode_${type}`]
      if (!mode) continue
      const b = modeToBools(mode)
      const setBool = (suffix: keyof ReturnType<typeof modeToBools>) => {
        const idx = rules.findIndex(r => r.key === `payment_${type}_${suffix}`)
        if (idx >= 0) rules[idx] = { ...rules[idx], value: b[suffix] }
      }
      setBool('promo_only')
      setBool('gift_only')
      setBool('mixed')
      setBool('switchable')
    }
  }
  return rules
}

/** 把某版块的当前值合并写入 localStorage（供同步消费端读取） */
function mergeGroupToStorage(group: RuleGroup) {
  const saved = loadSavedValues()
  if (group.type === 'table') {
    for (const rule of group.rules) {
      saved[rule.key] = stringifyTableCfg(
        (rule.value as string) || '-',
        rule.dateFormat || '',
        rule.min ?? 4,
      )
    }
  } else {
    for (const rule of group.rules) {
      saved[rule.key] = rule.value
    }
  }
  persistValues(saved)
}

/* ==================== 单版块编辑 Hook（规则中心子页面） ==================== */

export interface UseRuleGroupResult {
  group: RuleGroup | null
  loading: boolean
  /** 从后端拉取该版块持久化值并覆盖本地（后端优先） */
  reload: () => void
  /** 更新单条规则值（表格类型可更新 dateFormat/min；互斥组开启自动关闭同组其它） */
  updateRule: (key: string, value: unknown, field?: string) => void
  /** 保存：localStorage 兜底 + 后端批量落库；后端失败抛出，由调用方提示 */
  save: () => Promise<void>
  /** 恢复为默认值（不落库，仅重置编辑态与本地缓存，保存后落库） */
  resetDefaults: () => void
}

/**
 * 规则中心单个版块页的数据编排：按子菜单 menuKey 加载对应版块，支持后端读写的规则版块编辑并落库。
 */
export function useRuleGroup(menuKey: string): UseRuleGroupResult {
  const groupKey = RULE_MENU_TO_GROUP[menuKey]
  const findGroup = useCallback(
    () => buildGroups().find(g => g.key === groupKey) ?? null,
    [groupKey],
  )
  const [group, setGroup] = useState<RuleGroup | null>(findGroup)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(() => {
    if (!groupKey) return
    setLoading(true)
    setGroup(findGroup())
    const base = findGroup()
    if (!base || base.key === 'id_generation') {
      setLoading(false)
      return
    }
    batchGetSystemConfigSilent(groupConfigKeys(base)).then(remote => {
      if (!remote || Object.keys(remote).length === 0) {
        setLoading(false)
        return
      }
      setGroup(prev => {
        if (!prev) return prev
        const next: RuleGroup = { ...prev, rules: applyRemoteValues(prev, remote) }
        mergeGroupToStorage(next)
        return next
      })
      setLoading(false)
    })
  }, [groupKey, findGroup])

  const updateRule = useCallback((key: string, value: unknown, field?: string) => {
    setGroup(prev => {
      if (!prev) return prev
      // 互斥分组：开启某个 switch 时，同组其它规则置 false
      let mutexKeys: string[] = []
      if (value === true) {
        const target = prev.rules.find(r => r.key === key)
        if (target?.mutexGroup) {
          mutexKeys = prev.rules
            .filter(r => r.mutexGroup === target.mutexGroup && r.key !== key)
            .map(r => r.key)
        }
      }
      const rules = prev.rules.map(r => {
        if (prev.type === 'table' && field) {
          if (r.key !== key) return r
          if (field === 'dateFormat') return { ...r, dateFormat: value as string }
          if (field === 'min') return { ...r, min: value as number }
          return r
        }
        if (r.key === key) return { ...r, value }
        if (mutexKeys.includes(r.key)) return { ...r, value: false }
        return r
      })
      return { ...prev, rules }
    })
  }, [])

  const save = useCallback(async () => {
    if (!group) return
    mergeGroupToStorage(group)
    if (group.key === 'id_generation') return
    const payload = serializeGroupToConfig(group)
    if (Object.keys(payload).length > 0) {
      await batchUpdateSystemConfig(payload)
    }
  }, [group])

  const resetDefaults = useCallback(() => {
    const fresh = DEFAULT_RULE_GROUPS.find(g => g.key === groupKey)
    if (fresh) setGroup({ ...fresh })
  }, [groupKey])

  return { group, loading, reload, updateRule, save, resetDefaults }
}

/* ==================== 兼容旧全量 Hook（总览页只读） ==================== */

export function useSystemRules() {
  const [groups, setGroups] = useState<RuleGroup[]>(buildGroups)

  /** 从 localStorage 重建 */
  const refresh = useCallback(() => {
    setGroups(buildGroups())
  }, [])

  return { groups, refresh }
}

/* ==================== 后端同步（供零散场景） ==================== */

/**
 * 將空閒超時配置同步到後端 DB（分鐘 → 毫秒轉換）
 * @returns Promise，成功时 resolve，失败时 reject（调用方决定是否提示用户）
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
