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
import { fmt } from './worklogGanttModel'
import { autoOverview, buildWorkReport, doneAtOf, progressAt, reportToMarkdown } from './worklogReport'
import type { GanttData, GanttTask } from './worklogGanttModel'

/**
 * 「工作記錄 → 匯報」聚合引擎单测。
 *
 * 汇报的铁律是数字只来自台账事实（前端不重算、AI 不参与计数），所以这里钉五件事：
 * 期初/期末取流水快照、完成时点取流水首次 ≥100、工时取区间交集工作日、
 * 下期计划从全台账找（不是从"与本期相交的行"里筛）、导出文本与页面同源。
 *
 * 周期一律用固定日期 2026-11-16（周一）~ 2026-11-22（周日）：
 * 只有逾期天数依赖「今天」，那一条按同一个时钟算，避免换天就红。
 */

const S = '2026-11-16'
const E = '2026-11-22'
const MON = '2026-11-16'
const WED = '2026-11-18'
const FRI = '2026-11-20'
const NEXT_MON = '2026-11-23'
const FAR = '2026-12-31'

const task = (over: Partial<GanttTask>): GanttTask => ({
  id: 't', title: '任務', start: MON, end: FRI, progress: 0, note: '', ...over,
})

const data = (tasks: GanttTask[]): GanttData => ({
  groups: [{ id: 'g1', title: '工作項一', hue: 0, tasks }],
  holidays: [], makeup: [], compOff: [], leave: [],
})

const period = { start: dayjs(S), end: dayjs(E) }

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('进度流水快照', () => {
  it('有流水时取 ≤date 的最后一笔，不看当前值', () => {
    const t = task({ progress: 80, history: [{ at: MON, progress: 0 }, { at: WED, progress: 40 }] })
    expect(progressAt(t, MON)).toBe(0)
    expect(progressAt(t, WED)).toBe(40)
    expect(progressAt(t, E)).toBe(40)
    // 当前值 80 没有对应流水就不进历史某天：期初/期末只能引用已发生的事实，
    // 否则汇报里的「期末进度」会跟着用户手改的当前值一起漂移。
    expect(progressAt(t, '2026-12-31')).toBe(40)
  })

  it('无流水的存量数据兜底：开始前 0，之后取当前进度', () => {
    const t = task({ progress: 60, history: undefined })
    expect(progressAt(t, '2026-11-15')).toBe(0)
    expect(progressAt(t, E)).toBe(60)
  })

  it('完成时点取流水首次 ≥100；没流水就如实取结束日', () => {
    const withHistory = task({ progress: 100, history: [{ at: MON, progress: 0 }, { at: WED, progress: 100 }] })
    expect(doneAtOf(withHistory)).toBe(WED)
    expect(doneAtOf(task({ progress: 100, history: undefined, end: FRI }))).toBe(FRI)
    expect(doneAtOf(task({ progress: 99 }))).toBeNull()
  })
})

describe('区间聚合', () => {
  it('期初/期末/工时/完成数都按本期事实给，未排期落待排期', () => {
    const r = buildWorkReport(data([
      task({ id: 'a', title: '已完成任務', start: MON, end: WED, progress: 100, history: [{ at: MON, progress: 0 }, { at: WED, progress: 100 }] }),
      task({ id: 'b', title: '進行中任務', start: MON, end: E, progress: 40, history: [{ at: MON, progress: 0 }, { at: WED, progress: 40 }] }),
      task({ id: 'c', title: '未排期任務', start: null, end: null }),
    ]), period.start, period.end)

    expect(r.totals.total).toBe(2)
    expect(r.totals.backlog).toBe(1)
    expect(r.totals.done).toBe(1)
    expect(r.totals.inProgress).toBe(1)
    // 工时 = 交集工作日 × 8h：a 周一~周三 3 天，b 周一~周日 5 天（周末自动剔除）
    expect(r.rows.find(x => x.task.id === 'a')!.hours).toBe(3 * 8)
    expect(r.rows.find(x => x.task.id === 'b')!.hours).toBe(5 * 8)
    expect(r.totals.hours).toBe(3 * 8 + 5 * 8)
    expect(r.outputs.map(o => o.task.id)).toEqual(['a'])
    expect(r.groups[0].rows).toHaveLength(2)
    expect(r.groups[0].avgEnd).toBe(Math.round((100 + 40) / 2))
    expect(r.groups[0].doneCount).toBe(1)
  })

  it('跨周期任务在本期只留交集工时，整段总工时不变', () => {
    // 12/01 当节假日：让「交集」与「整段」两个口径都踩到节假日剔除，不然只是一个纯周历计数
    const fixture: GanttData = { ...data([task({ id: 'x', title: '跨月任務', start: '2026-11-20', end: '2026-12-05', progress: 30 })]), holidays: ['2026-12-01'] }
    const r = buildWorkReport(fixture, dayjs('2026-11-23'), dayjs('2026-11-29'))
    // 交集 11/23~11/27 = 5 个工作日；整段 11/20、11/23~27、11/30、12/02~04 = 10 个工作日（12/01 节假日）
    expect(r.rows[0].hours).toBe(5 * 8)
    // 存量任务没有进度流水时，期初/期末都回退到当前值（30/30）——
    // 宁可不报「本期推进」，也不能编出一个期初数字来凑 delta
    expect(r.rows[0].pStart).toBe(30)
    expect(r.rows[0].pEnd).toBe(30)
    expect(r.rows[0].delta).toBe(0)
    const whole = buildWorkReport(fixture, dayjs('2026-11-20'), dayjs('2026-12-05'))
    expect(whole.rows[0].hours).toBe(10 * 8)
  })

  it('节假日落在区间内时按扣减后的工作日计工时', () => {
    const withHoliday: GanttData = { ...data([task({ id: 'h', start: MON, end: E, progress: 10 })]), holidays: [WED] }
    const r = buildWorkReport(withHoliday, period.start, period.end)
    expect(r.rows[0].hours).toBe(4 * 8)
    expect(r.daily.find(d => d.key === WED)!.rest).toBe(true)
    expect(r.daily.find(d => d.key === WED)!.hours).toBe(0)
  })

  it('临时插入按插入日期落区间，上周插入的不算进本期', () => {
    const r = buildWorkReport(data([
      task({ id: 'i', title: '插入任務', start: WED, end: E, progress: 20, planType: 'inserted', insertedAt: WED }),
      task({ id: 'p', title: '原計劃任務', start: MON, end: E, progress: 10 }),
      task({ id: 'old', title: '上週插入', start: '2026-11-11', end: MON, progress: 50, planType: 'inserted', insertedAt: '2026-11-11' }),
    ]), period.start, period.end)
    expect(r.insertedRows.map(x => x.task.id)).toEqual(['i'])
    expect(r.totals.inserted).toBe(1)
  })

  it('逾期天数按结束日与今天的事实算，未完成才记风险', () => {
    const r = buildWorkReport(data([
      task({ id: 'o', title: '逾期任務', start: MON, end: FRI, progress: 70 }),
      task({ id: 'd', title: '按時完成', start: MON, end: FRI, progress: 100 }),
    ]), period.start, period.end)
    expect(r.rows.find(x => x.task.id === 'o')!.overdueDays).toBe(dayjs(fmt(dayjs())).diff(dayjs(FRI), 'day'))
    expect(r.rows.find(x => x.task.id === 'd')!.overdueDays).toBe(0)
    expect(r.totals.risks).toBe(1)
  })

  it('下期计划从全台账收：本期之后一个周期内的排期算下期，太远的不要', () => {
    const r = buildWorkReport(data([
      task({ id: 'n', title: '下期任務', start: NEXT_MON, end: '2026-11-24', progress: 0 }),
      task({ id: 'far', title: '太久以後', start: FAR, end: '2027-01-05', progress: 0 }),
      task({ id: 'in', title: '本期任務', start: MON, end: WED, progress: 10 }),
    ]), period.start, period.end)
    // 曾经写成 rows.filter(start > 期末)：rows 只收相交任务，这一节恒空
    expect(r.plan.map(x => x.task.id)).toEqual(['n'])
    expect(r.plan[0].hours).toBe(2 * 8)
    expect(r.plan[0].pEnd).toBe(0)
  })

  it('单日查询也能收到当天排期，工时就是一个工作日', () => {
    const r = buildWorkReport(data([task({ id: 's', title: '當日任務', start: WED, end: WED, progress: 100, history: [{ at: WED, progress: 100 }] })]), dayjs(WED), dayjs(WED))
    expect(r.totals.total).toBe(1)
    expect(r.totals.hours).toBe(8)
    expect(r.totals.done).toBe(1)
    expect(r.peak).toEqual({ key: WED, hours: 8 })
  })
})

describe('导出文本 = 页面文本', () => {
  const report = buildWorkReport(data([
    task({ id: 'a', title: '已完成任務', start: MON, end: WED, progress: 100, history: [{ at: MON, progress: 0 }, { at: WED, progress: 100 }] }),
    task({ id: 'i', title: '插入任務', start: WED, end: E, progress: 20, planType: 'inserted', insertedAt: WED }),
    task({ id: 'c', title: '未排期任務', start: null, end: null }),
    task({ id: 'n', title: '下期任務', start: NEXT_MON, end: '2026-11-25', progress: 0 }),
  ]), period.start, period.end)

  it('概述里的数字全部取自同一份 totals，不另算一次', () => {
    const text = autoOverview(report)
    expect(text).toContain(`${report.totals.total} 項子任務`)
    expect(text).toContain(`完成 ${report.totals.done} 項`)
    expect(text).toContain(`臨時插入 ${report.totals.inserted} 項`)
    expect(text).toContain(`${report.totals.backlog} 項待排期`)
    expect(text.endsWith('。')).toBe(true)
  })

  it('Markdown 四节与页面同构（顺序一致，不再各占一节）', () => {
    const md = reportToMarkdown(report, '第 47 週')
    const order = ['## 一、核心概覽', '## 二、本期內容', '## 三、下期計劃', '## 四、風險與備註']
    let last = -1
    order.forEach(h => {
      const at = md.indexOf(h)
      expect(at, `缺章節 ${h}`).toBeGreaterThan(-1)
      expect(at > last).toBe(true)
      last = at
    })
    // 精简不等于丢信息：产出/插入/工时都要能在本期内容行里读到
    expect(md).toContain('# 工作匯報（第 47 週）')
    expect(md).toContain('已完成任務')
    expect(md).toContain('［臨時插入］')
    expect(md).toContain('下期任務')
    expect(md).toContain(`- 風險 ${report.totals.risks} 項・臨時插入 ${report.totals.inserted} 項・待排期 ${report.totals.backlog} 項`)
  })

  it('切到英文后导出仍是英文口径（章节序号随译文，不在代码拼中文序号）', async () => {
    await i18n.changeLanguage('en')
    const md = reportToMarkdown(report, 'Week 47')
    expect(md).toContain('## 2. Period content')
    expect(md).toContain('## 3. Next period plan')
    expect(md).toContain('# Work Report (Week 47)')
    expect(autoOverview(report)).toContain('This period covers')
    await i18n.changeLanguage('zh-TW')
  })
})
