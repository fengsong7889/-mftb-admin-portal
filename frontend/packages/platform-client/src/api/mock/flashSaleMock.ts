/**
 * 秒杀模块 Mock 数据（后端不可用时降级，样本取自第85期秒殺數據分析.xlsx）
 */
import type {
  FlashSaleOverviewVO,
  FlashSalePeriod,
  FlashSaleRegisterRow,
  FlashSaleRegisterVO,
  FlashSaleStatsRow,
  FlashSaleStatsVO,
  FlashSaleSummaryDayVO,
  FlashSaleSummaryRow,
  FlashSaleImportResult,
} from '../flashSale'

const delay = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms))

export const mockPeriods: FlashSalePeriod[] = [
  { id: 2, periodNo: 85, startDate: '2026-08-13', endDate: '2026-08-15', status: 2, remark: '第85期秒殺' },
  { id: 1, periodNo: 84, startDate: '2026-08-06', endDate: '2026-08-08', status: 2, remark: '第84期秒殺' },
]

/* ─────────────── 登记 ─────────────── */

const mockRegisters: Array<FlashSaleRegisterVO & { periodNo: number }> = [
  {
    id: 1, periodNo: 85, seqNo: 1, subsidyType: 'ka', storeCodes: 'MD000001', storeNames: '聯豐宅鮮餸(南澳店)',
    bdNames: '高敏卿', productId: '1293040260302899694', productName: '雞蛋10只（散裝）', productType: 'tuan_dan',
    maxPurchase: '限購1', priceType: 'tier', originalPrice: 15.9, groupPrice: 14.9, flashSalePrice: null,
    currentSales: 232, blacklist: false,
    tiers: [
      { tierNo: 1, tierPrice: 9.1, tierStock: 10, tierSubsidy: 8.1 },
      { tierNo: 2, tierPrice: 9.1, tierStock: 500, tierSubsidy: 0.3 },
      { tierNo: 3, tierPrice: 9.1, tierStock: 100, tierSubsidy: 0 },
    ],
  },
  {
    id: 2, periodNo: 85, seqNo: 2, subsidyType: 'ka', storeCodes: 'MD000002', storeNames: '道達爾TOTAL加油站',
    bdNames: '高敏卿', productId: '1293412354404549540', productName: '100元代金券（道達爾TOTAL加油站）', productType: 'voucher',
    maxPurchase: '不限購', priceType: 'single', originalPrice: 100, groupPrice: 83, flashSalePrice: 75,
    flashSaleStock: 500, currentSales: 42, blacklist: false, tiers: [],
  },
  {
    id: 3, periodNo: 85, seqNo: 4, subsidyType: 'procurement', storeCodes: 'MD000003', storeNames: '新花城超級市場🐝24H生活超市(13)',
    bdNames: '高敏卿', productId: '1363444340137027392', productName: '【19店通用】100元代金券（新花城超級市場）【新】', productType: 'voucher',
    maxPurchase: '每人限購1', priceType: 'tier', originalPrice: 100, groupPrice: 97, flashSalePrice: null,
    currentSales: 242, blacklist: false,
    tiers: [
      { tierNo: 1, tierPrice: 92, tierStock: 50, tierSubsidy: 4 },
      { tierNo: 2, tierPrice: 92, tierStock: 300, tierSubsidy: 1 },
      { tierNo: 3, tierPrice: 92, tierStock: 400, tierSubsidy: 0 },
    ],
  },
  {
    id: 4, periodNo: 85, seqNo: 10, subsidyType: 'bd_submit', storeCodes: 'MD000004', storeNames: '煲掌門煲仔飯（🔥29.9自選煲仔飯）',
    bdNames: '洪威勝', productId: '1401791894465436101', productName: '【上新】明火現煲·煲仔飯1人套餐', productType: 'tuan_dan',
    maxPurchase: '階梯限購1', priceType: 'tier', originalPrice: 73, groupPrice: 31.9, flashSalePrice: null,
    currentSales: 28, blacklist: false,
    tiers: [
      { tierNo: 1, tierPrice: 28.9, tierStock: 5, tierSubsidy: 9 },
      { tierNo: 2, tierPrice: 28.9, tierStock: 10, tierSubsidy: 0 },
      { tierNo: 3, tierPrice: 29.8, tierStock: 200, tierSubsidy: 0.4 },
    ],
  },
  {
    id: 5, periodNo: 85, seqNo: 13, subsidyType: 'platform', storeCodes: 'MD000005', storeNames: 'KOI CAFE (KOI THE)（高士德店）',
    bdNames: 'ray', productId: '1264873341943158206', productName: '烤糖粉粿奶茶(中杯)', productType: 'tuan_dan',
    maxPurchase: '階梯限購1', priceType: 'tier', originalPrice: 29, groupPrice: 26.1, flashSalePrice: null,
    currentSales: 630, blacklist: false,
    tiers: [
      { tierNo: 1, tierPrice: 15.8, tierStock: 10, tierSubsidy: 5.9 },
      { tierNo: 2, tierPrice: 15.8, tierStock: 100, tierSubsidy: 1 },
      { tierNo: 3, tierPrice: 15.8, tierStock: 300, tierSubsidy: 0 },
    ],
  },
  {
    id: 6, periodNo: 85, seqNo: 41, subsidyType: 'merchant', storeCodes: 'MD000006', storeNames: '為食寶🏆手抓餅|雞蛋仔|湯粉|牛角包治-氹仔店',
    bdNames: '招大', productId: '1393794166946928441', productName: '【馳名招牌魚湯VS冬陰功湯套餐】重新推出！', productType: 'tuan_dan',
    maxPurchase: '不限購', priceType: 'single', originalPrice: 51, groupPrice: 33, flashSalePrice: 29.9,
    flashSaleStock: 77, currentSales: 5, blacklist: false, tiers: [],
  },
  {
    id: 7, periodNo: 85, seqNo: 45, subsidyType: 'merchant', storeCodes: 'MD000007', storeNames: '狗狗茶GOGOTEA-三盞燈店「芝士奶蓋茶」',
    bdNames: '招大', productId: '1039822484433800253', productName: '【狗狗茶】未來澳門手搖銷量第一！', productType: 'tuan_dan',
    maxPurchase: '每人限購1份', priceType: 'single', originalPrice: 39, groupPrice: 26.9, flashSalePrice: 16.9,
    flashSaleStock: 68, currentSales: 49, blacklist: false, tiers: [],
  },
]

export async function mockFetchRegisters(params: {
  periodNo?: number; subsidyType?: string; productType?: string; bd?: string; keyword?: string
  page?: number; size?: number
}) {
  await delay()
  const periodNo = params.periodNo ?? 85
  let list = mockRegisters.filter(r => r.periodNo === periodNo)
  if (params.subsidyType) list = list.filter(r => r.subsidyType === params.subsidyType)
  if (params.productType) list = list.filter(r => r.productType === params.productType)
  if (params.bd) list = list.filter(r => (r.bdNames || '').includes(params.bd!))
  if (params.keyword) {
    const kw = params.keyword.toLowerCase()
    list = list.filter(r => r.productId.toLowerCase().includes(kw) || (r.productName ?? '').includes(params.keyword!))
  }
  const page = params.page ?? 1
  const size = params.size ?? 10
  return { records: list.slice((page - 1) * size, page * size), total: list.length }
}

export async function mockImportRegisters(rows: FlashSaleRegisterRow[]): Promise<FlashSaleImportResult> {
  await delay()
  return { successCount: rows.length, errors: [] }
}

/* ─────────────── 统计 ─────────────── */

const mockStats: FlashSaleStatsVO[] = [
  {
    id: 1, periodNo: 85, productId: '1363444340137027392', productName: '【19店通用】100元代金券（新花城超級市場）【新】',
    storeNames: '新花城超級市場🐝24H生活超市(13);新花城超級市場🐝24H生活超市(26)', priceType: 'tier',
    orderUsers: 190, totalPrice: 22264, totalOrders: 213, totalSales: 242, actualAmount: 21872,
    orderUsersChange: 0.0857, totalPriceChange: -0.0359, totalOrdersChange: 0.0143, totalSalesChange: -0.0359, actualAmountChange: -0.0361,
    subsidyType: 'procurement', discountRate: 0.0176, lastPeriodSubsidy: 'procurement', bdName: '高敏卿',
    tiers: [
      { tierNo: 1, tierPrice: 92, tierStock: 50, tierSubsidy: null },
      { tierNo: 2, tierPrice: 92, tierStock: 300, tierSubsidy: null },
      { tierNo: 3, tierPrice: 92, tierStock: 400, tierSubsidy: null },
    ],
  },
  {
    id: 2, periodNo: 85, productId: '1264873341943158206', productName: '烤糖粉粿奶茶(中杯)',
    storeNames: 'KOI CAFE (KOI THE)（高士德店）;KOI CAFE (KOI THE)（皇朝店）', priceType: 'tier',
    orderUsers: 423, totalPrice: 9954, totalOrders: 465, totalSales: 630, actualAmount: 9710,
    orderUsersChange: null, totalPriceChange: null, totalOrdersChange: null, totalSalesChange: null, actualAmountChange: null,
    subsidyType: 'platform', discountRate: 0.0245, lastPeriodSubsidy: 'none_data', bdName: 'ray',
    tiers: [
      { tierNo: 1, tierPrice: 15.8, tierStock: 10, tierSubsidy: null },
      { tierNo: 2, tierPrice: 15.8, tierStock: 100, tierSubsidy: null },
      { tierNo: 3, tierPrice: 15.8, tierStock: 300, tierSubsidy: null },
    ],
  },
  {
    id: 3, periodNo: 85, productId: '1140929069951749561', productName: '100元代金券（ 聯豐宅鮮餸）',
    storeNames: '聯豐宅鮮餸(南澳店);聯豐宅鮮餸(筷子基店)', priceType: 'single', flashSalePrice: 89.9,
    orderUsers: 63, totalPrice: 10130.4, totalOrders: 77, totalSales: 108, actualAmount: 9709.2,
    orderUsersChange: 0.0328, totalPriceChange: -0.2286, totalOrdersChange: -0.0723, totalSalesChange: -0.2286, actualAmountChange: -0.2286,
    subsidyType: 'procurement', discountRate: 0.0416, lastPeriodSubsidy: 'procurement', bdName: '高敏卿', tiers: [],
  },
  {
    id: 4, periodNo: 85, productId: '1034028600441177376', productName: '【筷子基店】晚市⛩100元代金券🍱',
    storeNames: '魂太手作料理（筷子基威翠店）', priceType: 'single', flashSalePrice: 57,
    orderUsers: 22, totalPrice: 5985, totalOrders: 27, totalSales: 105, actualAmount: 5949,
    orderUsersChange: -0.0435, totalPriceChange: 0.3125, totalOrdersChange: -0.1, totalSalesChange: 0.3125, actualAmountChange: 0.3089,
    subsidyType: 'none', discountRate: 0.006, lastPeriodSubsidy: 'none', bdName: 'ray', tiers: [],
  },
  {
    id: 5, periodNo: 85, productId: '1391620391325301099', productName: '【人氣上新🔥】單人下午茶套餐‼兩店通用',
    storeNames: '車仔記(筷子基)『車仔麵專門店』;車仔記(黑沙環)『車仔麵專門店』', priceType: 'tier',
    orderUsers: 106, totalPrice: 4581.6, totalOrders: 118, totalSales: 184, actualAmount: 4492,
    orderUsersChange: 0.1778, totalPriceChange: 0.0636, totalOrdersChange: 0.0727, totalSalesChange: 0.0636, actualAmountChange: 0.0638,
    subsidyType: 'platform', discountRate: 0.0196, lastPeriodSubsidy: 'platform', bdName: 'Sammie',
    tiers: [
      { tierNo: 1, tierPrice: 24.9, tierStock: 10, tierSubsidy: null },
      { tierNo: 2, tierPrice: 24.9, tierStock: 500, tierSubsidy: null },
    ],
  },
  {
    id: 6, periodNo: 85, productId: '1089433722574603941', productName: '【六選一】新鮮現做知味檸檬茶 500ml',
    storeNames: '知味茶（山茶花檸檬茶/經典奶茶/冰沙/蘇打）', priceType: 'single', flashSalePrice: 9.9,
    orderUsers: 35, totalPrice: 999.9, totalOrders: 43, totalSales: 101, actualAmount: 969.9,
    orderUsersChange: 0.0294, totalPriceChange: 0.5538, totalOrdersChange: 0.1026, totalSalesChange: 0.5538, actualAmountChange: 0.531,
    subsidyType: 'none', discountRate: 0.03, lastPeriodSubsidy: 'none', bdName: '招大', tiers: [],
  },
]

export async function mockFetchStats(params: {
  periodNo?: number; subsidyType?: string; bd?: string; keyword?: string; page?: number; size?: number
}) {
  await delay()
  const periodNo = params.periodNo ?? 85
  let list = mockStats.filter(s => s.periodNo === periodNo)
  if (params.subsidyType) list = list.filter(s => s.subsidyType === params.subsidyType)
  if (params.bd) list = list.filter(s => (s.bdName || '').includes(params.bd!))
  if (params.keyword) {
    const kw = params.keyword.toLowerCase()
    list = list.filter(s => s.productId.toLowerCase().includes(kw) || (s.productName ?? '').includes(params.keyword!))
  }
  const page = params.page ?? 1
  const size = params.size ?? 10
  return { records: list.slice((page - 1) * size, page * size), total: list.length }
}

export async function mockImportStats(rows: FlashSaleStatsRow[]): Promise<FlashSaleImportResult> {
  await delay()
  return { successCount: rows.length, errors: [] }
}

/* ─────────────── 汇总/总览 ─────────────── */

interface RawDay {
  date: string
  payable: number
  actual: number
  orders: number
  sales: number
  products: number
  sold: number
  buyers: number
  repurchase: number
  repRate: number
  aov: number
}

const summaryByPeriod: Record<number, { daily: RawDay[]; totals: RawDay }> = {
  84: {
    daily: [
      { date: '2026-08-06', payable: 106531.1, actual: 102537.5, orders: 1855, sales: 2566, products: 317, sold: 211, buyers: 1238, repurchase: 735, repRate: 0.3646, aov: 86.05 },
      { date: '2026-08-07', payable: 54751.7, actual: 52851.1, orders: 917, sales: 1306, products: 317, sold: 192, buyers: 706, repurchase: 735, repRate: 0.3646, aov: 77.55 },
      { date: '2026-08-08', payable: 47770.6, actual: 46237.1, orders: 795, sales: 1132, products: 317, sold: 178, buyers: 611, repurchase: 735, repRate: 0.3646, aov: 78.18 },
    ],
    totals: { date: '', payable: 209053.4, actual: 201625.7, orders: 3567, sales: 5004, products: 317, sold: 262, buyers: 2193, repurchase: 735, repRate: 0.3646, aov: 95.33 },
  },
  85: {
    daily: [
      { date: '2026-08-13', payable: 107013.2, actual: 102992, orders: 1978, sales: 2825, products: 305, sold: 208, buyers: 1351, repurchase: 842, repRate: 0.3839, aov: 79.21 },
      { date: '2026-08-14', payable: 64814.5, actual: 62645, orders: 1144, sales: 1667, products: 305, sold: 169, buyers: 892, repurchase: 842, repRate: 0.3839, aov: 72.66 },
      { date: '2026-08-15', payable: 56454.9, actual: 53875.7, orders: 1047, sales: 1499, products: 305, sold: 162, buyers: 839, repurchase: 842, repRate: 0.3839, aov: 67.29 },
    ],
    totals: { date: '', payable: 228282.6, actual: 219512.7, orders: 4169, sales: 5991, products: 305, sold: 258, buyers: 2685, repurchase: 842, repRate: 0.3839, aov: 85.02 },
  },
}

const change = (cur: number, prev?: number): number | null => {
  if (prev === undefined || prev === null || prev === 0) return null
  return Number(((cur - prev) / prev).toFixed(4))
}

const toDayVO = (d: RawDay, totals: boolean, prev?: RawDay): FlashSaleSummaryDayVO => ({
  statDate: totals ? null : d.date,
  totals,
  totalPayable: d.payable,
  totalActual: d.actual,
  totalOrders: d.orders,
  totalSales: d.sales,
  totalProducts: d.products,
  soldProducts: d.sold,
  soldRate: d.products ? Number((d.sold / d.products).toFixed(4)) : null,
  buyers: d.buyers,
  repurchaseBuyers: d.repurchase,
  repurchaseRate: d.repRate,
  avgOrderValue: d.aov,
  payableChange: prev ? change(d.payable, prev.payable) : null,
  actualChange: prev ? change(d.actual, prev.actual) : null,
  ordersChange: prev ? change(d.orders, prev.orders) : null,
  salesChange: prev ? change(d.sales, prev.sales) : null,
  buyersChange: prev ? change(d.buyers, prev.buyers) : null,
})

export async function mockFetchOverview(periodNo?: number): Promise<FlashSaleOverviewVO> {
  await delay()
  const no = periodNo ?? 85
  const cur = summaryByPeriod[no]
  if (!cur) return { periodNo: no, totals: null, daily: [] }
  const prev = summaryByPeriod[no - 1]
  return {
    periodNo: no,
    totals: toDayVO(cur.totals, true, prev?.totals),
    daily: cur.daily.map((d, i) => toDayVO(d, false, prev?.daily[i])),
  }
}

export async function mockImportSummary(rows: FlashSaleSummaryRow[]): Promise<FlashSaleImportResult> {
  await delay()
  return { successCount: rows.length, errors: [] }
}
