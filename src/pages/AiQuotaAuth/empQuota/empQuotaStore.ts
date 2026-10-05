/**
 * 員工額度（職位額度） — 展示常量 / 工具函數
 *
 * 展示常量與工具函數已遷移至 `../components/quotaShared`，本文件僅保留 re-export。
 */

export {
  // 類型
  type QuotaPeriod, type QuotaType, type OverLimitAction, type Currency,
  type QuotaLike,
  // 展示常量
  QUOTA_PERIOD_LABEL, QUOTA_TYPE_LABEL, QUOTA_TYPE_UNIT,
  OVER_LIMIT_ACTION_LABEL, OVER_LIMIT_TAG,
  CURRENCY_SYMBOL, CURRENCY_OPTIONS,
  // 工具函數
  usagePercent, usageColor, quotaText, usedText,
} from '../components/quotaShared'
