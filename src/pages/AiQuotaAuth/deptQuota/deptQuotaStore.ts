/**
 * 部門額度 — 展示常量 / 工具函數 / 部門樹構建
 *
 * 數據已對接後端真實 API（src/api/deptQuota.ts），本文件僅保留：
 *   1. 展示常量（標籤映射）
 *   2. QuotaLike 接口 + 用量計算工具函數
 *   3. 部門樹構建 / 部門引用解析（供列表頁、編輯頁使用）
 */
import type { DeptOption } from '../../../api'
import type { QuotaPeriod, QuotaType, OverLimitAction, Currency, AllocateMode } from '../../../api/deptQuota'

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

/** 超額動作 Tag 顏色（遵循狀態標識規範：危險紅 / 系統紫 / 信息藍） */
export const OVER_LIMIT_TAG: Record<OverLimitAction, string> = {
  reject: 'error',
  approve: 'purple',
  downgrade: 'processing',
}

export const ALLOCATE_MODE_LABEL: Record<AllocateMode, string> = {
  total: '部門共享總額',
  per_capita: '人均獨立額度',
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$' }

export const CURRENCY_OPTIONS: Array<{ value: Currency; label: string }> = [
  { value: 'CNY', label: 'CNY（人民幣）' },
  { value: 'USD', label: 'USD（美元）' },
]

/* ────────────────── QuotaLike 接口 + 工具函數 ────────────────── */

export interface QuotaLike {
  quotaValue: number
  usedValue: number
  softThreshold: number
  period: QuotaPeriod
  quotaType: QuotaType
  currency: Currency
}

/** 使用率（百分比，四捨五入到整數；限額為 0 時返回 0） */
export function usagePercent(policy: QuotaLike): number {
  if (!policy.quotaValue) return 0
  return Math.round((policy.usedValue / policy.quotaValue) * 100)
}

/**
 * 用量進度條顏色：
 *   ≥100% 超額 → 紅；≥軟提醒閾值 → 橙；其餘 → 綠
 */
export function usageColor(policy: QuotaLike): string {
  const pct = usagePercent(policy)
  if (pct >= 100) return '#FF4D4F'
  if (pct >= policy.softThreshold) return '#FAAD14'
  return '#52C41A'
}

/** 限額文案：費用帶幣種符號，其餘帶單位；統一附周期 */
export function quotaText(policy: QuotaLike): string {
  const period = QUOTA_PERIOD_LABEL[policy.period]
  if (policy.quotaType === 'cost') {
    return `${CURRENCY_SYMBOL[policy.currency]}${policy.quotaValue.toLocaleString()} / ${period}`
  }
  const unit = QUOTA_TYPE_UNIT[policy.quotaType]
  return `${policy.quotaValue.toLocaleString()} ${unit} / ${period}`.trim()
}

/** 已用量文案（與限額同口徑） */
export function usedText(policy: QuotaLike): string {
  if (policy.quotaType === 'cost') {
    return `${CURRENCY_SYMBOL[policy.currency]}${policy.usedValue.toLocaleString()}`
  }
  const unit = QUOTA_TYPE_UNIT[policy.quotaType]
  return `${policy.usedValue.toLocaleString()} ${unit}`.trim()
}

/* ────────────────── 部門樹構建 ────────────────── */

/** 部門樹節點 */
export interface DeptTreeNode {
  value: number
  title: string
  deptCode: string
  deptName: string
  disabled?: boolean
  children?: DeptTreeNode[]
}

/** 由扁平部門列表構建樹（依據 parentId），標題含編碼便於區分重名部門 */
export function buildDeptTree(list: DeptOption[]): DeptTreeNode[] {
  const map = new Map<number, DeptTreeNode>()
  list.forEach((d) => {
    map.set(d.deptId, {
      value: d.deptId,
      title: `${d.deptName}（${d.deptCode ?? '-'}）`,
      deptCode: d.deptCode ?? '',
      deptName: d.deptName,
      children: [],
    })
  })
  const roots: DeptTreeNode[] = []
  list.forEach((d) => {
    const node = map.get(d.deptId)!
    const pid = d.parentId
    if (pid != null && map.has(pid)) map.get(pid)!.children!.push(node)
    else roots.push(node)
  })
  const prune = (n: DeptTreeNode) => {
    if (!n.children || n.children.length === 0) delete n.children
    else n.children.forEach(prune)
  }
  roots.forEach(prune)
  return roots
}
