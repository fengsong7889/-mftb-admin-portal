/**
 * AI 助手使用统计 API
 * 明细由开发环境 LLM 代理转发成功后回传落库，汇总按查询范围实时聚合
 */
import request, { TOKEN_KEY } from './request'

/** 单一币种的费用 */
export interface CostEntry {
  currency: string
  cost: number
}

/** 按模型聚合行 */
export interface UsageModelRow {
  model: string
  requests: number
  promptTokens: number
  completionTokens: number
  costs: CostEntry[]
}

/** 按用户聚合行 */
export interface UsageUserRow {
  username: string
  /** 员工姓名（供展示「姓名（工号）」，账号不存在时为空） */
  name: string | null
  /** 工号 */
  empId: string | null
  requests: number
  promptTokens: number
  completionTokens: number
  costs: CostEntry[]
  lastUsedAt: string | null
}

/** 消耗汇总 */
export interface UsageSummary {
  totalRequests: number
  totalPromptTokens: number
  totalCompletionTokens: number
  costByCurrency: CostEntry[]
  byModel: UsageModelRow[]
  byUser: UsageUserRow[]
}

/** 用量明细记录 */
export interface UsageRecord {
  id: number
  username: string
  /** 员工姓名（供展示「姓名（工号）」，账号不存在时为空） */
  name: string | null
  /** 工号 */
  empId: string | null
  mode: string
  channel: string
  model: string
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  cost: number
  currency: string
  createdAt: string
}

/** 汇总查询参数 */
export interface UsageSummaryParams {
  startDate: string
  endDate: string
  username?: string
}

/** 明细分页查询参数 */
export interface UsageRecordParams extends UsageSummaryParams {
  page: number
  size: number
}

/** 查询范围内的消耗汇总（按模型/按用户聚合，金额按币种分组） */
export function fetchUsageSummary(params: UsageSummaryParams): Promise<UsageSummary> {
  return request.get('/llm-usage/summary', { params })
}

/** 分页查询用量明细（按时间倒序） */
export function fetchUsageRecords(params: UsageRecordParams): Promise<{ records: UsageRecord[]; total: number }> {
  return request.get('/llm-usage/records', { params })
}

/** 供应商余额（当前仅 DeepSeek 提供官方余额 API；百炼无公开接口） */
export interface LlmBalances {
  deepseek: { available: boolean; balance: number } | null
}

/** 查询供应商账户余额（经 LLM 代理，需登录态） */
export function fetchLlmBalances(): Promise<LlmBalances> {
  return fetch(`${window.location.origin}/api/llm/balances`, {
    headers: { 'x-llm-token': localStorage.getItem(TOKEN_KEY) ?? '' },
  })
    .then((res) => (res.ok ? (res.json() as Promise<LlmBalances>) : { deepseek: null }))
    .catch(() => ({ deepseek: null }))
}
