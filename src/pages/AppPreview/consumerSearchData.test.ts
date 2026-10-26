/**
 * 用户端搜索数据层门禁
 *
 * 这 5 个搜索入口的全部差异都收敛在 scope 上：一旦 scopeEntries 或过滤条件写错，
 * 外卖页就会搜出超市商品、店内搜索会串到别家店，且界面上看不出「错在哪」。
 * 因此这里按「作用域隔离 → 关键词归一 → Tab/筛选/排序 → 联想 → 历史」逐层钉住契约。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearHistory,
  countByTab,
  formatMoney,
  getMerchant,
  getStoreCategories,
  getStoreOffers,
  loadHistory,
  normalizeQuery,
  pushHistory,
  scopeEntries,
  searchCatalog,
  sortEntries,
  suggestFor,
  type SearchEntry,
} from './consumerSearchData'

function merchantOf(entry: SearchEntry) {
  return entry.kind === 'merchant' ? entry : getMerchant(entry.merchantId)
}

function tagsOf(entry: SearchEntry): string[] {
  if (entry.kind === 'merchant') return entry.tags
  return [...entry.tags, ...(merchantOf(entry)?.tags ?? [])]
}

function distanceOf(entry: SearchEntry): number {
  return entry.kind === 'merchant' ? entry.distanceKm : merchantOf(entry)?.distanceKm ?? Number.POSITIVE_INFINITY
}

function salesOf(entry: SearchEntry): number {
  if (entry.kind === 'merchant' || entry.kind === 'product') return entry.monthlySales
  return entry.sold
}

function priceOf(entry: SearchEntry): number {
  return entry.kind === 'merchant' ? entry.minOrder ?? 0 : entry.price
}

function isSorted<T>(values: T[], compare: (a: T, b: T) => boolean): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1], value))
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('作用域隔离', () => {
  it('纸巾只属于超市，外卖/团购/店内都搜不到', () => {
    expect(searchCatalog('delivery', '紙巾')).toHaveLength(0)
    expect(searchCatalog('groupbuy', '紙巾')).toHaveLength(0)
    expect(searchCatalog('store', '紙巾', { merchantId: 'd-tai2' })).toHaveLength(0)

    const market = searchCatalog('market', '紙巾')
    expect(market.length).toBeGreaterThan(0)
    expect(market.every((entry) => entry.channel === 'market')).toBe(true)
  })

  it('全站搜索可跨三个频道命中，且结果仍带各自频道标记', () => {
    const results = searchCatalog('global', '紙巾')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((entry) => entry.channel === 'market')).toBe(true)

    const channels = new Set(results.map((entry) => entry.channel))
    expect([...channels]).toEqual(['market'])
  })

  it('店内搜索只返回本店 SKU，不跨店也不跨频道', () => {
    const offers = searchCatalog('store', '', { merchantId: 'd-tai2' })
    expect(offers).toHaveLength(getStoreOffers('d-tai2').length)
    expect(offers.every((entry) => entry.kind === 'product' && entry.merchantId === 'd-tai2')).toBe(true)
    expect(searchCatalog('store', '麥當勞', { merchantId: 'd-tai2' })).toHaveLength(0)
    expect(searchCatalog('store', '', { merchantId: 'missing' })).toHaveLength(0)
  })

  it('店内分类由本店商品去重得出', () => {
    expect(getStoreCategories('d-tai2')).toEqual(['酸菜魚', '甜品'])
  })
})

describe('关键词归一化', () => {
  it('简体、别名与大小写归一到目录用词', () => {
    expect(normalizeQuery('麦当劳')).toBe('麥當勞')
    expect(normalizeQuery('  柠檬茶  ')).toBe('檸檬茶')
    expect(normalizeQuery('KFC')).toBe('kfc')
  })

  it('外卖页用简体关键词也能命中繁体目录', () => {
    const results = searchCatalog('delivery', '酸菜鱼')
    expect(results.some((entry) => entry.id === 'd-tai2')).toBe(true)
    expect(results.some((entry) => entry.id === 'p-tai2-1')).toBe(true)
  })

  it('同义词「麦当劳」可同时命中商家与其商品', () => {
    const results = searchCatalog('global', '麦当劳')
    expect(results.some((entry) => entry.kind === 'merchant' && entry.id === 'd-mcd')).toBe(true)
    expect(results.filter((entry) => entry.kind === 'product')).toHaveLength(2)
    expect(results.every((entry) => entry.channel === 'delivery')).toBe(true)
  })
})

describe('Tab 计数与筛选', () => {
  it('外卖 Tab 计数与目录总量、商家/商品拆分一致', () => {
    const counts = countByTab('delivery', '')
    expect(counts.all).toBe(scopeEntries('delivery').length)
    expect(counts.merchant + counts.product).toBe(counts.all)
  })

  it('全站频道 Tab 计数之和等于综合结果数', () => {
    const counts = countByTab('global', '')
    expect(counts.delivery + counts.groupbuy + counts.market).toBe(counts.all)
  })

  it('免配送费筛选对商家和其商品同时生效', () => {
    const results = searchCatalog('delivery', '', { filters: ['freeDelivery'] })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((entry) => merchantOf(entry)?.deliveryFee === 0)).toBe(true)
  })

  it('有优惠筛选在超市覆盖全部商品与带券商家', () => {
    const results = searchCatalog('market', '', { filters: ['discount'] })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((entry) => (
      entry.kind === 'merchant'
        ? entry.coupons.length > 0
        : Boolean(entry.originPrice && entry.originPrice > entry.price)
    ))).toBe(true)
  })

  it('随时退筛选会合并商家标签判定', () => {
    const results = searchCatalog('groupbuy', '', { filters: ['refundable'] })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((entry) => tagsOf(entry).includes('隨時退'))).toBe(true)
  })
})

describe('排序', () => {
  it('距离、销量、价格、配送费四种排序方向正确', () => {
    const delivery = scopeEntries('delivery')

    const byDistance = sortEntries(delivery, 'distance')
    expect(isSorted(byDistance.map(distanceOf), (a, b) => a <= b)).toBe(true)

    const bySales = sortEntries(delivery, 'sales')
    expect(isSorted(bySales.map(salesOf), (a, b) => a >= b)).toBe(true)

    const byPrice = sortEntries(delivery, 'priceAsc')
    expect(isSorted(byPrice.map(priceOf), (a, b) => a <= b)).toBe(true)

    const byFee = sortEntries(delivery, 'deliveryFee')
    expect(isSorted(byFee.map((entry) => merchantOf(entry)?.deliveryFee ?? 0), (a, b) => a <= b)).toBe(true)
  })

  it('综合排序让商家排在商品与团购之前', () => {
    const sorted = sortEntries(scopeEntries('global'), 'default')
    const firstOffer = sorted.findIndex((entry) => entry.kind !== 'merchant')
    const lastMerchant = sorted.map((entry) => entry.kind).lastIndexOf('merchant')
    expect(firstOffer).toBeGreaterThan(lastMerchant)
  })
})

describe('输入联想', () => {
  it('商家名优先联想，并标注类型', () => {
    const suggestions = suggestFor('global', '麥當勞')
    expect(suggestions[0].type).toBe('merchant')
    expect(suggestions[0].text).toContain('麥當勞')
  })

  it('联想范围跟随作用域，不会带出其它频道或别家店的词', () => {
    const market = suggestFor('market', '紙巾')
    expect(market.map((item) => item.text)).toContain('抽取式紙巾')
    expect(market.every((item) => item.text !== '麥辣雞腿堡套餐')).toBe(true)

    const store = suggestFor('store', '酸菜魚', 'd-tai2')
    expect(store.length).toBeGreaterThan(0)
    expect(store.every((item) => !item.text.includes('麥當勞'))).toBe(true)
  })

  it('空关键词不返回联想', () => {
    expect(suggestFor('global', '   ')).toEqual([])
  })
})

describe('搜索历史', () => {
  it('按作用域独立存储，店内再按商家拆分', () => {
    pushHistory('delivery', '珍珠奶茶')
    pushHistory('groupbuy', '火鍋')
    pushHistory('store', '漢堡', 'd-mcd')
    pushHistory('store', '米飯糰', 'd-rice')

    expect(loadHistory('delivery')).toEqual(['珍珠奶茶'])
    expect(loadHistory('groupbuy')).toEqual(['火鍋'])
    expect(loadHistory('store', 'd-mcd')).toEqual(['漢堡'])
    expect(loadHistory('store', 'd-rice')).toEqual(['米飯糰'])
  })

  it('重复关键词前置去重，最多保留 10 条', () => {
    pushHistory('delivery', 'A')
    pushHistory('delivery', 'B')
    pushHistory('delivery', 'A')
    expect(loadHistory('delivery')).toEqual(['A', 'B'])

    for (let index = 1; index <= 12; index += 1) {
      pushHistory('delivery', `词${index}`)
    }
    const history = loadHistory('delivery')
    expect(history).toHaveLength(10)
    expect(history[0]).toBe('词12')
  })

  it('清空只影响当前作用域', () => {
    pushHistory('delivery', '珍珠奶茶')
    pushHistory('groupbuy', '火鍋')
    clearHistory('delivery')

    expect(loadHistory('delivery')).toEqual([])
    expect(loadHistory('groupbuy')).toEqual(['火鍋'])
  })

  it('空白关键词不写历史', () => {
    pushHistory('delivery', '   ')
    expect(loadHistory('delivery')).toEqual([])
  })
})

describe('金额格式', () => {
  it('整数不留小数，非整数保留一位', () => {
    expect(formatMoney(12)).toBe('12')
    expect(formatMoney(18.8)).toBe('18.8')
    expect(formatMoney(19.9)).toBe('19.9')
  })
})
