/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import dayjs, { type Dayjs } from 'dayjs'
import i18n from '@/i18n'
import {
  HOURS_PER_DAY, fmt, hoursInPeriod, isRestDay, overlaps, splitHours, taskHours, workdayCount,
  type GanttData, type GanttGroup, type GanttTask,
} from './worklogGanttModel'
import { noteToText } from './noteRich'

/**
 * 「工作記錄 → 匯報」確定性聚合引擎（阶段一本地口径，阶段二同口径迁服务端）。
 *
 * 数字只来自台账事实：排期交集工作日 × 8h 的工时、进度流水的期初/期末快照、
 * 完成时点、逾期与备注。AI 不参与计数（与既有汇报口径铁律一致）。
 */

export interface ReportRow {
  task: GanttTask
  group: GanttGroup
  /** 期初/期末进度（流水快照） */
  pStart: number
  pEnd: number
  delta: number
  hours: number
  /**
   * 本期加班工时（合计超出交集工作日 × 8h 的部分）。
   *
   * <p>与台账耗时列同一派生：汇报里只报一个合计，读的人无法判断这是「两天正常」
   * 还是「两天加了一晚上班」，而这两种情况在周会里是完全不同的话。
   */
  overtime: number
  /** 期内完成时点（YYYY-MM-DD），非期内完成为 null */
  doneAt: string | null
  overdueDays: number
}

export interface ReportGroupRow {
  group: GanttGroup
  rows: ReportRow[]
  hours: number
  overtime: number
  avgStart: number
  avgEnd: number
  doneCount: number
}

export interface WorkReport {
  start: string
  end: string
  rows: ReportRow[]
  groups: ReportGroupRow[]
  totals: {
    done: number
    inProgress: number
    avgStart: number
    avgEnd: number
    hours: number
    /** 本期加班合计（已含在 hours 里） */
    overtimeHours: number
    risks: number
    backlog: number
    total: number
    inserted: number
  }
  outputs: ReportRow[]
  insertedRows: ReportRow[]
  risks: ReportRow[]
  notes: ReportRow[]
  plan: ReportRow[]
  daily: { key: string; hours: number; rest: boolean }[]
  peak: { key: string; hours: number } | null
}

/** 某日時點的進度：取流水最後一筆 ≤ date；無流水時存量兜底（開始前=0，其後=當前） */
export function progressAt(t: GanttTask, date: string): number {
  const hist = t.history ?? []
  let val: number | null = null
  for (const h of hist) {
    if (h.at <= date) val = h.progress
  }
  if (val !== null) return val
  if (hist.length > 0) return 0
  if (t.start && date < t.start) return 0
  return t.progress
}

/** 完成時點：流水首次 ≥100；存量兜底取結束日 */
export function doneAtOf(t: GanttTask): string | null {
  if (t.progress < 100) return null
  const hit = (t.history ?? []).find(h => h.progress >= 100)
  if (hit) return hit.at
  return t.end
}

/**
 * 交集工作日数：与 hoursInPeriod 走同一条区间口径。
 *
 * <p>加班量是「合计 − 交集工作日 × 8h」，两边用不同区间算就会得出
 * 「工时按本期截、工作日按整段算」的假加班（一场跳月的会被多算好几晚）。
 */
function periodWorkdays(t: GanttTask, s: string, e: string, data: GanttData): number {
  if (!t.start || !t.end) return 0
  const from = t.start > s ? t.start : s
  const to = t.end < e ? t.end : e
  return to < from ? 0 : workdayCount(from, to, data)
}

export function buildWorkReport(data: GanttData, start: Dayjs, end: Dayjs): WorkReport {
  const s = fmt(start)
  const e = fmt(end)
  const today = fmt(dayjs())
  const rows: ReportRow[] = []
  const backlog: ReportRow[] = []

  data.groups.forEach(g => g.tasks.forEach(t => {
    const scheduled = !!t.start && !!t.end
    if (!scheduled) {
      backlog.push({ task: t, group: g, pStart: t.progress, pEnd: t.progress, delta: 0, hours: 0, overtime: 0, doneAt: null, overdueDays: 0 })
      return
    }
    if (!overlaps(t, s, e)) return
    const pStart = progressAt(t, s)
    const pEnd = progressAt(t, e)
    const doneAt = doneAtOf(t)
    const overdueDays = t.end! < today && t.progress < 100 ? dayjs(today).diff(dayjs(t.end!), 'day') : 0
    const hours = hoursInPeriod(t, s, e, data)
    rows.push({
      task: t, group: g, pStart, pEnd, delta: pEnd - pStart,
      hours,
      overtime: splitHours(hours, periodWorkdays(t, s, e, data)).overtime,
      doneAt: doneAt && doneAt >= s && doneAt <= e ? doneAt : null,
      overdueDays,
    })
  }))

  const groups: ReportGroupRow[] = data.groups
    .map(g => {
      const gr = rows.filter(r => r.group.id === g.id)
      if (gr.length === 0) return null
      const hours = gr.reduce((sum, r) => sum + r.hours, 0)
      const overtime = gr.reduce((sum, r) => sum + r.overtime, 0)
      const avgStart = Math.round(gr.reduce((sum, r) => sum + r.pStart, 0) / gr.length)
      const avgEnd = Math.round(gr.reduce((sum, r) => sum + r.pEnd, 0) / gr.length)
      return { group: g, rows: gr, hours, overtime, avgStart, avgEnd, doneCount: gr.filter(r => r.doneAt).length }
    })
    .filter((x): x is ReportGroupRow => x !== null)
    .sort((a, b) => b.hours - a.hours)

  const done = rows.filter(r => r.doneAt).length
  const inProgress = rows.filter(r => r.pEnd > 0 && r.pEnd < 100).length
  const avgStart = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.pStart, 0) / rows.length) : 0
  const avgEnd = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.pEnd, 0) / rows.length) : 0
  const hours = rows.reduce((sum, r) => sum + r.hours, 0)
  const overtimeHours = rows.reduce((sum, r) => sum + r.overtime, 0)
  const risks = rows.filter(r => r.overdueDays > 0)
  const notes = rows.filter(r => noteToText(r.task.note).trim() !== '')
  const insertedRows = rows.filter(r => {
    if (r.task.planType !== 'inserted') return false
    const d = r.task.insertedAt ?? r.task.start
    return !!d && d >= s && d <= e
  })

  const periodLen = end.diff(start, 'day') + 1
  /**
   * 下期计划：必须从全台账重找，不能从 rows 里筛。
   * rows 只收「与本期相交」的任务，而下期事项的 start 必然 > 期末，
   * 在 rows 上再筛 start > e 是空集——「下期計劃」永远显示暫無，
   * 周会要念的「下周安排」就成了假象（2026-11 单测拓出来的）。
   */
  const plan: ReportRow[] = []
  data.groups.forEach(g => g.tasks.forEach(t => {
    if (!t.start || !t.end || t.start <= e) return
    if (dayjs(t.start).diff(end, 'day') > periodLen) return
    const at = progressAt(t, e)
    const full = taskHours(t, data)
    plan.push({ task: t, group: g, pStart: at, pEnd: at, delta: 0, hours: full, overtime: splitHours(full, workdayCount(t.start, t.end, data)).overtime, doneAt: null, overdueDays: 0 })
  }))
  plan.sort((a, b) => (a.task.start! < b.task.start! ? -1 : 1))

  const daily: { key: string; hours: number; rest: boolean }[] = []
  let peak: { key: string; hours: number } | null = null
  for (let cur = start; cur.isBefore(end) || cur.isSame(end, 'day'); cur = cur.add(1, 'day')) {
    const key = fmt(cur)
    const rest = isRestDay(cur, data)
    let h = 0
    if (!rest) {
      rows.forEach(r => {
        if (r.task.start! <= key && r.task.end! >= key) h += HOURS_PER_DAY
      })
    }
    daily.push({ key, hours: h, rest })
    if (h > 0 && (!peak || h > peak.hours)) peak = { key, hours: h }
  }

  return {
    start: s, end: e, rows, groups,
    totals: { done, inProgress, avgStart, avgEnd, hours, overtimeHours, risks: risks.length, backlog: backlog.length, total: rows.length, inserted: insertedRows.length },
    outputs: rows.filter(r => r.doneAt).sort((a, b) => (a.doneAt! < b.doneAt! ? -1 : 1)),
    insertedRows, risks, notes, plan, daily, peak,
  }
}

/** 自動概述（確定性一句話，非 AI）：導出文本與頁面同源 */
export function autoOverview(r: WorkReport): string {
  const delta = r.totals.avgEnd - r.totals.avgStart
  const parts = [
    i18n.t('cpm.workReport.ov.cover', { total: r.totals.total, done: r.totals.done, defaultValue: '本期覆蓋 {{total}} 項子任務，完成 {{done}} 項' }),
    i18n.t('cpm.workReport.ov.progress', {
      from: r.totals.avgStart, to: r.totals.avgEnd, delta: `${delta >= 0 ? '+' : ''}${delta}`,
      defaultValue: '平均進度 {{from}}% → {{to}}%（{{delta}}%）',
    }),
    i18n.t('cpm.workReport.ov.hours', { hours: r.totals.hours, defaultValue: '投入 {{hours}}h（工作日口徑）' }),
  ]
  /* 加班单独成句：它是周会上最容易被追问的一句（“这 20 小时是怎么排的”）；
     夹在平均进度后面而不写出来，读的人只会以为本期真的有两个整天可用 */
  if (r.totals.overtimeHours > 0) parts.push(i18n.t('cpm.workReport.ov.overtime', { overtime: r.totals.overtimeHours, normal: r.totals.hours - r.totals.overtimeHours, defaultValue: '含加班 {{overtime}}h（正常 {{normal}}h）' }))
  if (r.totals.inserted > 0) parts.push(i18n.t('cpm.workReport.ov.inserted', { count: r.totals.inserted, defaultValue: '臨時插入 {{count}} 項' }))
  if (r.totals.risks > 0) parts.push(i18n.t('cpm.workReport.ov.risks', { count: r.totals.risks, defaultValue: '{{count}} 項逾期需關注' }))
  if (r.totals.backlog > 0) parts.push(i18n.t('cpm.workReport.ov.backlog', { count: r.totals.backlog, defaultValue: '{{count}} 項待排期' }))
  return `${parts.join(i18n.t('cpm.workReport.ov.sep', { defaultValue: '，' }))}。`
}

/** Markdown 导出：导出的文本 = 页面的文本（同一份聚合，不二次重算）。
 * 章节与汇报页一一对应（核心概览 / 本期内容 / 下期计划 / 风险与备注）：
 * 产出、临时插入、工时分布不再单独成节，而是回到本期内容的行内标记与峰值行——
 * 页面读四节、导出也四节，两边不会因章节增减而分叉。 */
export function reportToMarkdown(r: WorkReport, periodLabel: string, summary?: string): string {
  const lines: string[] = [
    i18n.t('cpm.workReport.md.title', { period: periodLabel, defaultValue: '# 工作匯報（{{period}}）' }),
    '', `> ${summary?.trim() || autoOverview(r)}`, '',
    i18n.t('cpm.workReport.md.s1', { defaultValue: '## 一、核心概覽' }), '',
  ]
  lines.push(i18n.t('cpm.workReport.md.overview', { done: r.totals.done, doing: r.totals.inProgress, total: r.totals.total, defaultValue: '- 完成 {{done}} 項／進行中 {{doing}} 項／覆蓋 {{total}} 項' }))
  lines.push(i18n.t('cpm.workReport.md.avgProgress', { from: r.totals.avgStart, to: r.totals.avgEnd, defaultValue: '- 平均進度：{{from}}% → {{to}}%' }))
  lines.push(i18n.t('cpm.workReport.md.invested', { hours: r.totals.hours, perDay: HOURS_PER_DAY, defaultValue: '- 投入工時：{{hours}}h（工作日 × {{perDay}}h，周末/節假日剔除）' }))
  /* 加班拆行：导出文本必须与页面说同一句话，否则贴进邮件的周报会弄丢加班事实 */
  if (r.totals.overtimeHours > 0) {
    lines.push(i18n.t('cpm.workReport.md.overtime', {
      overtime: r.totals.overtimeHours, normal: r.totals.hours - r.totals.overtimeHours,
      defaultValue: '- 其中加班 {{overtime}}h（正常 {{normal}}h）',
    }))
  }
  lines.push(i18n.t('cpm.workReport.md.riskLine', {
    risks: r.totals.risks, backlog: r.totals.backlog, inserted: r.totals.inserted,
    defaultValue: '- 風險 {{risks}} 項・臨時插入 {{inserted}} 項・待排期 {{backlog}} 項',
  }), '')
  lines.push(i18n.t('cpm.workReport.md.s2', { defaultValue: '## 二、本期內容' }), '')
  if (r.groups.length === 0) lines.push(i18n.t('cpm.workReport.md.noContent', { defaultValue: '- 本期無已排期的工作項任務' }))
  r.groups.forEach(g => {
    lines.push(g.overtime > 0
      ? i18n.t('cpm.workReport.md.groupTitleOt', { title: g.group.title, count: g.rows.length, hours: g.hours, overtime: g.overtime, defaultValue: '### {{title}}（{{count}} 項 · {{hours}}h，含加班 {{overtime}}h）' })
      : i18n.t('cpm.workReport.md.groupTitle', { title: g.group.title, count: g.rows.length, hours: g.hours, defaultValue: '### {{title}}（{{count}} 項 · {{hours}}h）' }))
    lines.push(i18n.t('cpm.workReport.md.groupDelta', {
      from: g.avgStart, to: g.avgEnd, delta: `${g.avgEnd - g.avgStart >= 0 ? '+' : ''}${g.avgEnd - g.avgStart}`,
      defaultValue: '- 期初 {{from}}% → 期末 {{to}}%（{{delta}}%）',
    }))
    g.rows.forEach(row => lines.push(i18n.t('cpm.workReport.md.contentRow', {
      task: row.task.title, from: row.pStart, to: row.pEnd, hours: row.hours,
      status: rowStatus(row, i18n.t), inserted: row.task.planType === 'inserted' ? i18n.t('cpm.workReport.md.insertedMark', { defaultValue: '［臨時插入］' }) : '',
      overtime: row.overtime > 0 ? i18n.t('cpm.workReport.md.overtimeMark', { overtime: row.overtime, defaultValue: '（含加班 {{overtime}}h）' }) : '',
      defaultValue: '- {{task}}{{inserted}} — {{from}}% → {{to}}% · {{hours}}h{{overtime}} · {{status}}',
    })))
    lines.push('')
  })
  if (r.peak) lines.push(i18n.t('cpm.workReport.md.peak', { date: r.peak.key, hours: r.peak.hours, defaultValue: '- 單日峰值：{{date}} {{hours}}h' }))
  lines.push('', i18n.t('cpm.workReport.md.s3', { defaultValue: '## 三、下期計劃' }), '')
  if (r.plan.length === 0) lines.push(i18n.t('cpm.workReport.md.noPlan', { defaultValue: '- 暫無已排期的下期事項' }))
  r.plan.forEach(x => lines.push(i18n.t('cpm.workReport.md.planItem', {
    task: x.task.title, group: x.group.title, start: x.task.start ?? '', hours: x.hours,
    defaultValue: '- {{task}}（{{group}}）— {{start}} 開始 · 預計 {{hours}}h',
  })))
  lines.push('', i18n.t('cpm.workReport.md.s4', { defaultValue: '## 四、風險與備註' }), '')
  if (r.risks.length === 0 && r.notes.length === 0 && r.totals.backlog === 0) lines.push(i18n.t('cpm.workReport.md.noRisk', { defaultValue: '- 本期無逾期與風險備註' }))
  r.risks.forEach(x => lines.push(i18n.t('cpm.workReport.md.riskItem', {
    days: x.overdueDays, task: x.task.title, group: x.group.title, end: x.task.end ?? '', progress: x.pEnd,
    defaultValue: '- [逾期 {{days}} 天] {{task}}（{{group}}）— 結束 {{end}} · {{progress}}%',
  })))
  r.notes.forEach(x => lines.push(i18n.t('cpm.workReport.md.noteItem', {
    task: x.task.title, note: noteToText(x.task.note).replace(/\n/g, ' ／ '),
    defaultValue: '- [備註] {{task}}：{{note}}',
  })))
  if (r.totals.backlog > 0) lines.push(i18n.t('cpm.workReport.md.backlogItem', { count: r.totals.backlog, defaultValue: '- [待排期] {{count}} 項未排期任務不計工時' }))
  return lines.join('\n')
}

/** 行内状态与汇报页/台账同一推导：期内完成=已完成，期末>0=进行中，否则待处理 */
function rowStatus(row: ReportRow, tr: (key: string, options: Record<string, unknown>) => string): string {
  if (row.doneAt) return tr('cpm.status.done', { defaultValue: '已完成' })
  return row.pEnd > 0 ? tr('cpm.status.doing', { defaultValue: '進行中' }) : tr('cpm.gantt.status.todo', { defaultValue: '待處理' })
}