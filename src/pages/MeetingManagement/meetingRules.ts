/**
 * 会议预约前端校验规则（纯函数，可单测）。
 *
 * <b>定位：这是体验，不是安全边界。</b>目的是少一次往返——用户点提交前就告诉他哪里不对。
 * 后端 MeetingRuleService 独立执行同一套规则（提前期/粒度/时长/每日窗/冲突），
 * 绕过本文件直接调接口必须照样被拒。
 *
 * <p>规则口径与后端逐字对齐（半开区间 [start, end)、粒度对齐、同日约束）：
 * 两边任一处漂移，就会出现"前端放行、后端拒绝"或反过来"前端拦截了其实合法的时段"。
 *
 * <p><b>会议室容量不在这里</b>：容量只描述现场能坐多少人，邀约名单里还有线上参会的人，
 * 拿它当提交门槛等于把"8 人房不能邀 12 人"写进系统。超容量只做提醒（见预约页的提示条），
 * 不做拦截；后端 MeetingRuleService 同口径不拦。
 */
import type { MeetingRoomVO } from '@/api/meeting'

/** 与后端 MeetingConstants.OCCUPYING_STATUSES 一致：只有这两种状态占着窗口 */
export const OCCUPYING_STATUSES = ['booked', 'checked_in']

export interface WindowRule {
  /** 粒度（分钟） */
  granularity: number
  minDuration: number
  maxDuration: number
  /** 'HH:mm' */
  bookableStart: string
  bookableEnd: string
  /** 最可提前天数 */
  advanceDays: number
  /** 最少提前分钟数 */
  minLeadMinutes: number
}

export const DEFAULT_WINDOW_RULE: WindowRule = {
  granularity: 15,
  minDuration: 15,
  maxDuration: 240,
  bookableStart: '08:00',
  bookableEnd: '22:00',
  advanceDays: 30,
  minLeadMinutes: 0,
}

/** 'HH:mm' → 当日分钟数；非法输入返回 NaN，由调用方判定 */
export function toMinutesOfDay(text?: string | null): number {
  if (!text) return Number.NaN
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!match) return Number.NaN
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return Number.NaN
  return hour * 60 + minute
}

/**
 * 两个时间区间是否冲突（左闭右开）。
 *
 * <p>10:00–11:00 与 11:00–12:00 是相邻不是冲突：用 <= 判定会让背靠背的会议互相挡死，
 * 房间白天永远只能订一半。
 */
export function isOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

/** 时长（分钟） */
export function durationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000)
}

/** 房间生效规则：房间列为 null 时回落全局（与后端 MeetingRuleService.effectiveFor 同一口径） */
export function ruleForRoom(room: MeetingRoomVO, global: WindowRule = DEFAULT_WINDOW_RULE): WindowRule {
  const min = room.minDuration ?? global.granularity
  const maxRaw = room.maxDuration ?? global.maxDuration
  // 上下限倒挂时以"能订出去"为准修正，与后端一致
  const max = maxRaw < min ? min : maxRaw
  return {
    granularity: global.granularity,
    minDuration: min,
    maxDuration: max,
    bookableStart: room.bookableStartTime ?? global.bookableStart,
    bookableEnd: room.bookableEndTime ?? global.bookableEnd,
    advanceDays: global.advanceDays,
    minLeadMinutes: global.minLeadMinutes,
  }
}

/**
 * 校验一次窗口占用，返回错误文案列表（空数组=通过）。
 *
 * <p>一次返回全部问题而不是第一条：用户改了时长才发现日期也超期，等于把一次提交拆成三轮试错。
 */
export function validateBookingWindow(params: {
  room?: MeetingRoomVO | null
  start?: Date | null
  end?: Date | null
  /** 参会人数（含组织者与外部人员）：仍要传，但只用于展示与落库口径，不构成门槛 */
  attendeeCount: number
  now?: Date
  global?: WindowRule
}): string[] {
  const { room, start, end } = params
  const now = params.now ?? new Date()
  const errors: string[] = []

  if (!room) {
    return ['請選擇會議室']
  }
  if (!start || !end) {
    return ['請選擇完整的會議起止時間']
  }
  if (!room.bookable) {
    errors.push('該會議室已停止接受預約')
  }
  if (end.getTime() <= start.getTime()) {
    errors.push('結束時間必須晚於開始時間')
    return errors
  }
  if (start.toDateString() !== end.toDateString()) {
    errors.push('會議需在同一天內結束')
  }

  const rule = ruleForRoom(room, params.global)
  const startMinuteOfDay = start.getHours() * 60 + start.getMinutes()
  const endMinuteOfDay = end.getHours() * 60 + end.getMinutes()
  const duration = durationMinutes(start, end)

  if (start.getSeconds() !== 0 || end.getSeconds() !== 0) {
    errors.push('會議時間請精確到分鐘')
  }
  if (rule.granularity > 0
    && (startMinuteOfDay % rule.granularity !== 0 || duration % rule.granularity !== 0)) {
    errors.push(`會議時間需對齊 ${rule.granularity} 分鐘刻度`)
  }
  if (duration < rule.minDuration) {
    errors.push(`會議時長不得少於 ${rule.minDuration} 分鐘`)
  }
  if (duration > rule.maxDuration) {
    errors.push(`該會議室單場最長 ${rule.maxDuration} 分鐘`)
  }

  const windowStart = toMinutesOfDay(rule.bookableStart)
  const windowEnd = toMinutesOfDay(rule.bookableEnd)
  if (!Number.isNaN(windowStart) && !Number.isNaN(windowEnd)) {
    if (startMinuteOfDay < windowStart || endMinuteOfDay > windowEnd) {
      errors.push(`該會議室可預約時段為 ${rule.bookableStart}–${rule.bookableEnd}`)
    }
  }

  const leadMs = start.getTime() - now.getTime()
  if (leadMs < rule.minLeadMinutes * 60000) {
    // 与后端 MeetingRuleService 同口径：提前量为 0 时不说“提前 0 分鐘”，那条规则只是“不能约过去”
    errors.push(rule.minLeadMinutes > 0
      ? `會議需提前 ${rule.minLeadMinutes} 分鐘以上預約`
      : '會議開始時間不能早於當前時間')
  }
  const farthest = new Date(now.getTime() + rule.advanceDays * 24 * 60 * 60 * 1000)
  if (start.getTime() > farthest.getTime()) {
    errors.push(`最多可提前 ${rule.advanceDays} 天預約`)
  }
  // 参会人数（含组织者与外部人员）不再与容量比对：容量是现场座位参考，不是邀约上限
  return errors
}

/**
 * 从忙闲数据里算出某间房在给定窗口内的空闲段（前端画时间轴用）。
 *
 * <p>输入一律用"当日分钟数"，避免在纯函数里带时区与 Date 解析——
 * 出参时间字符串是 'YYYY-MM-DD HH:mm:ss' 格式，解析一次由调用方完成并复用。
 */
export function freeWindows(
  windowStart: number,
  windowEnd: number,
  occupied: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...occupied].sort((a, b) => a.start - b.start)
  const free: Array<{ start: number; end: number }> = []
  let cursor = windowStart
  for (const slot of sorted) {
    const start = Math.max(slot.start, windowStart)
    const end = Math.min(slot.end, windowEnd)
    if (end <= cursor) continue
    if (start > cursor) free.push({ start: cursor, end: start })
    cursor = Math.max(cursor, end)
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd })
  return free
}

/** 'YYYY-MM-DD HH:mm:ss' → 当日分钟数；解析失败返回 NaN */
export function minuteOfDateTimeText(text?: string | null): number {
  if (!text) return Number.NaN
  const match = /\d{2}:(\d{2})/.exec(text)
  if (!match) return Number.NaN
  const hour = Number(text.slice(11, 13))
  return hour * 60 + Number(match[1])
}

/**
 * 给定窗口内该房间是否已被占用（与后端同口径的左闭右开）。
 *
 * <p>只比时间戳，不按天分桶：跨日占用段（数据异常或历史遗留）用同一表达式照样能得出正确结论，
 * 分桶写法反而会在跨日时漏判。出参字串无时区信息，按本地时区解析与后端一致。
 */
export function hasConflict(
  slots: Array<{ startTime: string; endTime: string }>,
  start: Date,
  end: Date,
): boolean {
  const startMs = start.getTime()
  const endMs = end.getTime()
  return slots.some(slot => {
    const slotStart = new Date(slot.startTime.replace(' ', 'T')).getTime()
    const slotEnd = new Date(slot.endTime.replace(' ', 'T')).getTime()
    if (Number.isNaN(slotStart) || Number.isNaN(slotEnd)) return false
    return slotStart < endMs && slotEnd > startMs
  })
}

/** 时长选择器候选：按粒度生成，避免用户手输 7 分钟这种非法值 */
export function durationOptions(granularity: number, maxMinutes: number): number[] {
  const step = Math.max(1, granularity)
  const out: number[] = []
  for (let m = step; m <= maxMinutes; m += step) out.push(m)
  return out
}
