/**
 * RDM 排期的工作日折算。
 *
 * <p>迭代产能与任务计划工时默认都由起止日期推算：每天 8 小时、只扣周六周日。
 * 暂不扣法定节假日——节假日随地区与调休变化，前端单独维护一份日历必然与考勤口径分裂，
 * 需要时由使用者在自动填入的数值上手改。
 */
import type { Dayjs } from 'dayjs'

/** 每工作日标准工时，与团队负载的默认可用容量口径一致 */
export const HOURS_PER_WORKDAY = 8

/**
 * 起止日期（含首尾）之间的工作日天数；任一端缺失或起止倒挂回 0。
 *
 * <p>先按整周 5 个工作日折算，再逐日补余数（最多 6 天），
 * 避免长跨度区间在渲染期做几百上千次循环。
 */
export function countWorkdays(start?: Dayjs | null, end?: Dayjs | null): number {
  if (!start || !end) return 0
  const from = start.startOf('day')
  const to = end.startOf('day')
  if (to.isBefore(from)) return 0
  const totalDays = to.diff(from, 'day') + 1
  const fullWeeks = Math.floor(totalDays / 7)
  let workdays = fullWeeks * 5
  let cursor = from.add(fullWeeks * 7, 'day')
  while (!cursor.isAfter(to)) {
    const dow = cursor.day()
    if (dow !== 0 && dow !== 6) workdays += 1
    cursor = cursor.add(1, 'day')
  }
  return workdays
}

/** 依起止日期折算工时（工作日 × 8h）；日期不完整或倒挂回 0，调用方据此判断是否自动填入 */
export function workdayHours(start?: Dayjs | null, end?: Dayjs | null): number {
  return countWorkdays(start, end) * HOURS_PER_WORKDAY
}
