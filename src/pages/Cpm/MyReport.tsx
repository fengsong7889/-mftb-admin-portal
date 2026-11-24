/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, DatePicker, Dropdown, Empty, Input, Segmented, Tabs, Tag, Tooltip, message, type MenuProps } from 'antd'
import {
  CheckCircleOutlined, CopyOutlined, DownloadOutlined, EditOutlined, FileImageOutlined,
  FilePdfOutlined, LeftOutlined, RightOutlined, RiseOutlined, FallOutlined,
  WarningOutlined, TrophyFilled, FieldTimeOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import quarterOfYear from 'dayjs/plugin/quarterOfYear'
import AnimatedNumber from '@/components/AnimatedNumber'
import { exportDocument, type DocumentExportKind } from '@/utils/documentExport'
import { CPM_PERIOD_LABELS, CpmPeriod, type CpmPeriodValue } from './meta'
import { GROUP_COLORS, HOURS_PER_DAY, fmt, progressColor } from './worklogGanttModel'
import { autoOverview, reportToMarkdown, type ReportGroupRow, type WorkReport } from './worklogReport'
import { fetchWorkReport, toWorkReport } from './worklogApi'
import { noteToDisplayHtml } from './noteRich'
import { RecognitionArchive, HistoryList } from './CpmReportArchive'
import ReportDeliveryPanel from './ReportDeliveryPanel'
import './worklogGantt.css'
import './cpmReportV2.css'

dayjs.extend(isoWeek)
dayjs.extend(quarterOfYear)

/**
 * 我的匯報（cpm-report）：从工作记录台账确定性聚合的阅读面。
 *
 * 版式收敛（2026-11 用户反馈「模块太多读着累」）：只留四节——
 * 01 核心概覽、02 本期內容（工时投入 + 进度对比 + 进度 + 状态，一次看同一批事实）、
 * 03 下期計劃、04 風險與備註。原来的「核心產出／臨時插入／工時分布」三节并入
 * 02 的行内标记与概览句：产出=状态列的已完成，插入=行内「插」标，工时=每行小时数，
 * 信息一条不丢，只是不再各占一个标题。
 *
 * 数字全部来自台账事实（前端不重算第二套口径），AI 不参与计数。
 */

/** 与 cpmPeriod.cpmPeriodRange 同口径（周一起算 isoWeek），支持自定义锚点日期；只算区间，不取词 */
function rangeFor(type: CpmPeriodValue, offset: number, anchor: Dayjs | null): { start: Dayjs; end: Dayjs } {
  const now = anchor ?? dayjs()
  if (type === 'day') {
    const b = now.add(offset, 'day')
    return { start: b, end: b }
  }
  if (type === 'week') {
    const b = now.startOf('isoWeek').add(offset * 7, 'day')
    return { start: b, end: b.add(6, 'day') }
  }
  if (type === 'month') {
    const b = now.startOf('month').add(offset, 'month')
    return { start: b, end: b.endOf('month') }
  }
  const b = now.startOf('quarter').add(offset, 'quarter')
  return { start: b, end: b.endOf('quarter') }
}

/**
 * 区间读数走 i18n：月份/星期的 dayjs format 串本身就是地区差异
 * （中文「YYYY 年 MM 月」vs 英文「MMMM YYYY」）。
 * 取词函数由调用方传入而不是自己拿 i18n 单例：这样 useMemo 对 t 的依赖是真实的，
 * 切语言重算不会被人当「多余依赖」删掉。
 */
function periodLabel(type: CpmPeriodValue, start: Dayjs, end: Dayjs, tr: (key: string, options: Record<string, unknown>) => string): string {
  if (type === 'day') return start.format(tr('cpm.workReport.label.dayFormat', { defaultValue: 'YYYY 年 MM 月 DD 日' }))
  if (type === 'week') {
    return tr('cpm.workReport.label.week', { week: start.isoWeek(), start: start.format('MM-DD'), end: end.format('MM-DD'), defaultValue: '第 {{week}} 週（{{start}} ~ {{end}}）' })
  }
  if (type === 'month') return start.format(tr('cpm.workReport.label.monthFormat', { defaultValue: 'YYYY 年 MM 月' }))
  return tr('cpm.workReport.label.quarter', { year: start.year(), q: start.quarter(), defaultValue: '{{year}} 年 Q{{q}}' })
}

export default function MyReport() {
  const { t, i18n } = useTranslation()
  const [periodType, setPeriodType] = useState<CpmPeriodValue>(CpmPeriod.WEEK)
  const [offset, setOffset] = useState(0)
  const [anchor, setAnchor] = useState<Dayjs | null>(null)
  const [summary, setSummary] = useState('')
  const [editingSummary, setEditingSummary] = useState(false)
  const [exportBusy, setExportBusy] = useState<DocumentExportKind | null>(null)
  const [report, setReport] = useState<WorkReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  const range = useMemo(() => {
    const r = rangeFor(periodType, offset, anchor)
    return { ...r, label: periodLabel(periodType, r.start, r.end, t) }
  }, [periodType, offset, anchor, t])

  // 汇报数字全部来自服务端聚合：前端不再从台账自己算一遍（通知/Word/页面必须同一个数）
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReport(toWorkReport(await fetchWorkReport(periodType, fmt(range.start))))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('cpm.workReport.loadFailed', { defaultValue: '匯報載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [periodType, range.start, t])

  useEffect(() => { void load() }, [load])

  const overview = report ? autoOverview(report) : ''

  const runExport = async (kind: DocumentExportKind) => {
    const src = docRef.current
    if (!src) return
    setExportBusy(kind)
    const host = document.createElement('div')
    host.className = 'wg-capture-host'
    const clone = src.cloneNode(true) as HTMLElement
    host.appendChild(clone)
    document.body.appendChild(host)
    try {
      const fileBase = i18n.t('cpm.workReport.export.fileBase', {
        period: CPM_PERIOD_LABELS[periodType], date: fmt(range.start),
        defaultValue: '工作匯報_{{period}}_{{date}}',
      })
      await exportDocument(clone, kind, fileBase, { alias: 'cpm-report-v2', fallbackName: 'report' })
      message.success(kind === 'image'
        ? i18n.t('cpm.workReport.export.imageDone', { defaultValue: '已下載當前匯報的長圖快照' })
        : i18n.t('cpm.workReport.export.pdfDone', { defaultValue: '已下載當前匯報的 A4 分頁 PDF' }))
    } catch (e) {
      message.error(e instanceof Error ? e.message : i18n.t('cpm.gantt.export.failed', { defaultValue: '導出失敗，請重試' }))
    } finally {
      host.remove()
      setExportBusy(null)
    }
  }
  const copyMarkdown = async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(reportToMarkdown(report, range.label, summary))
      message.success(i18n.t('cpm.workReport.copyDone', { defaultValue: '已複製 Markdown（導出文本 = 頁面文本）' }))
    } catch {
      message.error(i18n.t('cpm.report.clipboardUnavailable', { defaultValue: '剪貼板不可用' }))
    }
  }
  const exportItems: MenuProps['items'] = [
    { key: 'image', icon: <FileImageOutlined />, label: t('cpm.export.image', { defaultValue: '長圖圖片（PNG）' }) },
    { key: 'pdf', icon: <FilePdfOutlined />, label: t('cpm.export.pdf', { defaultValue: 'PDF 文件（A4 分頁）' }) },
  ]

  const delta = report ? report.totals.avgEnd - report.totals.avgStart : 0

  return (
    <div className="content-area">
      <Tabs
        items={[
          {
            key: 'report',
            label: t('cpm.workReport.tab.read', { defaultValue: '匯報閱讀' }),
            children: (
              <>
                {loadError && (
                  <Alert type="error" showIcon style={{ marginBottom: 14 }}
                    message={t('cpm.workReport.loadFailed', { defaultValue: '匯報載入失敗' })} description={loadError}
                    action={<Button size="small" onClick={() => void load()}>{t('cpm.sourceImport.retry', { defaultValue: '重試' })}</Button>} />
                )}
                <div className="rp-bar">
                  <Segmented
                    value={periodType}
                    onChange={v => { setPeriodType(v as CpmPeriodValue); setOffset(0) }}
                    options={Object.values(CpmPeriod).map(p => ({ label: CPM_PERIOD_LABELS[p], value: p }))}
                  />
                  <div className="rp-bar__nav">
                    <Button size="small" icon={<LeftOutlined />} onClick={() => setOffset(o => o - 1)} aria-label={t('cpm.gantt.period.prev', { defaultValue: '上一期' })} />
                    <Button size="small" onClick={() => { setOffset(0); setAnchor(null) }}>{t('cpm.workReport.thisPeriod', { defaultValue: '本期' })}</Button>
                    <Button size="small" icon={<RightOutlined />} disabled={offset >= 0} onClick={() => setOffset(o => o + 1)} aria-label={t('cpm.gantt.period.next', { defaultValue: '下一期' })} />
                  </div>
                  <DatePicker
                    size="small"
                    value={anchor}
                    onChange={v => { setAnchor(v); setOffset(0) }}
                    placeholder={t('cpm.workReport.anchor', { defaultValue: '錨點日期' })}
                    allowClear
                  />
                  <span className="rp-bar__label">{range.label}</span>
                  <Tag color="blue">{t('cpm.workReport.autoDraftTag', { defaultValue: '自動聚合草稿' })}</Tag>
                  <div className="rp-bar__actions">
                    <Button size="small" icon={<CopyOutlined />} onClick={() => void copyMarkdown()}>{t('cpm.workReport.copyMarkdown', { defaultValue: '複製 Markdown' })}</Button>
                    <Dropdown trigger={['click']} disabled={!!exportBusy} menu={{ items: exportItems, onClick: ({ key }) => void runExport(key as DocumentExportKind) }}>
                      <Button size="small" className="btn-export" icon={<DownloadOutlined />} loading={!!exportBusy}>{t('common.export', { defaultValue: '導出' })}</Button>
                    </Dropdown>
                  </div>
                </div>

                {loading && !report ? (
                  <div className="rp-empty">
                    <Empty description={t('cpm.workReport.loading', { defaultValue: '匯報聚合中…' })} />
                  </div>
                ) : !report || (report.totals.total === 0 && report.plan.length === 0 && report.totals.backlog === 0) ? (
                  <div className="rp-empty">
                    <Empty description={t('cpm.workReport.empty.desc', { defaultValue: '台账還沒有工作記錄，匯報無米下鍋' })} />
                    <Button type="primary" onClick={() => { location.hash = '#/cpm-my' }}>{t('cpm.workReport.empty.action', { defaultValue: '去工作記錄記一筆' })}</Button>
                  </div>
                ) : (
                  <div className="rp-doc" ref={docRef} data-period={range.label}>
                    {/* 抬頭 */}
                    <header className="rp-head">
                      <div className="rp-head__left">
                        <span className="rp-head__logo"><FieldTimeOutlined /></span>
                        <div>
                          <h1>{t('cpm.workReport.title', { defaultValue: '工作匯報' })}</h1>
                          <p>{range.label} · {fmt(range.start)} ~ {fmt(range.end)}</p>
                        </div>
                      </div>
                      <div className="rp-head__meta">
                        <span>{t('cpm.workReport.reporter', { defaultValue: '匯報人：本人' })}</span>
                        <span>{t('cpm.workReport.generatedAt', { time: dayjs().format('YYYY-MM-DD HH:mm'), defaultValue: '生成於 {{time}}' })}</span>
                        <span>{t('cpm.workReport.caliber', { hours: HOURS_PER_DAY, defaultValue: '口徑：工作日 × {{hours}}h・周末/節假日剔除' })}</span>
                      </div>
                    </header>

                    {/* 概述 */}
                    <div className="rp-overview">
                      <div className="rp-overview__text">
                        {editingSummary ? (
                          <Input.TextArea
                            autoFocus
                            rows={2}
                            maxLength={500}
                            value={summary}
                            onChange={e => setSummary(e.target.value)}
                            onBlur={() => setEditingSummary(false)}
                            placeholder={t('cpm.workReport.summaryPlaceholder', { defaultValue: '寫一句本期總結（留空則用自動概述，導出同文）' })}
                          />
                        ) : (
                          <p>{summary.trim() || overview}</p>
                        )}
                      </div>
                      <Tooltip title={t('cpm.workReport.editSummary', { defaultValue: '編輯本期總結' })}>
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditingSummary(true)} />
                      </Tooltip>
                    </div>

                    {/* 01 核心概覽 */}
                    <Section no="01" title={t('cpm.workReport.section.overview', { defaultValue: '核心概覽' })}>
                      <div className="rp-stats rp-stats--4">
                        <RpStat label={t('cpm.gantt.stat.doneInPeriod', { defaultValue: '本期完成' })} value={report.totals.done} suffix={t('cpm.gantt.suffix.item', { defaultValue: ' 項' })} color="var(--success)" bg="var(--success-soft)" icon={<CheckCircleOutlined />} />
                        <RpStat label={t('cpm.status.doing', { defaultValue: '進行中' })} value={report.totals.inProgress} suffix={t('cpm.gantt.suffix.item', { defaultValue: ' 項' })} color="var(--info)" bg="var(--info-soft)" icon={<RiseOutlined />} />
                        <RpStat label={t('cpm.workReport.stat.avgEnd', { defaultValue: '期末平均進度' })} value={report.totals.avgEnd} suffix="%" color="var(--brand)" bg="var(--brand-soft)" icon={<FieldTimeOutlined />}
                          extra={<DeltaChip delta={delta} />} />
                        <RpStat label={t('cpm.workReport.stat.hours', { defaultValue: '投入工時' })} value={report.totals.hours} suffix=" h" color="var(--purple)" bg="var(--purple-soft)" icon={<FieldTimeOutlined />} />
                      </div>
                      {/* 风险与临时插入不再各占一节，缩成概览行内标记：读的人先看到量，再去看明细 */}
                      <div className="rp-flags">
                        <span className="rp-flag"><WarningOutlined />{t('cpm.workReport.stat.risks', { defaultValue: '風險事項' })} <b>{report.totals.risks}</b></span>
                        <span className="rp-flag"><ThunderboltOutlined />{t('cpm.gantt.plan.inserted', { defaultValue: '臨時插入' })} <b>{report.totals.inserted}</b></span>
                        <span className="rp-flag">{t('cpm.gantt.status.plan', { defaultValue: '待排期' })} <b>{report.totals.backlog}</b></span>
                        <span className="rp-flag">{t('cpm.workReport.covered', { defaultValue: '本期覆蓋' })} <b>{report.totals.total}</b></span>
                      </div>
                    </Section>

                    {/* 02 本期內容：工时投入 + 进度对比 + 进度 + 状态 合在同一批块里 */}
                    <Section no="02" title={t('cpm.workReport.section.content', { defaultValue: '本期內容' })}>
                      {report.groups.length === 0 ? (
                        <p className="rp-none">{t('cpm.workReport.groups.none', { defaultValue: '本期無已排期的工作項任務。' })}</p>
                      ) : (
                        <>
                          {report.groups.map(g => <GroupBlock key={g.group.id} g={g} />)}
                          <DailySpark report={report} />
                        </>
                      )}
                    </Section>

                    {/* 03 下期計劃 */}
                    <Section no="03" title={t('cpm.workReport.section.plan', { defaultValue: '下期計劃' })}>
                      {report.plan.length === 0 ? (
                        <p className="rp-none">{t('cpm.workReport.plan.none', { defaultValue: '暫無已排期的下期事項。' })}</p>
                      ) : (
                        <div className="rp-plan">
                          {report.plan.map(r => (
                            <div key={r.task.id} className="rp-plan__row">
                              <span className="rp-plan__date">{r.task.start}</span>
                              <b>{r.task.title}</b>
                              <span className="rp-plan__group">{r.group.title}</span>
                              {r.task.planType === 'inserted' && (
                                <Tag color="volcano" className="wg-insert-tag">{t('cpm.gantt.insert.tag', { defaultValue: '臨時' })}</Tag>
                              )}
                              <span className="rp-plan__hours">{t('cpm.workReport.plan.estimate', { hours: r.hours, defaultValue: '預計 {{hours}}h' })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>

                    {/* 04 風險與備註 */}
                    <Section no="04" title={t('cpm.workReport.section.risks', { defaultValue: '風險與備註' })}>
                      {report.risks.length === 0 && report.notes.length === 0 && report.totals.backlog === 0 ? (
                        <p className="rp-none">{t('cpm.workReport.risks.none', { defaultValue: '本期無逾期、風險備註與待排期積壓。' })}</p>
                      ) : (
                        <div className="rp-risks">
                          {report.risks.map(r => (
                            <div key={r.task.id} className="rp-risk rp-risk--overdue">
                              <WarningOutlined />
                              <div>
                                <b>{r.task.title}</b>
                                <span>{t('cpm.workReport.riskLine', { group: r.group.title, end: r.task.end, progress: r.pEnd, defaultValue: '{{group}} · 結束 {{end}} · 進度 {{progress}}%' })}</span>
                              </div>
                              <Tag color="red">{t('cpm.workReport.overdueDays', { days: r.overdueDays, defaultValue: '逾期 {{days}} 天' })}</Tag>
                            </div>
                          ))}
                          {report.notes.map(r => (
                            <div key={r.task.id} className="rp-risk rp-risk--note">
                              <EditOutlined />
                              <div>
                                <b>{r.task.title}</b>
                                <div className="rp-risk__note" dangerouslySetInnerHTML={{ __html: noteToDisplayHtml(r.task.note) }} />
                              </div>
                            </div>
                          ))}
                          {report.totals.backlog > 0 && (
                            <div className="rp-risk rp-risk--backlog">
                              <FieldTimeOutlined />
                              <div>
                                <b>{t('cpm.workReport.backlog.count', { count: report.totals.backlog, defaultValue: '待排期積壓 {{count}} 項' })}</b>
                                <span>{t('cpm.workReport.backlog.note', { defaultValue: '未排期任務不計工時，建議尽快落入計劃' })}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Section>

                    <footer className="rp-foot">
                      {t('cpm.workReport.foot', { defaultValue: '數據來源：工作記錄台账（甘特／列表同源）· 進度對比取期初/期末流水快照 · 工時按工作日口徑扣減。' })}
                    </footer>
                  </div>
                )}
              </>
            ),
          },
          {
            key: 'delivery',
            label: t('cpm.workReport.tab.delivery', { defaultValue: '發布與交付' }),
            children: <ReportDeliveryPanel />,
          },
          {
            key: 'archive',
            label: (<span><TrophyFilled style={{ color: 'var(--purple)' }} /> {t('cpm.workReport.tab.archive', { defaultValue: '個人成果檔案' })}</span>),
            children: <RecognitionArchive />,
          },
          { key: 'history', label: t('cpm.workReport.tab.history', { defaultValue: '歷史匯報' }), children: <HistoryList /> },
        ]}
      />
    </div>
  )
}

/* ==================== 版式元件 ==================== */

function Section({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <section className="rp-sec">
      <div className="rp-sec__head">
        <span className="rp-sec__no">{no}</span>
        <h2>{title}</h2>
        <div className="rp-sec__line" />
      </div>
      {children}
    </section>
  )
}

function DeltaChip({ delta }: { delta: number }) {
  const { t } = useTranslation()
  if (delta === 0) return <Tag style={{ marginInlineEnd: 0 }}>{t('cpm.workReport.flat', { defaultValue: '持平' })}</Tag>
  return (
    <Tag color={delta > 0 ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>
      {delta > 0 ? <RiseOutlined /> : <FallOutlined />} {delta > 0 ? '+' : ''}{delta}%
    </Tag>
  )
}

function RpStat({ label, value, suffix, color, bg, icon, extra }: {
  label: string; value: number; suffix: string; color: string; bg: string; icon: ReactNode; extra?: ReactNode
}) {
  return (
    <div className="rp-stat" style={{ '--stat-color': color, '--stat-bg': bg } as CSSProperties}>
      <div className="rp-stat__icon">{icon}</div>
      <div className="rp-stat__num"><AnimatedNumber value={value} suffix={suffix} /></div>
      <div className="rp-stat__label">{label}</div>
      {extra && <div className="rp-stat__extra">{extra}</div>}
    </div>
  )
}

/**
 * 本期內容的一块：一个工作項的工时、进度对比、每条子任务的进度与状态。
 * 原来分散在「核心產出／工作項進度對比／工時分布」三节的信息在这里一次读完。
 */
function GroupBlock({ g }: { g: ReportGroupRow }) {
  const { t } = useTranslation()
  const color = GROUP_COLORS[g.group.hue % GROUP_COLORS.length]
  return (
    <div className="rp-cmp" style={{ '--g': color } as CSSProperties}>
      <div className="rp-cmp__head">
        <i className="rp-cmp__dot" />
        <b>{g.group.title}</b>
        <span>{t('cpm.workReport.groupMeta', { count: g.rows.length, hours: g.hours, done: g.doneCount, defaultValue: '{{count}} 項 · {{hours}}h · 完成 {{done}}' })}</span>
        <DeltaChip delta={g.avgEnd - g.avgStart} />
      </div>
      <div className="rp-cmp__track">
        <div className="rp-cmp__start" style={{ width: `${g.avgStart}%` }} />
        <div className="rp-cmp__end" style={{ width: `${g.avgEnd}%` }} />
        <i className="rp-cmp__mark" style={{ left: `${g.avgStart}%` }} />
      </div>
      <div className="rp-cmp__nums">
        <span>{t('cpm.workReport.periodStart', { v: g.avgStart, defaultValue: '期初 {{v}}%' })}</span>
        <span>{t('cpm.workReport.periodEnd', { v: g.avgEnd, defaultValue: '期末 {{v}}%' })}</span>
      </div>
      <div className="rp-cmp__tasks">
        {g.rows.map(r => (
          <div key={r.task.id} className="rp-cmp__task">
            <span className="rp-cmp__task-title">{r.task.title}</span>
            {r.task.planType === 'inserted' && (
              <Tooltip title={t('cpm.gantt.insert.tagTip', { date: r.task.insertedAt ?? r.task.start ?? t('cpm.gantt.insert.noDate', { defaultValue: '日期未記' }), defaultValue: '臨時插入・{{date}}' })}>
                <Tag color="volcano" className="wg-insert-tag">{t('cpm.gantt.insert.tag', { defaultValue: '臨時' })}</Tag>
              </Tooltip>
            )}
            <span className="rp-cmp__pill" style={{ '--p': progressColor(r.pEnd) } as CSSProperties}>
              <i style={{ width: `${r.pEnd}%` }} />
            </span>
            <span className="rp-cmp__task-num">{r.pStart}% → {r.pEnd}%</span>
            <span className="rp-cmp__task-hours">{r.hours}h</span>
            <Tag color={statusTagColor(r)} style={{ marginInlineEnd: 0 }}>{statusLabel(r, t)}</Tag>
            {r.overdueDays > 0 && <Tag color="red" style={{ marginInlineEnd: 0 }}>{t('cpm.workReport.overdueShort', { days: r.overdueDays, defaultValue: '逾期 {{days}}d' })}</Tag>}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 行内状态：与台账同一推导（完成时点在本期=本期完成，否则按期末进度） */
function statusOf(r: ReportGroupRow['rows'][number]): 'done' | 'doing' | 'todo' {
  if (r.doneAt) return 'done'
  return r.pEnd > 0 ? 'doing' : 'todo'
}
function statusTagColor(r: ReportGroupRow['rows'][number]): string {
  return r.doneAt ? 'green' : r.pEnd > 0 ? 'blue' : 'orange'
}
function statusLabel(r: ReportGroupRow['rows'][number], t: (key: string, options: Record<string, unknown>) => string): string {
  const key = statusOf(r)
  return key === 'done'
    ? t('cpm.status.done', { defaultValue: '已完成' })
    : key === 'doing' ? t('cpm.status.doing', { defaultValue: '進行中' }) : t('cpm.gantt.status.todo', { defaultValue: '待處理' })
}

function DailySpark({ report }: { report: WorkReport }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...report.daily.map(d => d.hours))
  const n = report.daily.length
  const bw = 100 / n
  return (
    <div className="rp-spark">
      <div className="rp-spark__head">
        <span>{t('cpm.workReport.daily', { defaultValue: '每日投入（工作日口徑）' })}</span>
        {report.peak && <span>{t('cpm.workReport.peak', { date: report.peak.key, hours: report.peak.hours, defaultValue: '峰值 {{date}} · {{hours}}h' })}</span>}
      </div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="rp-spark__svg" aria-hidden="true">
        {report.daily.map((d, i) => (
          <rect
            key={d.key}
            x={i * bw + bw * 0.15}
            y={30 - (d.hours / max) * 26 - 2}
            width={bw * 0.7}
            height={Math.max(d.hours > 0 ? 2 : 0.6, (d.hours / max) * 26)}
            rx={0.6}
            fill={d.rest ? 'var(--border-2)' : d.hours > 0 ? 'var(--brand)' : 'var(--border-2)'}
            opacity={d.rest ? 0.6 : d.hours > 0 ? 0.85 : 0.6}
          />
        ))}
      </svg>
      <div className="rp-spark__axis">
        <span>{report.start}</span>
        <span>{report.end}</span>
      </div>
    </div>
  )
}
