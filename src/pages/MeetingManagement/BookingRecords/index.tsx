/**
 * 预约记录（会议管理 → 會議治理 → 預約記錄，行政视野）
 *
 * 与「我的会议」是同一套接口的另一种范围表达：持有 meeting-record:view 才能看到全量，
 * 否则服务端把 scope=all 降级为"与自己相关"——前端不自己判断能不能看，
 * 只在拿到降级结果时如实显示，避免出现"界面藏住了、接口还敞开"的假安全。
 *
 * 三条界面口径：
 *   1. 「已釋放」与「已取消」分开统计并分开操作：前者占过房间没来（爽约），
 *      后者是主动撤销（窗口已还给他人），共用一个按钮会让行政在事后无法解释数字；
 *   2. 两个操作都必填原因，原因写入审计并附在通知里——那是事后唯一能回答
 *      "这场会为什么没了"的凭据；
 *   3. 统计卡片在搜索区下方且随筛选条件变化（§E.8）；
 *   4. 未开始的会议给「編輯」入口：改时间/换房/补参会人走同一张预约表单页，
 *      按钮可见性只看服务端 canEdit，不在前端复算“是否已开始”；
 *   5. 默认按会议开始时间倒序（最近一场在最前）：台账要找的就是刚开完/即将开的会，
 *      正序等于每次都得翻到最后一页；排序走服务端 sort 参数，因为分页也在服务端；
 *   6. 「提前結束」与「釋放房間」是两个事实，必须各自有入口：开过场的会（服务端已下发
 *      canFinish）走提前結束，不标爽约、纪要入口保留；無人到場才走釋放并计入爽约。
 *      曾经台账只给釋放，行政把提前散会当成释放，于是正常开会的人背了爽约记录。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, DatabaseOutlined, PlusOutlined,
  ReloadOutlined, RollbackOutlined, SearchOutlined, StopOutlined, SyncOutlined,
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import {
  cancelMeeting,
  fetchMeetings,
  finishMeeting,
  releaseMeeting,
  fetchMeetingRooms,
  toMeetingIso,
  type MeetingGroup,
  type MeetingQuery,
  type MeetingRoomVO,
  type MeetingStats,
  type MeetingVO,
} from '@/api/meeting'
import { bizTypeLabels, phaseMeta } from '../meetingMeta'
import { deriveCanRecordMinutes, hasMinutesRecord, minutesPathOf } from '../MeetingMinutes/minutesAccess'
import { useMeetingPhaseClock } from '../useMeetingPhaseClock'
import MeetingStatCards from '../MeetingStatCards'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

const EMPTY_STATS: MeetingStats = { total: 0, pending: 0, ongoing: 0, finished: 0, cancelled: 0, released: 0 }

const STATUS_OPTIONS = (t: TFunction) => [
  { value: 'booked', label: t('meeting.booked', { defaultValue: '已預約' }) },
  { value: 'checked_in', label: t('meeting.checkedIn', { defaultValue: '已簽到' }) },
  { value: 'finished', label: t('meeting.finished', { defaultValue: '已完成' }) },
  { value: 'cancelled', label: t('meeting.cancelled', { defaultValue: '已取消' }) },
  { value: 'released', label: t('meeting.released', { defaultValue: '已釋放' }) },
]

const GROUP_OPTIONS = (t: TFunction) => [
  { value: 'pending', label: t('meeting.upcoming', { defaultValue: '待開會' }) },
  { value: 'ongoing', label: t('meeting.ongoing', { defaultValue: '進行中' }) },
  { value: 'done', label: t('meeting.finished2', { defaultValue: '已結束' }) },
]

/** 列配置元数据（§E.3）：单号锁头、操作锁尾 */
const COLUMN_META = (t: TFunction) => [
  { key: 'bookingNo', title: t('meeting.bookingNo', { defaultValue: '單號' }) },
  { key: 'title', title: t('meeting.topic', { defaultValue: '主題' }) },
  { key: 'timeText', title: t('meeting.time', { defaultValue: '時間' }) },
  { key: 'roomName', title: t('meeting.meetingRoom', { defaultValue: '會議室' }) },
  { key: 'organizerName', title: t('meeting.organizer', { defaultValue: '組織者' }) },
  { key: 'departmentName', title: t('meeting.department', { defaultValue: '部門' }) },
  { key: 'attendeeCount', title: t('meeting.attendees', { defaultValue: '人數' }) },
  { key: 'bizType', title: t('meeting.type', { defaultValue: '類型' }) },
  { key: 'phase', title: t('meeting.status', { defaultValue: '狀態' }) },
  { key: 'remark', title: t('meeting.remark', { defaultValue: '備註' }) },
  { key: 'action', title: t('meeting.actions', { defaultValue: '操作' }) },
]

export default function BookingRecords() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission, user } = useAuth()
  const canEdit = hasPermission('meeting-record:edit')
  /** 纪要入口能力：本页以行政视野为主，canManageRecords 与 canEdit 同源 */
  const minutesCapability = {
    canRecordOwn: hasPermission('meeting-my:edit'),
    canManageRecords: canEdit,
  }

  const [rows, setRows] = useState<MeetingVO[]>([])
  const [stats, setStats] = useState<MeetingStats>(EMPTY_STATS)
  const [total, setTotal] = useState(0)
  const [rooms, setRooms] = useState<MeetingRoomVO[]>([])
  // sort 属于本页固定口径（台账倒序），不进搜索条件：重置/筛选都不应把它丢掉
  const [query, setQuery] = useState<MeetingQuery>({ page: 1, size: 20, scope: 'all', sort: 'time-desc' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [form] = Form.useForm()

  const { configComponent, applyConfig } = useColumnConfig('meeting-record', COLUMN_META(t), [
    { key: 'bookingNo', visible: true, locked: 'head' },
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetchMeetings(query)
      setRows(res.page?.records ?? [])
      setTotal(res.page?.total ?? 0)
      setStats(res.stats ?? EMPTY_STATS)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadBooking', { defaultValue: '預約記錄加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    // 房间候选用档案接口（行政可维护的全集），预约页的 options 只含可订房间
    void fetchMeetingRooms({ page: 1, size: 200 }).then(res => setRooms(res.page?.records ?? []))
      .catch(() => setRooms([]))
  }, [])

  const statsKey = useMemo(() => JSON.stringify(query), [query])

  // 阶段时钟：台账里的「進行中/待開會」同样是服务端按 now 算的，不刷新就会一直停在旧阶段，
  // 行政据此判断该不该去释放房间就会判错（2026-11-06 E2E 实测：必须手动刷新才变進行中）。
  useMeetingPhaseClock(rows, () => { void load() }, !loading)

  const search = () => {
    const values = form.getFieldsValue()
    const range = values.range as [Dayjs | null, Dayjs | null] | undefined
    setQuery(q => ({
      ...q,
      keyword: (values.keyword ?? '').trim() || undefined,
      roomId: values.roomId ?? undefined,
      status: values.status ?? undefined,
      group: (values.group ?? undefined) as MeetingGroup | undefined,
      from: range?.[0] ? toMeetingIso(range[0].startOf('day')) : undefined,
      to: range?.[1] ? toMeetingIso(range[1].endOf('day')) : undefined,
      page: 1,
    }))
  }

  const reset = () => {
    form.resetFields()
    setQuery({ page: 1, size: query.size ?? 20, scope: 'all', sort: 'time-desc' })
  }

  /** 代取消：必填原因，写入审计并附在通知里（§B.3 校验 → 弹框 → 接口） */
  const handleCancel = (record: MeetingVO) => {
    let reason = ''
    Modal.confirm({
      title: t('meeting.cancelThisMeetingOn', { defaultValue: '確認代組織者取消這場會議？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmProxyCancel', { defaultValue: '確認代取消' }),
      okButtonProps: { danger: true },
      cancelText: t('meeting.back', { defaultValue: '返回' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.labelTopic', { defaultValue: '會議主題：' })}</span><b>{record.title}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.bookingNo2', { defaultValue: '單號：' })}</span><b>{record.bookingNo}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.time2', { defaultValue: '時間：' })}</span><b>{record.timeText}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.labelRoom', { defaultValue: '會議室：' })}</span><b>{record.roomName}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.organizer2', { defaultValue: '組織者：' })}</span><b>{record.organizerName}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.proxyCancelImpact', { defaultValue: '通知組織者與全體參會人（需已開啟通知場景），窗口立刻還給他人' })}</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.cancellationReasonRequired', { defaultValue: '取消原因（必填）' })}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGOrganizerAbsent', { defaultValue: '如 組織者請假／會議改期' })}
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning(t('meeting.pleaseEnterTheCancellation', { defaultValue: '請填寫取消原因' }))
          // 抛出以阻止弹窗关闭：原因没填就放行，等于允许无凭据取消他人的会
          throw new Error('reason required')
        }
        await cancelMeeting(record.id, { reason: reason.trim(), version: record.version })
        message.success(t('meeting.meetingCancelledOnBehalf', { defaultValue: '已代組織者取消會議' }))
        void load()
      },
    })
  }

  /** 提前結束：会真的开过、只是提前收尾。与「釋放房間」分开——释放等于無人到場，
   *  把开过的会记成爽约会虚增次数（可能把人推向自动拉黑阈值）并吃掉纪要入口 */
  const handleFinish = (record: MeetingVO) => {
    let note = ''
    Modal.confirm({
      title: t('meeting.finishThisMeetingEarly', { defaultValue: '確認提前結束這場會議？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmFinish', { defaultValue: '確認結束' }),
      cancelText: t('meeting.back', { defaultValue: '返回' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.labelTopic', { defaultValue: '會議主題：' })}</span><b>{record.title}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.bookingNo2', { defaultValue: '單號：' })}</span><b>{record.bookingNo}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.time2', { defaultValue: '時間：' })}</span><b>{record.timeText}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.labelRoom', { defaultValue: '會議室：' })}</span><b>{record.roomName}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.finishEarlyNoShowNote', { defaultValue: '提前結束不計入爽約統計，參會名單與紀要入口保持可用' })}</b></div>
          {/* 与详情页同口径：散会说明选填但给得出入口，两边不能一个能写一个不能写 */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.finishNoteOptional', { defaultValue: '散會說明（選填，會寫入審計並附在通知裡）' })}</div>
            <Input.TextArea
              rows={2}
              maxLength={300}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGTopicsSettledEarly', { defaultValue: '例：議題已全部結論，提前散會' })}
              onChange={(e) => { note = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        await finishMeeting(record.id, note.trim() || undefined)
        message.success(t('meeting.meetingFinished', { defaultValue: '會議已結束' }))
        void load()
      },
    })
  }

  /** 释放房间：与代取消分开——释放针对"已开始却无人到场"，会计入爽约 */
  const handleRelease = (record: MeetingVO) => {
    let reason = ''
    Modal.confirm({
      title: t('meeting.releaseThisMeetingRoom', { defaultValue: '確認釋放這間會議室？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
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
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.releaseReasonRequired', { defaultValue: '釋放原因（必填）' })}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGNoOne', { defaultValue: '如 開始 20 分鐘無人到場' })}
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning(t('meeting.pleaseEnterTheRelease', { defaultValue: '請填寫釋放原因' }))
          throw new Error('reason required')
        }
        await releaseMeeting(record.id, { reason: reason.trim(), version: record.version })
        message.success(t('meeting.meetingRoomReleased', { defaultValue: '會議室已釋放' }))
        void load()
      },
    })
  }

  const columns: TableColumnsType<MeetingVO> = [
    { title: t('meeting.bookingNo', { defaultValue: '單號' }), dataIndex: 'bookingNo', key: 'bookingNo', width: 150, fixed: 'left', ellipsis: true },
    {
      title: t('meeting.topic', { defaultValue: '主題' }), dataIndex: 'title', key: 'title', width: 220, ellipsis: true,
      render: (value: string, record) => <a onClick={() => navigate(`/meeting-detail?id=${record.id}`)}>{value}</a>,
    },
    {
      title: t('meeting.time', { defaultValue: '時間' }), key: 'timeText', width: 190,
      render: (_, record) => (
        <div>
          <div>{record.timeText}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{t('meeting.minutesUnit', { count: record.durationMinutes, defaultValue: '{{count}} 分鐘' })}</div>
        </div>
      ),
    },
    {
      title: t('meeting.meetingRoom', { defaultValue: '會議室' }), key: 'roomName', width: 180,
      render: (_, record) => (
        <div>
          <div>{record.roomName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{record.roomLocation}</div>
        </div>
      ),
    },
    {
      title: t('meeting.organizer', { defaultValue: '組織者' }), dataIndex: 'organizerName', key: 'organizerName', width: 130,
      // 台账里"谁点的提交"与"这间房给谁用"必须同时可见：只看组织者会把 20 场代订误读成行政自己在开会
      render: (v: string, record) => (record.delegateForName ? (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('meeting.proxyForUser', { name: record.delegateForName, defaultValue: `代 ${record.delegateForName} 預訂` })}</span>
        </Space>
      ) : v),
    },
    {
      title: t('meeting.department', { defaultValue: '部門' }), dataIndex: 'departmentName', key: 'departmentName', width: 140,
      render: (v?: string | null) => v || '-',
    },
    {
      title: t('meeting.attendees', { defaultValue: '人數' }), key: 'attendeeCount', width: 80,
      render: (_, record) => t('meeting.headcount', { count: record.attendeeCount ?? 0, defaultValue: '{{count}} 人' }),
    },
    {
      title: t('meeting.type', { defaultValue: '類型' }), key: 'bizType', width: 100,
      render: (_, record) => bizTypeLabels()[record.bizType] ?? record.bizType,
    },
    {
      title: t('meeting.status', { defaultValue: '狀態' }), key: 'phase', width: 120,
      render: (_, record) => {
        const meta = phaseMeta(record.phase)
        return (
          <Space direction="vertical" size={2}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {record.noShow === 1 && <Tag color="red">{t('meeting.noShow', { defaultValue: '爽約' })}</Tag>}
          </Space>
        )
      },
    },
    {
      title: t('meeting.remark', { defaultValue: '備註' }), key: 'remark', width: 200, ellipsis: true,
      render: (_, record) => (
        <span style={{ fontSize: 12, color: '#8C8C8C' }} title={record.cancelReason ?? record.releaseReason ?? ''}>
          {record.cancelReason
            ? t('meeting.cancelReasonPrefix', { reason: record.cancelReason, defaultValue: `取消：${record.cancelReason}` })
            : record.releaseReason
              ? t('meeting.releaseReasonPrefix', { reason: record.releaseReason, defaultValue: `釋放：${record.releaseReason}` })
              : '-'}
        </span>
      ),
    },
    {
      title: t('meeting.actions', { defaultValue: '操作' }), key: 'action', width: 250, fixed: 'right',
      // 操作列（§B.9）：纯文本 + action-split 分隔，详情在前、危险操作在后
      render: (_, record) => (
        <Space size={0} wrap split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/meeting-detail?id=${record.id}`)}>{t('meeting.detail', { defaultValue: '詳情' })}</Button>
          {/* 编辑：只看服务端 canEdit（未开始 + 可写身份），前端不复算窗口口径 */}
          {canEdit && record.canEdit && (
            <Button type="link" size="small" onClick={() => navigate(`/meeting-booking-form?bookingId=${record.id}&from=${encodeURIComponent('/meeting-record')}`)}>{t('meeting.edit', { defaultValue: '編輯' })}</Button>
          )}
          {/* 纪要：行政可代录，口径与详情页一致（不能出现详情有、记录列没有） */}
          {deriveCanRecordMinutes(record, minutesCapability) && (
            <Button type="link" size="small" onClick={() => navigate(minutesPathOf(record))}>
              {hasMinutesRecord(record)
                ? t('meeting.minutes.viewShort', { defaultValue: '查看紀要' })
                : t('meeting.minutes.recordShort', { defaultValue: '錄入紀要' })}
            </Button>
          )}
          {/* 提前結束：开过的会走这里收尾（不标爽约）；按钮口径只看服务端 canFinish */}
          {canEdit && record.canFinish && (
            <Button type="link" size="small" onClick={() => handleFinish(record)}>{t('meeting.finishEarly', { defaultValue: '提前結束' })}</Button>
          )}
          {canEdit && record.canRelease && (
            <Button type="link" size="small" onClick={() => handleRelease(record)}>{t('meeting.releaseRoom', { defaultValue: '釋放房間' })}</Button>
          )}
          {canEdit && record.canCancel && (
            // 「代取消」只用于取消别人的会：台账是行政视野，但行政自己办的会也在表里，
            // 对自己办的会写「代取消」会让行政误以为要走一套额外的授权（2026-11-06 E2E 实测）。
            // 接口与必填原因完全一致，只是把语义说准。
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>
              {record.organizerId === user?.id
                ? t('meeting.cancelMeeting', { defaultValue: '取消會議' })
                : t('meeting.proxyCancel', { defaultValue: '代取消' })}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {error && (
        <Alert
          type="error"
          showIcon
          message={t('meeting.failedToLoadBooking', { defaultValue: '預約記錄加載失敗' })}
          description={error}
          style={{ marginBottom: 16 }}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>}
        />
      )}

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('meeting.meetingTime', { defaultValue: '會議時間' })} name="range">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('meeting.meetingRoom', { defaultValue: '會議室' })} name="roomId">
            <Select
              placeholder={t('meeting.allMeetingRooms', { defaultValue: '全部會議室' })}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={rooms.map(r => ({ value: r.id, label: `${r.roomName}（${r.roomNo}）` }))}
            />
          </Form.Item>
          <Form.Item label={t('meeting.status', { defaultValue: '狀態' })} name="status">
            <Select placeholder={t('meeting.allStatuses', { defaultValue: '全部狀態' })} allowClear style={{ width: '100%' }} options={STATUS_OPTIONS(t)} />
          </Form.Item>
          <Form.Item label={t('meeting.group', { defaultValue: '分組' })} name="group">
            <Select placeholder={t('meeting.allGroups', { defaultValue: '全部分組' })} allowClear style={{ width: '100%' }} options={GROUP_OPTIONS(t)} />
          </Form.Item>
          <Form.Item label={t('meeting.keyword', { defaultValue: '關鍵字' })} name="keyword">
            <Input placeholder={t('meeting.bookingNoTopic', { defaultValue: '單號／主題' })} allowClear style={{ width: '100%' }} onPressEnter={search} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={search}>{t('meeting.search', { defaultValue: '查詢' })}</Button>
              <Button icon={<ReloadOutlined />} onClick={reset}>{t('meeting.reset', { defaultValue: '重置' })}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：必须在搜索区之后（§E.8），六项口径由服务端按当前条件一次返回 */}
      <MeetingStatCards key={statsKey} loading={loading} items={[
        { icon: <DatabaseOutlined />, color: '#1890FF', bg: '#E6F7FF', value: stats.total, label: t('meeting.matchingMeetings', { defaultValue: '符合條件會議數' }), hint: t('meeting.followsTimeRoomStatus', { defaultValue: '隨時間／會議室／狀態篩選變化' }) },
        { icon: <ClockCircleOutlined />, color: '#722ED1', bg: '#F9F0FF', value: stats.pending, label: t('meeting.upcoming', { defaultValue: '待開會' }) },
        { icon: <SyncOutlined />, color: '#E8720C', bg: '#FFF7E6', value: stats.ongoing, label: t('meeting.ongoing', { defaultValue: '進行中' }) },
        { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats.finished, label: t('meeting.finished', { defaultValue: '已完成' }) },
        { icon: <StopOutlined />, color: '#8C8C8C', bg: '#FAFAFA', value: stats.cancelled, label: t('meeting.cancelled', { defaultValue: '已取消' }) },
        { icon: <RollbackOutlined />, color: '#FF4D4F', bg: '#FFF1F0', value: stats.released, label: t('meeting.releasedNoShow', { defaultValue: '已釋放（爽約）' }) },
      ]} />

      {/* 操作区（§E.2）：右侧只放「新增」与列配置 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/meeting-booking')}>{t('meeting.bookAMeeting', { defaultValue: '預約新會議' })}</Button>
          {configComponent}
        </div>
      </div>

      <Table<MeetingVO>
        rowKey="id"
        columns={applyConfig(columns)}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 'max-content' }}
        size="middle"
        pagination={{
          current: query.page,
          pageSize: query.size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: count => t('meeting.totalMeetings', { count, defaultValue: '共 {{count}} 場' }),
          // pageSize 变化必须回到第 1 页，否则会停在一个可能不存在的页码上
          onChange: (page, size) => setQuery(q => ({ ...q, page: size !== q.size ? 1 : page, size: size || 20 })),
        }}
      />
    </div>
  )
}
