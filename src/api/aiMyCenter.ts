/**
 * 智能中心「我的」视图 API
 * - 我的用量：当前账号生效的额度维度（员工/部门/职位/角色）+ 真实用量（biz_llm_usage 实时聚合）
 * - 我的授权模型：首页智能路由/指定模型的候选来源
 */
import request from './request'

/* ══════════ 我的用量 ══════════ */

/** 额度维度来源 */
export type QuotaSource = 'employee' | 'department' | 'position' | 'role'

/** 限额周期 */
export type QuotaPeriod = 'daily' | 'monthly'

/** 限额类型：token 数 / 费用金额 / 请求次数 */
export type QuotaType = 'token' | 'cost' | 'request'

/** 单一币种费用 */
export interface MyCostEntry {
  currency: string
  cost: number
}

/** 单个额度维度：一条「来源 + 周期 + 类型」的限额规则及本期已用 */
export interface QuotaDimension {
  source: QuotaSource
  /** 来源名称（员工专属 / 部门名 / 策略名 / 角色名） */
  sourceName: string
  /** 限定模型 ID；null = 全部模型 */
  modelId: number | null
  modelKey: string | null
  modelName: string | null
  period: QuotaPeriod
  quotaType: QuotaType
  quotaValue: number
  /** 计价币种（cost 类型使用，其余为空） */
  currency: string | null
  /** 本期已用（按 quotaType 口径） */
  usedValue: number
  /** 软限额提醒阈值(%) */
  softThreshold: number
  /** 本期重置日（yyyy-MM-dd） */
  resetDate: string
}

/** 整体用量概览（今日/本月） */
export interface MyUsageSummary {
  todayTokens: number
  monthTokens: number
  todayRequests: number
  monthRequests: number
  todayCosts: MyCostEntry[]
  monthCosts: MyCostEntry[]
}

/** 最近使用记录 */
export interface MyUsageRecord {
  id: number
  time: string
  model: string
  mode: string
  channel: string
  promptTokens: number
  completionTokens: number
  cost: number
  currency: string
}

/** 我的用量聚合视图 */
export interface MyQuotaUsage {
  username: string
  name: string
  empId: string
  dimensions: QuotaDimension[]
  usage: MyUsageSummary
  recentRecords: MyUsageRecord[]
}

/** 查询我的额度维度与真实用量 */
export function fetchMyQuotaUsage(): Promise<MyQuotaUsage> {
  return request.get<unknown, MyQuotaUsage>('/ai/quota/my', {
    headers: { 'X-Request-Silent': '1' },
  })
}

/* ══════════ 我的授权模型 ══════════ */

/** 授权来源：部门策略组/职位/角色/员工 */
export type ModelAuthSource = 'dept' | 'position' | 'role' | 'employee'

export interface MyModel {
  modelId: number
  modelKey: string
  modelName: string
  providerName: string | null
  /** 部署类型：cloud=公有云 private=私有化 */
  deployType: string | null
  sources: ModelAuthSource[]
}

/** 查询当前账号被授权的启用模型列表 */
export function fetchMyModels(): Promise<MyModel[]> {
  return request.get<unknown, MyModel[]>('/ai/auth/my-models', {
    headers: { 'X-Request-Silent': '1' },
  })
}

/* ══════════ 展示辅助 ══════════ */

/** 币种符号 */
export const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', '': '' }

/** 币种符号兜底：未知币种直接展示代码 */
export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return ''
  return CURRENCY_SYMBOL[currency] ?? currency
}

/** 数值千分位格式化 */
export function formatNumber(value: number): string {
  return value.toLocaleString()
}

/** 金额格式化（保留 2~4 位小数） */
export function formatCost(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}
