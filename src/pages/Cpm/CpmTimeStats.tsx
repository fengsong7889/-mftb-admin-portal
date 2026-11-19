/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import dayjs from 'dayjs'
import { Space, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import AnimatedNumber from '@/components/AnimatedNumber'
import HelpPopover from '@/components/HelpPopover'
import type { CpmTimeTotals } from '@/api/cpm'
import { formatHours, formatMinutes } from './cpmTime'
import './cpm.css'

/**
 * 工时投入汇总区（汇报阅读面第一节）。
 *
 * 数字一律来自服务端快照的工时维度（`CpmSnapshotBuilder` 的唯一算式），本组件只做可视化：
 * 分类占比、每日趋势、事项投入 Top N 都在渲染层重排形状，**不重新聚合**——
 * 「通知里的数字 = 页面数字 = 导出数字」这条铁律一旦被展示层的二次计算破坏，
 * 汇报就变成了罗生门。
 *
 * 条形一律 CSS 自绘而不是图表库：这份文件版式要被浏览器截图导出 PDF，
 * 图表库的 canvas 在克隆节点里会渲染成空白块。
 */

interface Props {
  /**
   * null 表示这份快照根本没有工时维度（阶段二冻结的 V1 快照）。
   * 与「有维度但合计为 0」必须给两种措辞：前者是「这份汇报发布时还没这个功能」，
   * 后者才是「这一期没人记录投入时间」。
   */
  totals: CpmTimeTotals | null
  /** 周期日历（用于给无投入日补 0 高度占位）；超过 35 天不补，避免季度趋势糊成一片 */
  range?: { start: string; end: string }
}

/** 分类占比条形取色：只用既有语义令牌，不新开裸色（主题令牌棘轮只降不升） */
const CATEGORY_COLORS = ['var(--brand)', 'var(--info)', 'var(--success)', 'var(--purple)', 'var(--warning)', 'var(--text-3)']

/** 分钟 → 小时数：与后端 DECIMAL(4,1) 同精度，两处小数位不同会互相觉得对方算错 */
const hoursOf = (minutes?: number | null): number => (minutes ?? 0) / 60

export default function CpmTimeStats({ totals, range }: Props) {
  const { t } = useTranslation()
  if (!totals) {
    return (
      <div className="cpm-time-stats cpm-time-stats--empty">
        {t('cpm.time.legacy', { defaultValue: '這一版匯報發布時還沒有投入時間統計（階段二凍結的快照），因此本節無資料可讀；修訂並重新發布後會帶上工時維度。' })}
      </div>
    )
  }
  if (totals.totalMinutes <= 0) {
    return (
      <div className="cpm-time-stats cpm-time-stats--empty">
        <span>{t('cpm.time.notRecorded', { defaultValue: '本期間未記錄投入時間 —— 在「我的工作記錄」的行內「記時」補上起止時間，再修訂並重新發布即可帶入本期匯報。' })}</span>
      </div>
    )
  }

  const axis = buildDayAxis(range, totals.byDay)
  const axisMax = Math.max(...axis.map(day => day.minutes), 1)
  const legendTotal = totals.byCategory.reduce((sum, cat) => sum + cat.minutes, 0)

  return (
    <div className="cpm-time-stats">
      <div className="cpm-time-stats__grid" key={`${totals.totalMinutes}-${totals.activeDays}`}>
        <div className="cpm-time-stats__cell">
          <div className="cpm-time-stats__value">
            <AnimatedNumber value={Math.round(hoursOf(totals.totalMinutes) * 10) / 10} decimals={1} suffix="h" />
          </div>
          <div className="cpm-time-stats__label">{t('cpm.time.total', { defaultValue: '總投入' })}</div>
        </div>
        <div className="cpm-time-stats__cell">
          <div className="cpm-time-stats__value">
            <AnimatedNumber value={Math.round(hoursOf(totals.avgMinutesPerActiveDay) * 10) / 10} decimals={1} suffix="h" />
          </div>
          {/* 分母是「有投入的天数」而不是周期自然天数——这句话必须写在标签上，
              否则请假一周的人会被读成「日均很低」 */}
          <div className="cpm-time-stats__label">
            {t('cpm.time.avg', { days: totals.activeDays, defaultValue: '日均（按有投入的 {{days}} 天）' })}
          </div>
        </div>
        <div className="cpm-time-stats__cell">
          <div className="cpm-time-stats__value">
            {totals.peakDate
              ? <AnimatedNumber value={Math.round(hoursOf(totals.peakMinutes) * 10) / 10} decimals={1} suffix="h" />
              : '—'}
          </div>
          <div className="cpm-time-stats__label">
            {totals.peakDate
              ? t('cpm.time.peakWithDate', { date: dayjs(totals.peakDate).format('MM-DD'), defaultValue: '單日峰值 · {{date}}' })
              : t('cpm.time.peak', { defaultValue: '單日峰值' })}
          </div>
        </div>
        <div className="cpm-time-stats__cell">
          <div className="cpm-time-stats__value"><AnimatedNumber value={totals.activeDays} suffix={t('cpm.time.unitDay', { defaultValue: ' 天' })} /></div>
          <div className="cpm-time-stats__label">{t('cpm.time.activeDays', { defaultValue: '有投入天數' })}</div>
        </div>
      </div>

      <div className="cpm-time-stats__block">
        <div className="cpm-time-stats__block-head">
          <span className="cpm-time-stats__block-title">{t('cpm.time.byCategory', { defaultValue: '時間分配（按分類）' })}</span>
          <HelpPopover
            ariaLabel={t('cpm.time.byCategoryHelpAria', { defaultValue: '時間分配口徑說明' })}
            title={t('cpm.time.byCategoryHelpTitle', { defaultValue: '這兩個分母請分開看' })}
            content={t('cpm.time.byCategoryHelpBody', { defaultValue: '分類占比以「有記錄分類的合計」為分母；總投入含來自手工工時的估算部分。帶「估算」標記的部分沒有精確起止，只有小時數，兩者的精度不同，所以不合併陳述。' })}
          />
        </div>
        <div className="cpm-time-stats__stack" role="img" aria-label={t('cpm.time.stackAria', { total: formatMinutes(totals.totalMinutes), defaultValue: '分類工時占比，共 {{total}}' })}>
          {totals.byCategory.map((cat, index) => (
            <span
              key={cat.category}
              className="cpm-time-stats__stack-seg"
              style={{
                width: `${legendTotal > 0 ? (cat.minutes / legendTotal) * 100 : 0}%`,
                background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
              }}
              title={`${cat.categoryLabel ?? cat.category} ${formatHours(cat.minutes)}`}
            />
          ))}
        </div>
        <div className="cpm-time-stats__legend">
          {totals.byCategory.map((cat, index) => (
            <span className="cpm-time-stats__legend-item" key={cat.category}>
              <i style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
              {cat.categoryLabel ?? cat.category} {formatHours(cat.minutes)}
              {/* 占比是展示层比例（分母就是同一份 byCategory 合计），不是第二次聚合：
                  服务端没给 percent 字段，正是因为「占比」在不同分母下有不同读法，由展示处标明 */}
              <em>{legendTotal > 0 ? Math.round((cat.minutes / legendTotal) * 100) : 0}%</em>
            </span>
          ))}
        </div>
      </div>

      <div className="cpm-time-stats__block">
        <div className="cpm-time-stats__block-head">
          <span className="cpm-time-stats__block-title">{t('cpm.time.trend', { defaultValue: '每日投入趨勢' })}</span>
          <span className="cpm-time-stats__block-extra">{t('cpm.time.trendPeak', { hours: formatHours(axisMax), defaultValue: '峰值 {{hours}}' })}</span>
        </div>
        <div className="cpm-time-trend" role="img" aria-label={t('cpm.time.trendAria', { defaultValue: '每日投入工時柱狀圖' })}>
          {axis.map(day => (
            <div className="cpm-time-trend__col" key={day.date} title={`${day.date} · ${formatHours(day.minutes)}`}>
              <div className="cpm-time-trend__track">
                <span
                  className={`cpm-time-trend__bar${day.minutes === 0 ? ' cpm-time-trend__bar--zero' : ''}`}
                  style={{ height: `${Math.max(day.minutes === 0 ? 2 : 6, (day.minutes / axisMax) * 100)}%` }}
                />
              </div>
              <span className="cpm-time-trend__date">{day.label}</span>
            </div>
          ))}
        </div>
      </div>

      {totals.topItems.length > 0 && (
        <div className="cpm-time-stats__block">
          <div className="cpm-time-stats__block-head">
            <span className="cpm-time-stats__block-title">
              {t('cpm.time.topItems', { count: totals.topItems.length, defaultValue: '事項時間投入成本（Top {{count}}）' })}
            </span>
            <span className="cpm-time-stats__block-extra">
              {t('cpm.time.topItemsMax', { hours: formatHours(totals.topItems[0].minutes), defaultValue: '投入最多的一件事 {{hours}}' })}
            </span>
          </div>
          <div className="cpm-time-top">
            {totals.topItems.map(item => {
              const share = totals.totalMinutes > 0 ? (item.minutes / totals.totalMinutes) * 100 : 0
              return (
                <div className="cpm-time-top__row" key={item.itemId}>
                  <span className="cpm-time-top__title" title={item.title ?? ''}>{item.title ?? `#${item.itemId}`}</span>
                  <span className="cpm-time-top__track"><i style={{ width: `${share}%` }} /></span>
                  <span className="cpm-time-top__value">{formatHours(item.minutes)}<em>{Math.round(share)}%</em></span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {totals.manualFallbackMinutes > 0 && (
        <Space size={6} wrap className="cpm-time-stats__footnote">
          <Tag>{t('cpm.time.estimateTag', { hours: formatHours(totals.manualFallbackMinutes), defaultValue: '估算 {{hours}}' })}</Tag>
          <span>
            {t('cpm.time.estimateNote', {
              estimate: formatHours(totals.manualFallbackMinutes), precise: formatHours(totals.preciseMinutes),
              defaultValue: '其中 {{estimate}} 來自手工工時（無精確起止），其餘 {{precise}} 來自記時時段',
            })}
          </span>
        </Space>
      )}
    </div>
  )
}

/**
 * 日轴：能拿到周期日历时补齐无投入日（0 高度占位），否则只画有记录的日子。
 *
 * 补齐的意义：只显示有柱子的那几天会让人以为「这个周期只工作了这些天」，
 * 而连续日历 + 空隙才能让人看出投入的节奏。季度这种长轴不补——90 根细柱会糊成一片，
 * 反而读不出任何东西。
 */
function buildDayAxis(range: Props['range'], byDay: CpmTimeTotals['byDay']): { date: string; label: string; minutes: number }[] {
  const nonzero = new Map(byDay.map(row => [row.workDate, row.minutes]))
  const sparse = (): { date: string; label: string; minutes: number }[] =>
    byDay.map(row => ({ date: row.workDate, label: dayjs(row.workDate).format('MM-DD'), minutes: row.minutes }))
  if (!range) return sparse()
  const cursor = dayjs(range.start)
  const last = dayjs(range.end)
  const span = last.diff(cursor, 'day') + 1
  // 季度这种长轴不补 0：90 根细柱会糊成一片，反而读不出任何东西
  if (span > 35 || span <= 0) return sparse()
  const days: { date: string; label: string; minutes: number }[] = []
  for (let index = 0; index < span; index += 1) {
    const date = cursor.add(index, 'day')
    const key = date.format('YYYY-MM-DD')
    days.push({ date: key, label: date.format('MM-DD'), minutes: nonzero.get(key) ?? 0 })
  }
  return days
}
