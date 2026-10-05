/**
 * 部門額度 — 展示常量 / 工具函數 / 部門樹構建
 *
 * 展示常量與工具函數已遷移至 `../components/quotaShared`，本文件僅保留：
 *   - 部門樹構建 / 部門引用解析（供列表頁、編輯頁使用）
 *   - 對 quotaShared 的 re-export（保持既有 import 路徑不變）
 */
import type { DeptOption } from '../../../api'

/* ────────────────── Re-export from quotaShared ────────────────── */

export {
  // 類型
  type QuotaPeriod, type QuotaType, type OverLimitAction, type Currency, type AllocateMode,
  type QuotaLike,
  // 展示常量
  QUOTA_PERIOD_LABEL, QUOTA_TYPE_LABEL, QUOTA_TYPE_UNIT,
  OVER_LIMIT_ACTION_LABEL, OVER_LIMIT_TAG,
  ALLOCATE_MODE_LABEL, CURRENCY_SYMBOL, CURRENCY_OPTIONS,
  // 工具函數
  usagePercent, usageColor, quotaText, usedText,
} from '../components/quotaShared'

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
