import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useCountUp } from '../../../hooks/useCountUp'

/**
 * 新店广告 / 推广赠送天数 日历选择通用 Hook
 *
 * 提取自 AdSales/NewStoreDayPicker 与 PromotionSalesConfig/NewStoreDayPicker 的重复逻辑：
 * - 月份切换、日期选择
 * - 可选日期范围计算（今天 → 赠送有效期止）
 * - 可选月份列表、日历网格生成
 * - 按月分组已选日期
 */
export function useNewStoreCalendar(giftExpireDate: string | null | undefined) {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs())
  const [selectedDates, setSelectedDates] = useState<string[]>([])

  // 可选日期范围：今天 → 赠送有效期止
  const rangeStart = dayjs().startOf('day')
  const rangeEnd = giftExpireDate ? dayjs(giftExpireDate).startOf('day') : rangeStart

  // 可选月份列表（用于月份切换器）
  const months = useMemo(() => {
    if (!giftExpireDate) return []
    const result: Dayjs[] = []
    let current = rangeStart.startOf('month')
    while (current.isBefore(rangeEnd) || current.isSame(rangeEnd, 'month')) {
      result.push(current)
      current = current.add(1, 'month')
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giftExpireDate])

  // 生成当前月份的日历网格
  const calendarGrid = useMemo(() => {
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
  }, [currentMonth])

  // 日期是否在可选范围内（今天 → 有效期止）
  const isDateSelectable = (date: Dayjs | null) => {
    if (!date) return false
    return !date.isBefore(rangeStart) && !date.isAfter(rangeEnd)
  }

  // 获取日历单元格样式
  const getCellStyle = (date: Dayjs | null) => {
    if (!date) return { background: '#fafafa', cursor: 'default', border: '1px solid #e8e8e8' }
    const selectable = isDateSelectable(date)
    if (!selectable) return { background: '#f5f5f5', cursor: 'not-allowed', border: '1px solid #e8e8e8', color: '#bfbfbf' }
    const isSelected = selectedDates.includes(date.format('YYYY-MM-DD'))
    if (isSelected) return { background: '#f6ffed', cursor: 'pointer', border: '2px solid #52c41a', color: '#52c41a', fontWeight: 600 }
    return { background: '#fff', cursor: 'pointer', border: '1px solid #e8e8e8', color: '#333' }
  }

  // 按月分组已选日期
  const datesByMonth = useMemo(() => {
    const grouped: Record<string, number[]> = {}
    selectedDates.forEach(dateStr => {
      const date = dayjs(dateStr)
      const monthKey = date.format('YYYY-MM')
      if (!grouped[monthKey]) grouped[monthKey] = []
      grouped[monthKey].push(date.date())
    })
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, days]) => ({ month, days: days.sort((a, b) => a - b) }))
  }, [selectedDates])

  return {
    currentMonth,
    setCurrentMonth,
    selectedDates,
    setSelectedDates,
    rangeStart,
    rangeEnd,
    months,
    calendarGrid,
    isDateSelectable,
    getCellStyle,
    datesByMonth,
  }
}

/** 动画数字组件（赠送天数概览卡片使用） */
export function AnimatedNumber({ value, suffix }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}{suffix && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2 }}>{suffix}</span>}</>
}
