import type { Scene } from './prototypeData'

export interface PreviewCard {
  id: string
  title: string
  store: string
  storeId: string
  channel: 'delivery' | 'market' | 'groupbuy'
  region: string
  terms: string[]
  price: number
  distance: number
  rating: string
  sales: number
  detail: string
  isAd?: boolean
}
const stores = ['星港漢堡', '南灣小廚', '海邊漢堡屋', '巷口輕食', '小島漢堡']
// 精选的界面样本集，名字、价格和位置均为虚构；不是 ES 检索或评分实现。
export const PREVIEW_CARDS: PreviewCard[] = ['澳門', '氹仔'].flatMap((region, r) => [
  ...stores.map((store, i): PreviewCard => ({
    id: `DEMO-D${r}${i}`, title: `${store}（${region}示例店）`, store: `${store}（${region}示例店）`, storeId: `DEMO-STORE-${r}${i}`,
    channel: 'delivery', region, terms: ['漢堡', '汉堡', 'burger', ...(i === 0 ? ['星港', '星港漢堡'] : [])],
    price: 32 + i * 3, distance: 0.6 + i * 0.3, rating: '4.8', sales: 600 - i * 70,
    detail: '招牌牛肉漢堡 · 配送約 25–35 分鐘 · 起送 MOP 25 · 配送費 MOP 4',
  })),
  ...['柔韌抽紙', '原生木漿紙巾', '便攜手帕紙', '家庭裝抽紙', '加厚廚房紙'].map((title, i): PreviewCard => ({
    id: `DEMO-M${r}${i}`, title, store: `海風生活超市 ${i + 1} 號示例店`, storeId: `DEMO-MARKET-${r}${i}`,
    channel: 'market', region, terms: ['紙巾', '纸巾'], price: 12 + i * 4, distance: 0.4 + i * 0.5, rating: '4.9', sales: 420 - i * 40,
    detail: '3 層 × 100 抽 × 6 包 · 有貨 · 約 30 分鐘送達',
  })),
  ...['海風雙人晚餐', '小島週末雙人餐', '南灣雙人下午茶', '街角雙人烤肉', '星港雙人套餐'].map((title, i): PreviewCard => ({
    id: `DEMO-G${r}${i}`, title, store: `小島餐廳 ${i + 1} 號示例店`, storeId: `DEMO-DEAL-${r}${i}`,
    channel: 'groupbuy', region, terms: ['雙人餐', '双人餐'], price: 98 + i * 20, distance: 0.8 + i * 0.4, rating: '4.7', sales: 280 - i * 30,
    detail: '雙人套餐 · 到店使用 · 需預約 · 未使用可退',
  })),
  { id: `DEMO-MB${r}`, title: '芝麻漢堡麵包', store: '海風超市示例店', storeId: `DEMO-MARKET-${r}0`, channel: 'market', region, terms: ['漢堡', '汉堡', 'burger'], price: 18, distance: 0.9, rating: '4.8', sales: 180, detail: '4 個裝 · 冷藏有貨 · 約 30 分鐘送達' },
  { id: `DEMO-GB${r}`, title: '漢堡雙人分享套餐', store: '小島餐廳示例店', storeId: `DEMO-DEAL-${r}0`, channel: 'groupbuy', region, terms: ['漢堡', '汉堡', 'burger'], price: 88, distance: 1.2, rating: '4.8', sales: 220, detail: '到店使用 · 需預約 · 未使用可退' },
  ...['招牌牛肉漢堡', '芝士雞肉漢堡', '雙層牛肉漢堡'].map((title, i): PreviewCard => ({
    id: `DEMO-IN${r}${i}`, title, store: `星港漢堡（${region}示例店）`, storeId: `DEMO-STORE-${r}0`, channel: 'delivery', region,
    terms: ['漢堡', '汉堡', 'burger'], price: 28 + i * 6, distance: 0.6, rating: '4.8', sales: 380 - i * 60, detail: '本店商品 · 即點即做 · 可選規格',
  })),
])
export type PreviewSort = 'relevance' | 'price' | 'distance' | 'sales'
export type DisplayState = 'results' | 'empty' | 'loading' | 'error' | 'partial' | 'guidance'
export interface PreviewContext { scene: Scene; region: string; query: string; sort: PreviewSort; showAds: boolean }

/** 只查询固定样本词，未覆盖的输入返回空样本，不能声称线上零结果。 */
export function getPreviewCards(context: PreviewContext): PreviewCard[] {
  const query = context.query.trim().toLowerCase()
  const rows = PREVIEW_CARDS.filter(card => card.region === context.region && card.terms.includes(query)
    && (context.scene === 'home' || context.scene === 'store' ? context.scene !== 'store' || card.id.startsWith('DEMO-IN') : card.channel === context.scene)
    && (context.scene === 'store' || !card.id.startsWith('DEMO-IN'))).map(card => ({ ...card }))
  if (context.sort !== 'relevance') {
    const sort = context.sort
    rows.sort((a, b) => sort === 'sales' ? b.sales - a.sales : a[sort] - b[sort])
  } else if (context.showAds && context.scene !== 'store' && rows.length >= 5) {
    // 仅演示第 5 个自然样例被提升到第 3 卡；不签发曝光标识或消费额度。
    const promoted = rows.splice(4, 1)[0]
    rows.splice(2, 0, { ...promoted, isAd: true })
  }
  return context.scene === 'home'
    ? (['delivery', 'market', 'groupbuy'] as const).flatMap(channel => rows.filter(row => row.channel === channel).slice(0, 4))
    : rows
}

/** 演示地图点位：与既有「搜索校验」页同源，仅用于实验室选点，不代表真实地理服务。 */
export interface DemoMapPoint {
  name: string
  lat: number
  lng: number
}
export const DEMO_MAP_POINTS: DemoMapPoint[] = [
  { name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 },
  { name: '大三巴牌坊', lat: 22.1956, lng: 113.5409 },
  { name: '威尼斯人度假村', lat: 22.1355, lng: 113.5645 },
  { name: '澳門大學', lat: 22.13, lng: 113.545 },
  { name: '珠海市拱北口岸', lat: 22.217, lng: 113.55 },
  { name: '橫琴口岸', lat: 22.12, lng: 113.54 },
  { name: '氹仔市中心', lat: 22.155, lng: 113.558 },
]

export interface DimensionSample {
  key: 'match' | 'business' | 'store' | 'user' | 'platform'
  weight: number
  maxScore: number
  score: number
}

/**
 * 维度得分的示例推导（方案 §18.3「取优」吸收项）。
 *
 * 刻意不做的事：这里**不是**排序算法，也不声称复现线上打分 —— 真实分数字段、
 * 相关分数与规则来源要等 B1 接 ES 后由服务端 explain 提供（见 LabPage「服務端解釋能力」）。
 * 刻意做的事：把 explain 视图的**结构**（维度/权重/满分/加权合计）先呈现给运营，
 * 分数由卡片既有展示字段线性推导，确定可复现，且界面统一标注「非線上算法」。
 * 用户维度只有在代入用户后才有示例值，避免暗示匿名请求也有个性化分。
 */
export function sampleDimensionScores(card: PreviewCard, hasUser: boolean): DimensionSample[] {
  const match = Math.min(400, Math.round(Number(card.rating) * 64))
  const business = Math.min(400, Math.round(card.sales / 2))
  const store = Math.max(0, Math.min(400, Math.round(400 - card.distance * 100)))
  const user = hasUser ? 120 : 0
  const platform = 60
  return [
    { key: 'match', weight: 32, maxScore: 400, score: match },
    { key: 'business', weight: 26, maxScore: 400, score: business },
    { key: 'store', weight: 22, maxScore: 400, score: store },
    { key: 'user', weight: 12, maxScore: 200, score: user },
    { key: 'platform', weight: 8, maxScore: 100, score: platform },
  ]
}

/** 加权合计：与各维度同一口径，仅用于示例展示。 */
export function weightedTotal(dims: DimensionSample[]): number {
  return dims.reduce((sum, d) => sum + Math.round(d.score * d.weight / 100), 0)
}
