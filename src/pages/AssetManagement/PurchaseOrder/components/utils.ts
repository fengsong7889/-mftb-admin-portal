/**
 * 采购订单录入/编辑共享工具函数与类型
 */
import type { AssetCategory } from '../../../../api/eam'

/* ==================== 分类树（TreeSelect） ==================== */

export interface CategoryTreeNode {
  value: number
  title: string
  code: string
  children?: CategoryTreeNode[]
}

/** 将扁平分类列表构建为 TreeSelect 所需的树结构 */
export function buildCategoryTree(list: AssetCategory[]): CategoryTreeNode[] {
  const nodeMap = new Map<number, CategoryTreeNode>()
  list.forEach((c) => {
    nodeMap.set(c.id, { value: c.id, title: c.name, code: c.code, children: [] })
  })
  const roots: CategoryTreeNode[] = []
  list.forEach((c) => {
    const node = nodeMap.get(c.id)!
    if (c.parentId && nodeMap.has(c.parentId)) {
      nodeMap.get(c.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/* ==================== 收货方式 ==================== */

export type DeliveryMethod = 'self_pickup' | 'supplier_delivery' | 'express'

/** 根据收货方式判断是否显示预计收货日期 */
export const showReceiveDate = (dm?: DeliveryMethod) =>
  dm === 'supplier_delivery' || dm === 'express'

/** 根据收货方式判断是否显示快递单号 */
export const showTrackingNo = (dm?: DeliveryMethod) => dm === 'express'

/* ==================== 明细行类型 ==================== */

/** 明细编辑弹窗使用的行数据 */
export interface ItemRow {
  key: string
  categoryId?: number
  categoryName?: string
  categoryCode?: string
  brandId?: number
  brandName?: string
  modelId?: number
  modelName?: string
  params?: Record<string, string>
  purchaseType?: 'purchase' | 'lease'
  qty: number
  price: number
  confirmedPrice?: number
}

/* ==================== 分组小计 ==================== */

import type { PurchaseOrderSupplierGroup } from '../../../../api/eam'

/** 计算分组小计 */
export const groupSubtotal = (group: PurchaseOrderSupplierGroup) =>
  group.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)

/** 计算所有分组总计 */
export const grandTotal = (groups: PurchaseOrderSupplierGroup[]) =>
  groups.reduce((s, g) => s + groupSubtotal(g), 0)
