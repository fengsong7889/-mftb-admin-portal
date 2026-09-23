import { describe, it, expect } from 'vitest'
import {
  mockListCategories, mockCandidatesByCategories, mockSearchItems, mockGetItemsByIds,
} from './waterfallCatalogMock'

describe('waterfallCatalogMock', () => {
  it('分类按内容类型隔离，门店分类与商品分类不串用', () => {
    const storeCats = mockListCategories('store')
    const productCats = mockListCategories('product')
    expect(storeCats.every(c => c.contentType === 'store')).toBe(true)
    expect(productCats.every(c => c.contentType === 'product')).toBe(true)
    const storeIds = new Set(storeCats.map(c => c.id))
    expect(productCats.some(c => storeIds.has(c.id))).toBe(false)
  })

  it('候选按分类并集去重、仅启用、排除已固定资源', () => {
    const all = mockCandidatesByCategories({ contentType: 'store', categoryIds: ['sc_hotpot'], limit: 50 })
    // 火鍋分类含一个失效门店 MD1004，应被过滤
    expect(all.some(i => i.id === 'MD1004')).toBe(false)
    const ids = all.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length) // 去重
    const excluded = mockCandidatesByCategories({ contentType: 'store', categoryIds: ['sc_hotpot'], excludeItemIds: ['MD1001'], limit: 50 })
    expect(excluded.some(i => i.id === 'MD1001')).toBe(false)
  })

  it('多分类并集覆盖各自资源且不重复', () => {
    const union = mockCandidatesByCategories({ contentType: 'store', categoryIds: ['sc_mr', 'sc_dessert'], limit: 50 })
    expect(union.some(i => i.categoryId === 'sc_mr')).toBe(true)
    expect(union.some(i => i.categoryId === 'sc_dessert')).toBe(true)
    const ids = union.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('品牌过滤生效', () => {
    const flash = mockCandidatesByCategories({ contentType: 'store', categoryIds: ['sc_hotpot'], brand: 'flashBee', limit: 50 })
    expect(flash.every(i => i.brand === 'flashBee')).toBe(true)
  })

  it('搜索分页返回 total 与当页记录', () => {
    const page1 = mockSearchItems({ contentType: 'product', page: 1, size: 2 })
    expect(page1.total).toBeGreaterThan(0)
    expect(page1.records.length).toBeLessThanOrEqual(2)
  })

  it('按 ID 回显忽略不存在与错误内容类型', () => {
    const items = mockGetItemsByIds('store', ['MD1001', 'NOT_EXIST'])
    expect(items.map(i => i.id)).toEqual(['MD1001'])
  })
})
