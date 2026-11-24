/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import i18n from '@/i18n'
import {
  HOURS_PER_DAY, buildRange, dayBadge, dayType, fmt, hoursInPeriod, isRestDay, loadData,
  mondayOf, overlaps, progressColor, setDayType, taskHours, taskStatus, weekName, weekdayShort, workdayCount,
  type GanttData,
} from './worklogGanttModel'

/**
 * 工作日引擎与台账模型的口径单测。
 *
 * 这批数字是甘特、统计卡、汇报三处共用的唯一真值，所以钉的是「口径」而不是渲染：
 * 跨周末/节假日不计工时、補班计入、調休/請假不计、区间工时只算交集工作日。
 */

const EMPTY = { holidays: [] as string[], makeup: [] as string[], compOff: [] as string[], leave: [] as string[] }
/** 2026-11-16 是周一，11-21/22 是周六/周日 */
const MON = '2026-11-16'
const SUN = '2026-11-22'

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('工作日口径', () => {
  it('整周只数 5 个工作日，周末自动剔除', () => {
    expect(workdayCount(MON, SUN, EMPTY)).toBe(5)
    expect(taskHours({ id: 't', title: 'x', start: MON, end: SUN, progress: 0, note: '' }, EMPTY)).toBe(5 * HOURS_PER_DAY)
  })

  it('节假日与调休/请假都扣工时，補班反过来把周末算进来', () => {
    const holiday = { ...EMPTY, holidays: ['2026-11-18'] }
    expect(workdayCount(MON, SUN, holiday)).toBe(4)

    const rest = { ...EMPTY, compOff: ['2026-11-19'], leave: ['2026-11-20'] }
    expect(workdayCount(MON, SUN, rest)).toBe(3)

    const makeup = { ...EMPTY, makeup: [SUN] }
    expect(workdayCount(MON, SUN, makeup)).toBe(6)
    expect(isRestDay(dayjs(SUN), makeup)).toBe(false)
  })

  it('未排期与起止倒挂都返回 0，不给出假工时', () => {
    expect(workdayCount(null, SUN, EMPTY)).toBe(0)
    expect(workdayCount(SUN, MON, EMPTY)).toBe(0)
  })

  it('区间工时只算交集工作日：跨月任务不把整段工时记进本期', () => {
    const data = { ...EMPTY, holidays: ['2026-12-01'] }
    // 任务 11/20 ~ 12/05；查询区间 11/23 ~ 11/29（周一~周日）→ 交集 11/23~11/27 共 5 个工作日
    const task = { id: 't', title: '跨月任務', start: '2026-11-20', end: '2026-12-05', progress: 10, note: '' }
    expect(hoursInPeriod(task, '2026-11-23', '2026-11-29', data)).toBe(5 * HOURS_PER_DAY)
    // 整段任务的总工时仍是全部工作日（11/20、11/23~27、11/30、12/02~04 = 10 天；11/21-22、11/28-29、12/05 是周末，12/01 节假日）
    expect(taskHours(task, data)).toBe(10 * HOURS_PER_DAY)
  })

  it('跨周期任务在相交的每个区间都可见，不相交才隐藏', () => {
    const task = { id: 't', title: '跨週任務', start: '2026-11-18', end: '2026-12-03', progress: 20, note: '' }
    expect(overlaps(task, MON, SUN)).toBe(true)
    expect(overlaps(task, '2026-11-30', '2026-12-06')).toBe(true)
    expect(overlaps(task, '2026-11-02', '2026-11-08')).toBe(false)
    const unscheduled = { ...task, start: null, end: null }
    expect(overlaps(unscheduled, MON, SUN)).toBe(false)
  })
})

describe('时间轴与状态', () => {
  it('轴线覆盖全部排期并按整周补齐，至少四周', () => {
    const groups = [{ id: 'g', title: 'G', hue: 0, tasks: [{ id: 't', title: 'T', start: '2026-11-18', end: '2026-12-31', progress: 0, note: '' }] }]
    const days = buildRange(groups, EMPTY)
    expect(days.length % 7).toBe(0)
    expect(days.length).toBeGreaterThanOrEqual(28)
    expect(dayjs(days[0].key).day()).toBe(1)
    expect(days.some(d => d.today)).toBe(true)
  })

  it('聚焦区间原样呈现：单日查询就是一列，不再补整周留白', () => {
    const days = buildRange([], EMPTY, { start: dayjs('2026-11-26'), end: dayjs('2026-11-26') })
    expect(days).toHaveLength(1)
    expect(days[0].key).toBe('2026-11-26')
  })

  it('状态由进度唯一推导，未排期落待排期', () => {
    const base = { id: 't', title: 'T', note: '', progress: 0 }
    expect(taskStatus({ ...base, start: null, end: null })).toBe('plan')
    expect(taskStatus({ ...base, start: MON, end: SUN, progress: 0 })).toBe('todo')
    expect(taskStatus({ ...base, start: MON, end: SUN, progress: 40 })).toBe('doing')
    expect(taskStatus({ ...base, start: MON, end: SUN, progress: 100 })).toBe('done')
  })

  it('进度五段色按区间分档，100% 才是绿', () => {
    expect(progressColor(0)).toBe('var(--danger)')
    expect(progressColor(20)).toBe('var(--danger)')
    expect(progressColor(21)).toBe('var(--brand)')
    expect(progressColor(40)).toBe('var(--brand)')
    expect(progressColor(41)).toBe('var(--warning)')
    expect(progressColor(60)).toBe('var(--warning)')
    expect(progressColor(61)).toBe('var(--info)')
    expect(progressColor(99)).toBe('var(--info)')
    expect(progressColor(100)).toBe('var(--success)')
  })

  it('周一为一周起点', () => {
    expect(fmt(mondayOf(dayjs('2026-11-22')))).toBe(MON)
    expect(fmt(mondayOf(dayjs('2026-11-16')))).toBe(MON)
  })
})

describe('特殊日期登记（互斥）', () => {
  it('同一天改类型会从旧名单摘除，不会同时算两次', () => {
    let data: GanttData = { groups: [], holidays: ['2026-11-24'], makeup: [], compOff: [], leave: [] }
    data = { ...data, ...setDayType(data, '2026-11-24', 'makeup') }
    expect(data.holidays).not.toContain('2026-11-24')
    expect(data.makeup).toContain('2026-11-24')
    expect(dayType('2026-11-24', data)).toBe('makeup')

    data = { ...data, ...setDayType(data, '2026-11-24', null) }
    expect(dayType('2026-11-24', data)).toBeNull()
    expect(isRestDay(dayjs('2026-11-24'), data)).toBe(false)
  })

  it('登记顺序不改变判定：节假日优先于补班', () => {
    const data: GanttData = { groups: [], holidays: ['2026-11-28'], makeup: ['2026-11-28'], compOff: [], leave: [] }
    expect(dayType('2026-11-28', data)).toBe('holiday')
    expect(isRestDay(dayjs('2026-11-28'), data)).toBe(true)
  })
})

describe('文案取值（切语言立刻生效，不在模块层定死）', () => {
  it('週序与星期缩写走语言包，单字角标按类型给字', async () => {
    expect(weekName(0)).toBe('第1週')
    expect(weekdayShort(0)).toBe('日')
    expect(weekdayShort(1)).toBe('一')
    expect(dayBadge('holiday')).toBe('休')
    expect(dayBadge('makeup')).toBe('班')
    expect(dayBadge('leave')).toBe('請')

    await i18n.changeLanguage('en')
    expect(weekName(0)).toBe('Week 1')
    expect(weekdayShort(1)).toBe('M')
    expect(dayBadge('compOff')).toBe('Off')
    await i18n.changeLanguage('zh-TW')
  })
})

describe('存量数据兼容', () => {
  it('旧版台账缺 compOff/leave/planType 时补默认而不是拒加载重置', () => {
    const legacy = {
      groups: [{ id: 'g', title: '舊工作項', hue: 0, tasks: [{ id: 't', title: '舊任務', start: MON, end: SUN, progress: 30, note: '舊備註' }] }],
      holidays: ['2026-11-18'],
      makeup: [],
    }
    localStorage.setItem('cpm-worklog-gantt-v1', JSON.stringify(legacy))
    const loaded = loadData()
    expect(loaded.compOff).toEqual([])
    expect(loaded.leave).toEqual([])
    expect(loaded.groups[0].tasks[0].planType).toBe('planned')
    expect(loaded.groups[0].tasks[0].insertedAt).toBeNull()
    expect(loaded.groups[0].tasks[0].title).toBe('舊任務')
  })

  it('结构损坏时回退示例数据，不抛错白屏', () => {
    localStorage.setItem('cpm-worklog-gantt-v1', '{"groups":"不是数组"}')
    const loaded = loadData()
    expect(Array.isArray(loaded.groups)).toBe(true)
    expect(loaded.groups.length).toBeGreaterThan(0)
  })
})
