/**
 * 会议详情（非菜单子页：/meeting-detail?id=）
 *
 * 归属：钉钉邀约卡片的「查看會議詳情」跳转、日程单元格与三个列表页的"詳情"按钮，
 * 菜单权限挂在 meeting-my 下（见 Permission/types.ts 的 ROUTE_MENU_KEY_MAP）。
 *
 * 越权处理：服务端把"不是你相关的会"与"不存在的会"统一按无权限/查不到返回，
 * 页面只如实转述接口结论，不区分两者——能区分就等于在探测单号是否存在。
 *
 * 五个模块固定顺序：基本信息 → 参会人与响应 → 邀约投递状态 → 会议纪要 → 会议轨迹。
 * 「N 人未綁定釘釘」的提示必须出现在基本信息附近：组织者最关心的是"人到底知不知道"。
 * 纪要模块永远排在投递状态之后：先看清"人到没到、邀约送没送"，再谈"会开了什么"。
 * 纪要 Tab 不只是回看：会议一到开始时间就能在页内直接记录（服务端 canEdit 为准），
 * 完整模板编辑与发送仍然走纪要表单页，两处共用同一份正文结构。
 *
 * 界面口径：
 *   1. 头部统一用 DetailPageHeader（§D.1），业务动作放它的 extra 槽，不自己手写返回按钮；
 *   2. 底部按 §D.4 收尾于「最后更新人 + 最后更新时间」；会议轨迹是业务内容（这场会经历了什么、
 *      谁在什么时候因为什么原因取消/释放），不是审计日志表格，所以保留为独立模块；
 *   3. 释放与取消都必填原因并二次确认（§B.3）：这两个动作都会把窗口立刻让给别人，不可逆。
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Descriptions, Input, Modal, QRCode, Space, Spin, Table, Tabs, Tag, Timeline, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BellOutlined, FileTextOutlined, HistoryOutlined, ProfileOutlined, QrcodeOutlined, ReloadOutlined, SaveOutlined, SendOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DetailPageHeader from '@/components/DetailPageHeader'
import CardTitle from '@/components/CardTitle'
import {
  cancelMeeting,
  checkinMeeting,
  fetchMeetingDetail,
  fetchMeetingEvents,
  finishMeeting,
  issueCheckinToken,
  newMeetingRequestKey,
  releaseMeeting,
  respondMeeting,
  type MeetingEventVO,
  type MeetingNotifyVO,
  type MeetingAttendeeVO,
  type MeetingVO,
} from '@/api/meeting'
import {
  attendeeTypeLabels,
  bizTypeLabels,
  responseMeta,
  notifyStatusMeta,
  eventLabel,
  notifyEventLabel,
  minutesStatusMeta,
  phaseMeta,
  scenarioLabel,
} from '../meetingMeta'
import {
  createMinutes,
  emptyMinutesContent,
  fetchMinutes,
  updateMinutes,
  type MinutesContent,
  type MinutesVO,
} from '@/api/meetingMinutes'
import MinutesContentCard from '../MeetingMinutes/MinutesContentCard'
import { deriveCanRecordMinutes } from '../MeetingMinutes/minutesAccess'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from 'react-i18next'

/** 详情卡片（§D.3）：白底、8px 圆角、不加 border，阴影统一 0.06 */
const cardStyle: CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

export default function MeetingDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const bookingId = idParam && /^[1-9]\d*$/.test(idParam) ? Number(idParam) : undefined

  const [record, setRecord] = useState<MeetingVO>()
  const [events, setEvents] = useState<MeetingEventVO[]>([])
  const [minutes, setMinutes] = useState<MinutesVO>()
  /** 纪要单独一个 Tab：会议基本信息与纪要的阅读时机不同（一个开会前看、一个会后看） */
  const [detailTab, setDetailTab] = useState('detail')
  /** 纪要入口能力：员工侧给自己的会记纪要，行政侧可代录（与代取消同源） */
  const minutesCapability = {
    canRecordOwn: hasPermission('meeting-my:edit'),
    canManageRecords: hasPermission('meeting-record:edit'),
  }
  /** 纪要读取失败不阻断详情页（详情先看会，再看纪要），但原因要能展示 */
  const [minutesError, setMinutesError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [qr, setQr] = useState<{ url: string; expireAt: string }>()
  /** 纪要快速记录（边开会边记）：只补「议题 + 过程要点」，行动项与发送仍走完整表单 */
  const [quickTopic, setQuickTopic] = useState('')
  const [quickNote, setQuickNote] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)

  const load = useCallback(async () => {
    if (!bookingId) {
      setError(t('meeting.missingMeetingIdPlease', { defaultValue: '缺少會議編號，請從列表或邀約卡片進入' }))
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const [detail, trail] = await Promise.all([fetchMeetingDetail(bookingId), fetchMeetingEvents(bookingId)])
      setRecord(detail)
      setEvents(trail ?? [])
      // 纪要单独取：读不到只影响纪要模块，不能把整场会的详情变成加载失败
      try {
        setMinutes(await fetchMinutes(bookingId))
        setMinutesError(undefined)
      } catch (e) {
        setMinutes(undefined)
        setMinutesError(e instanceof Error ? e.message : String(e))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe2', { defaultValue: '會議詳情加載失敗' }))
      setRecord(undefined)
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => { void load() }, [load])

  const respond = async (accept: boolean) => {
    if (!record) return
    try {
      await respondMeeting(record.id, { accept })
      message.success(accept ? t('meeting.invitationAccepted', { defaultValue: '已接受邀約' }) : t('meeting.invitationDeclined', { defaultValue: '已婉拒邀約' }))
      void load()
    } catch (e) {
      // request.ts 已统一弹出错误，这里只留日志，避免双弹
      console.warn(t('meeting.failedToRespond', { defaultValue: '響應邀約失敗' }), e instanceof Error ? e.message : e)
    }
  }

  /** 签到 / 提前结束：状态推进后必须重取详情，按钮可用性完全由服务端结论决定 */
  const run = async (fn: (id: number) => Promise<unknown>, okText: string) => {
    if (!record) return
    try {
      await fn(record.id)
      message.success(okText)
      void load()
    } catch (e) {
      console.warn(t('meeting.meetingOperationFailed', { defaultValue: '會議操作失敗' }), e instanceof Error ? e.message : e)
    }
  }

  /** 提前结束会把剩余窗口立刻还给他人，不可逆：必须二次确认（§B.3） */
  const handleFinish = () => {
    if (!record) return
    Modal.confirm({
      title: t('meeting.finishThisMeetingEarly', { defaultValue: '確認提前結束這場會議？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmFinish', { defaultValue: '確認結束' }),
      cancelText: t('meeting.back', { defaultValue: '返回' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.labelTopic', { defaultValue: '會議主題：' })}</span><b>{record.title}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.time2', { defaultValue: '時間：' })}</span><b>{record.timeText}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.labelRoom', { defaultValue: '會議室：' })}</span><b>{record.roomName}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.theRemainingSlotBecomes', { defaultValue: '結束後剩餘窗口立刻可被他人預訂，不可恢復' })}</b></div>
        </div>
      ),
      onOk: () => run(finishMeeting, t('meeting.meetingFinished', { defaultValue: '會議已結束' })),
    })
  }

  /** 释放：计入爽约统计，必填原因（写入审计并通知组织者） */
  const handleRelease = () => {
    if (!record) return
    let reason = ''
    Modal.confirm({
      title: t('meeting.releaseThisMeetingRoom', { defaultValue: '確認釋放這間會議室？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmRelease', { defaultValue: '確認釋放' }),
      okButtonProps: { danger: true },
      cancelText: t('meeting.back', { defaultValue: '返回' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.labelTopic', { defaultValue: '會議主題：' })}</span><b>{record.title}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.bookingNo2', { defaultValue: '單號：' })}</span><b>{record.bookingNo}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.time2', { defaultValue: '時間：' })}</span><b>{record.timeText}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.labelRoom', { defaultValue: '會議室：' })}</span><b>{record.roomName}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.countedAsNoShow', { defaultValue: '記入爽約統計並通知組織者，窗口立刻可被他人預訂' })}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.differenceFromCancel', { defaultValue: '與取消的區別：' })}</span><b>{t('meeting.releaseTargetsStartedMeetings', { defaultValue: '釋放針對已開始卻無人到場，取消針對尚未開始' })}</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.releaseReasonRequired', { defaultValue: '釋放原因（必填）' })}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGNobodyArrived', { defaultValue: '例：開始 20 分鐘無人到場，現場已確認' })}
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning(t('meeting.pleaseEnterTheRelease', { defaultValue: '請填寫釋放原因' }))
          // 抛出以阻止弹窗关闭：释放会计入爽约，不留原因等于无法事后解释
          throw new Error('reason required')
        }
        await releaseMeeting(record.id, { reason: reason.trim(), version: record.version })
        message.success(t('meeting.meetingRoomReleased', { defaultValue: '會議室已釋放' }))
        void load()
      },
    })
  }

  /** 取消：窗口立即归还，必填原因（写入审计并附在通知里） */
  const handleCancel = () => {
    if (!record) return
    let reason = ''
    Modal.confirm({
      title: t('meeting.cancelThisMeeting', { defaultValue: '確認取消這場會議？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmCancel', { defaultValue: '確認取消' }),
      okButtonProps: { danger: true },
      cancelText: t('meeting.back', { defaultValue: '返回' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.labelTopic', { defaultValue: '會議主題：' })}</span><b>{record.title}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.bookingNo2', { defaultValue: '單號：' })}</span><b>{record.bookingNo}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.time2', { defaultValue: '時間：' })}</span><b>{record.timeText}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.labelRoom', { defaultValue: '會議室：' })}</span><b>{record.roomName}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.theSlotIsReleased', { defaultValue: '房間窗口立即歸還；若已開啟釘釘通知場景，參會人會收到取消告知' })}</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.cancellationReasonRequired', { defaultValue: '取消原因（必填）' })}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGAgendaDropped', { defaultValue: '例：議程取消／改期另約' })}
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning(t('meeting.pleaseEnterTheCancellation', { defaultValue: '請填寫取消原因' }))
          throw new Error('reason required')
        }
        await cancelMeeting(record.id, { reason: reason.trim(), version: record.version })
        message.success(t('meeting.meetingCancelledTheRoom', { defaultValue: '會議已取消，房間窗口已歸還' }))
        void load()
      },
    })
  }

  /**
   * 签到二维码：令牌由后端按需签发，不落 URL、不进列表接口。
   *
   * <p>页面自己拼绝对地址（用 window.location.origin）：后端只有在通知场景绑定了企业应用
   * 且配了站点地址时才拿得到 base url，开发/生产域名不同，写死后二维码就扫不通了。
   */
  const showQr = async () => {
    if (!record) return
    try {
      const issued = await issueCheckinToken(record.id)
      const base = issued.url ?? `${window.location.origin}${window.location.pathname}#/meeting-checkin?token=${issued.token}`
      setQr({ url: base, expireAt: issued.expireAt })
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('meeting.failedToGenerateThe', { defaultValue: '生成簽到碼失敗' }))
    }
  }

  /**
   * 纪要能不能就地录入，一律听服务端：minutes.canEdit 已经合成了
   * 「相关人/行政身份 + 会议已进入（开始后就能记）」两个判定，前端不再自己拼一份。
   */
  const canQuickRecord = minutes?.canEdit === true && minutes?.minutesEnabled !== false

  /** 快速保存一条议题：已存正文逐字原样带回，只追加新的一条，避免覆写别人的记录 */
  const saveQuickRecord = async () => {
    if (!record || !minutes) return
    const topic = quickTopic.trim()
    const note = quickNote.trim()
    if (!topic) {
      message.warning(t('meeting.minutes.quickTopicRequired', { defaultValue: '請填寫議題標題' }))
      return
    }
    const base = minutes.content ?? emptyMinutesContent()
    // 空行是骨架里的占位议题（emptyMinutesContent 给一行空白的），不滤掉就会多出一条无标题议题
    const filledItems = (base.items ?? []).filter(
      item => item.topic?.trim() || item.discussion?.trim() || item.conclusion?.trim(),
    )
    const content: MinutesContent = { ...base, items: [...filledItems, { topic, discussion: note }] }
    // 行动项/跟进事项按原序回传：后端拿 (kind, seq) 当行身份，漏传会被当成"这场会没事项"而删掉
    const items = (minutes.items ?? []).map(row => ({
      kind: row.kind,
      content: row.content,
      ownerUserId: row.ownerUserId ?? null,
      dueDate: row.dueDate ?? null,
    }))
    // 关联纪要也是"按提交内容重建"：不带回去就等于记录一条要点就把别人挂好的关联清了
    const linkedMinutesIds = (minutes.links ?? []).map(link => link.minutesId)

    setQuickSaving(true)
    try {
      if (minutes.exists && minutes.id) {
        await updateMinutes(minutes.id, { content, items, linkedMinutesIds, version: minutes.version ?? 0 })
      } else {
        await createMinutes({
          bookingId: record.id, content, items, linkedMinutesIds,
          requestKey: newMeetingRequestKey('mm'),
        })
      }
      setQuickTopic('')
      setQuickNote('')
      message.success(t('meeting.minutes.quickSaved', { defaultValue: '已記錄，可繼續補充' }))
      void load()
    } catch (e) {
      // request.ts 已统一弹错，这里只留日志，避免双弹
      console.warn(t('meeting.minutes.quickSaveFailed', { defaultValue: '紀要記錄保存失敗' }), e instanceof Error ? e.message : e)
    } finally {
      setQuickSaving(false)
    }
  }

  const attendeeColumns: TableColumnsType<MeetingAttendeeVO> = [
    { title: t('meeting.name', { defaultValue: '姓名' }), dataIndex: 'name', key: 'name', width: 120 },
    { title: t('meeting.employeeNo', { defaultValue: '工號' }), dataIndex: 'empNo', key: 'empNo', width: 110, render: (v?: string | null) => v || '-' },
    { title: t('meeting.department', { defaultValue: '部門' }), dataIndex: 'departmentName', key: 'departmentName', width: 160, render: (v?: string | null) => v || '-' },
    {
      title: t('meeting.role', { defaultValue: '身份' }), dataIndex: 'attendeeType', key: 'attendeeType', width: 90,
      render: (v: string) => <Tag>{attendeeTypeLabels()[v] ?? v}</Tag>,
    },
    {
      title: t('meeting.response', { defaultValue: '響應' }), dataIndex: 'response', key: 'response', width: 100,
      render: (v: string) => {
        const meta = responseMeta()[v] ?? { label: v, color: 'default' as const }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    { title: t('meeting.respondedAt', { defaultValue: '響應時間' }), dataIndex: 'respondAt', key: 'respondAt', width: 160, render: (v?: string | null) => v || '-' },
    {
      title: t('meeting.checkIn', { defaultValue: '簽到' }), key: 'checkinAt', width: 160,
      render: (_, row) => (row.checkinAt
        ? <span style={{ color: '#52C41A' }}>{row.checkinAt}</span>
        : <span style={{ color: '#BFBFBF' }}>{t('meeting.notCheckedIn', { defaultValue: '未簽到' })}</span>),
    },
    {
      title: t('meeting.invitationDelivery', { defaultValue: '邀約投遞' }), key: 'notifyStatus', width: 170,
      render: (_, row) => {
        const meta = notifyStatusMeta()[row.notifyStatus ?? ''] ?? { label: row.notifyStatus || '-', color: 'default' as const }
        return (
          <Space direction="vertical" size={2}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {row.notifyNote && <span style={{ fontSize: 12, color: '#8C8C8C' }}>{row.notifyNote}</span>}
          </Space>
        )
      },
    },
  ]

  const notifyColumns: TableColumnsType<MeetingNotifyVO> = [
    { title: t('meeting.event', { defaultValue: '事件' }), dataIndex: 'eventCode', key: 'eventCode', width: 150, render: (v: string) => notifyEventLabel(v) },
    { title: t('meeting.scenario', { defaultValue: '場景' }), dataIndex: 'scenario', key: 'scenario', width: 130, render: (v: string) => scenarioLabel(v) },
    {
      title: t('meeting.recipient', { defaultValue: '接收人' }), key: 'receiver', width: 150,
      render: (_, row) => `${row.receiverName}${row.receiverEmpNo ? `（${row.receiverEmpNo}）` : ''}`,
    },
    {
      title: t('meeting.dingtalk', { defaultValue: '釘釘' }), dataIndex: 'dingtalkBound', key: 'dingtalkBound', width: 90,
      render: (v: boolean) => (v
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
  ]

  const phase = phaseMeta(record?.phase)
  /** 最后更新取轨迹里最近一条：MeetingVO 不带 updatedAt，而"谁在什么时候动了这场会"就是最后更新 */
  const lastEvent = events.length > 0 ? events[events.length - 1] : undefined

  if (loading && !record) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('meeting.loadingMeetingDetail', { defaultValue: '載入會議詳情...' })} />
      </div>
    )
  }

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('meeting.meetingDetail', { defaultValue: '會議詳情' })}
        tags={record ? (
          <Space size={4}>
            <Tag color={phase.color}>{phase.label}</Tag>
            {/* 爽约与“已釋放”是两件事但必须同时可见：只看状态会把问责信息弄丢 */}
            {record.noShow === 1 && <Tag color="red">{t('meeting.noShow', { defaultValue: '爽約' })}</Tag>}
          </Space>
        ) : undefined}
        meta={record
          ? <>{record.bookingNo} · {record.roomName} · {record.timeText}</>
          : undefined}
        onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/meeting-my'))}
        extra={record && (
          <Space size={8} wrap>
            <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>{t('meeting.refresh', { defaultValue: '刷新' })}</Button>
            {record.myRole && record.myRole !== 'none' && record.status !== 'finished'
              && record.status !== 'cancelled' && (
              <Button size="small" icon={<QrcodeOutlined />} onClick={() => void showQr()}>{t('meeting.myCheckInCode', { defaultValue: '我的簽到碼' })}</Button>
            )}
            {record.myRole !== 'organizer' && record.status === 'booked' && record.myResponse === 'pending' && (
              <>
                <Button size="small" type="primary" onClick={() => void respond(true)}>{t('meeting.acceptInvitation', { defaultValue: '接受邀約' })}</Button>
                <Button size="small" onClick={() => void respond(false)}>{t('meeting.decline', { defaultValue: '婉拒' })}</Button>
              </>
            )}
            {record.canCheckin && (
              <Button size="small" type="primary" onClick={() => void run(checkinMeeting, t('meeting.checkedIn', { defaultValue: '已簽到' }))}>{t('meeting.checkIn', { defaultValue: '簽到' })}</Button>
            )}
            {record.canFinish && <Button size="small" onClick={handleFinish}>{t('meeting.finishEarly', { defaultValue: '提前結束' })}</Button>}
            {record.canRelease && <Button size="small" danger onClick={handleRelease}>{t('meeting.releaseRoom2', { defaultValue: '釋放會議室' })}</Button>}
            {record.canCancel && <Button size="small" danger onClick={handleCancel}>{t('meeting.cancelMeeting', { defaultValue: '取消會議' })}</Button>}
          </Space>
        )}
      />

      {!bookingId && <Alert type="warning" showIcon message={t('meeting.invalidURLParameter', { defaultValue: '位址列不合法' })} description={error} />}
      {bookingId && error && !record && (
        <Alert type="error" showIcon message={t('meeting.unableToLoadThe', { defaultValue: '無法載入會議詳情' })} description={error}
          action={<Button size="small" onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>} />
      )}

      {record && (
        <>
          <Tabs
            activeKey={detailTab}
            onChange={setDetailTab}
            style={{ marginBottom: 4 }}
            items={[
              { key: 'detail', label: t('meeting.detailTabInfo', { defaultValue: '會議詳情' }) },
              { key: 'minutes', label: t('meeting.minutes.moduleTitle', { defaultValue: '會議紀要' }) },
            ]}
          />

          {detailTab === 'detail' && (<>
          {/* 一、基本信息 */}
          <div style={cardStyle}>
            <CardTitle icon={<ProfileOutlined />} tone="info" title={t('meeting.basicInfo', { defaultValue: '基本信息' })}
              note={t('meeting.attendeeAndType', {
                count: record.attendeeCount, type: bizTypeLabels()[record.bizType] ?? record.bizType,
                defaultValue: `${record.attendeeCount} 人 · ${bizTypeLabels()[record.bizType] ?? record.bizType}`,
              })} />
            {typeof record.notifySkippedCount === 'number' && record.notifySkippedCount > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message={t('meeting.notifySkippedAlert', { count: record.notifySkippedCount, defaultValue: `{{count}} 人未收到釘釘邀約` })}
                description={t('meeting.notifySkippedDesc', { defaultValue: '下方「參會人」列表的投遞列標明了每個人未送達的原因；站內日程仍然可見，不受影響。' })}
              />
            )}
            <Descriptions column={4} size="middle" items={[
              { key: 'time', label: t('meeting.meetingTime', { defaultValue: '會議時間' }), span: 2, children: t('meeting.timeRangeWithMinutes', { start: record.startTime, end: record.endTime, count: record.durationMinutes, defaultValue: `${record.startTime} ~ ${record.endTime}（${record.durationMinutes} 分鐘）` }) },
              {
                key: 'room', label: t('meeting.meetingRoom', { defaultValue: '會議室' }), span: 2,
                children: (
                  <Space size={4} wrap>
                    <span>{record.roomName}</span>
                    <span style={{ color: '#8C8C8C', fontSize: 12 }}>{record.roomNo}</span>
                    {record.roomBookable === false && <Tag color="orange">{t('meeting.roomNotBookableNow', { defaultValue: '房間當前不可約' })}</Tag>}
                  </Space>
                ),
              },
              { key: 'location', label: t('meeting.location', { defaultValue: '位置' }), span: 2, children: record.roomLocation || '-' },
              {
                key: 'organizer', label: t('meeting.organizer', { defaultValue: '組織者' }), span: 2,
                children: `${record.organizerName}${record.organizerEmpNo ? `（${record.organizerEmpNo}）` : ''}${record.departmentName ? ` · ${record.departmentName}` : ''}`,
              },
              // 代订单把"实际使用人"单独摆出来：只看到组织者是行政时，
              // 参会人会以为这场会由行政召集，散会后也不知道该找谁
              ...(record.delegateForId ? [{
                key: 'delegate', label: t('meeting.actualUser', { defaultValue: '實際使用人' }), span: 2,
                children: (
                  <Space size={6}>
                    <span>{record.delegateForName || t('meeting.selectedPerson', { defaultValue: '已指定人員' })}</span>
                    <Tag color="blue">{t('meeting.proxyBookingTag', { name: record.organizerName, defaultValue: `行政代訂 · 由 ${record.organizerName} 預訂` })}</Tag>
                  </Space>
                ),
              }] : []),
              { key: 'count', label: t('meeting.attendeeCount', { defaultValue: '參會人數' }), children: t('meeting.headcount', { count: record.attendeeCount, defaultValue: '{{count}} 人' }) },
              { key: 'biz', label: t('meeting.meetingType', { defaultValue: '會議類型' }), children: bizTypeLabels()[record.bizType] ?? record.bizType },
              {
                key: 'online', label: t('meeting.onlineLink', { defaultValue: '線上鏈接' }), span: 2,
                children: record.onlineMeetingUrl
                  ? <a href={record.onlineMeetingUrl} target="_blank" rel="noreferrer">{t('meeting.joinOnlineMeeting', { defaultValue: '進入線上會議' })}</a>
                  : '-',
              },
              {
                key: 'link', label: t('meeting.linkedBusiness', { defaultValue: '關聯業務' }), span: 2,
                children: record.bizNo
                  ? (record.bizUrl
                    ? <a href={record.bizUrl} target="_blank" rel="noreferrer">{record.bizNo}</a>
                    : record.bizNo)
                  : t('meeting.none', { defaultValue: '無' }),
              },
              { key: 'desc', label: t('meeting.agenda', { defaultValue: '會議議程' }), span: 4, children: record.description || '-' },
              { key: 'external', label: t('meeting.externalAttendees', { defaultValue: '外部參會人' }), span: 4, children: record.externalAttendees || '-' },
              ...(record.cancelReason ? [{ key: 'cancel', label: t('meeting.cancellationReason', { defaultValue: '取消原因' }), span: 4, children: record.cancelReason }] : []),
              ...(record.releaseReason
                ? [{ key: 'release', label: t('meeting.releaseReason', { defaultValue: '釋放原因' }), span: 4, children: `${record.releaseReason}（${record.releaseAt ?? '-'}）` }]
                : []),
            ]} />
          </div>

          {/* 二、参会人与响应 */}
          <div style={cardStyle}>
            <CardTitle icon={<TeamOutlined />} tone="success" title={t('meeting.attendees2', { defaultValue: '參會人' })}
              note={t('meeting.attendeeTotalNote', { count: record.attendees?.length ?? 0, defaultValue: `共 ${record.attendees?.length ?? 0} 人（含組織者與外部人員）` })} />
            <Table<MeetingAttendeeVO>
              rowKey="id"
              size="small"
              columns={attendeeColumns}
              dataSource={record.attendees ?? []}
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          </div>

          {/* 三、邀约投递状态 */}
          <div style={cardStyle}>
            <CardTitle icon={<BellOutlined />} tone="warn" title={t('meeting.invitationDeliveryStatus', { defaultValue: '邀約投遞狀態' })}
              note={t('meeting.eachInvitationIsSent', { defaultValue: '每條邀約只發一次，重試次數與失敗原因都在這裡' })} />
            <Table<MeetingNotifyVO>
              rowKey="id"
              size="small"
              columns={notifyColumns}
              dataSource={record.notifies ?? []}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: t('meeting.noDeliveryRecordYet', { defaultValue: '尚無投遞記錄（通知場景可能未啟用，或該會議未產生邀約事件）' }) }}
            />
          </div>

          </>)}

          {/* 四、会议纪要：单独 Tab（没录入时也要看得到入口） */}
          {detailTab === 'minutes' && (
          <div style={cardStyle}>
            <CardTitle icon={<FileTextOutlined />} tone="purple" title={t('meeting.minutes.moduleTitle', { defaultValue: '會議紀要' })}
              note={minutes?.exists
                ? t('meeting.minutes.moduleNoteExists', { count: minutes.sendCount ?? 0, defaultValue: '{{minutesNo}} · 已發送 {{count}} 次', minutesNo: minutes.minutesNo ?? '' })
                : t('meeting.minutes.moduleNoteEmpty', { defaultValue: '本場會可記錄結論與行動項，並發送釘釘群與相關人' })}
              tag={(() => {
                if (!minutes?.exists || !minutes.status) return undefined
                const meta = minutesStatusMeta()[minutes.status]
                return meta ? <Tag color={meta.color}>{meta.label}</Tag> : undefined
              })()}
            />
            {minutes?.exists && minutes.content ? (
              <>
                <MinutesContentCard content={minutes.content} />
                <Space size={8} wrap style={{ marginTop: 8 }}>
                  <Button size="small" icon={<HistoryOutlined />} onClick={() => navigate(`/meeting-minutes?id=${minutes.id}`)}>
                    {t('meeting.minutes.viewMinutes', { defaultValue: '查看紀要與發送歷史' })}
                  </Button>
                  {minutes.canEdit && (
                    <Button size="small" onClick={() => navigate(`/meeting-minutes-form?id=${minutes.id}`)}>{t('meeting.minutes.edit', { defaultValue: '編輯紀要' })}</Button>
                  )}
                  {minutes.canSend && (
                    <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => navigate(`/meeting-minutes?id=${minutes.id}&send=1`)}>
                      {t('meeting.minutes.sendNow', { defaultValue: '立即發送' })}
                    </Button>
                  )}
                </Space>
              </>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('meeting.minutes.emptyHint', { defaultValue: '本場會尚未錄入紀要' })}</span>
                {minutesError && (
                  <span style={{ fontSize: 12, color: '#FF4D4F' }}>{`${t('meeting.minutes.loadFailedShort', { defaultValue: '紀要讀取失敗：' })}${minutesError}`}</span>
                )}
                {record && deriveCanRecordMinutes(record, minutesCapability) && !canQuickRecord && (
                  <div>
                    <Button size="small" type="primary" icon={<FileTextOutlined />} onClick={() => navigate(`/meeting-minutes-form?bookingId=${record.id}`)}>
                      {t('meeting.minutes.recordNow', { defaultValue: '錄入紀要' })}
                    </Button>
                  </div>
                )}
              </Space>
            )}

            {/* 就地记录（会议开始就能记）：只读卡会跟着刷新，记录与回看不换来换页 */}
            {canQuickRecord && (
              <div style={{
                marginTop: 16, paddingTop: 12, borderTop: '1px dashed #E8E8E8',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>
                  {t('meeting.minutes.quickTitle', { defaultValue: '邊開會邊記錄' })}
                  <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: '#8C8C8C' }}>
                    {t('meeting.minutes.quickHint', { defaultValue: '每保存一次追加一條議題；行動項、缺席與發送請用「完整表單編輯」' })}
                  </span>
                </div>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Input
                    value={quickTopic}
                    onChange={event => setQuickTopic(event.target.value)}
                    maxLength={100}
                    disabled={quickSaving}
                    placeholder={t('meeting.minutes.quickTopicPlaceholder', { defaultValue: '議題標題，例：Q4 預算缺口分攤口徑' })}
                  />
                  <Input.TextArea
                    value={quickNote}
                    onChange={event => setQuickNote(event.target.value)}
                    maxLength={500}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    disabled={quickSaving}
                    placeholder={t('meeting.minutes.quickNotePlaceholder', { defaultValue: '討論要點與結論（可隨時保存，會後再補充完）' })}
                  />
                  <Space size={8}>
                    <Button size="small" type="primary" icon={<SaveOutlined />} loading={quickSaving} onClick={() => void saveQuickRecord()}>
                      {t('meeting.minutes.quickSave', { defaultValue: '保存記錄' })}
                    </Button>
                    <Button size="small" onClick={() => navigate(minutes?.exists && minutes.id
                      ? `/meeting-minutes-form?id=${minutes.id}`
                      : `/meeting-minutes-form?bookingId=${record?.id}`)}>
                      {t('meeting.minutes.openFullForm', { defaultValue: '完整表單編輯' })}
                    </Button>
                  </Space>
                </Space>
              </div>
            )}
          </div>
          )}

          {detailTab === 'detail' && (<>
          {/* 五、会议轨迹（业务事件，不是审计日志表格） */}
          <div style={cardStyle}>
            <CardTitle icon={<HistoryOutlined />} tone="purple" title={t('meeting.meetingTrail', { defaultValue: '會議軌跡' })}
              note={t('meeting.trailCount', { count: events.length, defaultValue: `${events.length} 條` })} />
            {events.length === 0 ? (
              <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('meeting.noTrail', { defaultValue: '無軌跡' })}</span>
            ) : (
              <Timeline
                items={events.map(item => ({
                  color: item.eventCode === 'cancel' ? 'red' : item.eventCode === 'create' ? 'green' : 'blue',
                  children: (
                    <Space direction="vertical" size={2}>
                      <Space size={6} wrap>
                        <strong>{eventLabel(item.eventCode)}</strong>
                        <span style={{ color: '#8C8C8C', fontSize: 12 }}>
                          {item.operatorName}{item.operatorEmpNo ? `（${item.operatorEmpNo}）` : ''} · {item.occurredAt}
                        </span>
                      </Space>
                      {item.reason && <span style={{ fontSize: 12 }}>{t('meeting.notePrefix', { reason: item.reason, defaultValue: `說明：${item.reason}` })}</span>}
                    </Space>
                  ),
                }))}
              />
            )}
          </div>

          {/* 操作记录（§D.4）：详情页以「最后更新人 + 最后更新时间」收尾 */}
          <div style={{
            background: '#fafafa', borderRadius: 8, padding: '12px 24px',
            border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24,
          }}>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              <span style={{ marginRight: 4 }}>{t('meeting.lastUpdatedBy', { defaultValue: '最後更新人：' })}</span><span style={{ color: '#595959' }}>
                {lastEvent ? `${lastEvent.operatorName}${lastEvent.operatorEmpNo ? `（${lastEvent.operatorEmpNo}）` : ''}` : record.organizerName}
              </span>
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              <span style={{ marginRight: 4 }}>{t('meeting.lastUpdatedAtLabel', { defaultValue: '最後更新時間：' })}</span><span style={{ color: '#595959' }}>{lastEvent?.occurredAt ?? record.startTime}</span>
            </span>
          </div>
          </>)}
        </>
      )}

      {/* 我的签到码：纯展示型弹窗（§9.1 允许），令牌由后端按需签发 */}
      <Modal
        title={t('meeting.myCheckInCode', { defaultValue: '我的簽到碼' })}
        open={Boolean(qr)}
        onCancel={() => setQr(undefined)}
        footer={<Button onClick={() => setQr(undefined)}>{t('meeting.close', { defaultValue: '關閉' })}</Button>}
      >
        {qr && (
          <div style={{ textAlign: 'center' }}>
            <QRCode value={qr.url} size={220} />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>
              {t('meeting.qrHint', { expireAt: qr.expireAt, defaultValue: `有效期內可在會議室門口掃碼簽到，至 ${qr.expireAt}（會議結束後 2 小時失效）` })}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#8C8C8C', wordBreak: 'break-all' }}>{qr.url}</div>
          </div>
        )}
      </Modal>
    </div>
  )
}
