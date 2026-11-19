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
import i18n from '@/i18n'
import type { CpmSnapshot, CpmTimeTotals } from '@/api/cpm'
import { CPM_STATUS_LABELS, type CpmPeriodValue, type CpmStatusValue } from './meta'
import { formatHours } from './cpmTime'

dayjs.extend(isoWeek)
dayjs.extend(quarterOfYear)

const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

/** 周期导航（日=自然日、周=isoWeek 周一起算、月/季=自然期），与后端 CpmPeriods 同口径。
 *
 * 单独成文件而不是留在 MyReport 里导出：react-refresh 要求组件文件只导出组件；
 * 但更根本的原因是——这个函数会被汇报页、团队页、催办参数三处共用，
 * 「前端算的周期起点」必须与「后端校验的周期起点」同源话术，单点维护比复制粘贴可靠。
 * 后端仍会复核（非法起点直接拒），这里的输出只是给用户少跑一次网络。
 *
 * `day` 只服务日报的**查看**档位：日报不落 report 实体，因此它不需要「合法周期起点」校验，
 * 只是把日历切成一天，让同一套阅读面能渲染任意一天。
 */
export function cpmPeriodRange(type: CpmPeriodValue, offset: number): { start: dayjs.Dayjs; end: dayjs.Dayjs; label: string } {
  if (type === 'day') {
    const base = dayjs().add(offset, 'day')
    return { start: base, end: base, label: `${base.format('YYYY 年 MM 月 DD 日')} ${WEEKDAY_LABELS[base.day()]}` }
  }
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

/**
 * 汇总快照 Markdown 导出（纯函数，独立文件便于测试与复用）。
 *
 * 「导出的文本 = 页面的文本」是这条链路的唯一存在理由：如果 Markdown 里没有工时区，
 * 而阅读面有，用户复制到别处汇报时就会少一块他自己确认过的内容。
 *
 * 数字全部取自服务端快照，本函数只排版：分钟数、日均、峰值都不在这里重算。
 * 占比按同一份 byCategory 的合计做分母（与阅读面同一口径），不是第二次聚合。
 *
 * 每一行整句交给语言包（而不是在这里拼「- 總投入：」+ 数字）：语序属于语言本身，
 * 拼接式导出在日语/韩语下会产出中英混排的半截中文，而导出件恰恰是要发给他人的那份。
 *
 * key 一律写完整字面量而不是「前缀 + 短名」的包装函数：check:i18n 的引用解析靠静态读
 * `t('a.b.c')` 里的字面量，模板拼出来的 key 它查不到——「漏登记一个词条」这条最常见的
 * 缺陷会从此对门禁隐形，界面照样回落中文，没人报警。
 */
export function snapshotToMarkdown(
  label: string,
  snapshot: CpmSnapshot | null,
  summary?: string,
  options: { time?: CpmTimeTotals | null } = {},
): string {
  const sectionFirst = String(i18n.t('cpm.document.section.first', { defaultValue: '一' }))
  const sectionSecond = String(i18n.t('cpm.document.section.second', { defaultValue: '二' }))
  const lines: string[] = [
    String(i18n.t('cpm.report.markdown.title', { period: label, defaultValue: '# 工作匯報（{{period}}）' })),
    '',
  ]
  if (summary) lines.push(`> ${summary}`, '')

  const time = options.time
  const hasTime = !!time && time.totalMinutes > 0
  if (time && hasTime) {
    const categoryTotal = time.byCategory.reduce((sum, cat) => sum + cat.minutes, 0)
    lines.push(String(i18n.t('cpm.report.markdown.timeSection', {
      no: sectionFirst, defaultValue: '## {{no}}、工時投入匯總',
    })))
    lines.push(String(i18n.t('cpm.report.markdown.timeTotal', {
      total: formatHours(time.totalMinutes),
      precise: formatHours(time.preciseMinutes),
      estimated: formatHours(time.manualFallbackMinutes),
      defaultValue: '- 總投入：{{total}}（精確記時 {{precise}}，估算 {{estimated}}）',
    })))
    lines.push(String(i18n.t('cpm.report.markdown.timeAvg', {
      avg: formatHours(time.avgMinutesPerActiveDay), days: time.activeDays,
      defaultValue: '- 日均投入：{{avg}} × 有投入 {{days}} 天',
    })))
    if (time.peakDate) {
      lines.push(String(i18n.t('cpm.report.markdown.timePeak', {
        date: time.peakDate, minutes: formatHours(time.peakMinutes ?? 0),
        defaultValue: '- 單日峰值：{{date}} {{minutes}}',
      })))
    }
    if (time.byCategory.length) {
      // 分类名来自模板（后端已本地化），这里只负责句式与顿号
      lines.push(String(i18n.t('cpm.report.markdown.timeByCategory', {
        items: time.byCategory.map(cat =>
          `${cat.categoryLabel ?? cat.category} ${formatHours(cat.minutes)}（${categoryTotal > 0 ? Math.round((cat.minutes / categoryTotal) * 100) : 0}%）`).join('、'),
        defaultValue: '- 時間分配：{{items}}',
      })))
    }
    if (time.topItems.length) {
      lines.push(String(i18n.t('cpm.report.markdown.timeTopItems', {
        items: time.topItems.slice(0, 3).map(item => `${item.title ?? `#${item.itemId}`} ${formatHours(item.minutes)}`).join('、'),
        defaultValue: '- 投入最多事項：{{items}}',
      })))
    }
    lines.push('')
  }

  lines.push(String(i18n.t('cpm.report.markdown.detailSection', {
    no: hasTime ? sectionSecond : sectionFirst,
    defaultValue: '## {{no}}、工作事項明細',
  })))
  snapshot?.groups.forEach(g => {
    lines.push(String(i18n.t('cpm.report.markdown.groupTitle', {
      category: g.categoryLabel, count: g.items.length,
      defaultValue: '### {{category}}（{{count}} 項）',
    })))
    g.items.forEach(e => {
      const trajectory = e.trail.length > 1
        ? String(i18n.t('cpm.report.markdown.trajectory', { trail: e.trail.join('→'), defaultValue: '（軌跡 {{trail}}%）' }))
        : ''
      // 条目分钟数就在快照里：历史版本导出时也能读到当时冻结的那一份，而不是「现在的数」
      const invested = e.minutes && e.minutes > 0
        ? String(i18n.t('cpm.report.markdown.invested', { minutes: formatHours(e.minutes), defaultValue: ' · 投入 {{minutes}}' }))
        : ''
      lines.push(String(i18n.t('cpm.report.markdown.entry', {
        title: e.title,
        status: CPM_STATUS_LABELS[e.status as CpmStatusValue] ?? e.status,
        progress: e.progress,
        trajectory,
        invested,
        defaultValue: '- {{title}} — {{status}} {{progress}}%{{trajectory}}{{invested}}',
      })))
    })
    lines.push('')
  })
  return lines.join('\n')
}
