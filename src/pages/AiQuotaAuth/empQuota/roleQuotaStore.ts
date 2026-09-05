/**
 * 員工額度（角色額度） — 復用展示常量 / 工具函數
 */

/* ────────────────── 復用展示常量 ────────────────── */
export {
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  QUOTA_TYPE_UNIT,
  OVER_LIMIT_ACTION_LABEL,
  OVER_LIMIT_TAG,
  CURRENCY_SYMBOL,
  CURRENCY_OPTIONS,
} from './empQuotaStore'

export type { QuotaPeriod, QuotaType, OverLimitAction, Currency } from './empQuotaStore'

/* ────────────────── 工具函數（復用 empQuotaStore 邏輯） ────────────────── */
import type { QuotaLike } from './empQuotaStore'
import {
  usagePercent as _up,
  usageColor as _uc,
  quotaText as _qt,
  usedText as _ut,
} from './empQuotaStore'

export const usagePercent = (p: QuotaLike) => _up(p)
export const usageColor = (p: QuotaLike) => _uc(p)
export const quotaText = (p: QuotaLike) => _qt(p)
export const usedText = (p: QuotaLike) => _ut(p)
