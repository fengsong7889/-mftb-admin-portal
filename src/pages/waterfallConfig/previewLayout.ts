/**
 * 瀑布流预览布局计算（纯函数，便于单测）。
 *
 * 坑位按「卡片编号」而非「行编号」：第 3 坑在单列是第 3 行，在双列是第 2 行左侧。
 * 切换布局不改变任何坑位编号或绑定关系。
 *
 * 团购预览规则：可用固定内容优先占位 → 其余坑位由分类候选去重补位；
 * 停用/失效固定内容由分类候选补位；候选不足则提示不足，不混入其他分类或重复填满。
 */
import type { FixedContentSlot, WaterfallLayoutColumns } from './types'

/** 预览候选资源（仅取预览需要的字段，兼容 Mock 与未来真实资源） */
export interface PreviewCandidate {
  id: string
  name: string
  image?: string
  rating?: number
  monthlySales?: number
  price?: number
  originPrice?: number
  distance?: string
  deliveryTime?: string
}

/** 预览卡片：固定内容 or 分类补位 or 空 */
export interface PreviewCard {
  position: number
  kind: 'fixed' | 'category' | 'empty'
  itemId?: string
  itemName?: string
  /** 固定坑位但资源已停用/失效（预览用分类补位，卡片仍标注来源） */
  invalid?: boolean
  image?: string
  rating?: number
  monthlySales?: number
  price?: number
  originPrice?: number
  distance?: string
  deliveryTime?: string
}

/** 把 1..totalPositions 按布局铺成行（左到右、上到下） */
export function toPreviewRows<T>(items: T[], columns: WaterfallLayoutColumns): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns))
  }
  return rows
}

/**
 * 生成团购预览卡片序列（位置 1..maxPosition）。
 * @param fixedSlots 固定内容坑位
 * @param candidates 分类候选（已排除被固定资源、已去重、按可用排序）
 */
export function buildGroupBuyPreview(
  fixedSlots: FixedContentSlot[],
  candidates: PreviewCandidate[],
  maxPosition: number,
): PreviewCard[] {
  const fixedByPos = new Map<number, FixedContentSlot>()
  for (const s of fixedSlots) {
    if (s.status === 1 && !fixedByPos.has(s.position)) fixedByPos.set(s.position, s)
  }
  let cursor = 0
  const cards: PreviewCard[] = []
  for (let pos = 1; pos <= maxPosition; pos++) {
    const fixed = fixedByPos.get(pos)
    if (fixed) {
      cards.push({
        position: pos,
        kind: 'fixed',
        itemId: fixed.itemId,
        itemName: fixed.itemName,
        image: '📌',
      })
      continue
    }
    const cand = candidates[cursor]
    if (cand) {
      cursor += 1
      cards.push({
        position: pos,
        kind: 'category',
        itemId: cand.id,
        itemName: cand.name,
        image: cand.image,
        rating: cand.rating,
        monthlySales: cand.monthlySales,
        price: cand.price,
        originPrice: cand.originPrice,
        distance: cand.distance,
        deliveryTime: cand.deliveryTime,
      })
    } else {
      cards.push({ position: pos, kind: 'empty' })
    }
  }
  return cards
}

/** 统计预览中候选不足的空坑位数 */
export function countEmptySlots(cards: PreviewCard[]): number {
  return cards.filter(c => c.kind === 'empty').length
}
