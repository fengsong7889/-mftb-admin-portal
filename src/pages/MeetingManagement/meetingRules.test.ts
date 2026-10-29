import { describe, expect, it } from 'vitest'
import type { MeetingRoomVO } from '@/api/meeting'
import {
  DEFAULT_WINDOW_RULE,
  durationOptions,
  freeWindows,
  hasConflict,
  isOverlap,
  ruleForRoom,
  toMinutesOfDay,
  validateBookingWindow,
} from './meetingRules'

/** 造一间房：只填会影响校验的字段，其余走默认 */
function room(overrides: Partial<MeetingRoomVO> = {}): MeetingRoomVO {
  return {
    id: 1,
    roomNo: 'MR-1F-01',
    roomName: '會議室 A',
    locationText: '總部 · 1 棟 · 1F',
    capacity: 8,
    facilities: [],
    photoUrls: [],
    status: 'active',
    bookable: true,
    checkinRequired: false,
    hideTitle: false,
    adminUserIds: [],
    version: 0,
    ...overrides,
  } as MeetingRoomVO
}

/** 固定"现在"，避免用例随真实时间漂移 */
const NOW = new Date('2026-06-15T09:00:00')
const at = (text: string) => new Date(`2026-06-15T${text}`)

describe('时段重叠判定（左闭右开）', () => {
  it('相邻不算冲突：10:00–11:00 与 11:00–12:00 可以背靠背', () => {
    expect(isOverlap(600, 660, 660, 720)).toBe(false)
    expect(isOverlap(660, 720, 600, 660)).toBe(false)
  })

  it('包含 / 被包含 / 左交叉 / 右交叉都算冲突', () => {
    expect(isOverlap(600, 720, 630, 660)).toBe(true)   // 新窗口包住已有
    expect(isOverlap(630, 660, 600, 720)).toBe(true)   // 新窗口被已有包住
    expect(isOverlap(600, 660, 630, 700)).toBe(true)   // 右交叉
    expect(isOverlap(630, 700, 600, 660)).toBe(true)   // 左交叉
  })

  it('不同房间不参与判定（由调用方按 roomId 分组后各自比对）', () => {
    const slots = [{ startTime: '2026-06-15 10:00:00', endTime: '2026-06-15 11:00:00' }]
    expect(hasConflict(slots, at('11:00:00'), at('12:00:00'))).toBe(false)
    expect(hasConflict(slots, at('10:30:00'), at('11:30:00'))).toBe(true)
  })

  it('脏时间串不参与判定而不是误报冲突', () => {
    expect(hasConflict([{ startTime: 'not-a-date', endTime: '' }], at('10:00:00'), at('11:00:00'))).toBe(false)
  })
})

describe('时间解析', () => {
  it('HH:mm 解析到分钟，非法输入返回 NaN 由调用方兜底', () => {
    expect(toMinutesOfDay('08:00')).toBe(480)
    expect(toMinutesOfDay('22:30')).toBe(1350)
    expect(toMinutesOfDay('24:00')).toBe(Number.NaN)
    expect(toMinutesOfDay('8:0')).toBe(Number.NaN)
    expect(toMinutesOfDay(undefined)).toBe(Number.NaN)
  })
})

describe('房间规则回落全局默认', () => {
  it('房间未单独配置时回落到全局值', () => {
    const rule = ruleForRoom(room(), DEFAULT_WINDOW_RULE)
    expect(rule.bookableStart).toBe('08:00')
    expect(rule.maxDuration).toBe(240)
  })

  it('上下限倒挂时以能订出去为准修正，而不是让所有预约都被拒', () => {
    const rule = ruleForRoom(room({ minDuration: 120, maxDuration: 30 }), DEFAULT_WINDOW_RULE)
    expect(rule.minDuration).toBe(120)
    expect(rule.maxDuration).toBe(120)
  })
})

describe('预约窗口校验', () => {
  it('正常窗口通过', () => {
    expect(validateBookingWindow({
      room: room(), start: at('10:00:00'), end: at('11:00:00'), attendeeCount: 6, now: NOW,
    })).toEqual([])
  })

  it('背靠背时段不被误拦', () => {
    expect(validateBookingWindow({
      room: room(), start: at('11:00:00'), end: at('12:00:00'), attendeeCount: 8, now: NOW,
    })).toEqual([])
  })

  it('超出每日可预约窗给出具体时段；参会人数超过容量不再拦截', () => {
    const errors = validateBookingWindow({
      room: room({ capacity: 4 }), start: at('21:00:00'), end: at('23:00:00'), attendeeCount: 6, now: NOW,
    })
    expect(errors.join('|')).toContain('可預約時段為 08:00–22:00')
    // 容量只是现场座位参考（线上参会不占座位），不能把它变成提交门槛
    expect(errors.join('|')).not.toContain('容納')
  })

  it('参会人数不限：4 人房邀 20 人仍可通过窗口校验', () => {
    expect(validateBookingWindow({
      room: room({ capacity: 4 }), start: at('10:00:00'), end: at('11:00:00'), attendeeCount: 20, now: NOW,
    })).toEqual([])
  })

  it('未对齐粒度的时间被拒绝', () => {
    const errors = validateBookingWindow({
      room: room(), start: at('10:07:00'), end: at('11:00:00'), attendeeCount: 1, now: NOW,
    })
    expect(errors.join('|')).toContain('15 分鐘刻度')
  })

  it('跨天会议直接要求同日结束', () => {
    const errors = validateBookingWindow({
      room: room(),
      start: new Date('2026-06-15T21:00:00'),
      end: new Date('2026-06-16T01:00:00'),
      attendeeCount: 2,
      now: NOW,
    })
    expect(errors.join('|')).toContain('同一天內結束')
  })

  it('停止接受预约的房间任何窗口都被拒', () => {
    const errors = validateBookingWindow({
      room: room({ bookable: false }), start: at('10:00:00'), end: at('11:00:00'), attendeeCount: 2, now: NOW,
    })
    expect(errors[0]).toBe('該會議室已停止接受預約')
  })

  it('一次返回全部问题，不把用户推进"改一处报一处"的循环', () => {
    const errors = validateBookingWindow({
      room: room(), start: at('07:00:00'), end: at('23:30:00'), attendeeCount: 9, now: NOW,
    })
    expect(errors.length).toBeGreaterThan(1)
  })
})

describe('空闲段计算', () => {
  it('占用段之间的空隙被完整列出', () => {
    expect(freeWindows(480, 1320, [{ start: 600, end: 660 }, { start: 720, end: 780 }]))
      .toEqual([{ start: 480, end: 600 }, { start: 660, end: 720 }, { start: 780, end: 1320 }])
  })

  it('重叠与乱序的占用段不会算出负长度空隙', () => {
    const free = freeWindows(480, 1320, [{ start: 900, end: 1000 }, { start: 600, end: 800 }, { start: 620, end: 700 }])
    expect(free.every(seg => seg.end > seg.start)).toBe(true)
    // 620–700 被 600–800 完全包住，只能算一段占用；900–1000 前留出 800–900 的空隙
    expect(free).toEqual([{ start: 480, end: 600 }, { start: 800, end: 900 }, { start: 1000, end: 1320 }])
  })
})

describe('时长候选', () => {
  it('按粒度生成，最多到上限', () => {
    expect(durationOptions(15, 60)).toEqual([15, 30, 45, 60])
    expect(durationOptions(0, 30)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30])
  })
})
