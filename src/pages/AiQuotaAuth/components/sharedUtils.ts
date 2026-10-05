/**
 * sharedUtils — AiQuotaAuth 模塊共享工具函數
 *
 * 提取自 DeptQuotaEdit / EmpQuotaEdit 中重複的工具函數。
 */
import type { Currency, QuotaType } from './quotaShared'
import { QUOTA_TYPE_UNIT, CURRENCY_SYMBOL } from './quotaShared'

/** 格式化時間為 YYYY-MM-DD HH:mm:ss */
export const nowText = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

/** 限額文案（含幣種符號 / 單位） */
export const fmtQuota = (val: number, qt: QuotaType, cur: Currency): string => {
  if (qt === 'cost') return `${CURRENCY_SYMBOL[cur]}${val.toLocaleString()}`
  return `${val.toLocaleString()} ${QUOTA_TYPE_UNIT[qt]}`.trim()
}

/** 限額值輸入框單位後綴 */
export const getValueUnit = (quotaType: QuotaType | undefined, currency: Currency | undefined): string => {
  if (!quotaType) return ''
  if (quotaType === 'cost') return currency === 'USD' ? 'USD' : 'CNY'
  return QUOTA_TYPE_UNIT[quotaType]
}
