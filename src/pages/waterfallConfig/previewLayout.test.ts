import { describe, it, expect } from 'vitest'
import { toPreviewRows, buildGroupBuyPreview, countEmptySlots, type PreviewCandidate } from './previewLayout'
import type { FixedContentSlot } from './types'

const cand = (id: string, name: string): PreviewCandidate => ({ id, name })

describe('toPreviewRows', () => {
  it('单列：每个元素独占一行', () => {
    expect(toPreviewRows([1, 2, 3], 1)).toEqual([[1], [2], [3]])
  })
  it('双列：左到右、上到下，末行可不满', () => {
    expect(toPreviewRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})

describe('buildGroupBuyPreview', () => {
  const fixed: FixedContentSlot[] = [
    { position: 1, contentType: 'store', itemId: 'A', itemName: '门店A', status: 1 },
    { position: 5, contentType: 'store', itemId: 'B', itemName: '门店B', status: 1 },
  ]

  it('固定内容优先占位，其余坑位由分类候选补位', () => {
    const cards = buildGroupBuyPreview(fixed, [cand('C', '门店C'), cand('D', '门店D')], 5)
    expect(cards.map(c => c.kind)).toEqual(['fixed', 'category', 'category', 'empty', 'fixed'])
    expect(cards[0].itemId).toBe('A')
    expect(cards[4].itemId).toBe('B')
  })

  it('停用固定坑位不占位，由候选补位', () => {
    const withDisabled: FixedContentSlot[] = [
      { position: 1, contentType: 'store', itemId: 'A', itemName: '门店A', status: 2 },
    ]
    const cards = buildGroupBuyPreview(withDisabled, [cand('C', '门店C')], 2)
    expect(cards[0].kind).toBe('category')
    expect(cards[0].itemId).toBe('C')
  })

  it('候选不足时标记空坑位，不重复填满', () => {
    const cards = buildGroupBuyPreview([], [cand('C', '门店C')], 4)
    expect(countEmptySlots(cards)).toBe(3)
  })

  it('同一位置多条固定只取第一条，避免重复占位', () => {
    const dup: FixedContentSlot[] = [
      { position: 2, contentType: 'store', itemId: 'X', itemName: 'X', status: 1 },
      { position: 2, contentType: 'store', itemId: 'Y', itemName: 'Y', status: 1 },
    ]
    const cards = buildGroupBuyPreview(dup, [], 2)
    expect(cards[1].itemId).toBe('X')
  })
})
