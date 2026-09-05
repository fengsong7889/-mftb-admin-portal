/**
 * 員工額度（職位額度） — 展示常量 / 工具函數
 *
 * 類型定義與 API 對齊（PosQuotaVO），展示常量 / 工具函數保留於此。
 */

/* ────────────────── 枚舉類型 ────────────────── */

/** 限額周期 */
export type QuotaPeriod = 'daily' | 'monthly'
/** 限額類型 */
export type QuotaType = 'token' | 'cost' | 'request'
/** 超額動作 */
export type OverLimitAction = 'reject' | 'approve' | 'downgrade'
/** 計價幣種 */
export type Currency = 'CNY' | 'USD'

/* ────────────────── 展示常量 ────────────────── */

export const QUOTA_PERIOD_LABEL: Record<QuotaPeriod, string> = {
  daily: '按日',
  monthly: '按月',
}

export const QUOTA_TYPE_LABEL: Record<QuotaType, string> = {
  token: 'Token 數',
  cost: '費用金額',
  request: '請求次數',
}

export const QUOTA_TYPE_UNIT: Record<QuotaType, string> = {
  token: 'tokens',
  cost: '',
  request: '次',
}

export const OVER_LIMIT_ACTION_LABEL: Record<OverLimitAction, string> = {
  reject: '拒絕請求',
  approve: '進入審批',
  downgrade: '自動降級',
}

/** 超額動作 Tag 顏色 */
export const OVER_LIMIT_TAG: Record<OverLimitAction, string> = {
  reject: 'error',
  approve: 'purple',
  downgrade: 'processing',
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$' }

export const CURRENCY_OPTIONS: Array<{ value: Currency; label: string }> = [
  { value: 'CNY', label: 'CNY（人民幣）' },
  { value: 'USD', label: 'USD（美元）' },
]

/* ────────────────── 工具函數 ────────────────── */

export interface QuotaLike {
  quotaValue: number
  usedValue: number
  softThreshold: number
  period: QuotaPeriod
  quotaType: QuotaType
  currency: Currency
}

/** 使用率（百分比） */
export function usagePercent(policy: QuotaLike): number {
  if (!policy.quotaValue) return 0
  return Math.round((policy.usedValue / policy.quotaValue) * 100)
}

/** 用量進度條顏色 */
export function usageColor(policy: QuotaLike): string {
  const pct = usagePercent(policy)
  if (pct >= 100) return '#FF4D4F'
  if (pct >= policy.softThreshold) return '#FAAD14'
  return '#52C41A'
}

/** 限額文案（含幣種符號 / 單位，統一附周期） */
export function quotaText(policy: QuotaLike): string {
  const period = QUOTA_PERIOD_LABEL[policy.period]
  if (policy.quotaType === 'cost') {
    return `${CURRENCY_SYMBOL[policy.currency]}${policy.quotaValue.toLocaleString()} / ${period}`
  }
  const unit = QUOTA_TYPE_UNIT[policy.quotaType]
  return `${policy.quotaValue.toLocaleString()} ${unit} / ${period}`.trim()
}

/** 已用量文案 */
export function usedText(policy: QuotaLike): string {
  if (policy.quotaType === 'cost') {
    return `${CURRENCY_SYMBOL[policy.currency]}${policy.usedValue.toLocaleString()}`
  }
  const unit = QUOTA_TYPE_UNIT[policy.quotaType]
  return `${policy.usedValue.toLocaleString()} ${unit}`.trim()
}
