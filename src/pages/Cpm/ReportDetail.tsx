/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Empty, Input, Modal, Segmented, Space, Spin, Tag, message } from 'antd'
import { FileTextOutlined, LikeFilled, LikeOutlined, MessageOutlined, TrophyFilled } from '@ant-design/icons'
import DetailPageHeader from '@/components/DetailPageHeader'
import {
  addCpmComment, createCpmRecognition, fetchCpmReportDetail, listCpmComments, toggleCpmReaction,
  type CpmCommentVO, type CpmReportVO,
} from '@/api/cpm'
import { CPM_PERIOD_LABELS, RECOGNITION_KIND_LABELS, RecognitionKind, type CpmPeriodValue, type RecognitionKindValue } from './meta'
import SnapshotView from './SnapshotView'
import './cpm.css'

/**
 * 汇报只读详情 + CFR 反馈操作条（方案 §五-D，阶段二真实链路）。
 *
 * 资格全部服务端判定：本人打开显示只读（不能给自己反馈——按钮根本不出现）；
 * 上级打开自动登记已读回执；评论/点赞/认定由后端 requireCfrWritable 拦截伪造。
 */

export default function ReportDetail() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const reportId = Number(params.get('id'))

  const [report, setReport] = useState<CpmReportVO | null>(null)
  const [comments, setComments] = useState<CpmCommentVO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)

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
      setComments(await listCpmComments('report', reportId))
      setError(null)
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => { void reload() }, [reload])

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

      <div className="cpm-card">
        <div className="cpm-card__title-row">
          <div className="cpm-card__icon cpm-card__icon--ok"><FileTextOutlined style={{ fontSize: 14 }} /></div>
          <span className="cpm-card__title">匯報內容（已發布快照，只讀）</span>
          <div className="cpm-card__line" />
          {report.aiSummary && <Tag color="purple">含 AI 摘要</Tag>}
          <Tag color="green">已發布 {report.publishedAt}</Tag>
        </div>
        <SnapshotView snapshot={report.snapshot ?? null} />
        {report.summary && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--surface-sunken)', border: '1px solid var(--border-2)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>匯總摘要</div>
            <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{report.summary}</div>
          </div>
        )}
        <div className="cpm-report__delivered">
          <span>送達 {report.receiverCount} 人 · 已讀 {report.readCount} 人（打開本頁自動登記回執）</span>
        </div>
      </div>

      {/* 评论区（Feedback） */}
      {!isSelf && (
        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--info"><MessageOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">反饋與評論</span>
            <div className="cpm-card__line" />
            <span className="cpm-card__extra">{comments.length} 條</span>
          </div>
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
        </div>
      )}

      {/* CFR 操作条 */}
      {!isSelf && (
        <div className="cpm-card">
          <div className="cpm-cfr-bar">
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
      {isSelf && (
        <div className="cpm-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="這是你的匯報：反饋與認定由上級在「團隊匯報」發起" />
        </div>
      )}

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
