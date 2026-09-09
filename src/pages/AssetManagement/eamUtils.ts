/**
 * 物資管理（EAM）前端公共工具與常量
 *
 * - buildTree：平鋪列表構建樹形結構（資產分類 / 存放位置）
 * - toTreeSelectData：樹形結構轉 antd TreeSelect 數據
 * - 部門 / 公司 / 單位等下拉常量（與 api/asset.ts mock 數據保持一致）
 */

export type WithChildren<T> = T & { children?: WithChildren<T>[] }

/** 平鋪列表 → 樹形結構（parentId = 0 視為頂級） */
export function buildTree<T extends { id: number; parentId: number }>(list: T[]): WithChildren<T>[] {
  const map = new Map<number, WithChildren<T>>()
  list.forEach((it) => map.set(it.id, { ...it }))
  const roots: WithChildren<T>[] = []
  map.forEach((node) => {
    const parent = node.parentId ? map.get(node.parentId) : undefined
    if (parent) {
      if (!parent.children) parent.children = []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

export interface TreeSelectNode {
  title: string
  value: number
  disabled?: boolean
  children?: TreeSelectNode[]
}

/** 樹形結構 → TreeSelect 數據
 * @param disabledIds - 禁用指定節點（如編輯時禁用自身）
 * @param maxDepth - 最大層級（超過該層級的節點不可選為父級），0 表示不限制
 */
export function toTreeSelectData<T extends { id: number; name: string }>(
  nodes: WithChildren<T>[],
  disabledIds: number[] = [],
  maxDepth = 0,
  currentDepth = 1,
): TreeSelectNode[] {
  return nodes.map((n) => {
    const atMaxDepth = maxDepth > 0 && currentDepth >= maxDepth
    return {
      title: n.name,
      value: n.id,
      disabled: disabledIds.includes(n.id) || atMaxDepth ? true : undefined,
      children: n.children?.length
        ? toTreeSelectData(n.children, disabledIds, maxDepth, currentDepth + 1)
        : undefined,
    }
  })
}

/** 收集樹中所有節點 id（用於默認展開） */
export function collectIds<T extends { id: number }>(nodes: WithChildren<T>[]): number[] {
  const ids: number[] = []
  const walk = (list: WithChildren<T>[]) => {
    list.forEach((n) => {
      ids.push(n.id)
      if (n.children?.length) walk(n.children)
    })
  }
  walk(nodes)
  return ids
}

/** 為樹中每個節點標注層級 depth（根=1） */
export function annotateDepth<T extends { id: number }>(
  nodes: WithChildren<T>[],
  depth = 1,
): (WithChildren<T> & { depth: number })[] {
  return nodes.map((n) => ({
    ...n,
    depth,
    children: n.children?.length ? annotateDepth(n.children, depth + 1) : undefined,
  }))
}

/** 部門選項（與 api/asset.ts、api/eam.ts mock 數據一致） */
export const EAM_DEPARTMENTS = [
  '研发部', '产品部', '市场部', '设计部', '技术部',
  '人事部', '财务部', '行政部', '运营部', '物资部',
]

/** 所屬公司選項 */
export const EAM_COMPANIES = ['澳觅科技', '闪蜂', 'mFood']

/** 計量單位選項 */
export const EAM_UNITS = ['台', '套', '件', '把', '张', '辆', '个']

/** 兩個日期（YYYY-MM-DD）相差天數：to - from */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime()
  const b = new Date(`${to}T00:00:00`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

/** 今天（YYYY-MM-DD） */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
