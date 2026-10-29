/**
 * 会议纪要只读查看页（非菜单子页：/meeting-minutes?id=）
 *
 * 归属：钉钉卡片「查看完整紀要」登录态跳转、表单页「發送歷史」按钮、会议详情纪要模块。
 * 菜单权限挂 meeting-my（见 Permission/types.ts 的 ROUTE_MENU_KEY_MAP）；
 * 被单独发送过纪要的非参会人也读得到——后端把"出现在任一发送批次名单里"计入可读范围，
 * 否则"发给没参会的人"就变成发出去却看不到。
 *
 * 三个模块固定顺序：纪要正文 → 发送历史（含每批投递明细）→ 最后更新收尾。
 * 发送历史是这一页存在的核心理由：纪要能改能重发，必须回答"哪一版在什么时候发给了谁"。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Input, Modal, Radio, Select, Space, Spin, Table, Tabs, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SafetyCertificateOutlined, SendOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '@/components/DetailPageHeader'
import CardTitle from '@/components/CardTitle'
import {
  fetchMinutesById, fetchMinutesSends, fetchMinutesRevisions, fetchMinutesRevision, minutesDeliveryTarget, resolveMinutesItem, revokeMinutesLinks, revokeBatchLink,
  fetchMinutesAttachmentAccess, minutesAttachmentFileUrl,
  type MinutesDeliveryVO, type MinutesDocument, type MinutesRevision, type MinutesItemView, type MinutesSendBatchVO, type MinutesVO,
} from '@/api/meetingMinutes'
import { fetchMeetingDetail, type MeetingVO } from '@/api/meeting'
import { bizTypeLabels, minutesStatusMeta, minutesTargetTypeLabels, notifyStatusMeta, phaseMeta } from '../meetingMeta'
import MinutesContentCard, { MinutesNoticePreview } from './MinutesContentCard'
import type { AttachmentUrlResolver } from './MinutesAttachments'
import SendMinutesModal from './SendMinutesModal'
import useMinutesNavigation from './useMinutesNavigation'
import './minutes.css'

/** 事项处理结果的展示文案（与后端 MeetingMinutesRenderer.resultLabel 同词表） */
function itemResultLabel(result: string | null | undefined, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (result === 'partial') return t('meeting.minutes.resultPartial', { defaultValue: '部分完成' })
  if (result === 'cannot') return t('meeting.minutes.resultCannot', { defaultValue: '無法完成' })
  return t('meeting.minutes.resultCompleted', { defaultValue: '已完成' })
}

const cardStyle: CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

export default function MinutesView() {
  const { t } = useTranslation()
  const { open: navigate, back } = useMinutesNavigation()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const minutesId = idParam && /^[1-9]\d*$/.test(idParam) ? Number(idParam) : undefined
  /** 详情页的「立即發送」直接带 send=1 进来：到页就弹开发送面板，不让用户再找一个按钮 */
  const autoSend = searchParams.get('send') === '1'

  const [minutes, setMinutes] = useState<MinutesVO>()
  const [meeting, setMeeting] = useState<MeetingVO>()
  const [sends, setSends] = useState<MinutesSendBatchVO[]>([])
  const [revisions, setRevisions] = useState<MinutesRevision[]>([])
  const [selectedDocument, setSelectedDocument] = useState<MinutesDocument>()
  const [selectedRevisionId, setSelectedRevisionId] = useState<number>()
  const revisionRequest = useRef(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [sendOpen, setSendOpen] = useState(false)
  const [viewTab, setViewTab] = useState('document')
  /** 当前正在更新状态的事项（负责人/记录人/行政可操作） */
  const [resolving, setResolving] = useState<MinutesItemView>()
  const [resolveResult, setResolveResult] = useState('completed')
  const [resolveNote, setResolveNote] = useState('')
  const [resolveSaving, setResolveSaving] = useState(false)

  const load = useCallback(async () => {
    if (!minutesId) {
      setError(t('meeting.minutes.missingId', { defaultValue: '缺少紀要編號，請從會議詳情或列表進入' }))
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const detail = await fetchMinutesById(minutesId)
      setMinutes(detail)
      // 会议单与发送历史都按纪要 id 反查：任一失败只影响对应模块，不让整页空白
      const [meetingResult, sendsResult] = await Promise.allSettled([
        detail.canEdit ? fetchMeetingDetail(detail.bookingId) : Promise.resolve(undefined),
        detail.canManageSends ? fetchMinutesSends(minutesId) : Promise.resolve([]),
      ])
      if (meetingResult.status === 'fulfilled') setMeeting(meetingResult.value)
      if (sendsResult.status === 'fulfilled') setSends(sendsResult.value ?? [])
      setRevisions(await fetchMinutesRevisions(minutesId))
      setSelectedDocument(undefined)
      setSelectedRevisionId(detail.publishedRevisionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.minutes.loadFailed', { defaultValue: '紀要載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [minutesId, t])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (autoSend && minutes?.canSend && minutes.document) { setSendOpen(true); setViewTab('notice') }
  }, [autoSend, minutes])

  const copyLink = async (url?: string | null) => {
    if (!url) {
      message.warning(t('meeting.minutes.noLink', { defaultValue: '本批次沒有可查看的鏈接' }))
      return
    }
    const absolute = /^https?:\/\//i.test(url) ? url : `${window.location.origin}${window.location.pathname}#${url}`
    try {
      await navigator.clipboard.writeText(absolute)
      message.success(t('meeting.minutes.linkCopied', { defaultValue: '查看鏈接已複製' }))
    } catch {
      // 非安全上下文（http）下 clipboard 不可用，退化为把地址显示出来让人手动复制，而不是报"复制失败"
      Modal.info({
        title: t('meeting.minutes.linkCopyFallback', { defaultValue: '請手動複製查看鏈接' }),
        className: 'custom-confirm-modal',
        content: <div style={{ wordBreak: 'break-all' }}>{absolute}</div>,
      })
    }
  }

  /** 作废历史免登链接：不可逆（已转发出去的链接立刻失效），必填语义由确认框讲清楚（§B.3） */
  const handleRevoke = () => {
    if (!minutes?.id) return
    Modal.confirm({
      title: t('meeting.minutes.revokeConfirmTitle', { defaultValue: '確認作廢全部查看鏈接？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.minutes.revokeConfirmOk', { defaultValue: '確認作廢' }),
      okButtonProps: { danger: true },
      cancelText: t('meeting.cancel', { defaultValue: '取消' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.minutes.noLabel', { defaultValue: '紀要：' })}</span><b>{minutes.minutesNo ?? minutesId}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.minutes.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.minutes.revokeImpact', { defaultValue: '已發出的釘釘卡片鏈接立刻讀不到內容，需重新發送才會生成新鏈接' })}</b></div>
        </div>
      ),
      onOk: async () => {
        const updated = await revokeMinutesLinks(minutes.id!, minutes.version ?? 0)
        setMinutes(updated)
        void load()
        message.success(t('meeting.minutes.revokeSuccess', { defaultValue: '查看鏈接已作廢' }))
      },
    })
  }

  /** 单批次作废走独立接口：只失效本批次链接，不影响其他批次；后端会重验权限。 */
  const handleRevokeBatch = (batch: MinutesSendBatchVO) => {
    if (!minutes?.id || !minutes.canEdit || !minutes.canManageSends || !batch.viewUrl || loading) return
    Modal.confirm({
      title: t('meeting.minutes.revokeBatchTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.minutes.revokeBatchOk'),
      okButtonProps: { danger: true },
      cancelText: t('meeting.cancel', { defaultValue: '取消' }),
      content: (
        <>
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>{t('meeting.minutes.noLabel', { defaultValue: '紀要：' })}</span><b>{minutes.minutesNo ?? minutes.id}</b></div>
            <div className="confirm-info-row"><span>{t('meeting.minutes.batch', { defaultValue: '批次' })}</span><b>{t('meeting.minutes.batchSeq', { seq: batch.batchSeq, defaultValue: '第 {{seq}} 次' })}</b></div>
            <div className="confirm-info-row"><span>{t('meeting.minutes.formalVersion', { defaultValue: '正式版本' })}</span><b>{batch.revisionNo ? `V${batch.revisionNo}` : t('meeting.minutes.legacySnapshot', { defaultValue: '歷史發送快照' })}</b></div>
            <div className="confirm-info-row"><span>{t('meeting.minutes.sentAt', { defaultValue: '發送時間' })}</span><b>{batch.sentAt || '-'}</b></div>
            <div className="confirm-info-row"><span>{t('meeting.minutes.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.minutes.revokeBatchImpact')}</b></div>
          </div>
        </>
      ),
      onOk: async () => {
        await revokeBatchLink(minutes.id!, batch.id)
        message.success(t('meeting.minutes.revokeBatchSuccess'))
        await load()
      },
    })
  }

  const batchColumns: TableColumnsType<MinutesSendBatchVO> = [
    {
      title: t('meeting.minutes.batch', { defaultValue: '批次' }), dataIndex: 'batchSeq', key: 'batchSeq', width: 90,
      render: (value: number) => t('meeting.minutes.batchSeq', { seq: value, defaultValue: '第 {{seq}} 次' }),
    },
    { title: t('meeting.minutes.formalVersion', { defaultValue: '正式版本' }), key: 'revision', render: (_, row) => row.revisionNo ? `V${row.revisionNo}` : t('meeting.minutes.legacySnapshot', { defaultValue: '歷史發送快照' }) },
    { title: t('meeting.minutes.sentAt', { defaultValue: '發送時間' }), dataIndex: 'sentAt', key: 'sentAt', width: 160, render: (v?: string | null) => v || '-' },
    {
      title: t('meeting.minutes.sender', { defaultValue: '發送人' }), key: 'operator', width: 150,
      render: (_, row) => `${row.operatorName ?? '-'}${row.operatorEmpNo ? `（${row.operatorEmpNo}）` : ''}`,
    },
    {
      title: t('meeting.minutes.groupColumn', { defaultValue: '釘釘群' }), key: 'group', width: 160,
      render: (_, row) => row.groupChannelName || <span style={{ color: '#BFBFBF' }}>{t('meeting.minutes.groupSkipped', { defaultValue: '未發群' })}</span>,
    },
    {
      title: t('meeting.minutes.receiverColumn', { defaultValue: '收件人' }), dataIndex: 'receiverCount', key: 'receiverCount', width: 90,
      render: (value: number) => `${value ?? 0} ${t('meeting.personUnit', { defaultValue: '人' })}`,
    },
    {
      title: t('meeting.status', { defaultValue: '狀態' }), dataIndex: 'sendStatus', key: 'sendStatus', width: 110,
      render: (value: string) => {
        const meta = notifyStatusMeta()[value] ?? { label: value, color: 'default' as const }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: t('meeting.minutes.resultDetail', { defaultValue: '投遞明細' }), key: 'counts',
      render: (_, row) => {
        const parts = [
          `${t('meeting.minutes.delivered', { defaultValue: '已送達' })} ${row.successCount ?? 0}`,
          `${t('meeting.minutes.failed', { defaultValue: '失敗' })} ${row.failedCount ?? 0}`,
          `${t('meeting.minutes.notDelivered', { defaultValue: '未送達' })} ${row.skippedCount ?? 0}`,
        ]
        return (
          <Space size={8} wrap>
            <span style={{ fontSize: 12, color: '#595959' }}>{parts.join(' / ')}</span>
            {row.errorMsg && <span style={{ fontSize: 12, color: '#FF4D4F' }}>{row.errorMsg}</span>}
          </Space>
        )
      },
    },
    {
      title: t('meeting.actions', { defaultValue: '操作' }), key: 'action', width: minutes?.canEdit ? 210 : 120, fixed: 'right',
      // 单批次作废与复制并列，危险动作置后；权限展示仅负责 UX，后端接入时必须重验。
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => void copyLink(row.viewUrl)}>
            {t('meeting.minutes.copyLink', { defaultValue: '複製鏈接' })}
          </Button>
          {minutes?.canEdit && minutes.canManageSends && (
            <Button type="link" size="small" danger disabled={!row.viewUrl || row.linkRevoked || loading} onClick={() => handleRevokeBatch(row)}>
              {row.linkRevoked ? t('meeting.minutes.revokedTag', { defaultValue: '已作廢' }) : t('meeting.minutes.revokeBatchAction', { defaultValue: '作廢鏈接' })}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  if (loading && !minutes) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('meeting.minutes.loading', { defaultValue: '載入會議紀要...' })} />
      </div>
    )
  }

  const status = minutes?.status ? minutesStatusMeta()[minutes.status] : undefined
  const phase = phaseMeta(meeting?.phase)
  const document = selectedDocument ?? minutes?.document
  const content = document?.content ?? minutes?.content
  const targetLabels = minutesTargetTypeLabels()
  /** 附件阅读口径：正在看的版本自带的引用（正式版看快照，草稿看当前绑定） */
  const viewingAttachments = document?.attachments ?? minutes?.attachments
  /** 站内附件地址：每次现取 5 分钟票据；后端兑换时还会复核用户与读权限 */
  const resolveAttachmentUrl: AttachmentUrlResolver = async (item, purpose) => {
    const access = await fetchMinutesAttachmentAccess(item.attachmentNo, purpose)
    return minutesAttachmentFileUrl({ attachmentNo: item.attachmentNo, ticket: access.ticket })
  }

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('meeting.minutes.viewTitle', { defaultValue: '會議紀要' })}
        tags={minutes ? (
          <Space size={4}>
            {status && <Tag color={status.color}>{status.label}</Tag>}
            {meeting && <Tag color={phase.color}>{phase.label}</Tag>}
          </Space>
        ) : undefined}
        meta={minutes
          ? <>{minutes.minutesNo} · {meeting?.title ?? ''} {meeting?.timeText ? `· ${meeting.timeText}` : ''}</>
          : undefined}
        onBack={back}
        onEdit={minutes?.canEdit ? () => navigate(`/meeting-minutes-form?id=${minutes.id}`) : undefined}
      />

      {error && !minutes && (
        <Alert type="error" showIcon message={t('meeting.minutes.unableToLoad', { defaultValue: '無法載入紀要' })} description={error}
          action={<Button size="small" onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>} />
      )}

      {minutes && (
        <>
          <div className="mm-reader-tools">
            <span className="mm-reader-tools__note">{minutes.hasUnpublishedChanges ? t('meeting.minutes.unpublishedChanges', { defaultValue: '存在未發布草稿；正式版本保持不變' }) : t('meeting.minutes.formalDocument', { defaultValue: '正式文檔與目前辦理進度分開閱讀' })}</span>
            <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>{t('meeting.refresh', { defaultValue: '刷新' })}</Button>
          </div>
          <Tabs className="mm-view-tabs" activeKey={viewTab} onChange={setViewTab} items={[
            { key: 'document', label: t('meeting.minutes.body') },
            { key: 'tracking', label: t('meeting.minutes.publicationText.itemTracking') },
            { key: 'history', label: t('meeting.minutes.publicationText.versionsAndNotifications') },
            { key: 'notice', label: t('meeting.minutes.publicationText.dingtalkCardPreview') },
          ]} />
        </>
      )}

      {minutes && content && (
        <>
          <div className="mm-reading-surface" hidden={viewTab !== 'document'}>
            <MinutesContentCard content={content} snapshot={document} trackedItems={content.schemaVersion === 2 ? undefined : minutes.items}
              attachments={viewingAttachments} resolveAttachmentUrl={resolveAttachmentUrl}
              document={{
                title: minutes.meetingTitle ?? meeting?.title,
                minutesNo: minutes.minutesNo,
                bookingNo: minutes.bookingNo,
                editionLabel: t('meeting.minutes.workingDraft', { defaultValue: '工作草稿 · 尚未發布' }),
                meetingTime: minutes.meetingTimeText ?? meeting?.timeText,
                meetingType: meeting ? (bizTypeLabels()[meeting.bizType] ?? meeting.bizType) : undefined,
                organizer: minutes.organizerName ?? meeting?.organizerName,
                recorder: `${minutes.recorderName || t('meeting.minutes.notRecorded')}${minutes.recorderEmpNo ? `（${minutes.recorderEmpNo}）` : ''}`,
                room: minutes.roomText ?? (meeting ? `${meeting.roomName}${meeting.roomLocation ? ` · ${meeting.roomLocation}` : ''}` : undefined),
                attendees: meeting?.attendees,
                externalAttendees: meeting?.externalAttendees,
                footer: <><span>{t('meeting.minutes.recorderColumn')} {minutes.recorderName}</span><span>{minutes.updatedAt}</span></>,
              }}
              references={(minutes.links ?? []).length > 0 ? <div className="mm-document__body">{(minutes.links ?? []).map(link => (
                <p key={link.minutesId}>{t('meeting.minutes.quotedFrom')}<Button type="link" size="small" onClick={() => navigate(`/meeting-minutes?id=${link.minutesId}`)}>{link.title || link.minutesNo}</Button> · {link.minutesNo} · {link.timeText}</p>
              ))}</div> : undefined}
            />
          </div>

          {/* 事项跟踪：行动项与跟进事项在正文之外单独呈现，因为有状态、负责人、时限要回答“谁还没办” */}
          <div style={cardStyle} hidden={viewTab !== 'tracking'}>
            <p className="mm-form-section-note">{t('meeting.minutes.publicationText.currentProgressIsShownSeparatelyFromThe')}</p>
            <CardTitle icon={<SafetyCertificateOutlined />} tone="warn"
              title={t('meeting.minutes.itemsTitle', { defaultValue: '行動項與跟進事項' })}
              note={t('meeting.minutes.itemsHint', { defaultValue: '負責人可在此回填處理結果；逾期會自動提醒' })} />
            <Table<MinutesItemView>
              size="small"
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              dataSource={minutes.items ?? []}
              locale={{ emptyText: t('meeting.minutes.noItems', { defaultValue: '本次會議沒有待跟進的事項' }) }}
              columns={[
                {
                  title: t('meeting.minutes.itemKind', { defaultValue: '類型' }), dataIndex: 'kind', key: 'kind', width: 100,
                  render: (kind: string) => (kind === 'FOLLOW'
                    ? <Tag color="orange">{t('meeting.minutes.kindFollow', { defaultValue: '跟進事項' })}</Tag>
                    : <Tag color="blue">{t('meeting.minutes.kindAction', { defaultValue: '行動項' })}</Tag>),
                },
                { title: t('meeting.minutes.itemContent', { defaultValue: '事項' }), dataIndex: 'content', key: 'content' },
                {
                  title: t('meeting.minutes.owner', { defaultValue: '負責人' }), key: 'owner', width: 160,
                  render: (_: unknown, row: MinutesItemView) => (row.ownerName
                    ? `${row.ownerName}${row.ownerEmpNo ? `（${row.ownerEmpNo}）` : ''}` : '-'),
                },
                { title: t('meeting.minutes.dueDate', { defaultValue: '完成時限' }), dataIndex: 'dueDate', key: 'dueDate', width: 120, render: (v?: string | null) => v || '-' },
                {
                  title: t('meeting.status', { defaultValue: '狀態' }), key: 'status', width: 150,
                  render: (_: unknown, row: MinutesItemView) => (row.status === 'done'
                    ? <Tag color={row.result === 'cannot' ? 'red' : 'green'}>{itemResultLabel(row.result, t)}</Tag>
                    : row.overdue
                      ? <Tag color="red">{t('meeting.minutes.overdue', { defaultValue: '已逾期' })}</Tag>
                      : <Tag color="processing">{t('meeting.minutes.pending', { defaultValue: '待處理' })}</Tag>),
                },
                {
                  title: t('meeting.minutes.itemNote', { defaultValue: '處理說明' }), key: 'note',
                  render: (_: unknown, row: MinutesItemView) => row.resolutionNote || '-',
                },
                {
                  title: t('meeting.action', { defaultValue: '操作' }), key: 'action', width: 110,
                  render: (_: unknown, row: MinutesItemView) => (row.canResolve
                    ? <Button type="link" size="small" onClick={() => { setResolving(row); setResolveResult('completed'); setResolveNote('') }}>
                        {t('meeting.minutes.updateStatus', { defaultValue: '更新狀態' })}
                      </Button>
                    : '-'),
                },
              ]}
            />
          </div>

          {/* 关联纪要统一放在正文「后续安排与相关资料」，避免在每个标签页重复展示。 */}
        </>
      )}

      {minutes && viewTab === 'notice' && (
        <div style={cardStyle} className="mm-form-publish">
          <div className="mm-form-publish__fields">
            <CardTitle icon={<SendOutlined />} tone="info" title={t('meeting.minutes.publicationText.dingtalkNotificationCard')} />
            <p>{t('meeting.minutes.publicationText.theCardShowsMeetingInformationAndA')}</p>
            <p className="mm-form-section-note">{t('meeting.minutes.cardVersionBound', { defaultValue: '通知綁定所選正式版本；重發只增加通知批次，不產生新版本。' })}</p>
            {minutes.canSend && document && <Button type="primary" onClick={() => setSendOpen(true)}>{t('meeting.minutes.sendNow')}</Button>}
          </div>
          <MinutesNoticePreview title={document?.meetingTitle ?? minutes.meetingTitle} timeText={document?.meetingTimeText ?? minutes.meetingTimeText} minutesNo={minutes.minutesNo}
            revisionNo={document?.revisionNo} publisher={document?.publisherName}
            topicCount={content?.items?.length ?? 0}
            actionCount={content?.actions?.length ?? 0}
            followCount={content?.openIssues?.length ?? 0}
            onView={() => setViewTab('document')} />
        </div>
      )}

      <div style={cardStyle} hidden={viewTab !== 'history'}>
        <Select style={{ width: '100%', marginBottom: 16 }} value={selectedRevisionId} placeholder={t('meeting.minutes.formalVersion', { defaultValue: '正式版本' })}
          options={revisions.map(revision => ({ value: revision.id, label: `V${revision.revisionNo} · ${revision.publisherName ?? ''} · ${revision.publishedAt ?? ''} ${revision.changeNote ?? ''}` }))}
          onChange={async (revisionId: number) => {
            const request = ++revisionRequest.current
            try {
              const selected = await fetchMinutesRevision(minutes!.id!, revisionId)
              if (request !== revisionRequest.current) return
              setSelectedDocument(selected.document); setSelectedRevisionId(revisionId); setViewTab('document')
            } catch { /* 请求层已统一提示，保留原来阅读的版本。 */ }
          }} />
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('meeting.minutes.versionAndBatch', { defaultValue: '正式版本與通知批次各自獨立；沒有版本號的舊記錄為歷史發送快照。' })} />
        <div className="mm-reader-tools">
          <span className="mm-reader-tools__note">{t('meeting.minutes.sendHistory')}</span>
          <Space size={8} wrap>
            {minutes?.canEdit && (minutes.sendCount ?? 0) > 0 && (
              <Tooltip title={t('meeting.minutes.revokeAllTooltip')}>
                <Button size="small" danger icon={<SafetyCertificateOutlined />} onClick={handleRevoke}>{t('meeting.minutes.revokeAllAction')}</Button>
              </Tooltip>
            )}
            {minutes?.canSend && document && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => { setSendOpen(true); setViewTab('notice') }}>
              {(minutes.sendCount ?? 0) > 0 ? t('meeting.minutes.sendAgain', { defaultValue: '再次發送' }) : t('meeting.minutes.sendNow', { defaultValue: '立即發送' })}
            </Button>}
          </Space>
        </div>
        <CardTitle icon={<SendOutlined />} tone="warn" title={t('meeting.minutes.sendHistory', { defaultValue: '發送歷史' })}
          note={t('meeting.minutes.sendHistoryNote', { defaultValue: '每一批都是「當時那一版正文」的一次投递，改正文不会追溯已发出的批次' })} />
        {minutes?.canManageSends && <Table<MinutesSendBatchVO>
          rowKey="id"
          size="small"
          columns={batchColumns}
          dataSource={sends}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            // 展开行看每个人/每个群的投递结论：只给汇总数字就永远说不清"谁没收到"
            expandedRowRender: row => (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={row.deliveries ?? []}
                columns={[
                  { title: t('meeting.minutes.targetType', { defaultValue: '目標' }), dataIndex: 'targetType', key: 'targetType', width: 140, render: (v: string) => targetLabels[v] ?? v },
                  { title: t('meeting.recipient', { defaultValue: '接收人' }), key: 'receiver', width: 180, render: (_, item: MinutesDeliveryVO) => minutesDeliveryTarget(item) },
                  {
                    title: t('meeting.dingtalk', { defaultValue: '釘釘' }), key: 'dingtalkBound', width: 90,
                    // 群行的投递对象就是机器人，不存在"没绑定"；只有收件人才需要区分未绑定钉钉
                    render: (_: unknown, item: MinutesDeliveryVO) => (item.targetType === 'GROUP' || item.dingtalkBound
                      ? <Tag color="green">{t('meeting.bound', { defaultValue: '已綁定' })}</Tag>
                      : <Tag color="orange">{t('meeting.unbound', { defaultValue: '未綁定' })}</Tag>),
                  },
                  {
                    title: t('meeting.status', { defaultValue: '狀態' }), dataIndex: 'sendStatus', key: 'sendStatus', width: 110,
                    render: (v: string) => {
                      const meta = notifyStatusMeta()[v] ?? { label: v, color: 'default' as const }
                      return <Tag color={meta.color}>{meta.label}</Tag>
                    },
                  },
                  { title: t('meeting.retry', { defaultValue: '重試' }), dataIndex: 'retryCount', key: 'retryCount', width: 70, render: (v?: number | null) => v ?? 0 },
                  { title: t('meeting.detail2', { defaultValue: '說明' }), dataIndex: 'errorMsg', key: 'errorMsg', render: (v?: string | null) => v || '-' },
                  { title: t('meeting.updatedAt', { defaultValue: '更新時間' }), dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v?: string | null) => v || '-' },
                ]}
                locale={{ emptyText: t('meeting.minutes.noDelivery', { defaultValue: '本批次無投遞明細' }) }}
              />
            ),
            rowExpandable: row => (row.deliveries?.length ?? 0) > 0,
          }}
          locale={{ emptyText: t('meeting.minutes.noSendHistory', { defaultValue: '尚未發送過紀要' }) }}
        />}
      </div>

      {/* 操作记录（§D.4）：详情页以「最后更新人 + 最后更新时间」收尾 */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          <span style={{ marginRight: 4 }}>{t('meeting.lastUpdatedBy', { defaultValue: '最後更新人：' })}</span>
          <span style={{ color: '#595959' }}>{minutes?.updatedBy || minutes?.recorderName || '-'}</span>
        </span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          <span style={{ marginRight: 4 }}>{t('meeting.lastUpdatedAtLabel', { defaultValue: '最後更新時間：' })}</span>
          <span style={{ color: '#595959' }}>{minutes?.updatedAt ?? '-'}</span>
        </span>
      </div>

      {resolving && (
        <Modal
          open
          title={t('meeting.minutes.resolveTitle', { defaultValue: '更新事項處理結果' })}
          onCancel={() => setResolving(undefined)}
          confirmLoading={resolveSaving}
          okText={t('meeting.save2', { defaultValue: '保存' })}
          onOk={async () => {
            if (resolveResult !== 'completed' && !resolveNote.trim()) {
              message.warning(t('meeting.minutes.noteRequired', { defaultValue: '部分完成或無法完成時，請說明原因' }))
              return
            }
            setResolveSaving(true)
            try {
              await resolveMinutesItem(resolving.id, { result: resolveResult, note: resolveNote.trim() || undefined, version: resolving.version })
              message.success(t('meeting.minutes.resolveSaved', { defaultValue: '處理結果已更新' }))
              setResolving(undefined)
              void load()
            } catch {
              /* request.ts 已统一弹错 */
            } finally {
              setResolveSaving(false)
            }
          }}
        >
          <div style={{ marginBottom: 8, color: '#595959' }}>{resolving.content}</div>
          <Radio.Group value={resolveResult} onChange={event => setResolveResult(event.target.value)} style={{ marginBottom: 12 }}>
            <Radio.Button value="completed">{t('meeting.minutes.resultCompleted', { defaultValue: '已完成' })}</Radio.Button>
            <Radio.Button value="partial">{t('meeting.minutes.resultPartial', { defaultValue: '部分完成' })}</Radio.Button>
            <Radio.Button value="cannot">{t('meeting.minutes.resultCannot', { defaultValue: '無法完成' })}</Radio.Button>
          </Radio.Group>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            maxLength={500}
            showCount
            value={resolveNote}
            onChange={event => setResolveNote(event.target.value)}
            placeholder={t('meeting.minutes.resolveNotePlaceholder', { defaultValue: '說明原因或進展；部分完成與無法完成時必填' })}
          />
        </Modal>
      )}

      {sendOpen && minutes?.canSend && document && (
        <SendMinutesModal
          minutesId={minutes.id!}
          meeting={meeting}
          content={document.content}
          document={document}
          revisionId={selectedRevisionId ?? minutes.publishedRevisionId}
          version={minutes.version ?? 0}
          linkBaseUrl={minutes.linkBaseUrl}
          linkBasePublic={minutes.linkBasePublic}
          onClose={() => setSendOpen(false)}
          onSent={() => { setSendOpen(false); void load() }}
        />
      )}
    </div>
  )
}
