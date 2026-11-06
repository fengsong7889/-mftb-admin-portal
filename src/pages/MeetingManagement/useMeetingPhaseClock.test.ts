/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 会议阶段时钟单测。
 *
 * 钉住的缺陷：会议阶段是服务端按 now 现算的，页面不取数就停在旧快照上——
 * E2E 实测 07:00 开始的会 07:01 仍显示「待開會」，必须手动刷新。
 * 临界点算错等于时钟白挂，所以这里专门断言「下一个该醒的时刻」而不是只断言渲染。
 */
import { describe, expect, it } from 'vitest'
import { nextPhaseBoundary } from './useMeetingPhaseClock'

const NOW = Date.parse('2026-11-06T08:00:00')
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString()

describe('nextPhaseBoundary', () => {
  it('待開會的会取开始时间作为临界点', () => {
    expect(nextPhaseBoundary([{ phase: 'pending', startTime: at(30), endTime: at(90) }], NOW))
      .toBe(Date.parse(at(30)))
  })

  it('进行中的会取结束时间作为临界点', () => {
    expect(nextPhaseBoundary([{ phase: 'ongoing', startTime: at(-10), endTime: at(20) }], NOW))
      .toBe(Date.parse(at(20)))
  })

  it('已收尾的阶段（ended/cancelled/released/finished）不再挂定时器', () => {
    const rows = ['ended', 'finished', 'cancelled', 'released'].map(phase => ({
      phase, startTime: at(5), endTime: at(60),
    }))
    expect(nextPhaseBoundary(rows, NOW)).toBeNull()
  })

  it('多场会取最近的一个临界点，而不是第一条', () => {
    const rows = [
      { phase: 'pending', startTime: at(120), endTime: at(180) },
      { phase: 'ongoing', startTime: at(-5), endTime: at(10) },
      { phase: 'pending', startTime: at(45), endTime: at(75) },
    ]
    expect(nextPhaseBoundary(rows, NOW)).toBe(Date.parse(at(10)))
  })

  it('签到截止时间也作为临界点：超时未签到会被服务端自动释放，不排进去就看不到「已釋放」', () => {
    const rows = [{ phase: 'pending', startTime: at(-1), endTime: at(59), checkinDeadlineAt: at(15) }]
    expect(nextPhaseBoundary(rows, NOW)).toBe(Date.parse(at(15)))
  })

  it('已过期的时间点一律忽略，不会算出一个过去的临界点', () => {
    expect(nextPhaseBoundary([{ phase: 'pending', startTime: at(-30), endTime: at(-10) }], NOW)).toBeNull()
  })

  it('缺失字段与非法时间不抛错（后端旧版本可能不下发 endTime）', () => {
    expect(nextPhaseBoundary([
      { phase: 'pending' },
      { phase: 'pending', startTime: null, endTime: 'not-a-date' },
      { phase: null, startTime: at(5) },
    ], NOW)).toBeNull()
  })

  it('空列表返回 null', () => {
    expect(nextPhaseBoundary([], NOW)).toBeNull()
  })
})
