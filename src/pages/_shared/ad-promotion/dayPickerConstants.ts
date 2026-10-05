/**
 * DayPicker 共享常量、类型与工具函数
 * 供 AdSales 与 PromotionSalesConfig 的 DayPicker 共用
 */
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

// ===== 常量 =====

/** 赠送管理中盘活复苏的广告类型标识（与后端一致） */
export const GIFT_AD_TYPE = 'revival'

/** 后端品牌 → 前端品牌值（flashBee=閃蜂 mFood=mFood） */
export const BACKEND_TO_UI_BRAND: Record<string, string> = { flashBee: 'shanfeng', mFood: 'mfood' }
/** 前端品牌值 → 后端品牌 */
export const UI_TO_BACKEND_BRAND: Record<string, string> = { shanfeng: 'flashBee', mfood: 'mFood' }

/** 可售天数兜底（真实数据以定价预售天数为准） */
export const DEFAULT_SELLABLE_DAYS = 180
/** 月份选择器每页展示数（超出用上下页按钮切换） */
export const MONTHS_PER_PAGE = 6
/** 开售时间（火车票式，每日该时点放出新一天的可购买日期） */
export const PRESALE_OPEN_HOUR = 10
/** 加购锁定时长（秒），从规则配置动态读取 */
export const DEFAULT_LOCK_SECONDS = 60

// ===== 类型 =====

/** 购物车项（一次加购批次） */
export interface CartItem {
  key: string
  dates: string[]
  days: number
  originalPrice: number
  discount: number
  salePrice: number
  lockTime: number
}

/** 购物车展平行 */
export interface CartRow {
  key: string
  date: string
  cartKey: string
  salePrice: number
  lockTime: number
}

/** 梯度折扣档位 */
export interface DayTier {
  minDays: number
  discount: number
}

// ===== 纯函数工具 =====

/** 计算某日期相对今天的天数偏移（今天=0） */
export function getDayOffset(date: Dayjs): number {
  return date.startOf('day').diff(dayjs().startOf('day'), 'day')
}

/** 是否为待开售日期（超出可售窗口，暂不可购买） */
export function isPresaleDate(date: Dayjs, sellableDays: number): boolean {
  return getDayOffset(date) >= sellableDays
}

/** 待开售日期的开售时间（提前 sellableDays 天、于 PRESALE_OPEN_HOUR 点开售） */
export function getPresaleOpenTime(date: Dayjs, sellableDays: number): Dayjs {
  return date.startOf('day').subtract(sellableDays - 1, 'day').hour(PRESALE_OPEN_HOUR).minute(0).second(0)
}

/** 解析定价配置的多天梯度折扣 JSON（后端 discount=95 表示 95 折） */
export function parseDayTiers(json?: string): DayTier[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return (arr as Array<{ minDays?: number; discount?: number }>)
      .filter(t => t && Number(t.minDays) > 0 && Number(t.discount) > 0)
      .map(t => ({ minDays: Number(t.minDays), discount: Number(t.discount) }))
      .sort((a, b) => a.minDays - b.minDays)
  } catch {
    return []
  }
}

/** 生成当前月份的日历网格 */
export function buildCalendarGrid(currentMonth: Dayjs): (Dayjs | null)[][] {
  const year = currentMonth.year()
  const month = currentMonth.month()
  const firstDay = dayjs(new Date(year, month, 1))
  const lastDay = dayjs(new Date(year, month + 1, 0))
  const firstDayOfWeek = firstDay.day()
  const daysInMonth = lastDay.date()

  const weeks: (Dayjs | null)[][] = []
  let currentWeek: (Dayjs | null)[] = []

  for (let i = 0; i < firstDayOfWeek; i++) { currentWeek.push(null) }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = dayjs(new Date(year, month, day))
    currentWeek.push(date)
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) { currentWeek.push(null) }
    weeks.push(currentWeek)
  }
  return weeks
}

/** 计算可售月份范围（补齐至整页） */
export function buildMonthList(sellableDays: number): Dayjs[] {
  const startDate = dayjs()
  const endDate = dayjs().add(sellableDays - 1, 'day')
  const result: Dayjs[] = []
  let current = startDate.startOf('month')
  while (current.isBefore(endDate) || current.isSame(endDate, 'month')) {
    result.push(current)
    current = current.add(1, 'month')
  }
  while (result.length % MONTHS_PER_PAGE !== 0) {
    result.push(current)
    current = current.add(1, 'month')
  }
  return result
}

/** 按月分组已选日期 */
export function groupDatesByMonth(selectedDates: string[]): Array<{ month: string; days: number[] }> {
  const grouped: Record<string, number[]> = {}
  selectedDates.forEach(dateStr => {
    const date = dayjs(dateStr)
    const monthKey = date.format('YYYY-MM')
    const day = date.date()
    if (!grouped[monthKey]) grouped[monthKey] = []
    grouped[monthKey].push(day)
  })
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, days]) => ({ month, days: days.sort((a, b) => a - b) }))
}
