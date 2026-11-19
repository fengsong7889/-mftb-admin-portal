/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Empty, Input, Modal, Segmented, Space, Spin, message } from 'antd'
import { LikeFilled, LikeOutlined, TrophyFilled } from '@ant-design/icons'
import DetailPageHeader from '@/components/DetailPageHeader'
import {
  addCpmComment, createCpmRecognition, fetchCpmReportDetail, fetchCpmRevision, fetchCpmRevisions,
  listCpmComments, toggleCpmReaction,
  type CpmCommentVO, type CpmReportVO, type CpmRevisionVO,
} from '@/api/cpm'
import {
  CPM_PERIOD_LABELS, RECOGNITION_KIND_LABELS, RecognitionKind,
  type CpmPeriodValue, type RecognitionKindValue,
} from './meta'
import CpmReportDocument from './CpmReportDocument'
import CpmExportButton from './CpmExportButton'
import { buildDocModel } from './cpmDocument'
import './cpm.css'

/**
 * 汇报只读详情 + CFR 反馈操作条（方案 §五-D，阶段三升级为公文式阅读面）。
 *
 * 资格全部服务端判定：本人打开显示只读（不能给自己反馈——按钮根本不出现）；
 * 上级打开自动登记已读回执；评论/点赞/认定由后端 requireCfrWritable 拦截伪造。
 *
 * 阅读面与「我的匯報」共用同一个 CpmReportDocument：上级看到的必须和本人发出的
 * 是同一份文件的同一种表达，否则「通知里的数字 = 页面数字」这条铁律会在第二个视图上失效。
 *
 * 历史版本按需单独取（`GET /reports/{id}/revisions/{no}`）：这里读的是发布时冻结的那一份，
 * **不重新聚合、也不登记已读回执**——回执说的是「收到了这一期」，翻旧账不算。
 */

export default function ReportDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const reportId = Number(params.get('id'))

  const [report, setReport] = useState<CpmReportVO | null>(null)
  const [comments, setComments] = useState<CpmCommentVO[]>([])
  const [revisions, setRevisions] = useState<CpmRevisionVO[]>([])
  const [activeRevision, setActiveRevision] = useState<number | undefined>()
  /** undefined=看当前版（无需另取），null=历史版取数失败，对象=该版冻结内容 */
  const [revisionView, setRevisionView] = useState<CpmReportVO | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const docRef = useRef<HTMLElement | null>(null)

  const [recOpen, setRecOpen] = useState(false)
  const [recKind, setRecKind] = useState<RecognitionKindValue>(RecognitionKind.HIGHLIGHT)
  const [recComment, setRecComment] = useState('')
  const [recognizing, setRecognizing] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const detail = await fetchCpmReportDetail(reportId)
      setReport(detail)
      setLiked(detail.likedByMe)
      setLikeCount(detail.likeCount)
      const [commentList, list] = await Promise.all([
        listCpmComments('report', reportId),
        fetchCpmRevisions(reportId),
      ])
      setComments(commentList)
      setRevisions(list)
      setActiveRevision(list.find(r => r.current)?.revisionNo ?? list[0]?.revisionNo)
      setRevisionView(undefined)
      setError(null)
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => { void reload() }, [reload])

  const currentRevision = revisions.find(r => r.current)?.revisionNo ?? revisions[0]?.revisionNo ?? report?.revisionNo ?? 1
  const viewingHistorical = !!activeRevision && activeRevision !== currentRevision

  /**
   * 阅读面视图模型必须 useMemo：不记忆化会让每次渲染都产出新对象，
   * 工时数字卡片的动画 key 随之变化 → 计数动画反复重来，页面看起来在「自己跳数」。
   */
  const viewingSnapshot = viewingHistorical ? revisionView?.snapshot ?? null : (report?.snapshot ?? null)
  const historicalFailed = viewingHistorical && revisionView === null
  const docModel = useMemo(() => buildDocModel(viewingSnapshot), [viewingSnapshot])

  const handleRevisionChange = async (revisionNo: number) => {
    setActiveRevision(revisionNo)
    if (revisionNo === currentRevision) {
      setRevisionView(undefined)
      return
    }
    try {
      setRevisionView(await fetchCpmRevision(reportId, revisionNo))
    } catch {
      // 置 null 让界面报「这一版正文没取到」，绝不拿当前版冒充历史版
      setRevisionView(null)
    }
  }


  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
  }
  if (!report) {
    return (
      <div className="content-area">
        <Alert type="error" showIcon message="匯報載入失敗" description={error ?? '匯報不存在或已被移除'}
          action={<Button size="small" onClick={() => void reload()}>重試</Button>} />
      </div>
    )
  }

  // 本人判定口径：上级视角永远看不到草稿正文（requireReadableReport 只放行本人+可见范围，
  // 且团队列表对草稿不给出链接），因此 status=draft 必然来自本人视图——不渲染反馈操作条；
  // 已发布汇报一律展示操作条，真正的越权由后端 requireCfrWritable 拦截（前端不复制判定规则）。
  const isSelf = report.status === 'draft'

  const handleComment = async () => {
    const content = draft.trim()
    if (!content) return
    setSending(true)
    try {
      await addCpmComment({ targetType: 'report', targetId: reportId, content })
      setDraft('')
      setComments(await listCpmComments('report', reportId))
    } finally {
      setSending(false)
    }
  }

  const handleLike = async () => {
    const result = await toggleCpmReaction('report', reportId)
    setLiked(result.liked)
    setLikeCount(c => Math.max(0, c + (result.liked ? 1 : -1)))
  }

  const handleRecognize = async () => {
    if (!recComment.trim()) {
      message.warning('請填寫認定說明')
      return
    }
    setRecognizing(true)
    try {
      await createCpmRecognition({
        targetType: 'report', targetId: reportId, kind: recKind, comment: recComment.trim(),
      })
      message.success('已發起成果認定，將通知本人')
      setRecOpen(false)
      setRecComment('')
    } finally {
      setRecognizing(false)
    }
  }

  return (
    <div className="content-area">
      <DetailPageHeader
        title={`${CPM_PERIOD_LABELS[report.periodType as CpmPeriodValue] ?? report.periodType}詳情`}
        meta={<>{report.ownerName}（{report.ownerEmpId}）· 週期 {report.periodStart} ~ {report.periodEnd}</>}
        onBack={() => navigate(-1)}
      />

      {historicalFailed && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 14 }}
          message={t('cpm.revision.loadErrorTitle', { no: activeRevision ?? '', defaultValue: '歷史版本 V{{no}} 正文載入失敗' })}
          description={t('cpm.revision.loadErrorBodyDetail', { defaultValue: '這裡刻意不退回顯示當前版本：把當前版冒充歷史版，會讓上級把「現在」當成「當時」讀。' })}
          action={<Button size="small" onClick={() => void handleRevisionChange(activeRevision ?? currentRevision)}>{t('common.retry', { defaultValue: '重試' })}</Button>}
        />
      )}

      <CpmReportDocument
        docTitle={`${CPM_PERIOD_LABELS[report.periodType as CpmPeriodValue] ?? report.periodType}（${report.periodStart} ~ ${report.periodEnd}）`}
        ownerName={report.ownerName}
        ownerEmpId={report.ownerEmpId}
        periodLabel={`${report.periodStart} ~ ${report.periodEnd}`}
        status="published"
        publishedAt={report.publishedAt}
        model={docModel}
        summary={report.summary}
        aiSummary={report.aiSummary}
        revisions={revisions}
        activeRevision={activeRevision}
        onRevisionChange={no => void handleRevisionChange(no)}
        historical={viewingHistorical}
        range={{ start: report.periodStart, end: report.periodEnd }}
        rootRef={docRef}
        delivery={(
          <div className="cpm-report__delivered">
            <span>送達 {report.receiverCount} 人 · 已讀 {report.readCount} 人（打開本頁自動登記回執）</span>
          </div>
        )}
        feedback={isSelf ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="這是你的匯報：反饋與認定由上級在「團隊匯報」發起" />
        ) : (
          <div className="cpm-document__feedback">
            {comments.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>還沒有評論——一句具體的反饋就是最好的認可。</div>
            )}
            {comments.map(c => (
              <div className="cpm-comment" key={c.id}>
                <div className="cpm-comment__avatar">{(c.authorName ?? '?').slice(0, 1)}</div>
                <div className="cpm-comment__body">
                  <div className="cpm-comment__meta">{c.authorName} · {c.createdAt}</div>
                  <div className="cpm-comment__text">{c.content}</div>
                </div>
              </div>
            ))}
            <Space.Compact style={{ width: '100%', marginTop: 12 }}>
              <Input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onPressEnter={() => void handleComment()}
                placeholder="寫一條反饋（回車發送，最長 500 字）"
                maxLength={500}
              />
              <Button type="primary" loading={sending} onClick={() => void handleComment()} disabled={!draft.trim()}>發送</Button>
            </Space.Compact>
            <div className="cpm-cfr-bar" style={{ marginTop: 12 }}>
              <Button
                type={liked ? 'primary' : 'default'}
                icon={liked ? <LikeFilled /> : <LikeOutlined />}
                onClick={() => void handleLike()}
              >
                點讚（{likeCount}）
              </Button>
              <Button type="primary" icon={<TrophyFilled />} onClick={() => setRecOpen(true)}>成果認定</Button>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                認定將進入本人「個人成果檔案」，期末可作為績效考核取證（二期打通 HR）
              </span>
            </div>
          </div>
        )}
        actions={(
          <Space size={8} wrap>
            <CpmExportButton
              getTarget={() => docRef.current}
              fileBase={t('cpm.report.fileBase', {
                type: CPM_PERIOD_LABELS[report.periodType as CpmPeriodValue] ?? report.periodType,
                date: report.periodStart, no: activeRevision ?? currentRevision,
                defaultValue: '工作匯報_{{type}}_{{date}}_V{{no}}',
              })}
              reportId={reportId}
              revisionNo={activeRevision ?? currentRevision}
            />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {t('cpm.report.exportVersionHint', { defaultValue: '導出的是當前檢視的那一版，不是「最新版」' })}
            </span>
          </Space>
        )}
      />

      {/* 成果认定面板：类型+说明+确认的轻量操作（§9.1 简单设置面板例外，非实体表单页） */}
      <Modal
        title="發起成果認定"
        open={recOpen}
        onOk={() => void handleRecognize()}
        onCancel={() => setRecOpen(false)}
        okText="確認認定"
        cancelText="取消"
        confirmLoading={recognizing}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>認定類型</div>
            <Segmented
              block
              value={recKind}
              onChange={v => setRecKind(v as RecognitionKindValue)}
              options={Object.values(RecognitionKind).map(k => ({ label: RECOGNITION_KIND_LABELS[k], value: k }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>認定說明（將展示在本人成果檔案）</div>
            <Input.TextArea
              rows={3}
              value={recComment}
              onChange={e => setRecComment(e.target.value)}
              maxLength={200}
              showCount
              placeholder="例：分層方案顯著降低閱讀成本，作為說明類頁面新基準。"
              style={{ resize: 'none' }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            被認定人：{report.ownerName}（服務端按內容歸屬判定，前端無法指定他人）
          </div>
        </Space>
      </Modal>
    </div>
  )
}
