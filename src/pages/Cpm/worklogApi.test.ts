/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import { toWorkReport, type ReportDTO } from './worklogApi'

describe('服务端汇报 DTO 适配', () => {
  it('兼容 Jackson 输出的 pstart/pend，避免进度与跟进均进变 NaN', () => {
    const row: ReportDTO['groups'][number]['rows'][number] = {
      taskId: 1, groupId: 2, title: '跟进项', groupTitle: '工作项',
      start: '2026-11-26', end: '2026-11-26', pstart: 0, pend: 25,
      delta: 25, hours: 8, overdueDays: 0, planType: 'planned', followUp: true, blocked: false, state: 'doing',
    }
    const dto: ReportDTO = {
      periodType: 'week', start: '2026-11-23', end: '2026-11-29',
      totals: { total: 1, done: 0, doing: 1, pending: 0, inserted: 0, followUpCount: 1, followUpAvg: 25, blockedCount: 0, backlog: 0, risks: 0, hours: 8, avgProgress: 25, avgStart: 0, avgEnd: 25 },
      groups: [{ groupId: 2, title: '工作项', hue: 0, hours: 8, avgStart: 0, avgEnd: 25, doneCount: 0, rows: [row] }],
      risks: [], notes: [], plan: [], insertedRows: [], followUps: [row], blockedRows: [], daily: [],
    }

    const report = toWorkReport(dto)
    expect(report.followUps?.[0].pStart).toBe(0)
    expect(report.followUps?.[0].pEnd).toBe(25)
    expect(report.groups[0].rows[0].pEnd).toBe(25)
  })
})
