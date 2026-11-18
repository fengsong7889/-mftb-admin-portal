/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, Input, Modal, Segmented, Space, Spin, Tabs, Tag, Timeline, Tooltip, message } from 'antd'
import {
  CopyOutlined, FileTextOutlined, LeftOutlined, ReloadOutlined, RobotOutlined, RightOutlined,
  SendOutlined, TrophyFilled,
} from '@ant-design/icons'
import {
  fetchCpmCurrent, fetchCpmReportAiSummary, listMyCpmReports, publishCpmReport, saveCpmDraft,
  fetchMyRecognitions, fetchCpmRule,
  type CpmReportVO, type CpmRecognitionVO,
} from '@/api/cpm'
import { CPM_PERIOD_LABELS, RECOGNITION_KIND_LABELS, CpmPeriod, type CpmPeriodValue } from './meta'
import { cpmPeriodRange, snapshotToMarkdown } from './cpmPeriod'
import SnapshotView from './SnapshotView'
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
  const [periodType, setPeriodType] = useState<CpmPeriodValue>(CpmPeriod.WEEK)
  const [offset, setOffset] = useState(0)
  /** range 必须按 (periodType, offset) 记忆化：dayjs 对象每次新建会让 reload 引用抖动，
   *  发布成功后立刻被重跑的 current 顶回草稿视图（发布=被撤销，是这个模块最恶劣的竞态） */
  const range = useMemo(() => cpmPeriodRange(periodType, offset), [periodType, offset])
  const periodStartStr = range.start.format('YYYY-MM-DD')

  const [report, setReport] = useState<CpmReportVO | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [dryRun, setDryRun] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const vo = await fetchCpmCurrent(periodType, periodStartStr)
      setReport(vo)
      setSummary(vo.summary ?? null)
      setAiSummary(vo.aiSummary)
      setLoadError(null)
    } catch (err) {
      setReport(null)
      setLoadError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [periodType, periodStartStr])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    fetchCpmRule().then(r => setDryRun(r.notifyDryRun)).catch(() => undefined)
  }, [])

  const snapshot = report?.snapshot ?? null
  const published = report?.status === 'published'
  const futurePeriod = offset > 0

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
          <div className="confirm-info-row"><span>AI 摘要：</span><b>{aiSummary ? '含 AI 生成內容' : '全人工'}</b></div>
          <div className="confirm-info-row"><span>釘釘推送：</span><b>{dryRun ? 'dry-run（只登記 skipped，不真發）' : '真實投遞'}</b></div>
        </div>
      ),
      okText: '確認發布',
      cancelText: '取消',
      onOk: async () => {
        setPublishing(true)
        try {
          const vo = await publishCpmReport({ periodType, periodStart: range.start.format('YYYY-MM-DD'), summary: summary ?? undefined, aiSummary })
          setReport(vo)
          message.success('已發布')
        } finally {
          setPublishing(false)
        }
      },
    })
  }

  const handleCopyMarkdown = async () => {
    const md = snapshotToMarkdown(range.label, snapshot, summary ?? undefined)
    try {
      await navigator.clipboard.writeText(md)
      message.success('已複製 Markdown')
    } catch {
      message.error('複製失敗，請檢查瀏覽器剪貼板權限')
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
                  {report && !loading && (
                    <Tag color={published ? 'green' : 'orange'}>
                      {published ? `已發布 ${report.publishedAt ?? ''}` : '草稿'}
                    </Tag>
                  )}
                </div>

                {futurePeriod && (
                  <Alert type="warning" showIcon style={{ marginBottom: 14 }} message="尚不屬於過去週期，僅可預覽聚合，不能發布未來匯報。" />
                )}

                {loading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
                ) : published && report ? (
                  <>
                    <PublishedView report={report} />
                    <div style={{ marginTop: 4 }}>
                      <Space>
                        <Button icon={<CopyOutlined />} onClick={() => void handleCopyMarkdown()}>複製 Markdown</Button>
                        <Tooltip title="歷史版本與 PDF/Word 服务端导出在二期开放；当前提供 Markdown 复制">
                          <Button onClick={() => message.info('服務端導出為二期能力')}>導出</Button>
                        </Tooltip>
                      </Space>
                    </div>
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

                    {!futurePeriod && (
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
    </div>
  )
}

/* ==================== 已发布视图 ==================== */

function PublishedView({ report }: { report: CpmReportVO }) {
  return (
    <>
      <div className="cpm-card">
        <div className="cpm-card__title-row">
          <div className="cpm-card__icon cpm-card__icon--ok"><FileTextOutlined style={{ fontSize: 14 }} /></div>
          <span className="cpm-card__title">已發布內容（快照凍結，不可修改）</span>
          <div className="cpm-card__line" />
          {report.aiSummary && <Tag color="purple">含 AI 摘要</Tag>}
          <Tag color="green">已發布 {report.publishedAt}</Tag>
        </div>
        <SnapshotView snapshot={report.snapshot ?? null} />
        {report.summary && (
          <Card size="small" title="匯總摘要" style={{ marginTop: 12 }} extra={report.aiSummary ? <Tag color="purple">AI 生成</Tag> : undefined}>
            <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{report.summary}</div>
          </Card>
        )}
      </div>
      <div className="cpm-card">
        <div className="cpm-card__title-row">
          <div className="cpm-card__icon cpm-card__icon--info"><SendOutlined style={{ fontSize: 14 }} /></div>
          <span className="cpm-card__title">送達與反饋</span>
          <div className="cpm-card__line" />
        </div>
        <div className="cpm-report__delivered">
          <span>發布時間：{report.publishedAt}</span>
          <span>送達 {report.receiverCount} 人 · 已讀 {report.readCount} 人</span>
          <span>評論 {report.commentCount} · 點讚 {report.likeCount}</span>
        </div>
      </div>
    </>
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
