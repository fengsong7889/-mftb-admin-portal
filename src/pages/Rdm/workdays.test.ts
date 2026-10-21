/**
 * 工作日折算的口径回归：迭代产能与任务计划工时都依赖它自动填值，
 * 一旦把周末算进去，产能会系统性虚高、负载率系统性偏低（排期预警就失效了）。
 */
import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { countWorkdays, workdayHours, HOURS_PER_WORKDAY } from './workdays'

const d = (value: string) => dayjs(value)

describe('countWorkdays', () => {
  it('单个工作日算 1 天', () => {
    expect(countWorkdays(d('2026-10-19'), d('2026-10-19'))).toBe(1)
  })

  it('单个周六/周日不计', () => {
    expect(countWorkdays(d('2026-10-24'), d('2026-10-24'))).toBe(0)
    expect(countWorkdays(d('2026-10-25'), d('2026-10-25'))).toBe(0)
  })

  it('整周只算 5 个工作日', () => {
    // 2026-10-19（一）~ 2026-10-25（日）
    expect(countWorkdays(d('2026-10-19'), d('2026-10-25'))).toBe(5)
  })

  it('跨两个整周算 10 个工作日', () => {
    // 2026-10-19（一）~ 2026-11-01（日）
    expect(countWorkdays(d('2026-10-19'), d('2026-11-01'))).toBe(10)
  })

  it('开始于周末时从下一个工作日算起', () => {
    // 2026-10-24（六）~ 2026-10-27（二）→ 周一、周二
    expect(countWorkdays(d('2026-10-24'), d('2026-10-27'))).toBe(2)
  })

  it('任一端缺失或起止倒挂回 0', () => {
    expect(countWorkdays(undefined, d('2026-10-19'))).toBe(0)
    expect(countWorkdays(d('2026-10-19'), null)).toBe(0)
    expect(countWorkdays(d('2026-10-20'), d('2026-10-19'))).toBe(0)
  })
})

describe('workdayHours', () => {
  it('按每个工作日 8 小时折算', () => {
    // 2026-10-01（四）~ 2026-10-15（四）：2 + 5 + 4 = 11 个工作日
    expect(HOURS_PER_WORKDAY).toBe(8)
    expect(workdayHours(d('2026-10-01'), d('2026-10-15'))).toBe(88)
  })

  it('纯周末区间折算为 0（不自动填入非法值）', () => {
    expect(workdayHours(d('2026-10-24'), d('2026-10-25'))).toBe(0)
  })
})
