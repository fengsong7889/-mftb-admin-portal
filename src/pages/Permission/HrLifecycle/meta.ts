import { HR_LIFECYCLE_TYPE, HR_DIMISSION_TYPE, type HrLifecycleType, type HrLifecycleStatus } from '../../../api/hrLifecycle'

/** 单据类型 → 名称 i18n key */
export const TYPE_LABEL_KEY: Record<HrLifecycleType, string> = {
  [HR_LIFECYCLE_TYPE.ONBOARD]: 'hrLifecycle.typeOnboard',
  [HR_LIFECYCLE_TYPE.REGULAR]: 'hrLifecycle.typeRegular',
  [HR_LIFECYCLE_TYPE.TRANSFER]: 'hrLifecycle.typeTransfer',
  [HR_LIFECYCLE_TYPE.DIMISSION]: 'hrLifecycle.typeDimission',
  [HR_LIFECYCLE_TYPE.RENEW]: 'hrLifecycle.typeRenew',
}

/** 单据类型 → 品牌色 Tag 颜色 */
export const TYPE_TAG_COLOR: Record<HrLifecycleType, string> = {
  [HR_LIFECYCLE_TYPE.ONBOARD]: 'green',
  [HR_LIFECYCLE_TYPE.REGULAR]: 'blue',
  [HR_LIFECYCLE_TYPE.TRANSFER]: 'purple',
  [HR_LIFECYCLE_TYPE.DIMISSION]: 'red',
  [HR_LIFECYCLE_TYPE.RENEW]: 'cyan',
}

/** 状态 → 名称 i18n key */
export const STATUS_LABEL_KEY: Record<HrLifecycleStatus, string> = {
  draft: 'hrLifecycle.statusDraft',
  pending: 'hrLifecycle.statusPending',
  approved: 'hrLifecycle.statusApproved',
  rejected: 'hrLifecycle.statusRejected',
  cancelled: 'hrLifecycle.statusCancelled',
  completed: 'hrLifecycle.statusCompleted',
}

/** 状态 → Tag 颜色 */
export const STATUS_TAG_COLOR: Record<HrLifecycleStatus, string> = {
  draft: 'default',
  pending: 'processing',
  approved: 'warning',
  rejected: 'error',
  cancelled: 'default',
  completed: 'success',
}

/** 列表页状态 Tab（all=全部） */
export const STATUS_TABS: Array<{ key: string }> = [
  { key: 'all' },
  { key: 'draft' },
  { key: 'pending' },
  { key: 'rejected' },
  { key: 'approved' },
  { key: 'completed' },
]

/** 离职类型 → 名称 i18n key */
export const DIMISSION_TYPE_LABEL_KEY: Record<string, string> = {
  [HR_DIMISSION_TYPE.VOLUNTARY]: 'hrLifecycle.dimissionVoluntary',
  [HR_DIMISSION_TYPE.INVOLUNTARY]: 'hrLifecycle.dimissionInvoluntary',
  [HR_DIMISSION_TYPE.EXPIRED]: 'hrLifecycle.dimissionExpired',
}

/** 可编辑/可提交/可删除的单据状态（与后端 requireEditable 对齐） */
export const EDITABLE_STATUSES: string[] = ['draft', 'rejected', 'cancelled']

/** 部门平铺列表 → antd TreeSelect 树（仅启用的部门） */
export interface DeptTreeNode {
  value: number
  title: string
  children?: DeptTreeNode[]
}

export function buildDeptTree(
  depts: Array<{ id: number; name: string; parentId?: number | null; status: number }>,
): DeptTreeNode[] {
  const enabled = depts.filter(d => d.status === 1)
  const byParent = new Map<number | null, typeof enabled>()
  for (const d of enabled) {
    const key = d.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(d)
  }
  const walk = (parentId: number | null): DeptTreeNode[] =>
    (byParent.get(parentId) ?? []).map(d => {
      const children = walk(d.id)
      return {
        value: d.id,
        title: d.name,
        ...(children.length ? { children } : {}),
      }
    })
  return walk(null)
}
