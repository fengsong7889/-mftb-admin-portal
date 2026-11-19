/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 时间维度的纯函数层（阶段三）。
 *
 * 边界必须先说清楚：**聚合真值在服务端**（`CpmSnapshotBuilder` / 时段表 SUM）。
 * 这里只做两件事——① 录入时的「起止 → 耗时」即时预览（用户当场要看到数字才对得上），
 * ② 展示层格式化。任何把这里当统计口径的用法都是错的：前端算一遍、后端算一遍，
 * 两套口径必然在跨夜/零时长/四舍五入上分叉，汇报数字就变成了罗生门。
 *
 * 单独成文件（而不是留在组件里）的原因与 `cpmPeriod.ts` 同款：
 * react-refresh 要求组件文件只导出组件，且这几会被记时弹层、阅读面、日报三处共用。
 */

import i18n from '@/i18n'

/** 业务上限：一段不超过 24 小时（与后端 `ck_cpm_time_duration` 同一约束值） */
export const MAX_SEGMENT_MINUTES = 1440

/** 'HH:mm' → 当日分钟数；非法返回 null */
export function parseClock(value?: string | null): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * 起止 → 耗时分钟。
 *
 * 跨夜必须显式声明而不是「end < start 就 +24h」自动推断：夜班交接、补记历史时
 * 「09:00 → 09:00」既可能是 0 分钟也可能是 24 小时，猜错就是凭空多记一整天。
 */
export function calcSegmentMinutes(
  start?: string | null,
  end?: string | null,
  crossesMidnight = false,
): number | null {
  const from = parseClock(start)
  const to = parseClock(end)
  if (from === null || to === null) return null
  let delta = to - from
  if (delta < 0) delta += crossesMidnight ? MAX_SEGMENT_MINUTES : 0
  // 声明不跨夜却是倒序区间：不给一个假装合理的数字
  if (delta < 0) return null
  return delta === 0 ? null : Math.min(delta, MAX_SEGMENT_MINUTES)
}

/**
 * 分钟 → 展示文案：7 小时 5 分 / 1 小时 / 30 分；0 与 null 一律给占位而不是「0 分」。
 *
 * 单位与拼接顺序全部交给语言包（`{{hours}}`/`{{minutes}}` 插值）而不是在这里拼字符串：
 * 日语、韩语的量词位置与中文不同，硬拼出来的外语界面会读成「30 分 1 小時」这种半截中文。
 */
export function formatMinutes(minutes?: number | null): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return String(i18n.t('cpm.time.format.minutesOnly', { count: rest, defaultValue: '{{count}} 分' }))
  if (rest === 0) return String(i18n.t('cpm.time.format.hoursOnly', { count: hours, defaultValue: '{{count}} 小時' }))
  return String(i18n.t('cpm.time.format.hoursMinutes', { hours, minutes: rest, defaultValue: '{{hours}} 小時 {{minutes}} 分' }))
}

/** 分钟 → 小数小时（保留一位，与 `work_hours DECIMAL(4,1)` 同精度） */
export function minutesToHours(minutes?: number | null): number | null {
  if (minutes === null || minutes === undefined || minutes <= 0) return null
  return Math.round(minutes / 6) / 10
}

/** 小时数展示（工时区与条目 chip 共用同一格式，避免「7.5h」与「7 小時 30 分」两套口径混用） */
export function formatHours(minutes?: number | null): string {
  const hours = minutesToHours(minutes)
  return hours === null ? '—' : `${hours}h`
}

/** 时段区间展示：跨夜显式标 +1 日，否则读者会以为这段比条目本身还短 */
export function formatSegmentRange(
  start?: string | null,
  end?: string | null,
  crossesMidnight = false,
): string | null {
  if (!start && !end) return null
  if (start && !end) return String(i18n.t('cpm.time.range.from', { time: start, defaultValue: '{{time}} 起' }))
  if (!start && end) return String(i18n.t('cpm.time.range.to', { time: end, defaultValue: '至 {{time}}' }))
  return String(i18n.t('cpm.time.range.between', {
    from: start, to: end, crossesMidnight: crossesMidnight ? '+1' : '',
    defaultValue: '{{from}}–{{to}}{{crossesMidnight}}',
  }))
}

/**
 * 完成率分母：已取消不计入。
 *
 * 取消的工作不是「没做完」，而是「不再该做」；留在分母里会把一个人的完成率
 * 压到与他实际交付表现无关的数字。延期仍计入分母——改期不等于取消，事还在。
 */
export function completionDenominator(totals: { total: number; cancelled?: number }): number {
  return Math.max(0, totals.total - (totals.cancelled ?? 0))
}

/** 占比：分母为 0 时返回 0 而不是 NaN/Infinity（画条形时 NaN 会让整行塌掉） */
export function percentOf(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

/** 'HH:mm' 输入框友好值：兼容后端可能返回的 'HH:mm:ss' */
export function toClockInput(value?: string | null): string | undefined {
  if (!value) return undefined
  const parts = value.split(':')
  return parts.length >= 2 ? `${parts[0].padStart(2, '0')}:${parts[1]}` : undefined
}
