/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Alert, Button, Empty, Input, Modal, Segmented, Space, Spin, Tabs, Tag, Timeline, Tooltip, message } from 'antd'
import {
  CopyOutlined, FileTextOutlined, HistoryOutlined, LeftOutlined,
  ReloadOutlined, RobotOutlined, RightOutlined, SendOutlined, TrophyFilled,
} from '@ant-design/icons'
import {
  fetchCpmCurrent, fetchCpmReportAiSummary, fetchCpmRevision, fetchCpmRevisions, listMyCpmReports,
  publishCpmReport, republishCpmReport, saveCpmDraft, fetchMyRecognitions, fetchCpmRule,
  type CpmReportVO, type CpmRecognitionVO, type CpmRevisionVO,
} from '@/api/cpm'
import {
  CPM_PERIOD_LABELS, PUBLISHABLE_PERIODS, RECOGNITION_KIND_LABELS, CpmPeriod, type CpmPeriodValue,
} from './meta'
import { cpmPeriodRange, snapshotToMarkdown } from './cpmPeriod'
import { formatHours } from './cpmTime'
import SnapshotView from './SnapshotView'
import DailyReport from './DailyReport'
import CpmReportDocument from './CpmReportDocument'
import CpmExportButton from './CpmExportButton'
import { buildDocModel } from './cpmDocument'
import './cpm.css'

/**
 * P3 我的匯報（cpm-report，使用侧）。
 *
 * 口径铁律（方案 §五-C）：
 * - 初稿/数字全部来自服务端确定性聚合，前端不重算（通知里的数字=页面数字）；
 * - AI 摘要=可选润色，产物标「AI 生成」；空周期不给按钮；
 * - 发布即提交：后端条件 UPDATE 幂等，重复点击不会二次触发推送。
 */

const newSummaryKey = () => `cpm-abs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export default function MyReport() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const [periodType, setPeriodType] = useState<CpmPeriodValue>(CpmPeriod.WEEK)
  const [offset, setOffset] = useState(0)
  /** range 必须按 (periodType, offset) 记忆化：dayjs 对象每次新建会让 reload 引用抖动，
   *  发布成功后立刻被重跑的 current 顶回草稿视图（发布=被撤销，是这个模块最恶劣的竞态） */
  const range = useMemo(() => cpmPeriodRange(periodType, offset), [periodType, offset])
  const periodStartStr = range.start.format('YYYY-MM-DD')
  const periodEndStr = range.end.format('YYYY-MM-DD')
  /** 日报档不向 current 接口取数：它没有 report 实体，只是条目的当日投影 */
  const isDaily = periodType === CpmPeriod.DAY

  const [report, setReport] = useState<CpmReportVO | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [revisions, setRevisions] = useState<CpmRevisionVO[]>([])
  const [activeRevision, setActiveRevision] = useState<number | undefined>()
  /**
   * 正在阅读的历史版本内容（服务端冻结快照）。
   *
   * 单独存一份而不是「本地重算」：历史版本一旦可重算，补录一条记录就能改写过去。
   * undefined=未加载/看当前版，null=加载失败（界面必须如实说，不能悄悄退回当前版）。
   */
  const [revisionView, setRevisionView] = useState<CpmReportVO | null | undefined>(undefined)
  const [republishOpen, setRepublishOpen] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  const docRef = useRef<HTMLElement | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      // 日报是投影：没有 report 实体，取数与渲染全部交给 DailyReport（同一个 SnapshotBuilder 口径）
      if (isDaily) {
        setReport(null)
        setRevisions([])
        setActiveRevision(undefined)
        setLoadError(null)
        return
      }
      const vo = await fetchCpmCurrent(periodType, periodStartStr)
      setReport(vo)
      setSummary(vo.summary ?? null)
      setAiSummary(vo.aiSummary)
      // 版本列表跟着快照走：修订重发布后必须立刻看到新的 V(n)，不能等用户刷新页面
      if (vo.id && vo.status === 'published') {
        const list = await fetchCpmRevisions(vo.id)
        setRevisions(list)
        setActiveRevision(list.find(r => r.current)?.revisionNo ?? list[0]?.revisionNo)
      } else {
        setRevisions([])
        setActiveRevision(undefined)
      }
      setRevisionView(undefined)
      setLoadError(null)
    } catch (err) {
      setReport(null)
      setLoadError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [isDaily, periodType, periodStartStr])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    fetchCpmRule().then(r => setDryRun(r.notifyDryRun)).catch(() => undefined)
  }, [])

  const snapshot = report?.snapshot ?? null
  const published = report?.status === 'published'
  const futurePeriod = offset > 0
  const currentRevision = revisions.find(r => r.current)?.revisionNo ?? revisions[0]?.revisionNo ?? report?.revisionNo ?? 1
  const viewingHistorical = !!activeRevision && activeRevision !== currentRevision
  /**
   * 阅读面渲染的那一份快照：看当前版本就是发布冻结值，看历史版本就取该版本冻结值。
   * 必须是「取哪一份」的判定而不是「重算一份」——历史版本可编辑就等于取证链断了。
   */
  const viewingSnapshot = viewingHistorical ? revisionView?.snapshot ?? null : snapshot
  const historicalFailed = viewingHistorical && revisionView === null
  const docModel = useMemo(() => buildDocModel(viewingSnapshot), [viewingSnapshot])

  /** 切换版本时按需取该版冻结内容：一版一份，不在列表接口里把所有历史正文都拖回来 */
  const handleRevisionChange = async (revisionNo: number) => {
    setActiveRevision(revisionNo)
    setRevisionView(undefined)
    if (!report?.id) return
    const sameAsCurrent = revisionNo === currentRevision
    if (sameAsCurrent) {
      setRevisionView(undefined)
      return
    }
    try {
      setRevisionView(await fetchCpmRevision(report.id, revisionNo))
    } catch {
      // 明确置 null 让界面报「这一版正文没取到」，而不是默默显示当前版冒充历史版
      setRevisionView(null)
    }
  }

  const handleAiSummary = async () => {
    setSummarizing(true)
    try {
      const result = await fetchCpmReportAiSummary({
        requestKey: newSummaryKey(), periodType, periodStart: range.start.format('YYYY-MM-DD'),
      })
      setSummary(result.text)
      setAiSummary(true)
      message.success('摘要草稿已生成，可再編輯')
    } finally {
      setSummarizing(false)
    }
  }

  const handleSaveDraft = async () => {
    await saveCpmDraft({ periodType, periodStart: range.start.format('YYYY-MM-DD'), summary: summary ?? undefined, aiSummary })
    message.success('草稿已保存')
    await reload()
  }

  const handlePublish = () => {
    Modal.confirm({
      title: '確認發布並提交匯報？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>週期：</span><b>{range.label}</b></div>
          <div className="confirm-info-row"><span>條目數：</span><b>{snapshot?.totals.total ?? 0} 項（完成 {snapshot?.totals.done ?? 0}）</b></div>
          <div className="confirm-info-row">
            <span>{t('cpm.report.confirm.totalInvested', { defaultValue: '總投入：' })}</span>
            <b>{docModel.time && docModel.time.totalMinutes > 0
              ? formatHours(docModel.time.totalMinutes)
              : t('cpm.report.confirm.notRecorded', { defaultValue: '未記錄' })}</b>
          </div>
          <div className="confirm-info-row"><span>{t('cpm.report.confirm.aiSummary', { defaultValue: 'AI 摘要：' })}</span><b>{aiSummary ? t('cpm.report.confirm.aiGenerated', { defaultValue: '含 AI 生成內容' }) : t('cpm.report.confirm.manualOnly', { defaultValue: '全人工' })}</b></div>
          <div className="confirm-info-row"><span>{t('cpm.report.confirm.pushMode', { defaultValue: '釘釘推送：' })}</span><b>{dryRun ? t('cpm.report.confirm.dryRun', { defaultValue: 'dry-run（只登記 skipped，不真發）' }) : t('cpm.report.confirm.realPush', { defaultValue: '真實投遞' })}</b></div>
        </div>
      ),
      okText: t('cpm.report.confirmPublishOk', { defaultValue: '確認發布' }),
      cancelText: t('common.cancel', { defaultValue: '取消' }),
      onOk: async () => {
        setPublishing(true)
        try {
          await publishCpmReport({ periodType, periodStart: range.start.format('YYYY-MM-DD'), summary: summary ?? undefined, aiSummary })
          // 重新取一次 current：V1 由服务端在发布事务里冻结，版本列表与编号都必须来自后端
          // （本地拼一份出来，界面就会展示一份数据库里没有的版本）
          await reload()
          message.success(t('cpm.report.publishedV1', { defaultValue: '已發布 V1' }))
        } finally {
          setPublishing(false)
        }
      },
    })
  }

  /**
   * 修订重发布：服务端重新聚合 → 冻结为 V(n+1) → 通知指向新版本。
   *
   * 为什么不能直接改已发布内容：已发出的钉钉卡片链接指向的是当时那一版，
   * 覆盖旧版本会让「他收到的是什么」变成不可回答的问题（纪要为此专门建了版本表）。
   *
   * 为什么前端不再自己「先 preview 再提交」：预览值与提交值之间隔着一次重算，
   * 并发补录会让冻结的那一版不是用户确认的那一版。聚合在服务端一次做完。
   */
  const handleRepublish = async () => {
    if (!report?.id) {
      message.warning(t('cpm.revision.needPublishFirst', { defaultValue: '當前週期還沒有匯報記錄，請先發布' }))
      return
    }
    if (!changeNote.trim()) {
      message.warning(t('cpm.revision.needChangeNote', { defaultValue: '請填寫修訂說明' }))
      return
    }
    setPublishing(true)
    try {
      const vo = await republishCpmReport({
        reportId: report.id,
        changeNote: changeNote.trim(),
        summary: summary ?? undefined,
        aiSummary,
      })
      setRepublishOpen(false)
      setChangeNote('')
      await reload()
      // 内容真的变了才有新版本；无变化时后端幂等返回同一版，提示口径必须跟着变
      const no = vo.revisionNo ?? currentRevision
      message.success(no > currentRevision
        ? t('cpm.revision.published', { no, defaultValue: '已發布 V{{no}}' })
        : t('cpm.revision.unchanged', { no, defaultValue: '期間內沒有新事實，版本保持 V{{no}}' }))
    } finally {
      setPublishing(false)
    }
  }

  const handleCopyMarkdown = async () => {
    const md = snapshotToMarkdown(range.label, viewingSnapshot, summary ?? undefined, { time: docModel.time })
    try {
      await navigator.clipboard.writeText(md)
      message.success(t('cpm.report.copied', { defaultValue: '已複製 Markdown' }))
    } catch {
      message.error(t('cpm.report.clipboardUnavailable', { defaultValue: '剪貼板不可用' }))
    }
  }

  return (
    <div className="content-area">
      <Tabs
        items={[
          {
            key: 'report',
            label: '匯報生成',
            children: (
              <>
                {loadError && (
                  <Alert type="error" showIcon style={{ marginBottom: 14 }} message="匯報載入失敗" description={loadError}
                    action={<Button size="small" onClick={() => void reload()}>重試</Button>} />
                )}
                <div className="cpm-report__period-bar">
                  <Segmented
                    value={periodType}
                    onChange={v => { setPeriodType(v as CpmPeriodValue); setOffset(0) }}
                    options={Object.values(CpmPeriod).map(p => ({ label: CPM_PERIOD_LABELS[p], value: p }))}
                  />
                  <Space.Compact>
                    <Button icon={<LeftOutlined />} onClick={() => setOffset(o => o - 1)} aria-label="上一期" />
                    <Button onClick={() => setOffset(0)}>本期</Button>
                    <Button icon={<RightOutlined />} disabled={offset >= 0} onClick={() => setOffset(o => o + 1)} aria-label="下一期" />
                  </Space.Compact>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{range.label}</span>
                  {isDaily ? (
                    <Tooltip title={t('cpm.period.dailyTip', { defaultValue: '日報是條目的當日投影，不需發布、不送達、不產正式版本' })}>
                      <Tag>{t('cpm.period.readonlyTag', { defaultValue: '只讀投影' })}</Tag>
                    </Tooltip>
                  ) : (report && !loading && (
                    <Tag color={published ? 'green' : 'orange'}>
                      {published
                        ? t('cpm.report.publishedTag', { no: currentRevision, defaultValue: '已發布 V{{no}}' })
                        : t('cpm.report.draftTag', { defaultValue: '草稿' })}
                    </Tag>
                  ))}
                  {published && report?.hasUnpublishedChanges && (
                    <Tooltip title={t('cpm.report.pendingRevisionTip', { defaultValue: '期間內又發生了新的記錄或進度流水，正式版本尚未包含；點「修訂並重新發布」生成新版本' })}>
                      <Tag color="gold">{t('cpm.report.pendingRevisionTag', { defaultValue: '有新事實未入版' })}</Tag>
                    </Tooltip>
                  )}
                </div>

                {!isDaily && futurePeriod && (
                  <Alert type="warning" showIcon style={{ marginBottom: 14 }} message="尚不屬於過去週期，僅可預覽聚合，不能發布未來匯報。" />
                )}

                {isDaily ? (
                  <DailyReport date={range.start} periodLabel={range.label} ownerName={user?.name} ownerEmpId={user?.username} />
                ) : loading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
                ) : published && report ? (
                  <>
                    {historicalFailed && (
                      <Alert
                        type="error"
                        showIcon
                        style={{ marginBottom: 14 }}
                        message={t('cpm.revision.loadErrorTitle', { no: activeRevision ?? '', defaultValue: '歷史版本 V{{no}} 正文載入失敗' })}
                        description={t('cpm.revision.loadErrorBody', { defaultValue: '這裡刻意不退回顯示當前版本：把當前版冒充歷史版，比報錯危險得多。' })}
                        action={<Button size="small" onClick={() => void handleRevisionChange(activeRevision ?? currentRevision)}>{t('common.retry', { defaultValue: '重試' })}</Button>}
                      />
                    )}
                    <CpmReportDocument
                      docTitle={t('cpm.report.docTitle', { period: range.label, defaultValue: '工作匯報（{{period}}）' })}
                      ownerName={report.ownerName ?? user?.name}
                      ownerEmpId={report.ownerEmpId ?? user?.username}
                      periodLabel={range.label}
                      status="published"
                      publishedAt={report.publishedAt}
                      model={docModel}
                      summary={report.summary}
                      aiSummary={report.aiSummary}
                      revisions={revisions}
                      activeRevision={activeRevision}
                      onRevisionChange={no => void handleRevisionChange(no)}
                      historical={viewingHistorical}
                      range={{ start: periodStartStr, end: periodEndStr }}
                      rootRef={docRef}
                      delivery={(
                        <div className="cpm-report__delivered">
                          <span>{t('cpm.report.delivered', { receivers: report.receiverCount, reads: report.readCount, defaultValue: '送達 {{receivers}} 人 · 已讀 {{reads}} 人' })}</span>
                          <span>{t('cpm.report.feedbackCount', { comments: report.commentCount, likes: report.likeCount, defaultValue: '評論 {{comments}} · 點讚 {{likes}}' })}</span>
                          <span onClick={() => navigate(`/cpm-report-detail?id=${report.id}`)}>{t('cpm.report.viewFullFeedback', { defaultValue: '查看完整反饋 →' })}</span>
                        </div>
                      )}
                      actions={(
                        <Space size={8} wrap>
                          <Button icon={<CopyOutlined />} onClick={() => void handleCopyMarkdown()}>{t('cpm.report.copyMarkdown', { defaultValue: '複製 Markdown' })}</Button>
                          <CpmExportButton
                            getTarget={() => docRef.current}
                            fileBase={t('cpm.report.fileBase', { type: CPM_PERIOD_LABELS[periodType], date: periodStartStr, no: activeRevision ?? currentRevision, defaultValue: '工作匯報_{{type}}_{{date}}_V{{no}}' })}
                            reportId={report.id}
                            revisionNo={activeRevision ?? currentRevision}
                          />
                          <Button icon={<HistoryOutlined />} onClick={() => setRepublishOpen(true)}>{t('cpm.revision.button', { defaultValue: '修訂並重新發布' })}</Button>
                        </Space>
                      )}
                    />
                  </>
                ) : (
                  <>
                    <div className="cpm-card">
                      <div className="cpm-card__title-row">
                        <div className="cpm-card__icon cpm-card__icon--ok"><FileTextOutlined style={{ fontSize: 14 }} /></div>
                        <span className="cpm-card__title">自動聚合初稿</span>
                        <div className="cpm-card__line" />
                        <span className="cpm-card__extra">確定性口徑：僅來自期間條目與進度流水，AI 不參與計數</span>
                        <Button size="small" icon={<ReloadOutlined />} onClick={() => void reload()}>刷新</Button>
                      </div>
                      <SnapshotView snapshot={snapshot} />
                    </div>

                    <div className="cpm-card">
                      <div className="cpm-card__title-row">
                        <div className="cpm-card__icon cpm-card__icon--purple"><RobotOutlined style={{ fontSize: 14 }} /></div>
                        <span className="cpm-card__title">匯總摘要（選填）</span>
                        <div className="cpm-card__line" />
                        {aiSummary && <Tag color="purple">AI 生成</Tag>}
                      </div>
                      <Input.TextArea
                        rows={4}
                        value={summary ?? ''}
                        onChange={e => { setSummary(e.target.value); setAiSummary(false) }}
                        maxLength={1000}
                        showCount
                        placeholder="寫一句本週總結，或點「AI 摘要」由模型起草後你再改"
                        style={{ resize: 'none' }}
                        disabled={futurePeriod}
                      />
                      <div style={{ marginTop: 10 }}>
                        <Button icon={<RobotOutlined />} loading={summarizing} onClick={() => void handleAiSummary()}
                          disabled={futurePeriod || !snapshot || snapshot.totals.total === 0}>
                          AI 摘要
                        </Button>
                      </div>
                    </div>

                    {!futurePeriod && PUBLISHABLE_PERIODS.includes(periodType) && (
                      <div className="form-footer">
                        <Space>
                          <Button onClick={() => void handleSaveDraft()}>保存草稿</Button>
                          <Button type="primary" icon={<SendOutlined />} loading={publishing} onClick={handlePublish}
                            disabled={!snapshot || snapshot.totals.total === 0}>
                            發布提交
                          </Button>
                        </Space>
                      </div>
                    )}
                  </>
                )}
              </>
            ),
          },
          {
            key: 'archive',
            label: (<Space size={6}><TrophyFilled style={{ color: 'var(--purple)' }} />個人成果檔案</Space>),
            children: <RecognitionArchive />,
          },
          {
            key: 'history',
            label: '歷史匯報',
            children: <HistoryList />,
          },
        ]}
      />

      <Modal
        title={t('cpm.revision.modalTitle', { defaultValue: '修訂並重新發布' })}
        open={republishOpen}
        onOk={() => void handleRepublish()}
        onCancel={() => { setRepublishOpen(false); setChangeNote('') }}
        okText={t('cpm.revision.publishOk', { defaultValue: '確認發布新版本' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
        confirmLoading={publishing}
      >
        <div className="confirm-info-card" style={{ marginBottom: 12 }}>
          <div className="confirm-info-row"><span>{t('cpm.revision.current', { defaultValue: '當前版本：' })}</span><b>V{currentRevision}</b></div>
          <div className="confirm-info-row"><span>{t('cpm.revision.includes', { defaultValue: '新版本將包含：' })}</span><b>{t('cpm.revision.includesValue', { defaultValue: '期間內新發生的條目與進度流水' })}</b></div>
          <div className="confirm-info-row"><span>{t('cpm.revision.impact', { defaultValue: '影響：' })}</span><b>{t('cpm.revision.impactValue', { defaultValue: '已發出的釘釘連結會指向新版本；舊版本仍可在閱讀面切換查看' })}</b></div>
          <div className="confirm-info-row"><span>{t('cpm.revision.idempotent', { defaultValue: '無變化時：' })}</span><b>{t('cpm.revision.idempotentValue', { defaultValue: '內容與說明都相同則不會產生新版本（後端按內容冪等）' })}</b></div>
        </div>
        <Input.TextArea
          rows={3}
          value={changeNote}
          onChange={e => setChangeNote(e.target.value)}
          maxLength={200}
          showCount
          placeholder={t('cpm.revision.notePlaceholder', { defaultValue: '修訂說明（必填，例：補錄週五兩筆投入時段與一項完成事項）' })}
          style={{ resize: 'none' }}
        />
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
          {t('cpm.revision.footnote', { defaultValue: '修訂不會覆蓋舊版本：每一版都是當次發布的凍結快照，可追溯、可導出、可對比。' })}
        </div>
      </Modal>
    </div>
  )
}

/* ==================== 成果档案 ==================== */

function RecognitionArchive() {
  const [records, setRecords] = useState<CpmRecognitionVO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchMyRecognitions()
      .then(list => { if (alive) setRecords(list) })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : '載入失敗') })
    return () => { alive = false }
  }, [])

  if (error) return <Alert type="error" showIcon message="成果檔案載入失敗" description={error} />
  if (!records) return <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
  if (records.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="還沒有收到成果認定" />
  }
  return (
    <div className="cpm-card">
      <div className="cpm-card__title-row">
        <div className="cpm-card__icon cpm-card__icon--purple"><TrophyFilled style={{ fontSize: 14 }} /></div>
        <span className="cpm-card__title">上級認可記錄</span>
        <div className="cpm-card__line" />
        <span className="cpm-card__extra">認定即績效證據，期末可供 HR 績效考核取數（二期接口）</span>
      </div>
      <Timeline
        items={records.map(r => ({
          color: r.kind === 'milestone' ? 'purple' : 'blue',
          children: (
            <div>
              <Space size={6} wrap>
                <Tag className="cpm-recognition__kind" color={r.kind === 'milestone' ? 'purple' : 'blue'}>
                  {RECOGNITION_KIND_LABELS[r.kind]}
                </Tag>
                <b style={{ fontSize: 13, color: 'var(--text-1)' }}>{r.targetTitle}</b>
              </Space>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{r.comment}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                認定人：{r.fromName} · {r.createdAt} · 週期 {r.periodTag}
              </div>
            </div>
          ),
        }))}
      />
    </div>
  )
}

/* ==================== 历史汇报 ==================== */

function HistoryList() {
  const [list, setList] = useState<CpmReportVO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listMyCpmReports()
      .then(rows => { if (alive) setList(rows) })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : '載入失敗') })
    return () => { alive = false }
  }, [])

  if (error) return <Alert type="error" showIcon message="歷史匯報載入失敗" description={error} />
  if (!list) return <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
  if (list.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="還沒有歷史匯報" />
  return (
    <div className="cpm-card">
      {list.map(r => (
        <div className="cpm-item" key={`${r.periodType}-${r.periodStart}`}>
          <div className="cpm-item__main">
            <div className="cpm-item__title">{CPM_PERIOD_LABELS[r.periodType as CpmPeriodValue] ?? r.periodType} · {r.periodStart} ~ {r.periodEnd}</div>
            <div className="cpm-item__meta">
              <Tag color={r.status === 'published' ? 'green' : 'orange'} style={{ marginInlineEnd: 0 }}>
                {r.status === 'published' ? '已發布' : '草稿'}
              </Tag>
              <span>{r.snapshot?.totals.total ?? 0} 項 · 完成 {r.snapshot?.totals.done ?? 0}</span>
              {r.aiSummary && <Tag color="purple" style={{ marginInlineEnd: 0 }}>AI 摘要</Tag>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ==================== Markdown 导出 ==================== */

/* Markdown 导出与周期导航已抽至 cpmPeriod.ts：多处共用一份口径（导出文本=页面文本） */
