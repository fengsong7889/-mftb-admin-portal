/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { ReactNode, RefObject } from 'react'
import { Alert, Select, Space, Tag } from 'antd'
import { RiseOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { CPM_STATUS_LABELS, CpmStatus, type CpmStatusValue } from './meta'
import { formatHours, formatMinutes } from './cpmTime'
import type { DocModel } from './cpmDocument'
import type { CpmRevisionVO } from '@/api/cpm'
import CpmTimeStats from './CpmTimeStats'
import './cpm.css'

/**
 * 汇报公文式阅读面（阶段三核心交付）。
 *
 * 版式对齐「会议纪要」正文卡：居中宋体抬头 + 双线分隔 + 身份行 + 连续编号章节，
 * **不以彩色卡片区分文件章节**——一份要给人读、要导出的汇报首先是「一份文件」，
 * 不是三个可折叠的面板。CSS 在 cpm.css 的 `.cpm-document*` 命名空间下自建：
 * 既不能 import 会议页面的 minutes.css（页面→页面依赖会被域耦合门禁判红），
 * 也不把 .mm-document 上提共享（那边有测试钉住类名，动它等于改已上线模块的视觉真源）。
 *
 * 三处共用同一个组件：我的日报、我的周月报已发布视图、上级查看页。
 * 理由与 SnapshotView 完全一致——两套渲染必然在某个字段上分叉，
 * 而汇报分叉的后果是「上级看到的和本人发出的不是同一件事」。
 */

interface Props {
  /** 文档主标题（含周期），例如「工作匯報（第 47 週 11-16 ~ 11-22）」 */
  docTitle: string
  ownerName?: string | null
  ownerEmpId?: string | null
  periodLabel: string
  /**
   * `readonly` 是日报专用：日报是「条目的当日投影」，没有草稿/已发布这回事，
   * 也不该有发布按钮——把它塞进 published/draft 二选一会让界面假装它有提交语义。
   */
  status: 'draft' | 'published' | 'readonly'
  publishedAt?: string | null
  model: DocModel
  summary?: string | null
  aiSummary?: boolean
  /** 可选版本列表；只有一个版本时不渲染选择器（不制造「还能切」的错觉） */
  revisions?: CpmRevisionVO[]
  activeRevision?: number
  onRevisionChange?: (revisionNo: number) => void
  /** 正在阅读历史版本：整页只读语义要在抬头就说清楚 */
  historical?: boolean
  /** 送达 / 已读一行（仅已发布视图有） */
  delivery?: ReactNode
  /** 反馈与成果认定区 */
  feedback?: ReactNode
  /** 底部操作区（复制、导出、修订重发布） */
  actions?: ReactNode
  /** 周期日历：给趋势图补无投入日 */
  range?: { start: string; end: string }
  /** 文档根节点引用：导出（长图/PDF）要截的就是正在阅读的这一份版式 */
  rootRef?: RefObject<HTMLElement>
}

/** 章节容器：连续编号标题 + 正文，不以彩色卡片区分文件章节（与纪要正文卡同构） */
function Section({ number, title, extra, children }: {
  number: string
  title: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="cpm-document__section">
      <h3 className="cpm-document__section-title">
        <span className="cpm-document__section-number">{number}、</span>
        <span>{title}</span>
        {extra && <span className="cpm-document__section-extra">{extra}</span>}
      </h3>
      {children}
    </section>
  )
}

/** 状态色由令牌派生，展示层不再新造颜色 */
function statusTagClass(status: string): string {
  switch (status) {
    case CpmStatus.DONE: return 'cpm-document__tag cpm-document__tag--done'
    case CpmStatus.BLOCKED: return 'cpm-document__tag cpm-document__tag--blocked'
    case CpmStatus.CANCELLED: return 'cpm-document__tag cpm-document__tag--cancelled'
    case CpmStatus.DEFERRED: return 'cpm-document__tag cpm-document__tag--deferred'
    case CpmStatus.TODO: return 'cpm-document__tag cpm-document__tag--todo'
    default: return 'cpm-document__tag cpm-document__tag--doing'
  }
}

function statusLabel(status: string): string {
  return CPM_STATUS_LABELS[status as CpmStatusValue] ?? status
}

/** 抬头身份行：这三个 helper 都在 render 期调用，所以直接用 i18n.t 取词是安全的 */
function statusLine(status: Props['status'], publishedAt?: string | null): string {
  if (status === 'published') {
    return String(i18n.t('cpm.document.publishedAt', { time: publishedAt ?? '—', defaultValue: '發布：{{time}}' }))
  }
  if (status === 'readonly') return String(i18n.t('cpm.document.readonlyLine', { defaultValue: '口徑：當日條目投影（日報不發布、不送達）' }))
  return String(i18n.t('cpm.document.draftLine', { defaultValue: '狀態：草稿（未發布）' }))
}

function editionLine(status: Props['status'], revisionNo?: number): string {
  if (status === 'readonly') return String(i18n.t('cpm.document.edition.daily', { defaultValue: '日報 · 只讀投影' }))
  if (status === 'draft') return String(i18n.t('cpm.document.edition.draft', { defaultValue: '草稿' }))
  // 没有版本号就是真的没有版本行，不能默认成 V1——那会让落款声称一个数据库里不存在的版本
  return revisionNo
    ? String(i18n.t('cpm.document.edition.published', { no: revisionNo, defaultValue: 'V{{no}} 正式版本' }))
    : String(i18n.t('cpm.document.edition.legacy', { defaultValue: '歷史發送快照（無版本記錄）' }))
}

export default function CpmReportDocument({
  docTitle, ownerName, ownerEmpId, periodLabel, status, publishedAt, model, summary,
  aiSummary, revisions, activeRevision, onRevisionChange, historical, delivery,
  feedback, actions, range, rootRef,
}: Props) {
  const { t } = useTranslation()
  const { totals, time } = model
  const showVersionPicker = (revisions?.length ?? 0) > 1 && !!onRevisionChange

  return (
    <article ref={rootRef} className="cpm-document cpm-document--sheet">
      {historical && (
        <Alert
          type="warning"
          showIcon
          className="cpm-document__historical"
          message={t('cpm.document.historicalTitle', { no: activeRevision ?? '', defaultValue: '正在閱讀歷史版本 V{{no}}，此版本內容不可修改' })}
          description={t('cpm.document.historicalBody', { defaultValue: '當前生效版本與本版本的差異請以各版本發布時間為準；歷史通知指向的就是當時發布的那一版。' })}
        />
      )}

      <header className="cpm-document__header">
        <div className="cpm-document__eyebrow">
          <span className="cpm-document__brand">
            <span><RiseOutlined style={{ color: 'var(--brand)' }} /></span>
            <span>{t('cpm.document.brand', { defaultValue: '持續績效系統' })}</span>
            <span className="cpm-document__english-title">CONTINUOUS PERFORMANCE</span>
          </span>
        </div>
        <div className="cpm-document__rule" />
        <h2 className="cpm-document__title">{docTitle}</h2>
        <div className="cpm-document__identity">
          <span>{t('cpm.document.owner', { name: ownerName ?? '—', empId: ownerEmpId ? `（${ownerEmpId}）` : '', defaultValue: '匯報人：{{name}}{{empId}}' })}</span>
          <span>{t('cpm.document.period', { period: periodLabel, defaultValue: '週期：{{period}}' })}</span>
          <span>{statusLine(status, publishedAt)}</span>
          {showVersionPicker ? (
            <span className="cpm-document__edition">
              <Select
                size="small"
                variant="borderless"
                value={activeRevision}
                onChange={onRevisionChange}
                style={{ minWidth: 168 }}
                options={(revisions ?? []).map(revision => ({
                  value: revision.revisionNo,
                  label: `V${revision.revisionNo} · ${revision.publishedAt ?? '—'} · ${revision.changeNote ?? t('cpm.revision.firstPublish', { defaultValue: '首次發布' })}`,
                }))}
              />
            </span>
          ) : (
            // 阶段二发布的记录不追认 V1：那一版没有版本行，硬说成「V1」会让「修订前的取证链」
            // 看起来比实际完整。老实标「歷史發送快照」，用户就知道这一版没有可比对的上一版。
            <span className="cpm-document__edition">
              {revisions?.length
                ? t('cpm.document.versionSingle', { no: revisions[0].revisionNo, defaultValue: '版本 V{{no}}' })
                : status === 'published' ? t('cpm.document.edition.legacy', { defaultValue: '歷史發送快照（無版本記錄）' }) : ''}
            </span>
          )}
        </div>
      </header>

      <dl className="cpm-document__metadata">
        <div>
          <dt className="cpm-document__label">{t('cpm.document.meta.itemCount', { defaultValue: '條目數' })}</dt>
          <dd>{t('cpm.document.meta.itemCountValue', { count: totals.total, defaultValue: '{{count}} 項' })}</dd>
        </div>
        <div>
          <dt className="cpm-document__label">{t('cpm.document.meta.completion', { defaultValue: '完成率' })}</dt>
          <dd>
            {totals.completionPercent}%
            <span className="cpm-document__note">
              {t('cpm.document.meta.completionDetail', {
                done: totals.done, base: totals.completionBase, cancelled: totals.cancelled,
                skipped: totals.cancelled > 0
                  ? t('cpm.document.meta.cancelledSkipped', { count: totals.cancelled, defaultValue: '，已取消 {{count}} 項不計入' })
                  : '',
                defaultValue: '（完成 {{done}}／應完成 {{base}}{{skipped}}）',
              })}
            </span>
          </dd>
        </div>
        <div>
          <dt className="cpm-document__label">{t('cpm.document.meta.totalInvested', { defaultValue: '總投入' })}</dt>
          <dd>{time ? formatMinutes(time.totalMinutes) : '—'}
            {time && time.manualFallbackMinutes > 0 && (
              <span className="cpm-document__note">
                {t('cpm.document.meta.includesEstimate', { hours: formatHours(time.manualFallbackMinutes), defaultValue: '（含估算 {{hours}}）' })}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="cpm-document__label">{t('cpm.document.meta.dailyAvg', { defaultValue: '日均投入' })}</dt>
          <dd>{time && time.activeDays > 0
            ? t('cpm.document.meta.dailyAvgValue', { hours: formatHours(time.avgMinutesPerActiveDay), days: time.activeDays, defaultValue: '{{hours}} × {{days}} 天' })
            : '—'}</dd>
        </div>
        {totals.blocked > 0 && (
          <div>
            <dt className="cpm-document__label">{CPM_STATUS_LABELS[CpmStatus.BLOCKED]}</dt>
            <dd>{t('cpm.document.meta.blockedValue', { count: totals.blocked, defaultValue: '{{count}} 項（需上級介入解除）' })}</dd>
          </div>
        )}
        {totals.deferred > 0 && (
          <div>
            <dt className="cpm-document__label">{CPM_STATUS_LABELS[CpmStatus.DEFERRED]}</dt>
            <dd>{t('cpm.document.meta.deferredValue', { count: totals.deferred, defaultValue: '{{count}} 項（改期，非取消）' })}</dd>
          </div>
        )}
        <div className="cpm-document__metadata-wide">
          <dt className="cpm-document__label">{t('cpm.document.meta.statusDist', { defaultValue: '狀態分佈' })}</dt>
          <dd>
            <Space size={6} wrap>
              {([
                ['doing', totals.doing], ['todo', totals.todo], ['done', totals.done],
                ['blocked', totals.blocked], ['deferred', totals.deferred], ['cancelled', totals.cancelled],
              ] as [CpmStatusValue, number][]).filter(([, count]) => count > 0).map(([value, count]) => (
                <Tag key={value} className={statusTagClass(value)}>{statusLabel(value)} {count}</Tag>
              ))}
              {aiSummary && <Tag color="purple">{t('cpm.document.aiSummaryTag', { defaultValue: '摘要含 AI 生成內容' })}</Tag>}
            </Space>
          </dd>
        </div>
      </dl>

      <Section number={t('cpm.document.section.first', { defaultValue: '一' })} title={t('cpm.document.section.time', { defaultValue: '工時投入匯總' })}>
        <CpmTimeStats totals={time} range={range} />
      </Section>

      <Section
        number={t('cpm.document.section.second', { defaultValue: '二' })}
        title={t('cpm.document.section.detail', { defaultValue: '工作事項明細' })}
        extra={t('cpm.document.totalItems', { count: totals.total, defaultValue: '共 {{count}} 項' })}
      >
        {model.groups.length === 0 ? (
          <p className="cpm-document__empty">{t('cpm.document.emptyDetail', { defaultValue: '本期間沒有活躍的工作記錄。' })}</p>
        ) : model.groups.map((group, groupIndex) => (
          <div className="cpm-document__group" key={group.category}>
            <h4 className="cpm-document__group-title">
              2.{groupIndex + 1} {group.categoryLabel}
              <span className="cpm-document__group-meta">
                {t('cpm.document.groupMeta', { count: group.items.length, hours: formatHours(group.minutes), defaultValue: '{{count}} 項 · {{hours}}' })}
              </span>
            </h4>
            {group.items.map(entry => (
              <div className="cpm-document__entry" key={entry.itemId}>
                <div className="cpm-document__entry-head">
                  <span className="cpm-document__entry-title">{entry.title}</span>
                  <span className={statusTagClass(entry.status)}>{statusLabel(entry.status)}</span>
                  <span className="cpm-document__entry-progress">{entry.progress}%</span>
                </div>
                <div className="cpm-document__entry-meta">
                  {entry.workDate && (
                    <span>{t('cpm.document.entry.startedFrom', { date: entry.workDate, defaultValue: '{{date}} 起' })}</span>
                  )}
                  {entry.trail.length > 1 && (
                    <span className="cpm-document__trail">
                      {t('cpm.document.entry.trail', { trail: entry.trail.join(' → '), defaultValue: '軌跡 {{trail}}%' })}
                    </span>
                  )}
                  {entry.minutes !== null && (
                    <span>{t('cpm.document.entry.invested', { minutes: formatMinutes(entry.minutes), defaultValue: '投入 {{minutes}}' })}</span>
                  )}
                  {entry.minutesSource === 'manual' && (
                    <span className="cpm-document__note">{t('cpm.document.entry.manualEstimateNote', { defaultValue: '（手工估算，無精確起止）' })}</span>
                  )}
                  {entry.sourceLabel && (
                    <span>{t('cpm.document.entry.source', { label: entry.sourceLabel, defaultValue: '來源：{{label}}' })}</span>
                  )}
                </div>
                {entry.segments.length > 0 && (
                  <ul className="cpm-document__segments">
                    {entry.segments.map((segment, index) => (
                      <li key={`${entry.itemId}-${index}`}>
                        <span className="cpm-document__segment-range">
                          {segment.range || t('cpm.time.range.none', { defaultValue: '未填起止' })}
                        </span>
                        <span className="cpm-document__segment-minutes">{formatMinutes(segment.minutes)}</span>
                        {segment.note && <span className="cpm-document__segment-note">{segment.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ))}
      </Section>

      <Section number={t('cpm.document.section.third', { defaultValue: '三' })} title={t('cpm.document.section.summary', { defaultValue: '匯總摘要' })}>
        {summary?.trim()
          ? <p className="cpm-document__summary">{summary}</p>
          : <p className="cpm-document__empty">{t('cpm.document.emptySummary', { defaultValue: '本報告未填寫匯總摘要。' })}</p>}
        <p className="cpm-document__note">
          {t('cpm.document.summaryFootnote', { defaultValue: '數字與狀態來自期間內的工作記錄與進度流水，AI 僅參與摘要文字起草且必須披露；模型不產生任何計數。' })}
        </p>
      </Section>

      {feedback && (
        <Section number={t('cpm.document.section.fourth', { defaultValue: '四' })} title={t('cpm.document.section.feedback', { defaultValue: '反饋與成果認定' })}>
          {feedback}
        </Section>
      )}

      {delivery}

      <div className="cpm-document__identity cpm-document__identity--foot">
        {/* 生成时刻是本地化的日期时间，不是「按中文 locale 渲染」——导出件给谁看就该按谁的地区格式 */}
        <span>{t('cpm.document.generatedAt', { time: new Date().toLocaleString(undefined, { hour12: false }), defaultValue: '生成於：{{time}}' })}</span>
        <span>{t('cpm.document.footprint', { defaultValue: '口徑：條目按 itemId 去重，狀態取期間內最後一筆進度流水' })}</span>
        <span className="cpm-document__edition">{editionLine(status, activeRevision ?? revisions?.[0]?.revisionNo)}</span>
      </div>

      {actions && <div className="cpm-document__actions">{actions}</div>}
    </article>
  )
}
