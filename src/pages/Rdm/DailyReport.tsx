import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Collapse, DatePicker, Empty, Segmented, Spin, Tag, Tooltip } from 'antd'
import {
  AlertOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchDailyReportSnapshot, type DailyReportSnapshot, type DailyReportProject, type DailyReportIteration } from '../../api/rdmDailyReport'

/**
 * 移動端日報頁（釘釘通知連結的落地頁）。
 *
 * 為什麼要單獨一頁而不是復用項目總覽：
 * 1. 打開場景是釘釘內置瀏覽器（手機豎屏為主），項目總覽是多列篩選表格，窄屏下横向滚动才能读；
 * 2. 管理者從通知點進來只想知道三件事——今天有多少事要關注、我的項目到哪了、哪些逾期了，
 *    不需要篩選/導出/列配置這些操作面；
 * 3. 數據必須讀快照（與通知同源），否則「通知說逾期 3 項、頁面顯示 2 項」會讓管理者懷疑數字。
 *
 * 口徑紀律：本頁不做任何進度重算，全部指標直接展示後端快照字段；
 * 剩餘工作在 deliveryItemTotal === 0 時必須顯示「尚未排定」，不能顯示「剩餘 0 項」
 * ——那會把「還沒承諾任何交付項」謊報成「全部完成」。
 */

/** 桌面端限寬居中：同一個連結可能在手機釘釘或桌面釘釘打開，兩種都要能讀 */
const PAGE_MAX_WIDTH = 760

/** 狀態 Tag 語義色：完成=success、進行中=processing、待處理=default、異常=error/warning */
function statusColor(status?: string | null): string {
  switch (status) {
    case 'released':
    case 'closed':
    case 'accepted':
    case 'test_passed':
      return 'success'
    case 'developing':
    case 'designing':
    case 'integration':
    case 'testing':
      return 'processing'
    case 'draft':
    case 'pool':
      return 'default'
    default:
      return 'default'
  }
}

function priorityColor(priority?: string | null): string | undefined {
  switch (priority) {
    case 'P0':
      return 'red'
    case 'P1':
      return 'orange'
    case 'P2':
      return 'blue'
    default:
      return undefined
  }
}

function iterationStatusLabel(status: string | null | undefined, t: (k: string) => string): string {
  switch (status) {
    case 'planning':
      return t('rdm.daily.iterPlanning')
    case 'active':
      return t('rdm.daily.iterActive')
    case 'closed':
      return t('rdm.daily.iterClosed')
    default:
      return status || '—'
  }
}

export default function DailyReport() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()

  // URL 參數：通知連結帶 date/type，個人通知另帶 projectId 用於錨定
  const urlDate = searchParams.get('date')
  const urlType = searchParams.get('type')
  const urlProjectId = searchParams.get('projectId')
  const anchorProjectId = urlProjectId ? Number(urlProjectId) : null

  const [date, setDate] = useState<Dayjs>(urlDate && dayjs(urlDate).isValid() ? dayjs(urlDate) : dayjs())
  // 手动触发存的快照行 report_type='manual'，通知链接会带 ?type=manual，因此三个值都要能接
  const [type, setType] = useState<string>(
    urlType === 'evening' || urlType === 'manual' ? urlType : 'morning')
  const [snapshot, setSnapshot] = useState<DailyReportSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 已手動折疊的項目（默認全展開：管理者打開就该看到明细，而不是先点一轮） */
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // anchorProjectId 同时用于收敛快照：同一天可能有多份手动/规则快照，不带项目会拿到别人的日报
      const data = await fetchDailyReportSnapshot(date.format('YYYY-MM-DD'), type, anchorProjectId)
      setSnapshot(data)
    } catch (e) {
      // 錯誤只展示「載入失敗 + 重試」，不回顯後端堆棧或 SQL（安全邊界）
      setSnapshot(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [date, type, anchorProjectId])

  useEffect(() => {
    void load()
  }, [load])

  const summary = snapshot?.summary
  const projects = useMemo(() => snapshot?.projects ?? [], [snapshot])

  /** 錨定項目排在最前：從個人通知點進來時，管理者第一眼就要看到自己的項目 */
  const orderedProjects = useMemo(() => {
    if (!anchorProjectId) return projects
    const anchor = projects.filter(p => p.projectId === anchorProjectId)
    const rest = projects.filter(p => p.projectId !== anchorProjectId)
    return [...anchor, ...rest]
  }, [projects, anchorProjectId])

  const toggleCollapse = (projectId: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  return (
    <div className="content-area" style={{ maxWidth: PAGE_MAX_WIDTH, margin: '0 auto' }}>
      {/* ── 頁頭：標題 + 檔位 + 日期 ── */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#262626' }}>
            {t('rdm.daily.title')}
          </h2>
          <Segmented
            size="small"
            value={type}
            onChange={v => setType(String(v))}
            options={[
              { label: t('rdm.daily.typeMorning'), value: 'morning' },
              { label: t('rdm.daily.typeEvening'), value: 'evening' },
              // 只有当前就是手动快照时才多给一个选项：平时不展示，避免管理者误以为有第三档定时推送
              ...(type === 'manual' ? [{ label: t('rdm.daily.typeManual'), value: 'manual' }] : []),
            ]}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <DatePicker
            size="small"
            allowClear={false}
            value={date}
            onChange={d => d && setDate(d)}
            disabledDate={d => d.isAfter(dayjs(), 'day')}
            style={{ width: 140 }}
          />
          {snapshot?.generatedAt && (
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {t('rdm.daily.generatedAt', { time: snapshot.generatedAt })}
            </span>
          )}
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            {t('rdm.daily.refresh')}
          </Button>
        </div>
        {anchorProjectId && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 10 }}
            message={t('rdm.daily.anchoredHint')}
          />
        )}
      </div>

      {/* ── 錯誤橫幅（留在內容之上，不屬於統計卡） ── */}
      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('rdm.daily.loadFailed')}
          description={error}
          action={<Button size="small" onClick={() => void load()}>{t('rdm.daily.retry')}</Button>}
        />
      )}

      {loading && !snapshot ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : !snapshot && !error ? (
        <Empty
          style={{ padding: '48px 16px' }}
          description={
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('rdm.daily.emptyTitle')}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.daily.emptyDesc')}</div>
            </div>
          }
        />
      ) : snapshot ? (
        <>
          {/* ── 匯總指標：手機 2 列、寬屏 4 列 ── */}
          {summary && (
            <div style={{
              display: 'grid', gap: 8, marginBottom: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            }}>
              <MetricCard label={t('rdm.daily.summaryProjects')} value={summary.projectCount}
                unit={t('rdm.daily.unitProject')} tone="info" />
              <MetricCard label={t('rdm.daily.summaryTodayDue')} value={summary.todayDueItemCount}
                unit={t('rdm.daily.unitItem')} tone={summary.todayDueItemCount > 0 ? 'warn' : 'neutral'} />
              <MetricCard label={t('rdm.daily.summaryOverdue')} value={summary.overdueItemCount}
                unit={t('rdm.daily.unitItem')} tone={summary.overdueItemCount > 0 ? 'danger' : 'neutral'} />
              <MetricCard label={t('rdm.daily.summaryRisk')} value={summary.riskProjectCount}
                unit={t('rdm.daily.unitProject')} tone={summary.riskProjectCount > 0 ? 'danger' : 'neutral'} />
              {type !== 'morning' && (
                <>
                  <MetricCard label={t('rdm.daily.summaryTodayDone')} value={summary.todayDoneItemCount}
                    unit={t('rdm.daily.unitItem')} tone="success" />
                  <MetricCard label={t('rdm.daily.summaryTodayReleased')} value={summary.todayReleasedCount}
                    unit={t('rdm.daily.unitProject')} tone="success" />
                  <MetricCard label={t('rdm.daily.summaryTodayChanged')} value={summary.todayChangedCount}
                    unit={t('rdm.daily.unitTimes')} tone="neutral" />
                  <MetricCard label={t('rdm.daily.summaryTomorrowDue')} value={summary.tomorrowDueItemCount}
                    unit={t('rdm.daily.unitItem')} tone={summary.tomorrowDueItemCount > 0 ? 'warn' : 'neutral'} />
                </>
              )}
            </div>
          )}

          {/* ── 項目卡片 ── */}
          {orderedProjects.length === 0 ? (
            <Empty style={{ padding: '32px 16px' }} description={t('rdm.daily.noProjects')} />
          ) : (
            orderedProjects.map(p => (
              <ProjectCard
                key={p.projectId}
                project={p}
                anchored={anchorProjectId === p.projectId}
                collapsed={collapsed.has(p.projectId)}
                onToggle={() => toggleCollapse(p.projectId)}
              />
            ))
          )}

          {/* ── 未掛項目的迭代：如實列出，不塞進任何項目下充數 ── */}
          {snapshot.unassignedIterations && snapshot.unassignedIterations.length > 0 && (
            <div style={{
              background: '#fff', borderRadius: 12, padding: '14px 16px', marginTop: 12,
              border: '1px solid #ffe58f',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AlertOutlined style={{ color: '#fa8c16' }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t('rdm.daily.unassignedIterations')}</span>
                <Tag color="orange">{snapshot.unassignedIterations.length}</Tag>
              </div>
              <Tooltip title={t('rdm.daily.unassignedHint')}>
                <span style={{ fontSize: 12, color: '#8c8c8c', display: 'block', marginBottom: 8 }}>
                  {t('rdm.daily.unassignedHintShort')}
                </span>
              </Tooltip>
              {snapshot.unassignedIterations.map(it => (
                <IterationBlock key={it.iterationId} iteration={it} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

/* ==================== 子組件 ==================== */

type Tone = 'info' | 'warn' | 'danger' | 'success' | 'neutral'

const TONE_STYLE: Record<Tone, { color: string; bg: string }> = {
  info: { color: '#1890ff', bg: '#e6f7ff' },
  warn: { color: '#fa8c16', bg: '#fff7e6' },
  danger: { color: '#f5222d', bg: '#fff1f0' },
  success: { color: '#52c41a', bg: '#f6ffed' },
  neutral: { color: '#595959', bg: '#fafafa' },
}

/** 指標卡：口徑直接取快照字段，不在前端重算 */
function MetricCard({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: Tone }) {
  const s = TONE_STYLE[tone]
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '10px 12px',
      borderLeft: `3px solid ${s.color}`, boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{value}</span>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>{unit}</span>
      </div>
    </div>
  )
}

function ProjectCard({ project, anchored, collapsed, onToggle }: {
  project: DailyReportProject
  anchored: boolean
  collapsed: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <div style={{
      background: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden',
      border: anchored ? '2px solid #E8720C' : '1px solid #f0f0f0',
      boxShadow: anchored ? '0 2px 12px rgba(232,114,12,0.15)' : '0 1px 6px rgba(0,0,0,0.04)',
    }}>
      {/* 卡頭：整行可點折疊，手機上比小圖標好點 */}
      <div
        onClick={onToggle}
        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8 }}
      >
        <RightOutlined
          rotate={collapsed ? 0 : 90}
          style={{ color: '#bfbfbf', fontSize: 12, marginTop: 5, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#262626' }}>
              {project.projectName || '—'}
            </span>
            {project.projectNo && (
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{project.projectNo}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {project.attention && <Tag color="error" style={{ marginInlineEnd: 0 }}>{t('rdm.daily.tagAttention')}</Tag>}
            {project.riskFlag === 1 && <Tag color="warning" style={{ marginInlineEnd: 0 }}>{t('rdm.daily.tagRisk')}</Tag>}
            {project.overdueFlag === 1 && <Tag color="error" style={{ marginInlineEnd: 0 }}>{t('rdm.daily.tagOverdue')}</Tag>}
            {project.pausedFlag === 1 && (
              <Tag icon={<PauseCircleOutlined />} style={{ marginInlineEnd: 0 }}>{t('rdm.daily.tagPaused')}</Tag>
            )}
            {(project.pmUserName || project.productOwnerUserName) && (
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                {project.pmUserName && `${t('rdm.daily.pm')} ${project.pmUserName}`}
                {project.pmUserName && project.productOwnerUserName && '｜'}
                {project.productOwnerUserName && `${t('rdm.daily.productOwner')} ${project.productOwnerUserName}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 進度摘要：即使折疊也要能看到關鍵數字 */}
      <div style={{
        padding: '0 14px 12px 34px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {project.deliveryItemTotal > 0 ? (
          <>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              {t('rdm.daily.deliveryProgress', { done: project.deliveryItemCompleted, total: project.deliveryItemTotal })}
            </Tag>
            <Tag style={{ marginInlineEnd: 0 }}>
              {t('rdm.daily.remaining', { count: project.remainingCount })}
            </Tag>
            {project.deliveryItemOverdue > 0 && (
              <Tag color="error" style={{ marginInlineEnd: 0 }}>
                {t('rdm.daily.overdueCount', { count: project.deliveryItemOverdue })}
              </Tag>
            )}
            {project.deliveryItemBlocked > 0 && (
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                {t('rdm.daily.blockedCount', { count: project.deliveryItemBlocked })}
              </Tag>
            )}
          </>
        ) : (
          // 零承諾短路：尚未排交付項 ≠ 全部完成，必須顯式說明
          <Tag style={{ marginInlineEnd: 0 }}>{t('rdm.daily.notScheduled')}</Tag>
        )}
        {project.nextDeliveryDate && (
          <span style={{ fontSize: 12, color: '#595959' }}>
            {t('rdm.daily.nextDelivery')}：{project.nextDeliveryDate}
          </span>
        )}
      </div>

      {!collapsed && (
        <div style={{ padding: '0 14px 14px 34px', borderTop: '1px dashed #f0f0f0', paddingTop: 12 }}>
          {project.iterations.length === 0 && project.unscheduledRequirements.length === 0 ? (
            <span style={{ fontSize: 12, color: '#bfbfbf' }}>{t('rdm.daily.noIterationOrReq')}</span>
          ) : (
            <>
              {project.iterations.map(it => (
                <IterationBlock key={it.iterationId} iteration={it} />
              ))}
              {project.unscheduledRequirements.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>
                    {t('rdm.daily.unscheduledGroup')}
                    <Tag style={{ marginLeft: 6, marginInlineEnd: 0 }}>
                      {t('rdm.daily.unscheduledCount', { count: project.unscheduledRequirements.length })}
                    </Tag>
                  </div>
                  {project.unscheduledRequirements.map(r => (
                    <RequirementRow key={r.reqId} req={r} />
                  ))}
                </div>
              )}
            </>
          )}
          {project.detailUrl && (
            <a
              href={`#${project.detailUrl}`}
              style={{ fontSize: 12, color: '#1890ff', display: 'inline-block', marginTop: 4 }}
            >
              {t('rdm.daily.openProjectDetail')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function IterationBlock({ iteration }: { iteration: DailyReportIteration }) {
  const { t } = useTranslation()
  const items = [{
    key: String(iteration.iterationId),
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{iteration.code}</span>
        {iteration.name && iteration.name !== iteration.code && (
          <span style={{ fontSize: 12, color: '#595959' }}>{iteration.name}</span>
        )}
        <Tag color={iteration.status === 'active' ? 'processing' : iteration.status === 'closed' ? 'default' : 'warning'}
          style={{ marginInlineEnd: 0 }}>
          {iterationStatusLabel(iteration.status, t)}
        </Tag>
        {iteration.startDate && iteration.endDate && (
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {iteration.startDate} ~ {iteration.endDate}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
          {t('rdm.daily.requirementCount', { count: iteration.requirementCount })}
        </span>
        {!iteration.projectId && (
          <Tag color="orange" style={{ marginInlineEnd: 0 }}>{t('rdm.daily.notLinkedProject')}</Tag>
        )}
      </div>
    ),
    children: iteration.requirements.length === 0
      ? <span style={{ fontSize: 12, color: '#bfbfbf' }}>{t('rdm.daily.noRequirement')}</span>
      : iteration.requirements.map(r => <RequirementRow key={r.reqId} req={r} />),
  }]
  return (
    <Collapse
      size="small"
      items={items}
      defaultActiveKey={[String(iteration.iterationId)]}
      style={{ marginBottom: 8, background: '#fafafa' }}
    />
  )
}

function RequirementRow({ req }: { req: DailyReportSnapshot['projects'][number]['unscheduledRequirements'][number] }) {
  const { t } = useTranslation()
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 0',
      borderBottom: '1px solid #f5f5f5', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13, color: '#262626', wordBreak: 'break-word' }}>
          {req.title || '—'}
          {req.overdueFlag === 1 && <Tag color="error" style={{ marginLeft: 6 }}>{t('rdm.daily.tagOverdue')}</Tag>}
          {req.blockedFlag === 1 && <Tag color="warning" style={{ marginLeft: 4 }}>{t('rdm.daily.tagBlocked')}</Tag>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          {req.reqNo && <span style={{ fontSize: 11, color: '#8c8c8c' }}>{req.reqNo}</span>}
          {!req.reqNo && (
            // 延遲發號口徑：認領前沒有正式編號，如實顯示待發號而不是留白
            <span style={{ fontSize: 11, color: '#bfbfbf' }}>{t('rdm.daily.reqNoPending')}</span>
          )}
          {req.statusLabel && <Tag color={statusColor(req.status)} style={{ marginInlineEnd: 0 }}>{req.statusLabel}</Tag>}
          {req.priority && <Tag color={priorityColor(req.priority)} style={{ marginInlineEnd: 0 }}>{req.priority}</Tag>}
          {req.assigneePmName && (
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>
              {t('rdm.daily.productOwner')} {req.assigneePmName}
            </span>
          )}
          {req.planReleaseDate && (
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>
              {t('rdm.daily.planRelease')}：{req.planReleaseDate}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
