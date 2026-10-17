/**
 * 我的会议（会议管理 → 會議中心 → 我的會議）
 *
 * 三个入口共用同一批接口，只是范围参数不同：
 *   - 今日日程：GET /meeting/my/schedule?date= （组织者也是参会人行，一次 JOIN 覆盖我发起+我参与）
 *   - 分页清单：GET /meeting/bookings?scope=mine|attended&group=pending|ongoing|done
 *   - 顶部摘要：GET /meeting/my/summary（首页工作台卡片复用）
 *
 * 「待我響應」只列我作为参会人且尚未表态的邀约：组织者不该给自己响应，外部人无账号，
 * 这一条判定由服务端给出，前端不重复实现（重复一次就多一处会漂移的口径）。
 *
 * 界面口径：
 *   1. 「日程日期」只影响上方的今日日程面板，不影响下方列表——所以它放在日程面板里，
 *      不放进搜索区：混在搜索区会让人以为改了日期表格也会跟着变；
 *   2. Tab 属于筛选的一部分，紧贴搜索区；统计卡片在其后（§E.8）；
 *   3. 取消必填原因，写入审计并附在通知里。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalendarOutlined, FolderOpenOutlined, HourglassOutlined, NotificationOutlined,
  PlusOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  cancelMeeting,
  checkinMeeting,
  fetchMeetings,
  finishMeeting,
  fetchMyMeetingSummary,
  fetchMySchedule,
  respondMeeting,
  type MeetingQuery,
  type MeetingScheduleVO,
  type MeetingStats,
  type MeetingVO,
} from '../../../api/meeting'
import { phaseMeta, statusMeta } from '../meetingMeta'
import MeetingStatCards from '../MeetingStatCards'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

const EMPTY_STATS: MeetingStats = { total: 0, pending: 0, ongoing: 0, finished: 0, cancelled: 0, released: 0 }

/** 列配置元数据（§E.3）：时间锁头、操作锁尾 */
const COLUMN_META = (t: TFunction) => [
  { key: 'timeText', title: t('meeting.time', { defaultValue: '時間' }) },
  { key: 'title', title: t('meeting.topic', { defaultValue: '主題' }) },
  { key: 'roomName', title: t('meeting.meetingRoom', { defaultValue: '會議室' }) },
  { key: 'organizerName', title: t('meeting.organizer', { defaultValue: '組織者' }) },
  { key: 'attendeeCount', title: t('meeting.attendees3', { defaultValue: '參會' }) },
  { key: 'myRole', title: t('meeting.myRole', { defaultValue: '我的身份' }) },
  { key: 'phase', title: t('meeting.status', { defaultValue: '狀態' }) },
  { key: 'action', title: t('meeting.actions', { defaultValue: '操作' }) },
]

export default function MyMeeting() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [day, setDay] = useState<Dayjs>(dayjs())
  const [agenda, setAgenda] = useState<MeetingScheduleVO[]>([])
  const [summary, setSummary] = useState({ todayCount: 0, upcomingCount: 0, pendingResponseCount: 0 })
  const [tab, setTab] = useState<'todo' | 'mine' | 'attended' | 'done'>('todo')
  const [rows, setRows] = useState<MeetingVO[]>([])
  const [stats, setStats] = useState<MeetingStats>(EMPTY_STATS)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<MeetingQuery>({ page: 1, size: 10, scope: 'attended' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [form] = Form.useForm()

  const { configComponent, applyConfig } = useColumnConfig('meeting-my', COLUMN_META(t), [
    { key: 'timeText', visible: true, locked: 'head' },
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const loadAgenda = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([fetchMySchedule(day.format('YYYY-MM-DD')), fetchMyMeetingSummary()])
      setAgenda(list ?? [])
      setSummary({
        todayCount: sum.todayCount ?? 0,
        upcomingCount: sum.upcomingCount ?? 0,
        pendingResponseCount: sum.pendingResponseCount ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe3', { defaultValue: '日程加載失敗' }))
    }
  }, [day])

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const scoped: MeetingQuery = buildQuery(tab, query)
      const res = await fetchMeetings(scoped)
      setRows(res.page?.records ?? [])
      setTotal(res.page?.total ?? 0)
      setStats(res.stats ?? EMPTY_STATS)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe4', { defaultValue: '會議列表加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [tab, query])

  useEffect(() => { void loadAgenda() }, [loadAgenda])
  useEffect(() => { void loadList() }, [loadList])

  const refresh = () => { void loadAgenda(); void loadList() }

  const statsKey = useMemo(() => `${tab}-${JSON.stringify(query)}`, [tab, query])

  const search = () => {
    const values = form.getFieldsValue()
    setQuery(q => ({
      ...q,
      keyword: (values.keyword ?? '').trim() || undefined,
      group: values.group && values.group !== 'all' ? values.group : undefined,
      page: 1,
    }))
  }

  const reset = () => {
    form.resetFields()
    setQuery({ page: 1, size: query.size ?? 10, scope: 'attended' })
  }

  const handleRespond = async (record: MeetingVO, accept: boolean) => {
    try {
      await respondMeeting(record.id, { accept })
      message.success(accept ? t('meeting.invitationAccepted', { defaultValue: '已接受邀約' }) : t('meeting.invitationDeclined', { defaultValue: '已婉拒邀約' }))
      refresh()
    } catch (e) {
      // request.ts 已统一弹出错误，这里只留日志，避免双弹
      console.warn(t('meeting.failedToRespond', { defaultValue: '響應邀約失敗' }), e instanceof Error ? e.message : e)
    }
  }

  /**
   * 签到/提前结束共用一个执行器：两者的失败处理与刷新语义完全相同（都要重取服务端状态），
   * 复制两份迟早出现"一个刷新了列表、另一个没有"。
   */
  const act = async (id: number, fn: (id: number) => Promise<unknown>, okText: string) => {
    try {
      await fn(id)
      message.success(okText)
      refresh()
    } catch (e) {
      console.warn(t('meeting.meetingOperationFailed', { defaultValue: '會議操作失敗' }), e instanceof Error ? e.message : e)
    }
  }

  /** 提前结束会把房间立刻还给他人，属于不可逆操作：必须二次确认（§B.3） */
  const handleFinish = (record: MeetingVO) => {
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
      onOk: () => act(record.id, finishMeeting, t('meeting.meetingFinished', { defaultValue: '會議已結束' })),
    })
  }

  /** 取消：必填原因，写入审计并附在通知里（校验 → 弹框 → 接口） */
  const handleCancel = (record: MeetingVO) => {
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
          <div className="confirm-info-row"><span>{t('meeting.status2', { defaultValue: '狀態：' })}</span><b>{statusMeta(record.status).label}</b></div>
          {/* 通知是否真的送达成于场景开关，不能把话说死成“会收到”（曾经与实际不符） */}
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.theSlotIsReleased', { defaultValue: '房間窗口立即歸還；若已開啟釘釘通知場景，參會人會收到取消告知' })}</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.cancellationReasonRequired', { defaultValue: '取消原因（必填）' })}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGAgendaDropped2', { defaultValue: '如 議程取消／改期另約' })}
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning(t('meeting.pleaseEnterTheCancellation', { defaultValue: '請填寫取消原因' }))
          // 抛出以阻止弹窗关闭：原因没填就放行，等于允许无凭据取消会议
          throw new Error('reason required')
        }
        await cancelMeeting(record.id, { reason: reason.trim(), version: record.version })
        message.success(t('meeting.meetingCancelledTheRoom', { defaultValue: '會議已取消，房間窗口已歸還' }))
        refresh()
      },
    })
  }

  const columns: TableColumnsType<MeetingVO> = [
    {
      title: t('meeting.time', { defaultValue: '時間' }), key: 'timeText', width: 200, fixed: 'left',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.timeText}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{t('meeting.minutesUnit', { count: record.durationMinutes, defaultValue: '{{count}} 分鐘' })}</div>
        </div>
      ),
    },
    {
      title: t('meeting.topic', { defaultValue: '主題' }), dataIndex: 'title', key: 'title', width: 240, ellipsis: true,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <a onClick={() => navigate(`/meeting-detail?id=${record.id}`)}>{value}</a>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.bookingNo}</span>
        </Space>
      ),
    },
    {
      title: t('meeting.meetingRoom', { defaultValue: '會議室' }), key: 'roomName', width: 200,
      render: (_, record) => (
        <div>
          <div>{record.roomName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{record.roomLocation}</div>
        </div>
      ),
    },
    { title: t('meeting.organizer', { defaultValue: '組織者' }), dataIndex: 'organizerName', key: 'organizerName', width: 110 },
    {
      title: t('meeting.attendees3', { defaultValue: '參會' }), key: 'attendeeCount', width: 90,
      render: (_, record) => t('meeting.headcount', { count: record.attendeeCount ?? 0, defaultValue: '{{count}} 人' }),
    },
    {
      title: t('meeting.myRole', { defaultValue: '我的身份' }), key: 'myRole', width: 110,
      render: (_, record) => (
        <Tag color={record.myRole === 'organizer' ? 'blue' : record.myRole === 'none' ? 'default' : 'green'}>
          {roleLabel(t, record.myRole)}
        </Tag>
      ),
    },
    {
      title: t('meeting.status', { defaultValue: '狀態' }), key: 'phase', width: 110,
      render: (_, record) => {
        const meta = phaseMeta(record.phase)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: t('meeting.actions', { defaultValue: '操作' }), key: 'action', width: 300, fixed: 'right',
      // 操作列（§B.9）：纯文本 + action-split 分隔，详情在前、危险操作（取消）在最后
      render: (_, record) => (
        <Space size={0} wrap split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/meeting-detail?id=${record.id}`)}>{t('meeting.detail', { defaultValue: '詳情' })}</Button>
          {record.myRole !== 'organizer' && record.status === 'booked' && record.myResponse === 'pending' && (
            <>
              <Button type="link" size="small" onClick={() => void handleRespond(record, true)}>{t('meeting.accept', { defaultValue: '接受' })}</Button>
              <Button type="link" size="small" onClick={() => void handleRespond(record, false)}>{t('meeting.decline', { defaultValue: '婉拒' })}</Button>
            </>
          )}
          {record.canCheckin && (
            <Button type="link" size="small" onClick={() => void act(record.id, checkinMeeting, t('meeting.checkedIn', { defaultValue: '已簽到' }))}>{t('meeting.checkIn', { defaultValue: '簽到' })}</Button>
          )}
          {record.canFinish && (
            <Button type="link" size="small" onClick={() => handleFinish(record)}>{t('meeting.finishEarly', { defaultValue: '提前結束' })}</Button>
          )}
          {record.canCancel && (
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>{t('meeting.cancel', { defaultValue: '取消' })}</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 页面说明横幅：把"我能看到什么、能做什么"写在最前面，减少权限相关的答疑 */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('meeting.onlyMeetingsRelatedTo', { defaultValue: '這裡只顯示與你相關的會議：你發起的、你被邀請的' })}
        description={t('meeting.theOrganizerCanReschedule', { defaultValue: '組織者可改期與取消，參會人僅能響應邀約、簽到與查看。開啟簽到保留的會議，開始後超過保留分鐘未簽到將被行政或系統釋放。' })}
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={t('meeting.failedToLoadData', { defaultValue: '數據加載失敗' })}
          description={error}
          style={{ marginBottom: 16 }}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={refresh}>{t('meeting.retry', { defaultValue: '重試' })}</Button>}
        />
      )}

      {/* 今日日程：日期选择器放在面板内，因为它只影响这块，不影响下方列表 */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#FAFAFA', border: '1px solid #F0F0F0', borderRadius: 8 }}>
        <Space style={{ marginBottom: 8 }} wrap>
          <strong style={{ fontSize: 13, color: '#262626' }}>{t('meeting.mySchedule', { defaultValue: '我的日程' })}</strong>
          <DatePicker value={day} allowClear={false} size="small"
            disabledDate={current => !!current && current < dayjs().startOf('day')}
            onChange={value => value && setDay(value)} />
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('meeting.sessionCount', { count: agenda.length, defaultValue: '{{count}} 場' })}</span>
        </Space>
        {agenda.length === 0 ? (
          <div style={{ color: '#8C8C8C', fontSize: 12 }}>{t('meeting.noMeetingRelatedTo', { defaultValue: '這一天沒有與你相關的會議' })}</div>
        ) : (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {agenda.map(item => (
              <Space key={item.bookingId} size={8} wrap>
                <span style={{ fontSize: 12, color: '#595959', minWidth: 110 }}>
                  {item.startTime.slice(11, 16)}–{item.endTime.slice(11, 16)}
                </span>
                <a onClick={() => navigate(`/meeting-detail?id=${item.bookingId}`)}>{item.title}</a>
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>{item.roomName}</span>
                <Tag color={phaseMeta(item.phase).color}>{phaseMeta(item.phase).label}</Tag>
                {item.myResponse === 'pending' && <Tag color="orange">{t('meeting.pendingResponse', { defaultValue: '待響應' })}</Tag>}
              </Space>
            ))}
          </Space>
        )}
      </div>

      <div className="search-section">
        <Form form={form} layout="inline" initialValues={{ group: query.group ?? 'all' }}>
          <Form.Item label={t('meeting.keyword', { defaultValue: '關鍵字' })} name="keyword">
            <Input placeholder={t('meeting.bookingNoTopic', { defaultValue: '單號／主題' })} allowClear style={{ width: '100%' }} onPressEnter={search} />
          </Form.Item>
          <Form.Item label={t('meeting.group', { defaultValue: '分組' })} name="group">
            <Select
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: t('meeting.allStatuses', { defaultValue: '全部狀態' }) },
                { value: 'pending', label: t('meeting.upcoming', { defaultValue: '待開會' }) },
                { value: 'ongoing', label: t('meeting.ongoing', { defaultValue: '進行中' }) },
                { value: 'done', label: t('meeting.finished2', { defaultValue: '已結束' }) },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={search}>{t('meeting.search', { defaultValue: '查詢' })}</Button>
              <Button icon={<ReloadOutlined />} onClick={reset}>{t('meeting.reset', { defaultValue: '重置' })}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* Tab 属于筛选的一部分，紧贴搜索区；统计卡片仍在其后（§E.8） */}
      <Tabs
        activeKey={tab}
        onChange={key => { setTab(key as typeof tab); setQuery(q => ({ ...q, page: 1 })) }}
        items={[
          { key: 'todo', label: summary.pendingResponseCount
            ? `${t('meeting.waitingForMe', { defaultValue: '待我響應' })}（${summary.pendingResponseCount}）`
            : t('meeting.waitingForMe', { defaultValue: '待我響應' }) },
          { key: 'mine', label: t('meeting.organizedByMe', { defaultValue: '我發起的' }) },
          { key: 'attended', label: t('meeting.iAttend', { defaultValue: '我參與的' }) },
          { key: 'done', label: t('meeting.finished2', { defaultValue: '已結束' }) },
        ]}
      />

      <MeetingStatCards key={statsKey} loading={loading} items={[
        { icon: <CalendarOutlined />, color: '#1890FF', bg: '#E6F7FF', value: summary.todayCount, label: t('meeting.today', { defaultValue: '今日會議' }), hint: t('meeting.organizedByMePlus', { defaultValue: '我發起 + 我參與，按開始日期統計' }) },
        { icon: <HourglassOutlined />, color: '#E8720C', bg: '#FFF7E6', value: summary.upcomingCount, label: t('meeting.meetingsInTheNext', { defaultValue: '未來 7 天會議' }) },
        { icon: <NotificationOutlined />, color: '#722ED1', bg: '#F9F0FF', value: summary.pendingResponseCount, label: t('meeting.waitingForMe', { defaultValue: '待我響應' }) },
        { icon: <FolderOpenOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats.total, label: t('meeting.meetingsUnderCurrentFilters', { defaultValue: '當前條件會議數' }) },
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
          onChange: (page, size) => setQuery(q => ({ ...q, page: size !== q.size ? 1 : page, size: size || 10 })),
        }}
      />
    </div>
  )
}

/** Tab → 服务端范围参数：口径由后端解释，前端只表达"我要看哪一类" */
function buildQuery(tab: string, base: MeetingQuery): MeetingQuery {
  const withoutDerived = { ...base }
  delete withoutDerived.scope
  delete withoutDerived.group
  delete withoutDerived.respond
  switch (tab) {
    case 'todo':
      // 「待我響應」按响应态筛，而不是按会议阶段筛：group=pending 是“待開會”，
      // 会把我自己组织的会也列进来，与同页「待我響應」徽标（后台算的是未响应邀约数）永远对不上
      return { ...withoutDerived, scope: 'attended', respond: 'pending' }
    case 'mine':
      return { ...withoutDerived, scope: 'mine' }
    case 'attended':
      return { ...withoutDerived, scope: 'attended' }
    case 'done':
      return { ...withoutDerived, scope: 'attended', group: 'done' }
    default:
      return withoutDerived
  }
}

function roleLabel(t: TFunction, role?: string | null): string {
  switch (role) {
    case 'organizer': return t('meeting.organizer', { defaultValue: '組織者' })
    case 'required': return t('meeting.required', { defaultValue: '必參' })
    case 'optional': return t('meeting.optional', { defaultValue: '選參' })
    case 'external': return t('meeting.external', { defaultValue: '外部' })
    default: return t('meeting.unrelated', { defaultValue: '無關' })
  }
}
