import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Segmented, Spin } from 'antd'
import GroupLogo from '../../components/GroupLogo'
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  ColumnWidthOutlined,
  ExpandAltOutlined,
  LinkOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ShrinkOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import AnimatedNumber from '../../components/AnimatedNumber'
import HelpPopover, { type HelpSection } from '../../components/HelpPopover'
import GanttBoard, { type GanttDraft, type GanttRow, type GanttTask } from '../Rdm/components/GanttBoard'
import { fetchDailyReportPublicView, type DailyReportPublicView } from '../../api/rdmDailyReportPublic'
import type {
  DailyReportIteration,
  DailyReportProject,
  DailyReportRequirement,
  DailyReportSnapshot,
  DailyReportTask,
} from '../../api/rdmDailyReport'
import './index.css'
// 复用「我的甘特圖」GanttBoard，其样式定义在 RDM 模块样式表中
import '../Rdm/index.css'

/**
 * 进度日报看板（公开页，钉钉通知链接的落地页）。
 *
 * <p><b>两个模板，一套结构</b>：晨报与晚报共用同一套层级与样式，只在“焦点条”上分叉
 * （晨报看今日到期/明日到期，晚报看今日完成/上线/状态变更）——写两套组件会让两个模板
 * 的字段口径逐渐漂移，最后同一份快照在两个页面显示不同数字。
 *
 * <p><b>嵌套而不是分区</b>：项目 → 迭代（隐藏已关闭）→ 需求（点击展开甘特）。
 * 读者从消息里的“项目 + 迭代”点进来，落点必须是同一个归属关系；平铺成“项目区/迭代区/需求区”
 * 会让跨项目混排，读者得自己在脑内 join。
 *
 * <p><b>样式固定</b>：布局与配色写在本文件 + index.css，不提供皮肤/模板/自定义 CSS；
 * 可调的只有后端下发的展示参数（负责人/需求明细/未挂迭代）。
 *
 * <p><b>口径只读快照</b>：所有数字直接展示后端快照字段，前端不做进度重算——
 * 「通知里的数字」与「页面看到的数字」必须恒等。
 */

type Tone = 'info' | 'warn' | 'danger' | 'success' | 'neutral'

const TONE_STYLE: Record<Tone, { color: string; bg: string }> = {
  info: { color: '#1890ff', bg: '#e6f7ff' },
  warn: { color: '#fa8c16', bg: '#fff7e6' },
  danger: { color: '#f5222d', bg: '#fff1f0' },
  success: { color: '#52c41a', bg: '#f6ffed' },
  neutral: { color: '#8c8c8c', bg: '#fafafa' },
}

function isEvening(snapshot: DailyReportSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  return snapshot.reportType === 'evening' || Boolean(snapshot.reportTypeLabel?.includes('晚報'))
}

function statusTone(status?: string | null): Tone {
  switch (status) {
    case 'released':
    case 'closed':
    case 'accepted':
    case 'test_passed':
    case 'verified':
      return 'success'
    case 'developing':
    case 'designing':
    case 'integration':
    case 'testing':
    case 'reviewing':
    case 'prd_designing':
      return 'info'
    case 'draft':
    case 'pool':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function priorityTone(priority?: string | null): Tone {
  switch (priority) {
    case 'P0':
      return 'danger'
    case 'P1':
      return 'warn'
    case 'P2':
      return 'info'
    default:
      return 'neutral'
  }
}

function iterationStatusKey(status?: string | null): string {
  switch (status) {
    case 'planning':
      return 'rdm.daily.iterPlanning'
    case 'active':
      return 'rdm.daily.iterActive'
    case 'closed':
      return 'rdm.daily.iterClosed'
    default:
      return ''
  }
}

/** 展示口径：迭代按是否关闭分三类，需求按是否交付完成分三类 */
type IterFilter = 'active' | 'closed' | 'all'
type ReqFilter = 'open' | 'done' | 'all'

interface BoardFilters {
  iter: IterFilter
  req: ReqFilter
}

/** 项目区视图：卡片可横向比较，列表为单列全宽，适合逐项目看甘特 */
type ProjectView = 'card' | 'list'

/**
 * 需求「交付完成」口径：已確認交付(verified) / 已歸檔(closed)。
 * <p>已上线(released)仍欠业务验收，归入未完成——与项目详情 REQ_DONE_STATUSES 同源。
 * 两边必须一致，否则同一份数据在看板与详情页会得出不同的完成数。
 */
const REQ_DONE_STATUSES = new Set(['verified', 'closed'])

function isReqDone(status?: string | null): boolean {
  return Boolean(status && REQ_DONE_STATUSES.has(status))
}

/** 驳回需求既不属于「已完成」也不该凭空消失，统一留在「未完成」里靠状态标签区分 */
function filterRequirements(list: DailyReportRequirement[], filter: ReqFilter): DailyReportRequirement[] {
  if (filter === 'all') return list
  return list.filter(r => (filter === 'done' ? isReqDone(r.status) : !isReqDone(r.status)))
}

function filterIterations(list: DailyReportIteration[], filter: IterFilter): DailyReportIteration[] {
  if (filter === 'all') return sortIterations(list)
  const wantedClosed = filter === 'closed'
  return sortIterations(list.filter(it => (it.status === 'closed') === wantedClosed))
}

/** 推进中的迭代按开始日期正序；已完成的按结束日期倒序（最近关版的版本在前） */
function sortIterations(list: DailyReportIteration[]): DailyReportIteration[] {
  const rank = (s?: string | null) => (s === 'closed' ? 1 : 0)
  return [...list].sort((a, b) => {
    const ra = rank(a.status)
    const rb = rank(b.status)
    if (ra !== rb) return ra - rb
    // 日期均为 yyyy-MM-dd，可直接按字典序比较
    return ra === 1
      ? (b.endDate ?? '').localeCompare(a.endDate ?? '')
      : (a.startDate ?? '').localeCompare(b.startDate ?? '')
  })
}

function countDoneRequirements(list: DailyReportRequirement[]): number {
  return list.filter(r => isReqDone(r.status)).length
}

/** 项目级迭代/需求计数：按快照里实际可见的行统计，不另查接口 */
function projectStats(project: DailyReportProject) {
  const iterations = project.iterations ?? []
  const requirements = [
    ...iterations.flatMap(it => it.requirements ?? []),
    ...(project.unscheduledRequirements ?? []),
  ]
  return {
    iterationTotal: iterations.length,
    iterationDone: iterations.filter(it => it.status === 'closed').length,
    requirementTotal: requirements.length,
    requirementDone: countDoneRequirements(requirements),
  }
}

/** 日期工具：快照里的日期都是 yyyy-MM-dd；非法值一律返回 null，不参与甘特缩放 */
function parseDate(value?: string | null) {
  if (!value) return null
  const d = dayjs(value)
  return d.isValid() ? d : null
}

export default function RdmDailyReportView() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [view, setView] = useState<DailyReportPublicView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      setView(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setView(await fetchDailyReportPublicView(token))
    } catch (e) {
      // 开放页面不暴露技术错误（状态码/网关信息），统一一句可操作提示；真实错误只进控制台
      console.error(e)
      setView(null)
      setError(t('rdm.board.loadFailedDesc', { defaultValue: '服務暫時不可用，請稍後重試。' }))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="rdm-board-page">
      <div className="rdm-board-shell">
        {loading ? (
          <div className="rdm-board-center">
            <Spin size="large" />
            <div className="rdm-board-center-text">{t('rdm.board.loading', { defaultValue: '載入日報中…' })}</div>
          </div>
        ) : !token ? (
          <NoticeCard
            title={t('rdm.board.missingTitle', { defaultValue: '缺少查看令牌' })}
            message={t('rdm.board.missingToken', { defaultValue: '請從釘釘通知中的連結重新進入，或向推送人索取新連結。' })}
          />
        ) : error ? (
          <NoticeCard
            title={t('rdm.board.loadFailed', { defaultValue: '看板載入失敗' })}
            message={error}
            onRetry={() => void load()}
          />
        ) : view ? (
          <RdmDailyReportBoard view={view} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * 看板正文：公开链接与登录态实时预览共用同一套渲染。
 *
 * <p>实时预览不另写一套 UI：弹窗里看到的层级、字段、裁剪规则与真正推出去后点开的
 * 看板完全一致，避免“预览好看、落地页不一样”。
 */
export function RdmDailyReportBoard({ view, preview = false }: {
  view: DailyReportPublicView
  /** 实时预览：未发送、未落库，页头提示换为预览口径 */
  preview?: boolean
}) {
  const { t } = useTranslation()
  const snapshot = view.valid ? view.snapshot ?? null : null
  const evening = isEvening(snapshot)
  // 默认只看推进中的迭代与未完成需求：看板回答「现在进行到哪」，历史按需展开
  const [filters, setFilters] = useState<BoardFilters>({ iter: 'active', req: 'open' })
  const [projectView, setProjectView] = useState<ProjectView>('card')

  const riskProjects = useMemo(() => {
    if (!snapshot) return []
    return snapshot.projects.filter(p =>
      p.attention || p.riskFlag === 1 || p.overdueFlag === 1
      || p.deliveryItemOverdue > 0 || p.deliveryItemBlocked > 0)
  }, [snapshot])

  /**
   * 历史遗留：已关闭迭代里仍有未完成需求。
   * <p>看板默认只渲染推进中迭代，这些行会被整体藏起来；必须显式提示并提供
   * 一键跳转，避免「关了迭代就等于做完了」的错觉。
   */
  const legacyOpenInClosedIterations = useMemo(() => {
    if (!snapshot || !view.showRequirements) return 0
    const countIn = (iters: DailyReportIteration[]) => iters.reduce((sum, it) => (
      it.status === 'closed'
        ? sum + (it.requirements ?? []).filter(r => !isReqDone(r.status)).length
        : sum
    ), 0)
    return countIn(snapshot.projects.flatMap(p => p.iterations ?? []))
      + (view.showUnassigned ? countIn(snapshot.unassignedIterations ?? []) : 0)
  }, [snapshot, view.showRequirements, view.showUnassigned])

  if (!view.valid) {
    return (
      <NoticeCard
        title={t('rdm.board.invalidTitle', { defaultValue: '連結不可用' })}
        message={view.message || t('rdm.board.invalidDesc', { defaultValue: '連結可能已過期或已被撤回，請向推送人索取新連結。' })}
      />
    )
  }
  if (!snapshot) return null
  const unassignedRequirements = snapshot.unassignedRequirements ?? []
  // 需求明细关闭时不做需求筛选：没有可筛的行，多一个控件只会制造疑问
  const visibleUnassignedRequirements = view.showRequirements
    ? filterRequirements(unassignedRequirements, filters.req)
    : []

  return (
    <>
      <BoardHeader view={view} snapshot={snapshot} evening={evening} preview={preview} />
      <KpiSection snapshot={snapshot} />
      <FocusStrip snapshot={snapshot} evening={evening} />
      {riskProjects.length > 0 && <RiskSection projects={riskProjects} />}

      <section className="rdm-board-section">
        <SectionTitle
          title={t('rdm.board.progressTitle', { defaultValue: '項目進度' })}
          count={snapshot.projects.length}
          countSuffix={t('rdm.daily.unitProject', { defaultValue: '個' })}
          extra={(
            <div
              className="rdm-board-view-switch"
              role="group"
              aria-label={t('rdm.board.viewSwitchAria', { defaultValue: '項目區視圖切換' })}
            >
              <button
                type="button"
                data-active={projectView === 'card' ? 'true' : 'false'}
                aria-pressed={projectView === 'card'}
                onClick={() => setProjectView('card')}
              >
                <AppstoreOutlined />
                <span>{t('rdm.board.viewCard', { defaultValue: '卡片' })}</span>
              </button>
              <button
                type="button"
                data-active={projectView === 'list' ? 'true' : 'false'}
                aria-pressed={projectView === 'list'}
                onClick={() => setProjectView('list')}
              >
                <UnorderedListOutlined />
                <span>{t('rdm.board.viewList', { defaultValue: '列表' })}</span>
              </button>
            </div>
          )}
        />
        <BoardFilterBar
          filters={filters}
          onChange={setFilters}
          showRequirements={view.showRequirements}
          legacyOpenCount={legacyOpenInClosedIterations}
        />
        {snapshot.projects.length === 0 ? (
          <div className="rdm-board-empty">{t('rdm.daily.noProjects', { defaultValue: '目前沒有在途項目' })}</div>
        ) : (
          <div className="rdm-board-projects" data-view={projectView}>
            {snapshot.projects.map(p => (
              <ProjectCard key={p.projectId} project={p} view={view} filters={filters} />
            ))}
          </div>
        )}
      </section>

      {view.showUnassigned && (snapshot.unassignedIterations?.length ?? 0) > 0 && (
        <UnassignedSection iterations={snapshot.unassignedIterations} view={view} filters={filters} />
      )}

      {view.showUnassigned && view.showRequirements && visibleUnassignedRequirements.length > 0 && (
        <section className="rdm-board-section">
          <SectionTitle
            title={t('rdm.board.unassignedRequirements', { defaultValue: '未掛項目的需求' })}
            count={visibleUnassignedRequirements.length}
            countSuffix={t('rdm.daily.unitItem', { defaultValue: '項' })}
            tone="warn"
          />
          <div className="rdm-board-card">
            <div className="rdm-board-note">
              {t('rdm.board.unassignedReqHint', { defaultValue: '這些需求未掛項目與迭代，不計入任何項目進度' })}
            </div>
            {visibleUnassignedRequirements.map(req => (
              <RequirementRow key={req.reqId} req={req} iteration={null} view={view} />
            ))}
          </div>
        </section>
      )}

      <BoardFooter view={view} />
    </>
  )
}

/* ==================== 页头 ==================== */

function BoardHeader({ view, snapshot, evening, preview = false }: {
  view: DailyReportPublicView
  snapshot: DailyReportSnapshot
  evening: boolean
  preview?: boolean
}) {
  const { t } = useTranslation()
  return (
    <header className="rdm-board-hero">
      <div className="rdm-board-hero-bar" />
      <div className="rdm-board-hero-inner">
        <div className="rdm-board-brand-row">
          <div className="rdm-board-brand">
            <div className="rdm-board-logo"><GroupLogo size={38} /></div>
            <div>
              <div className="rdm-board-brand-name">{t('rdm.board.brand', { defaultValue: '麦峰集团·项目汇报' })}</div>
              <div className="rdm-board-brand-sub">{t('rdm.board.subtitle', { defaultValue: 'PROJECT REPORT' })}</div>
            </div>
          </div>
          <div className="rdm-board-type-pill" data-evening={evening ? 'true' : 'false'}>
            {snapshot.reportTypeLabel || t('rdm.board.title', { defaultValue: '進度日報看板' })}
          </div>
        </div>
        <h1 className="rdm-board-title">{t('rdm.board.title', { defaultValue: '進度日報看板' })}</h1>
        <div className="rdm-board-meta">
          <span className="rdm-board-meta-item">
            <ClockCircleOutlined />
            {t('rdm.board.reportDate', { defaultValue: '日報日期' })}：{snapshot.reportDate}
          </span>
          {snapshot.scopeLabel && (
            <span className="rdm-board-meta-item">
              {t('rdm.board.scope', { defaultValue: '範圍' })}：{snapshot.scopeLabel}
            </span>
          )}
          {snapshot.generatedAt && (
            <span className="rdm-board-meta-item">
              {t('rdm.daily.generatedAt', { defaultValue: '生成於 {{time}}', time: snapshot.generatedAt })}
            </span>
          )}
        </div>
        <div className="rdm-board-expire">
          <SafetyCertificateOutlined />
          {preview
            ? t('rdm.board.previewHint', {
              defaultValue: '即時預覽：按當前數據生成，未發送、未落庫；正式推送後以當日快照為準。',
            })
            : view.expireAt
              ? t('rdm.board.openHint', {
                defaultValue: '本看板載有集團核心機密數據，僅限授權人員在有效期內查閱。嚴禁截圖、轉發、複製或向任何第三方披露；連結將於 {{time}} 失效。',
                time: view.expireAt,
              })
              : t('rdm.board.openHintUnknown', {
                defaultValue: '本看板載有集團核心機密數據，僅限授權人員在有效期內查閱。嚴禁截圖、轉發、複製或向任何第三方披露；連結有效期以推送人設定為準。',
              })}
        </div>
      </div>
    </header>
  )
}

/* ==================== 指标 ==================== */

function KpiSection({ snapshot }: { snapshot: DailyReportSnapshot }) {
  const { t } = useTranslation()
  const s = snapshot.summary
  const risk = s.overdueRiskReqCount ?? 0
  const cards: Array<{ label: string; value: number; unit: string; tone: Tone }> = [
    { label: t('rdm.daily.summaryProjects'), value: s.projectCount, unit: t('rdm.daily.unitProject'), tone: 'info' },
    {
      label: t('rdm.board.kpiIterations', { defaultValue: '迭代版本' }),
      value: s.iterationActiveCount ?? 0, unit: t('rdm.daily.unitProject'), tone: 'info',
    },
    {
      label: t('rdm.board.kpiRequirements', { defaultValue: '需求總數' }),
      value: s.requirementTotal ?? 0, unit: t('rdm.daily.unitItem'), tone: 'neutral',
    },
    {
      label: t('rdm.board.kpiRisk', { defaultValue: '逾期風險' }),
      value: risk, unit: t('rdm.daily.unitItem'), tone: risk > 0 ? 'danger' : 'neutral',
    },
  ]
  return (
    <>
      <section className="rdm-board-kpis">
        {cards.map(c => (
          <div key={c.label} className="rdm-board-kpi"
            style={{ borderLeftColor: c.tone === 'neutral' ? '#d9d9d9' : TONE_STYLE[c.tone].color }}>
            <div className="rdm-board-kpi-label">{c.label}</div>
            <div className="rdm-board-kpi-value" style={{ color: TONE_STYLE[c.tone].color }}>
              <AnimatedNumber value={c.value} />
              <span className="rdm-board-kpi-unit">{c.unit}</span>
            </div>
          </div>
        ))}
      </section>
      {snapshot.scopeLabel && (
        <div className="rdm-board-kpi-scope">
          {t('rdm.board.kpiScopeHint', {
            defaultValue: '統計範圍：{{scope}}；全系統數據請登錄系統查看。',
            scope: snapshot.scopeLabel,
          })}
        </div>
      )}
    </>
  )
}

/**
 * 晨/晚报的差异点：晨报看“今天要做完什么”，晚报看“今天做完了什么”。
 * 只在这一条上分叉，其余结构完全一致。
 */
function FocusStrip({ snapshot, evening }: { snapshot: DailyReportSnapshot; evening: boolean }) {
  const { t } = useTranslation()
  const s = snapshot.summary
  const items = evening
    ? [
      { label: t('rdm.daily.summaryTodayDone'), value: s.todayDoneItemCount, tone: 'success' as Tone },
      { label: t('rdm.daily.summaryTodayReleased'), value: s.todayReleasedCount, tone: 'success' as Tone },
      { label: t('rdm.daily.summaryTodayChanged'), value: s.todayChangedCount, tone: 'neutral' as Tone },
      { label: t('rdm.daily.summaryTomorrowDue'), value: s.tomorrowDueItemCount, tone: 'warn' as Tone },
    ]
    : [
      { label: t('rdm.daily.summaryTodayDue'), value: s.todayDueItemCount, tone: 'warn' as Tone },
      { label: t('rdm.daily.summaryTomorrowDue'), value: s.tomorrowDueItemCount, tone: 'neutral' as Tone },
      { label: t('rdm.daily.summaryOverdue'), value: s.overdueItemCount, tone: 'danger' as Tone },
    ]
  return (
    <section className="rdm-board-focus" data-evening={evening ? 'true' : 'false'}>
      <div className="rdm-board-focus-title">
        {evening
          ? t('rdm.board.focusEvening', { defaultValue: '當日復盤' })
          : t('rdm.board.focusMorning', { defaultValue: '今日焦點' })}
      </div>
      <div className="rdm-board-focus-list">
        {items.map(it => (
          <div key={it.label} className="rdm-board-focus-item">
            <span className="rdm-board-focus-value" style={{ color: TONE_STYLE[it.tone].color }}>{it.value}</span>
            <span className="rdm-board-focus-label">{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ==================== 风险摘要 ==================== */

function RiskSection({ projects }: { projects: DailyReportProject[] }) {
  const { t } = useTranslation()
  return (
    <section className="rdm-board-risk">
      <div className="rdm-board-risk-head">
        <span>{t('rdm.board.riskTitle', { defaultValue: '風險提醒' })}</span>
        <span className="rdm-board-risk-count">{projects.length}</span>
      </div>
      <div className="rdm-board-risk-list">
        {projects.map(p => (
          <div key={p.projectId} className="rdm-board-risk-item">
            <span className="rdm-board-risk-name">{p.projectName || `#${p.projectId}`}</span>
            {p.attention && <Pill tone="warn">{t('rdm.daily.tagAttention')}</Pill>}
            {p.overdueFlag === 1 && <Pill tone="danger">{t('rdm.daily.tagOverdue')}</Pill>}
            {p.deliveryItemOverdue > 0 && (
              <Pill tone="danger">{t('rdm.daily.overdueCount', { count: p.deliveryItemOverdue })}</Pill>
            )}
            {p.deliveryItemBlocked > 0 && (
              <Pill tone="warn">{t('rdm.daily.blockedCount', { count: p.deliveryItemBlocked })}</Pill>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ==================== 项目 → 迭代 → 需求 ==================== */

function ProjectCard({ project, view, filters }: {
  project: DailyReportProject
  view: DailyReportPublicView
  filters: BoardFilters
}) {
  const { t } = useTranslation()
  // 迭代按全局口径过滤：默认只留推进中，历史版本按需展开；排序规则见 sortIterations
  const iterations = filterIterations(project.iterations ?? [], filters.iter)
  // 需求明细关闭时不存在可筛选的需求行，避免把未排需求算成内容
  const unscheduled = view.showRequirements
    ? filterRequirements(project.unscheduledRequirements ?? [], filters.req)
    : []
  const owners = buildOwners(project, view, t)
  const stats = projectStats(project)
  const hasAnyContent = (project.iterations?.length ?? 0) > 0
    || (view.showRequirements && (project.unscheduledRequirements?.length ?? 0) > 0)

  return (
    <article className="rdm-board-card rdm-board-project">
      <div className="rdm-board-project-head">
        <div className="rdm-board-project-title-wrap">
          <div className="rdm-board-project-title">
            {project.projectNo && <span className="rdm-board-project-no">{project.projectNo}</span>}
            <span>{project.projectName || '—'}</span>
          </div>
          <div className="rdm-board-project-tags">
            {project.attention && <Pill tone="warn">{t('rdm.daily.tagAttention')}</Pill>}
            {project.riskFlag === 1 && <Pill tone="warn">{t('rdm.daily.tagRisk')}</Pill>}
            {project.overdueFlag === 1 && <Pill tone="danger">{t('rdm.daily.tagOverdue')}</Pill>}
            {project.pausedFlag === 1 && <Pill tone="neutral">{t('rdm.daily.tagPaused')}</Pill>}
          </div>
          {/* 全量计数不随筛选变化：它是「切到历史视图」的导航信息，不是当前可见行数 */}
          {(stats.iterationTotal > 0 || stats.requirementTotal > 0) && (
            <div className="rdm-board-project-stats">
              {stats.iterationTotal > 0 && (
                <span>{t('rdm.board.statIterations', {
                  defaultValue: '迭代 {{total}} 個 · 已完成 {{done}} 個',
                  total: stats.iterationTotal,
                  done: stats.iterationDone,
                })}</span>
              )}
              {stats.requirementTotal > 0 && (
                <span>{t('rdm.board.statRequirements', {
                  defaultValue: '需求 {{total}} 個 · 已完成 {{done}} 個',
                  total: stats.requirementTotal,
                  done: stats.requirementDone,
                })}</span>
              )}
            </div>
          )}
        </div>
        <DeliveryProgress project={project} />
      </div>

      {owners.length > 0 && (
        <div className="rdm-board-owners">
          <span className="rdm-board-owners-title">{t('rdm.board.ownersTitle', { defaultValue: '相關負責人' })}</span>
          {owners.map(o => <span key={o.label} className="rdm-board-owner-chip">{o.label} {o.name}</span>)}
        </div>
      )}

      <div className="rdm-board-project-body">
        {iterations.length === 0 && unscheduled.length === 0 ? (
          <div className="rdm-board-iteration-empty">
            {hasAnyContent
              ? t('rdm.board.filterEmpty', {
                defaultValue: '目前口徑下無可展示內容，可切換上方「迭代 / 需求」篩選查看歷史',
              })
              : t('rdm.daily.noIterationOrReq', { defaultValue: '尚無迭代與需求' })}
          </div>
        ) : (
          <>
            {iterations.map(it => (
              <IterationBlock key={it.iterationId} iteration={it} view={view} filters={filters} />
            ))}
            {unscheduled.length > 0 && view.showRequirements && (
              <div className="rdm-board-unscheduled-reqs">
                <div className="rdm-board-iteration-head">
                  <span className="rdm-board-iteration-code">
                    {t('rdm.daily.unscheduledGroup', { defaultValue: '未排迭代' })}
                  </span>
                  <span className="rdm-board-iteration-meta">
                    {t('rdm.daily.unscheduledCount', { count: unscheduled.length })}
                  </span>
                </div>
                <div className="rdm-board-req-list">
                  {unscheduled.map(r => (
                    <RequirementRow key={r.reqId} req={r} iteration={null} view={view} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  )
}

/** 交付进度：总数 0 时短路为「尚未排定」，不能读成 0% 或 100% */
function DeliveryProgress({ project }: { project: DailyReportProject }) {
  const { t } = useTranslation()
  const pct = project.deliveryItemTotal > 0
    ? (project.deliveryProgressPercent
      ?? Math.round((project.deliveryItemCompleted * 100) / project.deliveryItemTotal))
    : null
  return (
    <div className={`rdm-board-delivery${pct == null ? ' is-empty' : ''}`}>
      <div className="rdm-board-delivery-top">
        <span className="rdm-board-delivery-label">{t('rdm.board.deliveryProgress')}</span>
        {pct != null && <b className="rdm-board-delivery-pct">{pct}%</b>}
      </div>
      {pct == null ? (
        <div className="rdm-board-delivery-empty">{t('rdm.daily.notScheduled')}</div>
      ) : (
        <>
          <div className="rdm-board-progress-track">
            <div className="rdm-board-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="rdm-board-delivery-meta">
            {t('rdm.board.deliveryDone', { done: project.deliveryItemCompleted, total: project.deliveryItemTotal })}
            <span className="rdm-board-delivery-dot">·</span>
            {t('rdm.daily.remaining', { count: project.remainingCount })}
          </div>
        </>
      )}
    </div>
  )
}

function buildOwners(project: DailyReportProject, view: DailyReportPublicView,
                     t: TFunction): Array<{ label: string; name: string }> {
  if (!view.showOwners) return []
  const defs = [
    { label: t('rdm.board.roleProduct', { defaultValue: '產品' }), name: project.productOwnerUserName },
    { label: t('rdm.board.rolePm', { defaultValue: '項目' }), name: project.pmUserName },
    { label: t('rdm.board.roleQa', { defaultValue: '測試' }), name: project.qaLeadUserName },
    { label: t('rdm.board.roleTech', { defaultValue: '研發' }), name: project.techLeadUserName },
    { label: t('rdm.board.roleDesign', { defaultValue: '設計' }), name: project.uiDesignerUserName },
    { label: t('rdm.board.roleOps', { defaultValue: '運維' }), name: project.opsLeadUserName },
  ]
  return defs.filter(d => Boolean(d.name)) as Array<{ label: string; name: string }>
}

function IterationBlock({ iteration, view, filters }: {
  iteration: DailyReportIteration
  view: DailyReportPublicView
  filters: BoardFilters
}) {
  const { t } = useTranslation()
  const statusKey = iterationStatusKey(iteration.status)
  const allRequirements = iteration.requirements ?? []
  const requirements = filterRequirements(allRequirements, filters.req)
  const closed = iteration.status === 'closed'
  return (
    <div className="rdm-board-iteration-block" data-closed={closed ? 'true' : 'false'}>
      <div className="rdm-board-iteration-head">
        <span className="rdm-board-iteration-code">{iteration.code || '—'}</span>
        {iteration.name && iteration.name !== iteration.code && (
          <span className="rdm-board-iteration-name">{iteration.name}</span>
        )}
        {iteration.iterationType && (
          <HelpPopover title={t('rdm.board.iterTypeHelpTitle')} ariaLabel={t('rdm.board.iterTypeHelpAria')}
            placement="bottomLeft" width={360} content={t('rdm.board.iterTypeHelpBody')}>
            <button type="button" className="rdm-board-type-help">
              <Pill tone="neutral">{iterationTypeLabel(iteration.iterationType, t)}</Pill>
            </button>
          </HelpPopover>
        )}
        {statusKey && <Pill tone={iteration.status === 'active' ? 'info' : 'neutral'}>{t(statusKey)}</Pill>}
        {iteration.startDate && iteration.endDate && (
          <span className="rdm-board-iteration-meta">{iteration.startDate} ~ {iteration.endDate}</span>
        )}
        {/* 需求完成度帮读者判断「这个版本做完了没有」；按全量统计，不跟随筛选 */}
        {view.showRequirements && allRequirements.length > 0 && (
          <span className="rdm-board-iteration-meta">{t('rdm.board.iterReqDone', {
            defaultValue: '需求 {{done}}/{{total}} 已完成',
            done: countDoneRequirements(allRequirements),
            total: allRequirements.length,
          })}</span>
        )}
        <IterationMetrics iteration={iteration} />
        {view.showOwners && iteration.ownerName && (
          <span className="rdm-board-iteration-owner">{iteration.ownerName}</span>
        )}
      </div>
      <div className="rdm-board-req-list">
        {!view.showRequirements ? null : requirements.length === 0 ? (
          <div className="rdm-board-iteration-empty">
            {allRequirements.length > 0
              ? t('rdm.board.filterEmptyIteration', {
                defaultValue: '本口徑下無需求，可切換上方「需求」篩選查看',
              })
              : t('rdm.daily.noRequirement', { defaultValue: '本迭代尚無需求' })}
          </div>
        ) : (
          requirements.map(r => (
            <RequirementRow key={r.reqId} req={r} iteration={iteration} view={view} />
          ))
        )}
      </div>
    </div>
  )
}

/** 迭代进度/产能：数字全部来自快照（后端算好），前端只负责展示与颜色分级 */
function IterationMetrics({ iteration }: { iteration: DailyReportIteration }) {
  const { t } = useTranslation()
  // 旧快照没有 taskTotal/capacityHours 键：此时宁可不展示，也不能把「缺失」误报成「尚無任務/未設定」
  const hasProgressMetric = iteration.taskTotal != null
  const hasCapacityMetric = iteration.capacityHours != null
  if (!hasProgressMetric && !hasCapacityMetric) return null
  const progress = iteration.progressPercent ?? null
  const progressTone = progress == null ? 'is-muted' : progress >= 100 ? 'is-success' : 'is-progress'
  const capacitySet = (iteration.capacityHours ?? 0) > 0
  const capacity = iteration.capacityUsagePercent ?? null
  const capacityTone = !capacitySet ? 'is-muted'
    : capacity != null && capacity > 100 ? 'is-danger'
      : capacity != null && capacity >= 80 ? 'is-warn' : 'is-success'
  const sections: HelpSection[] = [
    { tone: 'info', label: t('rdm.board.iterProgressFormula'), body: t('rdm.board.iterProgressFormulaBody') },
    { tone: 'warn', label: t('rdm.board.iterCapacityFormula'), body: t('rdm.board.iterCapacityFormulaBody') },
    {
      tone: 'neutral',
      body: t('rdm.board.iterMetricsCurrent', {
        done: iteration.taskDone ?? 0,
        tasks: iteration.taskTotal ?? 0,
        hours: iteration.taskHours ?? 0,
        capacity: iteration.capacityHours ?? 0,
      }),
    },
  ]
  return (
    <span className="rdm-board-iter-metrics">
      {hasProgressMetric && (
        <span className={`rdm-board-metric-chip ${progressTone}`}>
          <span className="rdm-board-metric-chip-label">{t('rdm.board.iterationProgress')}</span>
          <b>{progress == null ? t('rdm.board.noTasks') : `${progress}%`}</b>
        </span>
      )}
      {hasCapacityMetric && (
        <span className={`rdm-board-metric-chip ${capacityTone}`}>
          <span className="rdm-board-metric-chip-label">{t('rdm.board.iterationCapacity')}</span>
          <b>{capacitySet ? `${capacity ?? 0}%` : t('rdm.board.capacityUnset')}</b>
        </span>
      )}
      <HelpPopover title={t('rdm.board.iterMetricsHelpTitle')}
        ariaLabel={t('rdm.board.iterMetricsHelpAria')} placement="bottomRight"
        width={380} content={sections} />
    </span>
  )
}

function iterationTypeLabel(type: string, t: TFunction): string {
  switch (type) {
    case 'sprint':
      return t('rdm.board.iterTypeSprint', { defaultValue: '衝刺' })
    case 'version':
      return t('rdm.board.iterTypeVersion', { defaultValue: '版本' })
    case 'hotfix':
      return t('rdm.board.iterTypeHotfix', { defaultValue: '緊急修復' })
    default:
      return type
  }
}

function complexityLabel(value: string | null | undefined, t: TFunction): string {
  switch (value) {
    case 'SIMPLE':
      return t('rdm.board.sizeSimple', { defaultValue: '簡單' })
    case 'MEDIUM':
      return t('rdm.board.sizeMedium', { defaultValue: '中等' })
    case 'COMPLEX':
      return t('rdm.board.sizeComplex', { defaultValue: '複雜' })
    case 'HUGE':
      return t('rdm.board.sizeHuge', { defaultValue: '超大' })
    default:
      return value || '—'
  }
}

/* ==================== 需求行 + 甘特 ==================== */

/** 只读看板不提供拖拽草稿；用空对象常量避免每次渲染都新建引用 */
const EMPTY_GANTT_DRAFT: GanttDraft = {}

function RequirementRow({ req, iteration, view }: {
  req: DailyReportRequirement
  iteration: DailyReportIteration | null
  view: DailyReportPublicView
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const st = statusTone(req.status)
  return (
    <div className={`rdm-board-req${expanded ? ' is-open' : ''}`}>
      <button type="button" className="rdm-board-req-head" onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}>
        <span className="rdm-board-req-caret" />
        <span className="rdm-board-req-main">
          <span className="rdm-board-req-title">
            {req.title || '—'}
            {req.overdueFlag === 1 && <Pill tone="danger">{t('rdm.daily.tagOverdue')}</Pill>}
            {req.blockedFlag === 1 && <Pill tone="warn">{t('rdm.daily.tagBlocked')}</Pill>}
          </span>
          <span className="rdm-board-req-meta">
            {req.reqNo
              ? <span className="rdm-board-req-no">{req.reqNo}</span>
              : <span className="rdm-board-req-no rdm-board-req-no-pending">{t('rdm.daily.reqNoPending')}</span>}
            {req.statusLabel && <Pill tone={st}>{req.statusLabel}</Pill>}
            {req.priority && <Pill tone={priorityTone(req.priority)}>{req.priority}</Pill>}
            {/* 已归档需求不再有「停留」的管理意义：归档后数字只增不减，展示出来会被误读成还在卡着 */}
            {req.status !== 'closed' && (
              <span>{t('rdm.board.stayDays', {
                defaultValue: '停留 {{count}} 天',
                count: req.stayDays == null ? '—' : req.stayDays,
              })}</span>
            )}
            {view.showOwners && req.assigneePmName && (
              <span>{t('rdm.daily.productOwner')} {req.assigneePmName}</span>
            )}
            <span>{t('rdm.board.sizeLabel', { defaultValue: '規模' })} {complexityLabel(req.complexity, t)}</span>
          </span>
        </span>
      </button>
      {expanded && <GanttView req={req} iteration={iteration} showOwners={view.showOwners} />}
    </div>
  )
}

/** 甘特：直接复用「我的甘特圖」的 GanttBoard（只读模式），保证两边视觉与交互完全一致 */
function GanttView({ req, iteration, showOwners }: {
  req: DailyReportRequirement
  iteration: DailyReportIteration | null
  showOwners: boolean
}) {
  const { t } = useTranslation()
  const tasks = req.tasks ?? []
  // 与「我的甘特圖」一致：左栏默认紧凑（把宽度让给时间轴），任务默认展开，均可手动切换
  const [compact, setCompact] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const window = ganttWindow(req, iteration, tasks)

  if (!window.start || !window.end) {
    return (
      <div className="rdm-board-gantt">
        <div className="rdm-board-gantt-empty">{t('rdm.board.ganttNoDates', { defaultValue: '尚無可用的排期日期' })}</div>
      </div>
    )
  }

  // 两侧各留 2 天，避免条形贴边；刻度与今天线由 GanttBoard 统一处理
  const windowStart = dayjs(window.start).startOf('day').subtract(2, 'day')
  const windowEnd = dayjs(window.end).startOf('day').add(2, 'day')
  const days = Math.max(1, windowEnd.diff(windowStart, 'day') + 1)

  const rows: GanttRow[] = [
    {
      kind: 'group',
      id: `req-${req.reqId}`,
      depth: 0,
      label: [req.reqNo, req.title].filter(Boolean).join(' ') || '—',
      meta: t('rdm.board.ganttTaskCount', { defaultValue: '{{count}} 項任務', count: tasks.length }),
      expandable: tasks.length > 0,
      expanded: !collapsed,
      spanStart: window.reqStart,
      spanEnd: window.reqEnd,
    },
  ]
  if (!collapsed) {
    rows.push(...tasks.map((task: DailyReportTask): GanttRow => ({
      kind: 'task',
      id: `task-${task.taskId}`,
      depth: 1,
      task: toGanttTask(task, showOwners),
    })))
    if (tasks.length === 0) {
      rows.push({ kind: 'empty', id: `empty-${req.reqId}`, depth: 1, text: t('rdm.board.ganttNoTasks', { defaultValue: '該需求尚無任務排期，僅展示需求時間範圍' }) })
    }
  }

  return (
    <div className="rdm-board-gantt">
      <div className="rdm-board-gantt-toolbar">
        <Button size="small" type="text" icon={<ColumnWidthOutlined />}
          onClick={() => setCompact(v => !v)}>
          {compact ? t('rdm.gantt.wideLeft') : t('rdm.gantt.compactLeft')}
        </Button>
        {tasks.length > 0 && (
          <Button size="small" type="text"
            icon={collapsed ? <ExpandAltOutlined /> : <ShrinkOutlined />}
            onClick={() => setCollapsed(v => !v)}>
            {collapsed ? t('rdm.gantt.expandAll') : t('rdm.gantt.collapseAll')}
          </Button>
        )}
      </div>
      <GanttBoard
        rows={rows}
        windowStart={windowStart}
        days={days}
        dayW={32}
        scale="day"
        editMode={false}
        draft={EMPTY_GANTT_DRAFT}
        editingTaskId={null}
        compact={compact}
        onToggleGroup={() => setCollapsed(v => !v)}
        onDragChange={() => {}}
        onStartEditDates={() => {}}
        onDateChange={() => {}}
      />
    </div>
  )
}

/** 快照任务 → GanttBoard 任务：只读、不可拖拽，颜色沿用任务类型色板 */
function toGanttTask(task: DailyReportTask, showOwners: boolean): GanttTask {
  const status = task.status ?? 'todo'
  const end = task.planFinishDate ?? null
  return {
    id: task.taskId,
    taskNo: task.taskNo ?? '',
    title: task.title ?? '—',
    taskType: task.taskType ?? 'frontend',
    roleCode: task.roleCode ?? 'DEV',
    ownerUserId: null,
    ownerName: showOwners ? (task.ownerName ?? '—') : '—',
    ownerEmpNo: showOwners ? (task.ownerEmpNo ?? '') : '',
    planStartDate: task.planStartDate ?? null,
    planFinishDate: end,
    status,
    progress: task.progress ?? 0,
    // 与真实任务口径一致：未完成且计划完成日已过才算逾期
    overdue: status !== 'done' && end != null && dayjs(end).isBefore(dayjs(), 'day'),
    planVersion: 0,
    canAdjust: false,
    mine: false,
  }
}

function ganttWindow(req: DailyReportRequirement, iteration: DailyReportIteration | null, tasks: DailyReportTask[]) {
  const starts: dayjs.Dayjs[] = []
  const ends: dayjs.Dayjs[] = []
  tasks.forEach(t => {
    const s = parseDate(t.planStartDate)
    const e = parseDate(t.planFinishDate)
    if (s) starts.push(s)
    if (e) ends.push(e)
  })
  const iterationStart = parseDate(iteration?.startDate)
  const iterationEnd = parseDate(iteration?.endDate)
  const releaseDate = parseDate(req.planReleaseDate)
  if (iterationStart) starts.push(iterationStart)
  if (iterationEnd) ends.push(iterationEnd)
  if (releaseDate) ends.push(releaseDate)

  const start = starts.length > 0 ? starts.reduce((a, b) => (a.isBefore(b) ? a : b)) : null
  const end = ends.length > 0 ? ends.reduce((a, b) => (a.isAfter(b) ? a : b)) : null
  const reqStart = starts.length > 0 ? starts.reduce((a, b) => (a.isBefore(b) ? a : b)) : null
  const reqEnd = releaseDate ?? (ends.length > 0 ? ends.reduce((a, b) => (a.isAfter(b) ? a : b)) : null)
  return {
    start: start ? start.format('YYYY-MM-DD') : null,
    end: end ? end.format('YYYY-MM-DD') : null,
    reqStart: reqStart ? reqStart.format('YYYY-MM-DD') : null,
    reqEnd: reqEnd ? reqEnd.format('YYYY-MM-DD') : null,
  }
}

/* ==================== 未挂项目迭代 ==================== */

function UnassignedSection({ iterations, view, filters }: {
  iterations: DailyReportIteration[]
  view: DailyReportPublicView
  filters: BoardFilters
}) {
  const { t } = useTranslation()
  const visible = filterIterations(iterations, filters.iter)
  if (visible.length === 0) return null
  return (
    <section className="rdm-board-section">
      <SectionTitle
        title={t('rdm.daily.unassignedIterations', { defaultValue: '未掛項目的迭代' })}
        count={visible.length}
        countSuffix={t('rdm.board.iterationUnit', { defaultValue: '個迭代' })}
        tone="warn"
      />
      <div className="rdm-board-card rdm-board-unassigned">
        <div className="rdm-board-note">
          {t('rdm.daily.unassignedHintShort', { defaultValue: '這些迭代未掛項目，不計入任何項目進度' })}
        </div>
        {visible.map(it => (
          <IterationBlock key={it.iterationId} iteration={it} view={view} filters={filters} />
        ))}
      </div>
    </section>
  )
}

/* ==================== 全局展示口径 ==================== */

/**
 * 全局展示口径：迭代与需求各三态，一次设置作用于所有项目卡。
 * <p>不做每卡独立筛选：一屏多项目时各卡口径不一致会让横向比较失效；
 * 「已完成」不是隐藏信息，而是按需展开——默认仍只看推进中。
 */
function BoardFilterBar({ filters, onChange, showRequirements, legacyOpenCount }: {
  filters: BoardFilters
  onChange: (next: BoardFilters) => void
  showRequirements: boolean
  legacyOpenCount: number
}) {
  const { t } = useTranslation()
  return (
    <div className="rdm-board-filter-bar">
      <div className="rdm-board-filter-group" data-filter="iter">
        <span className="rdm-board-filter-label">{t('rdm.board.filterIter', { defaultValue: '迭代' })}</span>
        <Segmented
          size="small"
          value={filters.iter}
          onChange={value => onChange({ ...filters, iter: value as IterFilter })}
          options={[
            { value: 'active', label: t('rdm.board.filterIterActive', { defaultValue: '推進中' }) },
            { value: 'closed', label: t('rdm.board.filterIterClosed', { defaultValue: '已完成' }) },
            { value: 'all', label: t('rdm.board.filterIterAll', { defaultValue: '全部' }) },
          ]}
        />
      </div>
      {showRequirements && (
        <div className="rdm-board-filter-group" data-filter="req">
          <span className="rdm-board-filter-label">{t('rdm.board.filterReq', { defaultValue: '需求' })}</span>
          <Segmented
            size="small"
            value={filters.req}
            onChange={value => onChange({ ...filters, req: value as ReqFilter })}
            options={[
              { value: 'open', label: t('rdm.board.filterReqOpen', { defaultValue: '未完成' }) },
              { value: 'done', label: t('rdm.board.filterReqDone', { defaultValue: '已完成' }) },
              { value: 'all', label: t('rdm.board.filterReqAll', { defaultValue: '全部' }) },
            ]}
          />
        </div>
      )}
      <span className="rdm-board-filter-hint">
        {t('rdm.board.filterHint', { defaultValue: '僅篩選下方明細；上方指標固定為當日推進口徑' })}
      </span>
      {/* 存量兜底：已关闭迭代里的未完成需求默认看不见，必须给一条可点击的线索 */}
      {filters.iter === 'active' && legacyOpenCount > 0 && (
        <button
          type="button"
          className="rdm-board-legacy-hint"
          onClick={() => onChange({ iter: 'closed', req: 'open' })}
        >
          {t('rdm.board.legacyHint', {
            defaultValue: '歷史迭代仍有 {{count}} 個未完成需求未展示，點擊查看',
            count: legacyOpenCount,
          })}
        </button>
      )}
    </div>
  )
}

/* ==================== 通用 ==================== */

function SectionTitle({ title, count, countSuffix, tone = 'info', extra }: {
  title: string
  count: number
  countSuffix?: string
  tone?: Tone
  /** 标题行右侧的视图/口径切换等辅助控件 */
  extra?: ReactNode
}) {
  return (
    <div className="rdm-board-section-title">
      <span className="rdm-board-section-bar" style={{ background: TONE_STYLE[tone].color }} />
      <span>{title}</span>
      <span className="rdm-board-section-count">{count}{countSuffix ? ` ${countSuffix}` : ''}</span>
      {extra && <div className="rdm-board-section-extra">{extra}</div>}
    </div>
  )
}

function Pill({ children, tone }: { children: ReactNode; tone: Tone }) {
  const s = TONE_STYLE[tone]
  return (
    <span className="rdm-board-pill" style={{ color: s.color, background: s.bg }}>
      {children}
    </span>
  )
}

function NoticeCard({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="rdm-board-notice">
      <div className="rdm-board-notice-icon">
        <LinkOutlined />
      </div>
      <div className="rdm-board-notice-title">{title}</div>
      <div className="rdm-board-notice-msg">{message}</div>
      {onRetry && (
        <button type="button" className="rdm-board-retry" onClick={onRetry}>
          <ReloadOutlined /> {t('rdm.board.retry', { defaultValue: '重試' })}
        </button>
      )}
    </div>
  )
}

function BoardFooter({ view }: { view: DailyReportPublicView }) {
  const { t } = useTranslation()
  // 只取快照生成时刻：看板不是实时数据，必须在页脚说清楚口径与更精准数据的入口
  const generatedAt = view.snapshot?.generatedAt
  const generatedTime = generatedAt && dayjs(generatedAt).isValid()
    ? dayjs(generatedAt).format('HH:mm')
    : null
  return (
    <footer className="rdm-board-footer">
      <div>{generatedTime
        ? t('rdm.board.footerNote', {
          defaultValue: '本看板數據為截至當日 {{time}} 生成的快照，非實時數據；如需查看更精準的數據，請登錄系統查看。',
          time: generatedTime,
        })
        : t('rdm.board.footerNoteNoTime', {
          defaultValue: '本看板數據為推送時刻生成的快照，非實時數據；如需查看更精準的數據，請登錄系統查看。',
        })}</div>
      {view.expireAt && (
        <div>{t('rdm.board.footerExpire', { defaultValue: '連結有效期至：{{time}}', time: view.expireAt })}</div>
      )}
      <div className="rdm-board-footer-brand">{t('rdm.board.brand', { defaultValue: '麦峰集团·项目汇报' })}</div>
    </footer>
  )
}
