/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import quarterOfYear from 'dayjs/plugin/quarterOfYear'
import type { CpmPeriodValue } from './meta'

dayjs.extend(isoWeek)
dayjs.extend(quarterOfYear)

/**
 * 周期导航（周=isoWeek 周一起算、月/季=自然期），与后端 CpmPeriods 同口径。
 *
 * 为什么单独成文件而不是留在 MyReport 里导出：react-refresh 要求组件文件只导出组件；
 * 但更根本的原因是——这个函数会被汇报页、团队页、催办参数三处共用，
 * 「前端算的周期起点」必须与「后端校验的周期起点」同源话术，单点维护比复制粘贴可靠。
 * 后端仍会复核（非法起点直接拒），这里的输出只是给用户少跑一次网络。
 */
export function cpmPeriodRange(type: CpmPeriodValue, offset: number): { start: dayjs.Dayjs; end: dayjs.Dayjs; label: string } {
  if (type === 'week') {
    const base = dayjs().startOf('isoWeek').add(offset * 7, 'day')
    const end = base.add(6, 'day')
    return { start: base, end, label: `第 ${base.isoWeek()} 週（${base.format('MM-DD')} ~ ${end.format('MM-DD')}）` }
  }
  if (type === 'month') {
    const base = dayjs().startOf('month').add(offset, 'month')
    return { start: base, end: base.endOf('month'), label: base.format('YYYY 年 MM 月') }
  }
  const base = dayjs().startOf('quarter').add(offset, 'quarter')
  return { start: base, end: base.endOf('quarter'), label: `${base.year()} 年 Q${base.quarter()}` }
}

/** 汇总快照 Markdown 导出（纯函数，独立文件便于测试与复用） */
export function snapshotToMarkdown(
  label: string,
  snapshot: import('@/api/cpm').CpmSnapshot | null,
  summary?: string,
): string {
  const lines: string[] = [`# 工作匯報（${label}）`, '']
  if (summary) lines.push(`> ${summary}`, '')
  snapshot?.groups.forEach(g => {
    lines.push(`## ${g.categoryLabel}`)
    g.items.forEach(e => {
      const trajectory = e.trail.length > 1 ? `（軌跡 ${e.trail.join('→')}%）` : ''
      lines.push(`- ${e.title} — ${STATUS_TEXT[e.status] ?? e.status} ${e.progress}%${trajectory}`)
    })
    lines.push('')
  })
  return lines.join('\n')
}

export const STATUS_TEXT: Record<string, string> = {
  todo: '待辦',
  doing: '進行中',
  done: '已完成',
  blocked: '受阻',
}
