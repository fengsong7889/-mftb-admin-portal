/**
 * 用户端 APP · 搜索目录与作用域检索引擎（纯前端原型）
 *
 * 设计口径见 docs/design/用户端搜索体验设计_2026-10-26.md：
 * - 5 个作用域：global / delivery / groupbuy / market / store；
 * - 首页全站搜命中三个频道的商家与商品，频道页只搜本频道，店铺页只搜本店；
 * - 结果卡片只保留「可比较」字段（评分、月售、时效、距离、履约门槛、优惠）。
 *
 * 数据为原型 Mock，字段与生产接口建议一一对应；接入后端时只需替换 searchCatalog 的数据源。
 */
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'

export type ConsumerChannel = 'delivery' | 'groupbuy' | 'market'
export type SearchScope = 'global' | ConsumerChannel | 'store'

/** 结果页 Tab：全站用频道 Tab；频道内用对象类型 Tab；店铺内不展示 Tab */
export type SearchTab = 'all' | 'merchant' | 'product' | 'deal' | ConsumerChannel
export type SearchSort = 'default' | 'distance' | 'sales' | 'priceAsc' | 'priceDesc' | 'deliveryFee'
export type SearchFilter = 'freeDelivery' | 'discount' | 'open' | 'pickup' | 'refundable' | 'member'

export interface SearchMerchant {
  kind: 'merchant'
  id: string
  name: string
  channel: ConsumerChannel
  image?: string
  emoji: string
  rating: number
  monthlySales: number
  distanceKm: number
  /** 外卖 / 超市的履约信息；团购商家为空 */
  deliveryMinutes?: number
  deliveryFee?: number
  minOrder?: number
  groupbuyCount?: number
  avgPrice?: number
  coupons: string[]
  tags: string[]
  categories: string[]
  status: 'open' | 'rest' | 'new'
}

export interface SearchProduct {
  kind: 'product'
  id: string
  name: string
  channel: 'delivery' | 'market'
  merchantId: string
  merchantName: string
  image?: string
  emoji: string
  price: number
  originPrice?: number
  monthlySales: number
  spec: string
  category: string
  tags: string[]
}

export interface SearchDeal {
  kind: 'deal'
  id: string
  title: string
  channel: 'groupbuy'
  merchantId: string
  merchantName: string
  image?: string
  emoji: string
  price: number
  originPrice: number
  sold: number
  rating: number
  distanceKm: number
  category: string
  tags: string[]
}

export type SearchOffer = SearchProduct | SearchDeal
export type SearchEntry = SearchMerchant | SearchOffer

export const CHANNEL_LABEL: Record<ConsumerChannel, string> = {
  delivery: '外賣',
  groupbuy: '團購',
  market: '超市',
}

interface TabConfig {
  key: SearchTab
  label: string
}

interface SortConfig {
  key: SearchSort
  label: string
}

export interface ScopeConfig {
  label: string
  short: string
  placeholder: string
  hint: string
  channels: ConsumerChannel[]
  tabs: TabConfig[]
  sorts: SortConfig[]
  filters: SearchFilter[]
}

export const FILTER_LABEL: Record<SearchFilter, string> = {
  freeDelivery: '免配送費',
  discount: '有優惠',
  open: '營業中',
  pickup: '可自取',
  refundable: '隨時退',
  member: '神會員',
}

const ALL_CHANNELS: ConsumerChannel[] = ['delivery', 'groupbuy', 'market']

export const SCOPE_CONFIG: Record<SearchScope, ScopeConfig> = {
  global: {
    label: '全站',
    short: '全站',
    placeholder: '搜尋商家、商品、團購',
    hint: '可搜尋外賣、團購、超市的商家與商品',
    channels: ALL_CHANNELS,
    tabs: [
      { key: 'all', label: '綜合' },
      { key: 'delivery', label: '外賣' },
      { key: 'groupbuy', label: '團購' },
      { key: 'market', label: '超市' },
    ],
    sorts: [
      { key: 'default', label: '綜合排序' },
      { key: 'distance', label: '距離' },
      { key: 'sales', label: '銷量' },
    ],
    filters: ['freeDelivery', 'discount', 'open', 'refundable', 'member'],
  },
  delivery: {
    label: '美食外賣',
    short: '外賣',
    placeholder: '搜尋外賣商家、商品',
    hint: '僅搜尋美食外賣頻道的商家與商品',
    channels: ['delivery'],
    tabs: [
      { key: 'all', label: '綜合' },
      { key: 'merchant', label: '商家' },
      { key: 'product', label: '商品' },
    ],
    sorts: [
      { key: 'default', label: '綜合排序' },
      { key: 'distance', label: '距離' },
      { key: 'sales', label: '銷量' },
      { key: 'deliveryFee', label: '配送費' },
    ],
    filters: ['freeDelivery', 'discount', 'open', 'pickup'],
  },
  groupbuy: {
    label: '特價團購',
    short: '團購',
    placeholder: '搜尋團購套餐、商家',
    hint: '僅搜尋特價團購頻道的套餐與商家',
    channels: ['groupbuy'],
    tabs: [
      { key: 'all', label: '綜合' },
      { key: 'deal', label: '團購套餐' },
      { key: 'merchant', label: '商家' },
    ],
    sorts: [
      { key: 'default', label: '綜合排序' },
      { key: 'sales', label: '銷量' },
      { key: 'distance', label: '距離' },
      { key: 'priceAsc', label: '價格' },
    ],
    filters: ['refundable', 'discount'],
  },
  market: {
    label: '超市百貨',
    short: '超市',
    placeholder: '搜尋超市商品、商家',
    hint: '僅搜尋超市百貨頻道的商家與商品',
    channels: ['market'],
    tabs: [
      { key: 'all', label: '綜合' },
      { key: 'merchant', label: '商家' },
      { key: 'product', label: '商品' },
    ],
    sorts: [
      { key: 'default', label: '綜合排序' },
      { key: 'distance', label: '距離' },
      { key: 'sales', label: '銷量' },
      { key: 'priceAsc', label: '價格' },
    ],
    filters: ['freeDelivery', 'discount', 'open', 'pickup'],
  },
  store: {
    label: '店內',
    short: '店內',
    placeholder: '搜尋店內商品',
    hint: '僅搜尋本店商品，不跨店',
    channels: ALL_CHANNELS,
    tabs: [{ key: 'all', label: '全部' }],
    sorts: [
      { key: 'default', label: '綜合' },
      { key: 'sales', label: '銷量' },
      { key: 'priceAsc', label: '價格' },
    ],
    filters: ['discount'],
  },
}

export const SEARCH_MERCHANTS: SearchMerchant[] = [
  {
    kind: 'merchant', id: 'd-tai2', name: '太二酸菜魚（澳門店）', channel: 'delivery', image: fishPotImg, emoji: '🐟',
    rating: 4.5, monthlySales: 1196, distanceKm: 1.2, deliveryMinutes: 30, deliveryFee: 0, minOrder: 30,
    coupons: ['125減50', '80減20'], tags: ['神會員', '免配送費', '可自取'], categories: ['酸菜魚', '川菜', '中餐'], status: 'open',
  },
  {
    kind: 'merchant', id: 'd-rice', name: '米飯糰（威尼斯人店）', channel: 'delivery', image: riceballImg, emoji: '🍙',
    rating: 4.6, monthlySales: 860, distanceKm: 0.9, deliveryMinutes: 20, deliveryFee: 3, minOrder: 20,
    coupons: ['新客減10'], tags: ['可自取'], categories: ['飯糰', '日式', '早餐'], status: 'open',
  },
  {
    kind: 'merchant', id: 'd-mcd', name: '麥當勞（威尼斯人店）', channel: 'delivery', image: burgerImg, emoji: '🍔',
    rating: 4.5, monthlySales: 1896, distanceKm: 0.8, deliveryMinutes: 25, deliveryFee: 5, minOrder: 20,
    coupons: ['滿50減8'], tags: ['神會員'], categories: ['漢堡', '炸雞', '快餐'], status: 'new',
  },
  {
    kind: 'merchant', id: 'd-kfc', name: '肯德基KFC（氹仔店）', channel: 'delivery', image: friedChickenImg, emoji: '🍗',
    rating: 4.4, monthlySales: 980, distanceKm: 1.8, deliveryMinutes: 30, deliveryFee: 6, minOrder: 25,
    coupons: ['88折'], tags: ['可自取'], categories: ['炸雞', '漢堡', '快餐'], status: 'open',
  },
  {
    kind: 'merchant', id: 'd-lemon', name: '招牌暴打檸檬茶（黑沙環店）', channel: 'delivery', image: lemonTeaImg, emoji: '🍋',
    rating: 4.6, monthlySales: 2400, distanceKm: 1.5, deliveryMinutes: 20, deliveryFee: 0, minOrder: 15,
    coupons: ['$9.9起', '第二杯半價'], tags: ['神會員', '免配送費'], categories: ['飲品', '奶茶', '檸檬茶'], status: 'open',
  },
  {
    kind: 'merchant', id: 'd-organic', name: 'Organic Garden（氹仔店）', channel: 'delivery', image: burgerImg, emoji: '🥗',
    rating: 4.7, monthlySales: 620, distanceKm: 2.5, deliveryMinutes: 35, deliveryFee: 8, minOrder: 40,
    coupons: [], tags: ['健康輕食'], categories: ['輕食', '沙拉', '西餐'], status: 'open',
  },
  {
    kind: 'merchant', id: 'd-sushi', name: '鮨山日本料理（葡京店）', channel: 'delivery', image: fishPotImg, emoji: '🍣',
    rating: 4.8, monthlySales: 430, distanceKm: 2.1, deliveryMinutes: 40, deliveryFee: 10, minOrder: 80,
    coupons: [], tags: ['可自取'], categories: ['日料', '壽司', '刺身'], status: 'rest',
  },
  {
    kind: 'merchant', id: 'd-hotpot', name: '海底撈火鍋（澳門店）', channel: 'delivery', image: fishPotImg, emoji: '🍲',
    rating: 4.9, monthlySales: 1500, distanceKm: 1.9, deliveryMinutes: 35, deliveryFee: 0, minOrder: 60,
    coupons: ['滿200減30'], tags: ['神會員', '免配送費'], categories: ['火鍋', '川菜'], status: 'open',
  },
  {
    kind: 'merchant', id: 'g-pizza', name: 'Pizza Lab西塔烤肉（威尼斯人店）', channel: 'groupbuy', image: bbqImg, emoji: '🍕',
    rating: 4.6, monthlySales: 650, distanceKm: 1.5, groupbuyCount: 12, avgPrice: 88,
    coupons: ['2人套餐'], tags: ['隨時退', '免預約'], categories: ['烤肉', '西餐'], status: 'open',
  },
  {
    kind: 'merchant', id: 'g-kfc', name: '肯德基KFC（澳門店）', channel: 'groupbuy', image: friedChickenImg, emoji: '🍗',
    rating: 4.4, monthlySales: 1200, distanceKm: 1.1, groupbuyCount: 8, avgPrice: 45,
    coupons: ['59.9套餐'], tags: ['隨時退'], categories: ['炸雞', '快餐'], status: 'open',
  },
  {
    kind: 'merchant', id: 'g-hotpot', name: '海底撈火鍋（澳門店）', channel: 'groupbuy', image: fishPotImg, emoji: '🍲',
    rating: 4.9, monthlySales: 3000, distanceKm: 1.9, groupbuyCount: 6, avgPrice: 168,
    coupons: ['代金券'], tags: ['隨時退', '免預約'], categories: ['火鍋', '川菜'], status: 'open',
  },
  {
    kind: 'merchant', id: 'g-spa', name: '悅SPA按摩（皇朝店）', channel: 'groupbuy', image: lemonTeaImg, emoji: '💆',
    rating: 4.7, monthlySales: 210, distanceKm: 2.4, groupbuyCount: 5, avgPrice: 128,
    coupons: ['60分鐘按摩'], tags: ['隨時退', '免預約'], categories: ['美容美髮', '按摩', '生活服務'], status: 'open',
  },
  {
    kind: 'merchant', id: 'g-buffet', name: '澳門銀河自助餐', channel: 'groupbuy', image: bbqImg, emoji: '🍽️',
    rating: 4.8, monthlySales: 180, distanceKm: 3.2, groupbuyCount: 4, avgPrice: 298,
    coupons: ['2人同行'], tags: ['免預約'], categories: ['自助餐', '酒店餐飲'], status: 'open',
  },
  {
    kind: 'merchant', id: 'g-sushi', name: '鮨山日本料理（葡京店）', channel: 'groupbuy', image: fishPotImg, emoji: '🍣',
    rating: 4.8, monthlySales: 160, distanceKm: 2.1, groupbuyCount: 3, avgPrice: 388,
    coupons: ['雙人Omakase'], tags: ['免預約'], categories: ['日料', '壽司'], status: 'open',
  },
  {
    kind: 'merchant', id: 'm-donki', name: 'DONKI驚安之殿堂（澳門店）', channel: 'market', image: undefined, emoji: '🛒',
    rating: 4.7, monthlySales: 3200, distanceKm: 1.6, deliveryMinutes: 45, deliveryFee: 10, minOrder: 99,
    coupons: ['滿199減20'], tags: ['可自取'], categories: ['超市', '零食', '日用品'], status: 'open',
  },
  {
    kind: 'merchant', id: 'm-taste', name: 'Taste超市（氹仔店）', channel: 'market', image: undefined, emoji: '🥬',
    rating: 4.5, monthlySales: 2100, distanceKm: 1.2, deliveryMinutes: 30, deliveryFee: 0, minOrder: 50,
    coupons: ['滿99免運'], tags: ['免配送費', '可自取'], categories: ['超市', '生鮮', '糧油'], status: 'open',
  },
  {
    kind: 'merchant', id: 'm-7eleven', name: '7-Eleven（新口岸店）', channel: 'market', image: undefined, emoji: '🏪',
    rating: 4.3, monthlySales: 1680, distanceKm: 0.6, deliveryMinutes: 20, deliveryFee: 5, minOrder: 30,
    coupons: [], tags: [], categories: ['便利店', '飲料', '零食'], status: 'open',
  },
  {
    kind: 'merchant', id: 'm-fresh', name: '鮮果薈（黑沙環店）', channel: 'market', image: undefined, emoji: '🍓',
    rating: 4.6, monthlySales: 960, distanceKm: 1.4, deliveryMinutes: 25, deliveryFee: 0, minOrder: 40,
    coupons: ['滿60減5'], tags: ['免配送費', '可自取'], categories: ['水果', '生鮮'], status: 'open',
  },
]

export const SEARCH_PRODUCTS: SearchProduct[] = [
  // 外賣
  { kind: 'product', id: 'p-tai2-1', name: '太二酸菜魚（2人份）', channel: 'delivery', merchantId: 'd-tai2', merchantName: '太二酸菜魚（澳門店）', image: fishPotImg, emoji: '🐟', price: 198, originPrice: 258, monthlySales: 650, spec: '2人份', category: '酸菜魚', tags: ['特價'] },
  { kind: 'product', id: 'p-tai2-2', name: '太二酸菜魚（4人份）', channel: 'delivery', merchantId: 'd-tai2', merchantName: '太二酸菜魚（澳門店）', image: fishPotImg, emoji: '🐟', price: 328, originPrice: 398, monthlySales: 210, spec: '4人份', category: '酸菜魚', tags: ['特價'] },
  { kind: 'product', id: 'p-tai2-3', name: '紅糖冰粉', channel: 'delivery', merchantId: 'd-tai2', merchantName: '太二酸菜魚（澳門店）', image: riceballImg, emoji: '🍧', price: 12, originPrice: 18, monthlySales: 430, spec: '1份', category: '甜品', tags: ['優惠'] },
  { kind: 'product', id: 'p-rice-1', name: '米飯糰 招牌滷肉', channel: 'delivery', merchantId: 'd-rice', merchantName: '米飯糰（威尼斯人店）', image: riceballImg, emoji: '🍙', price: 18.8, originPrice: 25, monthlySales: 320, spec: '1個', category: '飯糰', tags: ['人氣'] },
  { kind: 'product', id: 'p-rice-2', name: '米飯糰 鰻魚玉子', channel: 'delivery', merchantId: 'd-rice', merchantName: '米飯糰（威尼斯人店）', image: riceballImg, emoji: '🍙', price: 22, originPrice: 28, monthlySales: 260, spec: '1個', category: '飯糰', tags: [] },
  { kind: 'product', id: 'p-rice-3', name: '米飯糰 照燒雞', channel: 'delivery', merchantId: 'd-rice', merchantName: '米飯糰（威尼斯人店）', image: riceballImg, emoji: '🍙', price: 19.9, originPrice: 26, monthlySales: 240, spec: '1個', category: '飯糰', tags: ['優惠'] },
  { kind: 'product', id: 'p-mcd-1', name: '麥辣雞腿堡套餐', channel: 'delivery', merchantId: 'd-mcd', merchantName: '麥當勞（威尼斯人店）', image: burgerImg, emoji: '🍔', price: 39.9, originPrice: 56, monthlySales: 1580, spec: '漢堡+薯條+飲料', category: '漢堡', tags: ['特價'] },
  { kind: 'product', id: 'p-mcd-2', name: '麥辣雞翅（2件）', channel: 'delivery', merchantId: 'd-mcd', merchantName: '麥當勞（威尼斯人店）', image: friedChickenImg, emoji: '🍗', price: 12, originPrice: 16, monthlySales: 980, spec: '2件', category: '炸雞', tags: [] },
  { kind: 'product', id: 'p-kfc-1', name: '香辣雞腿堡套餐', channel: 'delivery', merchantId: 'd-kfc', merchantName: '肯德基KFC（氹仔店）', image: friedChickenImg, emoji: '🍔', price: 9.9, originPrice: 29.9, monthlySales: 760, spec: '1人份', category: '漢堡', tags: ['特價', '優惠'] },
  { kind: 'product', id: 'p-kfc-2', name: '肯德基全家桶', channel: 'delivery', merchantId: 'd-kfc', merchantName: '肯德基KFC（氹仔店）', image: friedChickenImg, emoji: '🍗', price: 99, originPrice: 139, monthlySales: 320, spec: '5人份', category: '炸雞', tags: [] },
  { kind: 'product', id: 'p-lemon-1', name: '招牌暴打檸檬茶', channel: 'delivery', merchantId: 'd-lemon', merchantName: '招牌暴打檸檬茶（黑沙環店）', image: lemonTeaImg, emoji: '🍋', price: 9.9, originPrice: 19.9, monthlySales: 1980, spec: '500ml', category: '檸檬茶', tags: ['人氣', '優惠'] },
  { kind: 'product', id: 'p-lemon-2', name: '珍珠奶茶', channel: 'delivery', merchantId: 'd-lemon', merchantName: '招牌暴打檸檬茶（黑沙環店）', image: lemonTeaImg, emoji: '🧋', price: 16, originPrice: 22, monthlySales: 860, spec: '500ml', category: '奶茶', tags: [] },
  { kind: 'product', id: 'p-lemon-3', name: '鴨屎香檸檬茶', channel: 'delivery', merchantId: 'd-lemon', merchantName: '招牌暴打檸檬茶（黑沙環店）', image: lemonTeaImg, emoji: '🍋', price: 18, originPrice: 24, monthlySales: 620, spec: '500ml', category: '檸檬茶', tags: ['新品'] },
  { kind: 'product', id: 'p-organic-1', name: '有機田園沙拉', channel: 'delivery', merchantId: 'd-organic', merchantName: 'Organic Garden（氹仔店）', image: burgerImg, emoji: '🥗', price: 38, originPrice: 48, monthlySales: 210, spec: '1份', category: '沙拉', tags: ['健康'] },
  { kind: 'product', id: 'p-organic-2', name: '牛油果雞胸沙拉', channel: 'delivery', merchantId: 'd-organic', merchantName: 'Organic Garden（氹仔店）', image: burgerImg, emoji: '🥑', price: 46, originPrice: 58, monthlySales: 160, spec: '1份', category: '沙拉', tags: [] },
  { kind: 'product', id: 'p-sushi-1', name: '三文魚刺身拼盤', channel: 'delivery', merchantId: 'd-sushi', merchantName: '鮨山日本料理（葡京店）', image: fishPotImg, emoji: '🍣', price: 88, originPrice: 118, monthlySales: 120, spec: '12片', category: '刺身', tags: [] },
  { kind: 'product', id: 'p-sushi-2', name: '鰻魚飯', channel: 'delivery', merchantId: 'd-sushi', merchantName: '鮨山日本料理（葡京店）', image: riceballImg, emoji: '🍱', price: 68, originPrice: 88, monthlySales: 90, spec: '1份', category: '日料', tags: [] },
  { kind: 'product', id: 'p-hotpot-1', name: '海底撈雙人火鍋套餐', channel: 'delivery', merchantId: 'd-hotpot', merchantName: '海底撈火鍋（澳門店）', image: fishPotImg, emoji: '🍲', price: 268, originPrice: 328, monthlySales: 420, spec: '2人份', category: '火鍋', tags: ['人氣'] },
  { kind: 'product', id: 'p-hotpot-2', name: '撈派毛肚', channel: 'delivery', merchantId: 'd-hotpot', merchantName: '海底撈火鍋（澳門店）', image: fishPotImg, emoji: '🥘', price: 48, originPrice: 58, monthlySales: 360, spec: '1份', category: '火鍋', tags: [] },
  // 超市
  { kind: 'product', id: 'p-donki-1', name: '維他檸檬茶', channel: 'market', merchantId: 'm-donki', merchantName: 'DONKI驚安之殿堂（澳門店）', emoji: '🧃', price: 19.9, originPrice: 26.9, monthlySales: 1200, spec: '250ml×6', category: '飲料', tags: ['特價'] },
  { kind: 'product', id: 'p-donki-2', name: '洗衣液', channel: 'market', merchantId: 'm-donki', merchantName: 'DONKI驚安之殿堂（澳門店）', emoji: '🧴', price: 39.9, originPrice: 59.9, monthlySales: 320, spec: '2L', category: '日用品', tags: ['優惠'] },
  { kind: 'product', id: 'p-donki-3', name: '日本零食大禮包', channel: 'market', merchantId: 'm-donki', merchantName: 'DONKI驚安之殿堂（澳門店）', emoji: '🍫', price: 88, originPrice: 128, monthlySales: 260, spec: '1袋', category: '零食', tags: [] },
  { kind: 'product', id: 'p-taste-1', name: '泰國香米', channel: 'market', merchantId: 'm-taste', merchantName: 'Taste超市（氹仔店）', emoji: '🌾', price: 59.9, originPrice: 79.9, monthlySales: 540, spec: '5kg', category: '糧油', tags: ['優惠'] },
  { kind: 'product', id: 'p-taste-2', name: '日本士多啤梨', channel: 'market', merchantId: 'm-taste', merchantName: 'Taste超市（氹仔店）', emoji: '🍓', price: 49.9, originPrice: 69.9, monthlySales: 380, spec: '約250g', category: '水果', tags: ['特價'] },
  { kind: 'product', id: 'p-taste-3', name: '雞蛋', channel: 'market', merchantId: 'm-taste', merchantName: 'Taste超市（氹仔店）', emoji: '🥚', price: 25.9, originPrice: 32.9, monthlySales: 760, spec: '10隻', category: '生鮮', tags: [] },
  { kind: 'product', id: 'p-711-1', name: '抽取式紙巾', channel: 'market', merchantId: 'm-7eleven', merchantName: '7-Eleven（新口岸店）', emoji: '🧻', price: 15.9, originPrice: 24.9, monthlySales: 680, spec: '3包裝', category: '日用品', tags: ['特價'] },
  { kind: 'product', id: 'p-711-2', name: '鮮牛奶', channel: 'market', merchantId: 'm-7eleven', merchantName: '7-Eleven（新口岸店）', emoji: '🥛', price: 12.9, originPrice: 16.9, monthlySales: 920, spec: '1L', category: '乳品', tags: [] },
  { kind: 'product', id: 'p-711-3', name: '薯片', channel: 'market', merchantId: 'm-7eleven', merchantName: '7-Eleven（新口岸店）', emoji: '🥔', price: 9.9, originPrice: 13.9, monthlySales: 1100, spec: '70g', category: '零食', tags: [] },
  { kind: 'product', id: 'p-fresh-1', name: '藍莓', channel: 'market', merchantId: 'm-fresh', merchantName: '鮮果薈（黑沙環店）', emoji: '🫐', price: 29.9, originPrice: 39.9, monthlySales: 420, spec: '125g', category: '水果', tags: ['優惠'] },
  { kind: 'product', id: 'p-fresh-2', name: '泰國金枕榴槤', channel: 'market', merchantId: 'm-fresh', merchantName: '鮮果薈（黑沙環店）', emoji: '🥭', price: 168, originPrice: 228, monthlySales: 86, spec: '約2kg', category: '水果', tags: ['特價'] },
  { kind: 'product', id: 'p-fresh-3', name: '新鮮雞蛋', channel: 'market', merchantId: 'm-fresh', merchantName: '鮮果薈（黑沙環店）', emoji: '🥚', price: 26.9, originPrice: 33.9, monthlySales: 310, spec: '10隻', category: '生鮮', tags: [] },
]

export const SEARCH_DEALS: SearchDeal[] = [
  { kind: 'deal', id: 'deal-pizza', title: '甄選2人泥爐烤肉特惠套餐', channel: 'groupbuy', merchantId: 'g-pizza', merchantName: 'Pizza Lab西塔烤肉（威尼斯人店）', image: bbqImg, emoji: '🍖', price: 18.8, originPrice: 688.8, sold: 650, rating: 4.6, distanceKm: 1.5, category: '烤肉', tags: ['隨時退', '免預約', '到店可用'] },
  { kind: 'deal', id: 'deal-kfc', title: '肯德基KFC 全家桶套餐', channel: 'groupbuy', merchantId: 'g-kfc', merchantName: '肯德基KFC（澳門店）', image: friedChickenImg, emoji: '🍗', price: 59.9, originPrice: 129, sold: 1200, rating: 4.4, distanceKm: 1.1, category: '炸雞', tags: ['隨時退', '到店可用'] },
  { kind: 'deal', id: 'deal-hotpot', title: '海底撈 2人火鍋套餐', channel: 'groupbuy', merchantId: 'g-hotpot', merchantName: '海底撈火鍋（澳門店）', image: fishPotImg, emoji: '🍲', price: 168, originPrice: 328, sold: 860, rating: 4.9, distanceKm: 1.9, category: '火鍋', tags: ['隨時退', '免預約', '到店可用'] },
  { kind: 'deal', id: 'deal-hotpot-voucher', title: '海底撈 90代100元代金券', channel: 'groupbuy', merchantId: 'g-hotpot', merchantName: '海底撈火鍋（澳門店）', image: fishPotImg, emoji: '🎫', price: 90, originPrice: 100, sold: 3000, rating: 4.9, distanceKm: 1.9, category: '火鍋', tags: ['隨時退', '到店可用'] },
  { kind: 'deal', id: 'deal-spa', title: '60分鐘全身按摩套餐', channel: 'groupbuy', merchantId: 'g-spa', merchantName: '悅SPA按摩（皇朝店）', image: lemonTeaImg, emoji: '💆', price: 128, originPrice: 398, sold: 210, rating: 4.7, distanceKm: 2.4, category: '按摩', tags: ['隨時退', '免預約'] },
  { kind: 'deal', id: 'deal-buffet', title: '銀河自助餐 2人同行套餐', channel: 'groupbuy', merchantId: 'g-buffet', merchantName: '澳門銀河自助餐', image: bbqImg, emoji: '🍽️', price: 298, originPrice: 536, sold: 180, rating: 4.8, distanceKm: 3.2, category: '自助餐', tags: ['免預約', '到店可用'] },
  { kind: 'deal', id: 'deal-sushi', title: '鮨山 雙人Omakase套餐', channel: 'groupbuy', merchantId: 'g-sushi', merchantName: '鮨山日本料理（葡京店）', image: fishPotImg, emoji: '🍣', price: 388, originPrice: 688, sold: 60, rating: 4.8, distanceKm: 2.1, category: '日料', tags: ['免預約', '到店可用'] },
]

export const SEARCH_CATALOG: SearchEntry[] = [...SEARCH_MERCHANTS, ...SEARCH_PRODUCTS, ...SEARCH_DEALS]

const MERCHANT_MAP = new Map(SEARCH_MERCHANTS.map((m) => [m.id, m]))

/** 简繁与常见别名归一，保证用户输入简体也能命中繁体目录 */
const ALIAS_MAP: Record<string, string> = {
  纸巾: '紙巾', 抽取式: '抽取式', 柠檬茶: '檸檬茶', 柠檬: '檸檬', 团购: '團購', 火锅: '火鍋',
  寿司: '壽司', 酸菜鱼: '酸菜魚', 麦当劳: '麥當勞', 维他: '維他', 泰国: '泰國', 粮油: '糧油',
  蓝莓: '藍莓', 鸡蛋: '雞蛋', 鲜奶: '鮮奶', 水果: '水果', 零食: '零食', 洗衣液: '洗衣液',
  便利店: '便利店', 超市: '超市', 免配送费: '免配送費', 优惠: '優惠', 营业中: '營業中',
  随时退: '隨時退', 双人套餐: '雙人套餐', 按摩: '按摩', 自助餐: '自助餐', 烤肉: '烤肉',
  理发: '理髮', 美发: '美髮', 宠物: '寵物', 母婴: '母嬰', 酒水: '酒水', 冷冻: '冷凍',
}

export function normalizeQuery(input: string): string {
  let text = input.trim().toLowerCase().replace(/\s+/g, '')
  for (const [alias, target] of Object.entries(ALIAS_MAP)) {
    if (text.includes(alias)) text = text.split(alias).join(target)
  }
  return text
}

export function getMerchant(merchantId?: string): SearchMerchant | undefined {
  return merchantId ? MERCHANT_MAP.get(merchantId) : undefined
}

export function getStoreOffers(merchantId: string): SearchOffer[] {
  return [
    ...SEARCH_PRODUCTS.filter((p) => p.merchantId === merchantId),
    ...SEARCH_DEALS.filter((d) => d.merchantId === merchantId),
  ]
}

export function getStoreName(merchantId?: string): string {
  return getMerchant(merchantId)?.name ?? ''
}

export function getStoreCategories(merchantId: string): string[] {
  return Array.from(new Set(getStoreOffers(merchantId).map((o) => o.category)))
}

function entryText(entry: SearchEntry): string {
  if (entry.kind === 'merchant') {
    return [entry.name, CHANNEL_LABEL[entry.channel], ...entry.categories, ...entry.tags, ...entry.coupons].join(' ')
  }
  if (entry.kind === 'product') {
    return [entry.name, entry.merchantName, entry.spec, entry.category, ...entry.tags].join(' ')
  }
  return [entry.title, entry.merchantName, entry.category, ...entry.tags].join(' ')
}

function entryMatches(entry: SearchEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return normalizeQuery(entryText(entry)).includes(normalizedQuery)
}

export function scopeEntries(scope: SearchScope, merchantId?: string): SearchEntry[] {
  if (scope === 'store') {
    return merchantId ? getStoreOffers(merchantId) : []
  }
  const channels = SCOPE_CONFIG[scope].channels
  return SEARCH_CATALOG.filter((entry) => channels.includes(entry.channel))
}

export function entryMatchesTab(entry: SearchEntry, tab: SearchTab): boolean {
  if (tab === 'all') return true
  if (tab === 'merchant' || tab === 'product' || tab === 'deal') return entry.kind === tab
  return entry.channel === tab
}

function entryMerchant(entry: SearchEntry): SearchMerchant | undefined {
  return entry.kind === 'merchant' ? entry : getMerchant(entry.merchantId)
}

function entryTags(entry: SearchEntry): string[] {
  return entry.kind === 'merchant' ? entry.tags : [...entry.tags, ...(entryMerchant(entry)?.tags ?? [])]
}

export function entryMatchesFilter(entry: SearchEntry, filter: SearchFilter): boolean {
  const merchant = entryMerchant(entry)
  switch (filter) {
    case 'freeDelivery':
      return merchant?.deliveryFee === 0
    case 'discount':
      return entry.kind === 'merchant'
        ? entry.coupons.length > 0
        : Boolean(entry.originPrice && entry.originPrice > entry.price)
    case 'open':
      return merchant?.status !== 'rest'
    case 'pickup':
      return entryTags(entry).includes('可自取')
    case 'refundable':
      return entryTags(entry).includes('隨時退')
    case 'member':
      return entryTags(entry).includes('神會員')
    default:
      return true
  }
}

export interface SearchOptions {
  merchantId?: string
  tab?: SearchTab
  filters?: SearchFilter[]
}

export function searchCatalog(scope: SearchScope, keyword: string, options: SearchOptions = {}): SearchEntry[] {
  const normalized = normalizeQuery(keyword)
  let list = scopeEntries(scope, options.merchantId).filter((entry) => entryMatches(entry, normalized))
  if (options.tab && options.tab !== 'all') {
    list = list.filter((entry) => entryMatchesTab(entry, options.tab!))
  }
  if (options.filters?.length) {
    list = list.filter((entry) => options.filters!.every((filter) => entryMatchesFilter(entry, filter)))
  }
  return list
}

export function countByTab(
  scope: SearchScope,
  keyword: string,
  filters: SearchFilter[] = [],
  merchantId?: string,
): Record<string, number> {
  const base = searchCatalog(scope, keyword, { merchantId, filters })
  const config = SCOPE_CONFIG[scope]
  return Object.fromEntries(
    config.tabs.map((tab) => [tab.key, base.filter((entry) => entryMatchesTab(entry, tab.key)).length]),
  )
}

function entryPrice(entry: SearchEntry): number {
  if (entry.kind === 'merchant') return entry.minOrder ?? entry.avgPrice ?? Number.POSITIVE_INFINITY
  return entry.price
}

function entrySales(entry: SearchEntry): number {
  if (entry.kind === 'merchant') return entry.monthlySales
  if (entry.kind === 'product') return entry.monthlySales
  return entry.sold
}

function entryDistance(entry: SearchEntry): number {
  if (entry.kind === 'merchant') return entry.distanceKm
  return entryMerchant(entry)?.distanceKm ?? Number.POSITIVE_INFINITY
}

export function sortEntries(entries: SearchEntry[], sort: SearchSort): SearchEntry[] {
  const list = [...entries]
  switch (sort) {
    case 'distance':
      return list.sort((a, b) => entryDistance(a) - entryDistance(b) || entrySales(b) - entrySales(a))
    case 'sales':
      return list.sort((a, b) => entrySales(b) - entrySales(a))
    case 'priceAsc':
      return list.sort((a, b) => entryPrice(a) - entryPrice(b) || entrySales(b) - entrySales(a))
    case 'priceDesc':
      return list.sort((a, b) => entryPrice(b) - entryPrice(a) || entrySales(b) - entrySales(a))
    case 'deliveryFee':
      return list.sort((a, b) => (
        (entryMerchant(a)?.deliveryFee ?? Number.POSITIVE_INFINITY)
        - (entryMerchant(b)?.deliveryFee ?? Number.POSITIVE_INFINITY)
        || entrySales(b) - entrySales(a)
      ))
    default:
      // 综合：商家优先，其次按销量；同类型保持目录顺序
      return list.sort((a, b) => {
        if (a.kind === 'merchant' && b.kind !== 'merchant') return -1
        if (a.kind !== 'merchant' && b.kind === 'merchant') return 1
        return entrySales(b) - entrySales(a)
      })
  }
}

export interface SearchSuggestion {
  key: string
  text: string
  type: 'merchant' | 'product' | 'deal' | 'category'
  typeLabel: string
  meta: string
}

const SUGGEST_TYPE_LABEL: Record<SearchSuggestion['type'], string> = {
  merchant: '店鋪',
  product: '商品',
  deal: '套餐',
  category: '分類',
}

export function suggestFor(
  scope: SearchScope,
  keyword: string,
  merchantId?: string,
  limit = 8,
): SearchSuggestion[] {
  const normalized = normalizeQuery(keyword)
  if (!normalized) return []
  const entries = scopeEntries(scope, merchantId)
  const candidates: SearchSuggestion[] = []

  for (const entry of entries) {
    if (entry.kind === 'merchant') {
      candidates.push({
        key: `m-${entry.id}`, text: entry.name, type: 'merchant', typeLabel: SUGGEST_TYPE_LABEL.merchant,
        meta: `${CHANNEL_LABEL[entry.channel]} · ${entry.rating}分`,
      })
    } else if (entry.kind === 'product') {
      candidates.push({
        key: `p-${entry.id}`, text: entry.name, type: 'product', typeLabel: SUGGEST_TYPE_LABEL.product,
        meta: `${entry.merchantName} · $${entry.price}`,
      })
    } else {
      candidates.push({
        key: `d-${entry.id}`, text: entry.title, type: 'deal', typeLabel: SUGGEST_TYPE_LABEL.deal,
        meta: `${entry.merchantName} · $${entry.price}`,
      })
    }
  }

  const categorySet = new Set(entries.flatMap((entry) => (
    entry.kind === 'merchant' ? entry.categories : [entry.category]
  )))
  for (const category of categorySet) {
    candidates.push({
      key: `c-${category}`, text: category, type: 'category', typeLabel: SUGGEST_TYPE_LABEL.category,
      meta: `${entries.filter((entry) => (entry.kind === 'merchant' ? entry.categories : [entry.category]).includes(category)).length} 個結果`,
    })
  }

  const seen = new Set<string>()
  return candidates
    .filter((candidate) => normalizeQuery(candidate.text).includes(normalized))
    .sort((a, b) => {
      const aStarts = normalizeQuery(a.text).startsWith(normalized) ? 0 : 1
      const bStarts = normalizeQuery(b.text).startsWith(normalized) ? 0 : 1
      return aStarts - bStarts
    })
    .filter((candidate) => {
      const key = normalizeQuery(candidate.text)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export const HOT_WORDS: Record<Exclude<SearchScope, 'store'>, string[]> = {
  global: ['太二酸菜魚', '珍珠奶茶', '火鍋', '超市', '士多啤梨', '按摩', '全家桶', '紙巾'],
  delivery: ['太二酸菜魚', '珍珠奶茶', '炸雞', '壽司', '沙拉', '海底撈', '早餐', '免配送費'],
  groupbuy: ['火鍋', '自助餐', '按摩', '烤肉', 'KFC', '雙人套餐', '下午茶', '美容'],
  market: ['紙巾', '牛奶', '雞蛋', '士多啤梨', '零食', '香米', '洗衣液', '藍莓'],
}

export const GUESS_WORDS: Record<Exclude<SearchScope, 'store'>, string[]> = {
  global: ['一人食', '免配送費', '新店', '雙人套餐', '超市到家'],
  delivery: ['酸菜魚', '炸雞', '壽司', '沙拉', '檸檬茶'],
  groupbuy: ['雙人套餐', '火鍋', '自助餐', '按摩', '下午茶'],
  market: ['紙巾', '牛奶', '雞蛋', '水果', '香米'],
}

export function hotWordsFor(scope: SearchScope, merchantId?: string): string[] {
  if (scope !== 'store') return HOT_WORDS[scope]
  const top = sortEntries(getStoreOffers(merchantId ?? ''), 'sales').slice(0, 6)
  const words = top.map((entry) => (entry.kind === 'deal' ? entry.title : entry.name))
  return words.length > 0 ? words : ['招牌', '套餐', '優惠']
}

export function guessWordsFor(scope: SearchScope, merchantId?: string): string[] {
  if (scope !== 'store') return GUESS_WORDS[scope]
  return getStoreCategories(merchantId ?? '').slice(0, 6)
}

const HISTORY_KEY = 'sras.consumer.search.history.v1'
const HISTORY_LIMIT = 10

type HistoryStore = Record<string, string[]>

function scopeHistoryKey(scope: SearchScope, merchantId?: string): string {
  return scope === 'store' ? `store:${merchantId ?? 'unknown'}` : scope
}

function readHistoryStore(): HistoryStore {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const store: HistoryStore = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) store[key] = value.filter((item): item is string => typeof item === 'string')
    }
    return store
  } catch {
    return {}
  }
}

function writeHistoryStore(store: HistoryStore): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(store))
  } catch {
    // 无痕模式或存储配额不足时静默降级，不影响搜索主流程
  }
}

export function loadHistory(scope: SearchScope, merchantId?: string): string[] {
  return readHistoryStore()[scopeHistoryKey(scope, merchantId)] ?? []
}

export function pushHistory(scope: SearchScope, keyword: string, merchantId?: string): string[] {
  const text = keyword.trim()
  if (!text) return loadHistory(scope, merchantId)
  const store = readHistoryStore()
  const key = scopeHistoryKey(scope, merchantId)
  const next = [text, ...(store[key] ?? []).filter((item) => item !== text)].slice(0, HISTORY_LIMIT)
  store[key] = next
  writeHistoryStore(store)
  return next
}

export function clearHistory(scope: SearchScope, merchantId?: string): void {
  const store = readHistoryStore()
  delete store[scopeHistoryKey(scope, merchantId)]
  writeHistoryStore(store)
}

export function formatMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
