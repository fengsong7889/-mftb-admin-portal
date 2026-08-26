import * as XLSX from 'xlsx'
import type { FlashSaleRegisterRow, FlashSaleStatsRow, FlashSaleSummaryRow, FlashSaleTier } from '../api/flashSale'
import {
  SUBSIDY_TYPE_LABEL_REVERSE,
  FLASH_PRODUCT_TYPE_LABEL_REVERSE,
  FLASH_PRICE_TYPE_LABEL_REVERSE,
  SUBSIDY_NONE,
  LAST_PERIOD_NONE_DATA,
} from '../constants/flashSale'

/** 解析结果 */
export interface ParsedFlashSaleExcel {
  registerRows: FlashSaleRegisterRow[]
  statsRows: FlashSaleStatsRow[]
  summaryByPeriod: Array<{ periodNo: number; rows: FlashSaleSummaryRow[] }>
}

/** 阶梯文本解析: ▲價格:9.1,庫存:10,補貼:8.10（逐行） */
export function parseTierText(text: unknown): FlashSaleTier[] {
  if (typeof text !== 'string') return []
  const tiers: FlashSaleTier[] = []
  const regex = /▲價格:([\d.]+)\s*,庫存:(\d+)\s*,補貼:([\d.]+)/g
  let match: RegExpExecArray | null
  let no = 1
  while ((match = regex.exec(text)) !== null) {
    tiers.push({
      tierNo: no++,
      tierPrice: Number(match[1]),
      tierStock: Number(match[2]),
      tierSubsidy: Number(match[3]),
    })
  }
  return tiers
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 環比/上期字段: 「無上期數據」-> null */
const toChange = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && v.includes('無上期數據')) return null
  return toNum(v)
}

const toSubsidyKey = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s === '否' || s === '無') return SUBSIDY_NONE
  return SUBSIDY_TYPE_LABEL_REVERSE[s] ?? SUBSIDY_NONE
}

const toLastPeriodSubsidy = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s.includes('無上期數據')) return LAST_PERIOD_NONE_DATA
  if (!s || s === '否' || s === '無') return SUBSIDY_NONE
  return SUBSIDY_TYPE_LABEL_REVERSE[s] ?? SUBSIDY_NONE
}

/** Excel 日期序列 -> YYYY-MM-DD */
const serialToDate = (serial: number): string => {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const cellToDate = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  if (v instanceof Date) {
    const y = v.getUTCFullYear()
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    const day = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  if (typeof v === 'number') return serialToDate(v)
  const s = String(v).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** 解析秒杀数据分析 Excel（三个 sheet: 汇总/登记/统计） */
export async function parseFlashSaleExcel(file: File): Promise<ParsedFlashSaleExcel> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { cellDates: true })
  const result: ParsedFlashSaleExcel = { registerRows: [], statsRows: [], summaryByPeriod: [] }

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })
    if (name.includes('登記')) {
      result.registerRows = parseRegisterSheet(rows)
    } else if (name.includes('銷量') || name.includes('統計')) {
      result.statsRows = parseStatsSheet(rows)
    } else if (name.includes('匯總')) {
      result.summaryByPeriod = parseSummarySheet(rows)
    }
  }
  return result
}

/** 登记 sheet: 跳过合并表头行, 从「補貼類型」表头后开始 */
function parseRegisterSheet(rows: unknown[][]): FlashSaleRegisterRow[] {
  const out: FlashSaleRegisterRow[] = []
  let started = false
  for (const r of rows) {
    if (!started) {
      if (str(r[0]) === '補貼類型') started = true
      continue
    }
    const subsidyType = SUBSIDY_TYPE_LABEL_REVERSE[str(r[0])]
    const productId = str(r[6])
    if (!subsidyType || !productId) continue
    const tiers = parseTierText(r[12])
    const priceType = FLASH_PRICE_TYPE_LABEL_REVERSE[str(r[9])] ?? (tiers.length ? 'tier' : 'single')
    out.push({
      seqNo: toNum(r[1]),
      subsidyType,
      storeNames: str(r[3]),
      productId,
      productName: str(r[4]),
      productType: FLASH_PRODUCT_TYPE_LABEL_REVERSE[str(r[5])] ?? null,
      maxPurchase: str(r[7]) || null,
      priceType,
      originalPrice: toNum(r[10]),
      groupPrice: toNum(r[11]),
      flashSalePrice: tiers.length ? null : toNum(r[12]),
      flashSaleStock: tiers.length ? null : toNum(r[8]),
      currentSales: toNum(r[13]),
      tiers,
    })
  }
  return out
}

/** 统计 sheet: 表头「商品ID」后开始 */
function parseStatsSheet(rows: unknown[][]): FlashSaleStatsRow[] {
  const out: FlashSaleStatsRow[] = []
  let started = false
  for (const r of rows) {
    if (!started) {
      if (str(r[0]) === '商品ID') started = true
      continue
    }
    const productId = str(r[0])
    if (!productId || !/^\d{5,}$/.test(productId)) continue
    const tiers = parseTierText(r[4])
    out.push({
      productId,
      productName: str(r[1]),
      storeNames: str(r[2]),
      priceType: FLASH_PRICE_TYPE_LABEL_REVERSE[str(r[3])] ?? (tiers.length ? 'tier' : 'single'),
      flashSalePrice: tiers.length ? null : toNum(r[4]),
      orderUsers: toNum(r[5]),
      totalPrice: toNum(r[6]),
      totalOrders: toNum(r[7]),
      totalSales: toNum(r[8]),
      actualAmount: toNum(r[9]),
      orderUsersChange: toChange(r[10]),
      totalPriceChange: toChange(r[11]),
      totalOrdersChange: toChange(r[12]),
      totalSalesChange: toChange(r[13]),
      actualAmountChange: toChange(r[14]),
      subsidyType: toSubsidyKey(r[15]),
      discountRate: toNum(r[16]),
      lastPeriodSubsidy: toLastPeriodSubsidy(r[17]),
      bdName: str(r[18]) || null,
      tiers,
    })
  }
  return out
}

/** 汇总 sheet: 按期数分组（每日行 + 合计行） */
function parseSummarySheet(rows: unknown[][]): Array<{ periodNo: number; rows: FlashSaleSummaryRow[] }> {
  const byPeriod = new Map<number, FlashSaleSummaryRow[]>()
  let current: number | null = null
  for (const r of rows) {
    const head = str(r[0])
    const periodMatch = head.match(/第(\d+)期/)
    if (periodMatch) {
      current = Number(periodMatch[1])
      if (!byPeriod.has(current)) byPeriod.set(current, [])
      // 期数行本身可能携带首日数据（时间列为数字/日期）
      if (cellToDate(r[1])) {
        byPeriod.get(current)!.push(buildSummaryRow(r))
      }
      continue
    }
    if (head === '合計' || head === '合计') {
      if (current !== null) byPeriod.get(current)!.push(buildSummaryRow(r))
      continue
    }
    if (head === '' && cellToDate(r[1]) && current !== null) {
      byPeriod.get(current)!.push(buildSummaryRow(r))
    }
  }
  return Array.from(byPeriod.entries())
    .map(([periodNo, list]) => ({ periodNo, rows: list }))
    .sort((a, b) => a.periodNo - b.periodNo)
}

function buildSummaryRow(r: unknown[]): FlashSaleSummaryRow {
  const head = str(r[0])
  const isTotals = head === '合計' || head === '合计'
  return {
    statDate: isTotals ? null : cellToDate(r[1]),
    totalPayable: toNum(r[2]),
    totalActual: toNum(r[3]),
    totalOrders: toNum(r[4]),
    totalSales: toNum(r[5]),
    totalProducts: toNum(r[6]),
    soldProducts: toNum(r[7]),
    buyers: toNum(r[9]),
    repurchaseBuyers: toNum(r[10]),
    repurchaseRate: toNum(r[11]),
    avgOrderValue: toNum(r[12]),
  }
}
