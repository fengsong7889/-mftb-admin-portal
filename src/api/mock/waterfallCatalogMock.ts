/**
 * 瀑布流团购目录 Mock 数据源
 *
 * 门店、商品及分类最终来自外部业务系统，本期先内置假数据，通过 waterfallCatalog.ts
 * 适配层暴露统一的异步接口；接入真实接口后仅替换适配层实现，页面无需改动。
 *
 * 数据覆盖：两个品牌（flashBee / mFood）、门店与商品分类、长名称、空分类、失效资源等场景。
 */
import type { WaterfallContentType, WaterfallSortMode, WaterfallCatalogChannel } from '../../pages/waterfallConfig/types'

/** 分类（带所属内容类型，防止门店分类与商品分类串用） */
export interface MockCategory {
  id: string
  name: string
  contentType: WaterfallContentType
  channel?: WaterfallCatalogChannel
  parentId?: string | null
  brand?: string
}

/** 目录资源（门店或商品） */
export interface MockCatalogItem {
  id: string
  name: string
  contentType: WaterfallContentType
  channel?: WaterfallCatalogChannel
  brand: string
  categoryId: string
  /** 是否可用（false 表示已下线/失效，坑位选择器仍可回显但预览会补位） */
  enabled: boolean
  /** 预览辅助字段 */
  image?: string
  rating?: number
  score?: number
  sales?: number
  distanceMeters?: number
  monthlySales?: number
  price?: number
  originPrice?: number
  distance?: string
  deliveryTime?: string
}

/** 门店分类 */
const STORE_CATEGORIES: MockCategory[] = [
  { id: 'sc_hotpot', name: '火鍋', contentType: 'store' },
  { id: 'sc_mr', name: '茶餐廳', contentType: 'store' },
  { id: 'sc_dessert', name: '甜品', contentType: 'store' },
  { id: 'sc_west', name: '西餐', contentType: 'store' },
  { id: 'sc_jp', name: '日式料理', contentType: 'store' },
  { id: 'sc_empty', name: '空分類（示例）', contentType: 'store' },
]

/** 商品分类 */
const PRODUCT_CATEGORIES: MockCategory[] = [
  { id: 'pc_set', name: '套餐', contentType: 'product' },
  { id: 'pc_voucher', name: '代金券', contentType: 'product' },
  { id: 'pc_drink', name: '飲品', contentType: 'product' },
  { id: 'pc_buffet', name: '自助餐', contentType: 'product' },
]

const CATEGORIES: MockCategory[] = [...STORE_CATEGORIES, ...PRODUCT_CATEGORIES,
  { id: 'sm_sc_fresh', name: '生鮮超市', contentType: 'store', channel: 'supermarket' },
  { id: 'sm_sc_daily', name: '便利百貨', contentType: 'store', channel: 'supermarket' },
  { id: 'sm_pc_fruit', name: '水果蔬菜', contentType: 'product', channel: 'supermarket' },
  { id: 'sm_pc_daily', name: '日用百貨', contentType: 'product', channel: 'supermarket' },
]

/** 目录资源 */
const ITEMS: MockCatalogItem[] = [
  { id: 'SM1001', name: '閃蜂生鮮超市（示例）', contentType: 'store', channel: 'supermarket', brand: 'flashBee', categoryId: 'sm_sc_fresh', enabled: true, score: 95, sales: 3800, monthlySales: 800, distanceMeters: 500, image: '🛒' },
  { id: 'SM1002', name: '閃蜂便利百貨（示例）', contentType: 'store', channel: 'supermarket', brand: 'flashBee', categoryId: 'sm_sc_daily', enabled: true, score: 90, sales: 4200, monthlySales: 900, distanceMeters: 300, image: '🏪' },
  { id: 'SM1003', name: 'mFood 生鮮超市（示例）', contentType: 'store', channel: 'supermarket', brand: 'mFood', categoryId: 'sm_sc_fresh', enabled: true, score: 92, sales: 3600, distanceMeters: 800, image: '🛒' },
  { id: 'SP1001', name: '新鮮蘋果 1kg（示例）', contentType: 'product', channel: 'supermarket', brand: 'flashBee', categoryId: 'sm_pc_fruit', enabled: true, score: 94, monthlySales: 600, distanceMeters: 500, price: 28, image: '🍎' },
  { id: 'SP1002', name: '家庭裝紙巾（示例）', contentType: 'product', channel: 'supermarket', brand: 'flashBee', categoryId: 'sm_pc_daily', enabled: true, score: 88, monthlySales: 1200, distanceMeters: 300, price: 19, image: '🧻' },
  { id: 'SP1003', name: 'mFood 新鮮蔬菜（示例）', contentType: 'product', channel: 'supermarket', brand: 'mFood', categoryId: 'sm_pc_fruit', enabled: true, score: 91, monthlySales: 700, distanceMeters: 800, price: 15, image: '🥬' },
  // 火鍋門店
  { id: 'MD1001', name: '撈撈灰·徐州風味肉醬米線(南灣店)', contentType: 'store', brand: 'flashBee', categoryId: 'sc_hotpot', enabled: true, rating: 4.6, monthlySales: 1196, image: '🍲', distance: '720m', deliveryTime: '22分鐘' },
  { id: 'MD1002', name: '重慶老火鍋·澳門總店（氹仔區金牌性價比火鍋食店·澳門人最愛食的海鮮火鍋）', contentType: 'store', brand: 'flashBee', categoryId: 'sc_hotpot', enabled: true, rating: 4.8, monthlySales: 880, image: '🌶️', distance: '1.2km', deliveryTime: '30分鐘' },
  { id: 'MD1003', name: '海底擑火鍋(新馬路店)', contentType: 'store', brand: 'mFood', categoryId: 'sc_hotpot', enabled: true, rating: 4.7, monthlySales: 640, image: '🍲', distance: '900m', deliveryTime: '25分鐘' },
  { id: 'MD1004', name: '已下線火鍋店(失效示例)', contentType: 'store', brand: 'flashBee', categoryId: 'sc_hotpot', enabled: false, rating: 4.0, monthlySales: 0, image: '🍲' },
  // 茶餐廳
  { id: 'MD2001', name: '澳門茶餐廳(總店)', contentType: 'store', brand: 'flashBee', categoryId: 'sc_mr', enabled: true, rating: 4.5, monthlySales: 2100, image: '', distance: '500m', deliveryTime: '18分鐘' },
  { id: 'MD2002', name: '華嫂冰室·港式茶餐廳(高士德店)', contentType: 'store', brand: 'mFood', categoryId: 'sc_mr', enabled: true, rating: 4.4, monthlySales: 1500, image: '🍳', distance: '1.0km', deliveryTime: '24分鐘' },
  // 甜品
  { id: 'MD3001', name: '義順鮮奶(甜品·燉奶·雙皮奶·澳門老字號甜品站·氹仔店)', contentType: 'store', brand: 'flashBee', categoryId: 'sc_dessert', enabled: true, rating: 4.6, monthlySales: 900, image: '🍮', distance: '800m', deliveryTime: '20分鐘' },
  { id: 'MD3002', name: '馬介休甜品工坊', contentType: 'store', brand: 'mFood', categoryId: 'sc_dessert', enabled: true, rating: 4.3, monthlySales: 420, image: '🍨', distance: '1.5km', deliveryTime: '28分鐘' },
  // 西餐
  { id: 'MD4001', name: '全澳西餐銷量第1名·威尼斯西餐廳', contentType: 'store', brand: 'flashBee', categoryId: 'sc_west', enabled: true, rating: 4.9, monthlySales: 3200, image: '🍝', distance: '600m', deliveryTime: '26分鐘' },
  // 空分類無資源
  // 团购商品
  { id: 'GD9001', name: '【火鍋】雙人海鮮火鍋套餐（含飲品任選）', contentType: 'product', brand: 'flashBee', categoryId: 'pc_set', enabled: true, rating: 4.7, monthlySales: 560, price: 299, originPrice: 458, image: '🍲' },
  { id: 'GD9002', name: '【19店通用】100元代金券（新花城超級市場）【新】', contentType: 'product', brand: 'flashBee', categoryId: 'pc_voucher', enabled: true, monthlySales: 242, price: 97, originPrice: 100, image: '🎫' },
  { id: 'GD9003', name: '招牌暴打檸檬茶(中杯)', contentType: 'product', brand: 'mFood', categoryId: 'pc_drink', enabled: true, rating: 4.5, monthlySales: 1196, price: 26.1, originPrice: 29, image: '🧋' },
  { id: 'GD9004', name: '五星酒店自助晚餐·雙人套餐（含酒水暢飲·週末節假日通用·限時特惠搶購價）', contentType: 'product', brand: 'flashBee', categoryId: 'pc_buffet', enabled: true, rating: 4.8, monthlySales: 320, price: 599, originPrice: 899, image: '🍽️' },
  { id: 'GD9005', name: '【已下架】下午茶套餐(失效示例)', contentType: 'product', brand: 'flashBee', categoryId: 'pc_set', enabled: false, monthlySales: 0, price: 88, originPrice: 128, image: '🍰' },
  { id: 'GD9006', name: '烤糖粉粿奶茶(中杯)', contentType: 'product', brand: 'mFood', categoryId: 'pc_drink', enabled: true, rating: 4.6, monthlySales: 630, price: 26.1, originPrice: 29, image: '🧋' },
]

const CATEGORY_MAP = new Map(CATEGORIES.map(c => [c.id, c]))

/** 排序演示指标，仅用于 Mock 预览，综合分不以用户评分冒充；距离模拟同一个用户位置。 */
const MOCK_RANKING: Record<string, { score: number; sales?: number; distanceMeters: number }> = {
  MD1001: { score: 88, sales: 3200, distanceMeters: 720 },
  MD1002: { score: 96, sales: 2800, distanceMeters: 1200 },
  MD1003: { score: 90, sales: 1900, distanceMeters: 900 },
  MD2001: { score: 86, sales: 4800, distanceMeters: 500 },
  MD2002: { score: 84, sales: 3100, distanceMeters: 1000 },
  MD3001: { score: 91, sales: 2100, distanceMeters: 800 },
  MD3002: { score: 82, sales: 1200, distanceMeters: 1500 },
  MD4001: { score: 98, sales: 6500, distanceMeters: 600 },
  GD9001: { score: 95, distanceMeters: 720 },
  GD9002: { score: 89, distanceMeters: 1100 },
  GD9003: { score: 92, distanceMeters: 600 },
  GD9004: { score: 97, distanceMeters: 1800 },
  GD9006: { score: 90, distanceMeters: 800 },
}

export function sortWaterfallCandidates(items: MockCatalogItem[], sortMode: WaterfallSortMode, random = Math.random): MockCatalogItem[] {
  const sorted = [...items]
  if (sortMode === 'random') {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
    }
    return sorted
  }
  const value = (item: MockCatalogItem): number => {
    const metric = sortMode === 'score' ? item.score : sortMode === 'sales' ? (item.contentType === 'store' ? item.sales : item.monthlySales) : item.distanceMeters
    return metric != null && Number.isFinite(metric) ? metric : sortMode === 'distance' ? Infinity : -Infinity
  }
  return sorted.sort((a, b) => (sortMode === 'distance' ? value(a) - value(b) : value(b) - value(a)) || a.id.localeCompare(b.id))
}

/** 取分类（可按内容类型 / 品牌过滤；品牌为空的分类视为通用） */
export function mockListCategories(contentType: WaterfallContentType, brand?: string, channel: WaterfallCatalogChannel = 'groupBuy'): MockCategory[] {
  return CATEGORIES.filter(
    c => c.contentType === contentType && (c.channel ?? 'groupBuy') === channel && (!brand || !c.brand || c.brand === brand)
  )
}

/** 取分类名称 */
export function mockCategoryName(id: string): string | undefined {
  return CATEGORY_MAP.get(id)?.name
}

/** 分页搜索资源（按内容类型 / 品牌 / 分类 / 关键词） */
export function mockSearchItems(params: {
  contentType: WaterfallContentType
  brand?: string
  categoryId?: string
  keyword?: string
  channel?: WaterfallCatalogChannel
  page: number
  size: number
}): { records: MockCatalogItem[]; total: number } {
  let list = ITEMS.filter(i => i.contentType === params.contentType && (i.channel ?? 'groupBuy') === (params.channel ?? 'groupBuy'))
  if (params.brand) list = list.filter(i => i.brand === params.brand)
  if (params.categoryId) list = list.filter(i => i.categoryId === params.categoryId)
  if (params.keyword) {
    const kw = params.keyword.toLowerCase()
    list = list.filter(i => i.id.toLowerCase().includes(kw) || i.name.toLowerCase().includes(kw))
  }
  const start = (params.page - 1) * params.size
  return { records: list.slice(start, start + params.size), total: list.length }
}

/** 按 ID 回显 */
export function mockGetItemsByIds(contentType: WaterfallContentType, ids: string[], channel: WaterfallCatalogChannel = 'groupBuy'): MockCatalogItem[] {
  const set = new Set(ids)
  return ITEMS.filter(i => i.contentType === contentType && (i.channel ?? 'groupBuy') === channel && set.has(i.id))
}

/**
 * 按分类并集取候选（父分类含子分类、跨分类去重、排除已固定资源）。
 * 仅返回启用资源，用于团购预览补位。
 */
export function mockCandidatesByCategories(params: {
  contentType: WaterfallContentType
  brand?: string
  categoryIds: string[]
  excludeItemIds?: string[]
  sortMode?: WaterfallSortMode
  channel?: WaterfallCatalogChannel
  limit?: number
}): MockCatalogItem[] {
  const catSet = new Set(params.categoryIds)
  // 收集父分类 + 子分类
  const matchedCatIds = new Set<string>()
  for (const c of CATEGORIES) {
    if (catSet.has(c.id)) matchedCatIds.add(c.id)
    if (c.parentId && catSet.has(c.parentId)) matchedCatIds.add(c.id)
  }
  const exclude = new Set(params.excludeItemIds ?? [])
  const seen = new Set<string>()
  const result: MockCatalogItem[] = []
  for (const i of ITEMS) {
    if (i.contentType !== params.contentType || (i.channel ?? 'groupBuy') !== (params.channel ?? 'groupBuy')) continue
    if (params.brand && i.brand !== params.brand) continue
    if (!matchedCatIds.has(i.categoryId)) continue
    if (!i.enabled) continue
    if (exclude.has(i.id)) continue
    if (seen.has(i.id)) continue
    seen.add(i.id)
    result.push({ ...i, ...MOCK_RANKING[i.id] })
  }
  const sorted = sortWaterfallCandidates(result, params.sortMode ?? 'score')
  return params.limit ? sorted.slice(0, params.limit) : sorted
}
