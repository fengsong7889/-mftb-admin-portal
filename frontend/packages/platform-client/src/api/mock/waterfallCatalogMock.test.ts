import { describe, it, expect } from 'vitest'
import {
  mockListCategories, mockCandidatesByCategories, mockSearchItems, mockGetItemsByIds, sortWaterfallCandidates,
  type MockCatalogItem,
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

  it('火锅分类整体排序在截取候选之前执行', () => {
    const base = { contentType: 'store' as const, brand: 'flashBee', categoryIds: ['sc_hotpot'], limit: 1 }
    expect(mockCandidatesByCategories({ ...base, sortMode: 'score' })[0].id).toBe('MD1002')
    expect(mockCandidatesByCategories({ ...base, sortMode: 'sales' })[0].id).toBe('MD1001')
    expect(mockCandidatesByCategories({ ...base, sortMode: 'distance' })[0].id).toBe('MD1001')
  })

  it('商品销量排序使用近30天销量而非门店销量', () => {
    const base: MockCatalogItem = { id: 'A', name: '商品', contentType: 'product', brand: 'flashBee', categoryId: 'pc_set', enabled: true }
    const items = [{ ...base, monthlySales: 10, sales: 1000 }, { ...base, id: 'B', monthlySales: 20, sales: 1 }]
    expect(sortWaterfallCandidates(items, 'sales').map(item => item.id)).toEqual(['B', 'A'])
    expect(items[0].id).toBe('A')
  })

  it('距离由近到远，缺失距离排最后；综合分不是用户评分', () => {
    const base: MockCatalogItem = { id: 'A', name: '门店', contentType: 'store', brand: 'flashBee', categoryId: 'sc_hotpot', enabled: true }
    const items = [{ ...base, score: 90, rating: 3 }, { ...base, id: 'B', distanceMeters: 200, score: 80, rating: 5 }, { ...base, id: 'C', distanceMeters: 100, score: 70 }]
    expect(sortWaterfallCandidates(items, 'distance').map(item => item.id)).toEqual(['C', 'B', 'A'])
    expect(sortWaterfallCandidates(items, 'score').map(item => item.id)).toEqual(['A', 'B', 'C'])
  })

  it('随机排序只打乱顺序，不重复或丢失候选', () => {
    const items = mockCandidatesByCategories({ contentType: 'store', categoryIds: ['sc_hotpot'] })
    const shuffled = sortWaterfallCandidates(items, 'random', () => 0)
    expect(shuffled.map(item => item.id).sort()).toEqual(items.map(item => item.id).sort())
    expect(shuffled.map(item => item.id)).not.toEqual(items.map(item => item.id))
  })

  it('超市目录按频道和品牌隔离，不混入团购内容', () => {
    const categories = mockListCategories('store', 'flashBee', 'supermarket')
    expect(categories.every(category => category.channel === 'supermarket')).toBe(true)
    const items = mockSearchItems({ channel: 'supermarket', contentType: 'product', brand: 'flashBee', page: 1, size: 50 }).records
    expect(items.map(item => item.id)).toEqual(['SP1001', 'SP1002'])
    expect(mockGetItemsByIds('product', ['GD9001', 'SP1001'], 'supermarket').map(item => item.id)).toEqual(['SP1001'])
    const candidates = mockCandidatesByCategories({ channel: 'supermarket', contentType: 'store', brand: 'flashBee', categoryIds: ['sm_sc_fresh', 'sm_sc_daily'], sortMode: 'sales' })
    expect(candidates.map(item => item.id)).toEqual(['SM1002', 'SM1001'])
  })

  it('按 ID 回显忽略不存在与错误内容类型', () => {
    const items = mockGetItemsByIds('store', ['MD1001', 'NOT_EXIST'])
    expect(items.map(i => i.id)).toEqual(['MD1001'])
  })
})
