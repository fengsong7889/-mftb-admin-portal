/**
 * 我的会议（会议管理 → 我的會議，v1.3 拍平后为一级菜单）
 *
 * 列表与日历共用同一批接口，只是范围参数与呈现形态不同：
 *   - 分页清单 / 日历月取数：GET /meeting/bookings?scope=mine|attended&group=...
 *     （日历在列表口径之上再加 from/to 月份窗，复用重叠语义）
 *   - 顶部摘要：GET /meeting/my/summary（首页工作台卡片与本頁统计卡复用）
 *
 * 界面口径：
 *   1. 默认日历视图，列表只是呈现形态切换，口径不变；
 *   2. Tab 属于筛选的一部分，紧贴搜索区，统计卡片在其后（§E.8）；「我參與的」为默认 Tab，
 *      我发起的与我被邀请的会议一并列在其中；
 *   3. 只要会议没开始（phase=pending），参会人就能确认或婉拒参会，且开始前可改表态：
 *      后端 respond 接口本就允许覆盖响应，前端只收窄按钮展示窗口、不放宽；
 *   4. 取消必填原因，写入审计并附在通知里。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Form, Input, Modal, Segmented, Select, Space, Spin, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalendarOutlined, FolderOpenOutlined, HourglassOutlined, LeftOutlined, NotificationOutlined,
  PlusOutlined, ReloadOutlined, RightOutlined, SearchOutlined, UnorderedListOutlined,
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
  respondMeeting,
  toMeetingIso,
  type MeetingQuery,
  type MeetingStats,
  type MeetingVO,
} from '../../../api/meeting'
import { phaseMeta, statusMeta } from '../meetingMeta'
import MeetingStatCards from '../MeetingStatCards'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import './index.css'

const EMPTY_STATS: MeetingStats = { total: 0, pending: 0, ongoing: 0, finished: 0, cancelled: 0, released: 0 }

/**
 * 日历圆点色：与 phaseMeta 的 Tag 语义一一对应（蓝=待開會、品牌橙=進行中、绿=已结束、
 * 灰=已取消、警告橙=已釋放），色值全部取自设计令牌（§A.1），不引新色。
 */
const PHASE_DOT: Record<string, string> = {
  pending: '#1890FF',
  ongoing: '#E8720C',
  ended: '#52C41A',
  finished: '#52C41A',
  cancelled: '#D9D9D9',
  released: '#FA8C16',
}

/** 图例只列会出现在格子上的五种阶段态 */
const CALENDAR_LEGEND_PHASES = ['pending', 'ongoing', 'ended', 'cancelled', 'released']

const phaseDot = (phase?: string | null): string => PHASE_DOT[phase ?? ''] ?? '#D9D9D9'

/** 日历会议条样式变体：finished 与 ended 共用绿色变体，未知阶段回落待開會 */
const phaseChipVariant = (phase?: string | null): string => {
  if (phase === 'finished') return 'ended'
  return phase && phase in PHASE_DOT ? phase : 'pending'
}

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
  const [summary, setSummary] = useState({ todayCount: 0, upcomingCount: 0, pendingResponseCount: 0 })
  // 默认 Tab 为「我參與的」：我发起的与我被邀请的会议一并列在其中，不再单设「待我響應」入口
  const [tab, setTab] = useState<'mine' | 'attended' | 'done'>('attended')
  const [rows, setRows] = useState<MeetingVO[]>([])
  const [stats, setStats] = useState<MeetingStats>(EMPTY_STATS)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<MeetingQuery>({ page: 1, size: 10, scope: 'attended' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [form] = Form.useForm()
  // 视图模式：列表表格 vs 月历，默认日历视图。日历复用同一批筛选口径，两个视图的数字永远对得上
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar')
  // 选中日与面板月共用一个值：点日期既切当日日程，也驱动面板所在月
  const [calValue, setCalValue] = useState<Dayjs>(dayjs())
  const [calRows, setCalRows] = useState<MeetingVO[]>([])
  const [calLoading, setCalLoading] = useState(false)

  const { configComponent, applyConfig } = useColumnConfig('meeting-my', COLUMN_META(t), [
    { key: 'timeText', visible: true, locked: 'head' },
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const loadSummary = useCallback(async () => {
    try {
      const sum = await fetchMyMeetingSummary()
      setSummary({
        todayCount: sum.todayCount ?? 0,
        upcomingCount: sum.upcomingCount ?? 0,
        pendingResponseCount: sum.pendingResponseCount ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadData', { defaultValue: '數據加載失敗' }))
    }
  }, [])

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

  // 日历月取数口径 = 列表口径 + 月份窗：后端 from/to 是重叠语义（end_time >= from AND start_time <= to），
  // size 取分页上限 200；单月超上限属于异常数据量，日历不再为其做二次分页
  const calMonthKey = calValue.format('YYYY-MM')
  const loadCalendar = useCallback(async () => {
    setCalLoading(true)
    try {
      const month = dayjs(`${calMonthKey}-01`)
      const scoped = buildQuery(tab, { page: 1, size: 200, keyword: query.keyword, group: query.group })
      const res = await fetchMeetings({
        ...scoped,
        from: toMeetingIso(month.startOf('month')),
        to: toMeetingIso(month.endOf('month')),
      })
      setCalRows(res.page?.records ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe4', { defaultValue: '會議列表加載失敗' }))
    } finally {
      setCalLoading(false)
    }
  }, [calMonthKey, tab, query.keyword, query.group])

  useEffect(() => { void loadSummary() }, [loadSummary])
  useEffect(() => { void loadList() }, [loadList])
  useEffect(() => { if (viewMode === 'calendar') void loadCalendar() }, [loadCalendar, viewMode])

  /** 按开始日期分组并排序：月历格子与当日日程面板共用这一份，不各自再算一遍 */
  const calByDate = useMemo(() => {
    const map: Record<string, MeetingVO[]> = {}
    for (const row of calRows) {
      const key = row.startTime.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(row)
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return map
  }, [calRows])

  /** 6 周 × 7 天固定网格、週日开头：手工推算不依赖 dayjs locale，表头与格子不会错位 */
  const calCells = useMemo(() => {
    const first = dayjs(`${calMonthKey}-01`)
    const start = first.subtract(first.day(), 'day')
    return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'))
  }, [calMonthKey])

  const weekdays = t('meeting.calendarWeekdays', { returnObjects: true }) as string[]
  const dayList = calByDate[calValue.format('YYYY-MM-DD')] ?? []

  // 操作后的刷新必须覆盖日历：否则在当日日程里响应邀约后，网格上的标签还是旧状态
  const refresh = () => {
    void loadSummary()
    void loadList()
    if (viewMode === 'calendar') void loadCalendar()
  }

  // 口径快照带上视图与月份：翻月/切视图时统计卡重挂载、重跑计数动画（§E.8）
  const statsKey = useMemo(() => `${tab}-${JSON.stringify(query)}-${viewMode}-${calMonthKey}`, [tab, query, viewMode, calMonthKey])

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

  /** 操作集合由列表操作列与日历当日日程行共用：只留一份，两个入口的按钮显隐口径不会漂移 */
  const renderActions = (record: MeetingVO) => (
    // 操作列（§B.9）：纯文本 + action-split 分隔，详情在前、危险操作（取消）在最后
    <Space size={0} wrap split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => navigate(`/meeting-detail?id=${record.id}`)}>{t('meeting.detail', { defaultValue: '詳情' })}</Button>
      {/* 没开始就能确认或婉拒，且开始前可改表态：只看 phase，不看已有响应 */}
      {record.myRole !== 'organizer' && record.myRole !== 'none' && record.phase === 'pending' && (
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
  )

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
      render: (_, record) => renderActions(record),
    },
  ]

  return (
    <div className="content-area">
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
        // 视图切换放 Tab 栏右侧：它是呈现形态开关而非筛选口径，不占操作区（§E.2 只允许新增与列配置）
        tabBarExtraContent={
          <Segmented
            value={viewMode}
            onChange={value => setViewMode(value as 'list' | 'calendar')}
            options={[
              { value: 'list', label: t('meeting.listView', { defaultValue: '列表視圖' }), icon: <UnorderedListOutlined /> },
              { value: 'calendar', label: t('meeting.calendarView', { defaultValue: '日曆視圖' }), icon: <CalendarOutlined /> },
            ]}
          />
        }
        items={[
          { key: 'mine', label: t('meeting.organizedByMe', { defaultValue: '我發起的' }) },
          { key: 'attended', label: t('meeting.iAttend', { defaultValue: '我參與的' }) },
          { key: 'done', label: t('meeting.finished2', { defaultValue: '已結束' }) },
        ]}
      />

      <MeetingStatCards key={statsKey} loading={loading} items={[
        { icon: <CalendarOutlined />, color: '#1890FF', bg: '#E6F7FF', value: summary.todayCount, label: t('meeting.today', { defaultValue: '今日會議' }), hint: t('meeting.organizedByMePlus', { defaultValue: '我發起 + 我參與，按開始日期統計' }) },
        { icon: <HourglassOutlined />, color: '#E8720C', bg: '#FFF7E6', value: summary.upcomingCount, label: t('meeting.meetingsInTheNext', { defaultValue: '未來 7 天會議' }) },
        { icon: <NotificationOutlined />, color: '#722ED1', bg: '#F9F0FF', value: summary.pendingResponseCount, label: t('meeting.waitingForMe', { defaultValue: '待我響應' }) },
        // 日历态第 4 卡切当月口径：用户眼里是月网格，卡片不能再报全量合计
        viewMode === 'calendar'
          ? { icon: <FolderOpenOutlined />, color: '#52C41A', bg: '#F6FFED', value: calRows.length, label: t('meeting.currentMonthMeetings', { defaultValue: '當月會議' }), hint: t('meeting.currentMonthMeetingsHint', { defaultValue: '當前月份 + 當前篩選條件' }) }
          : { icon: <FolderOpenOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats.total, label: t('meeting.meetingsUnderCurrentFilters', { defaultValue: '當前條件會議數' }) },
      ]} />

      {/* 操作区（§E.2）：右侧只放「新增」与列配置 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/meeting-booking')}>{t('meeting.bookAMeeting', { defaultValue: '預約新會議' })}</Button>
          {/* 列配置只对列表表格有意义，日历态展示它会误导 */}
          {viewMode === 'list' && configComponent}
        </div>
      </div>

      {viewMode === 'list' ? (
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
      ) : (
        <>
          <div className="meeting-cal-card">
            <div className="meeting-cal-toolbar">
              <div className="meeting-cal-toolbar-left">
                <span className="meeting-cal-month">
                  {t('meeting.calendarMonthTitle', { defaultValue: '{{year}} 年 {{month}} 月', year: calValue.year(), month: calValue.month() + 1 })}
                </span>
                <Space size={4}>
                  <Button size="small" icon={<LeftOutlined />} aria-label={t('meeting.previousMonth', { defaultValue: '上個月' })} onClick={() => setCalValue(v => v.subtract(1, 'month'))} />
                  <Button size="small" onClick={() => setCalValue(dayjs())}>{t('meeting.calendarToday', { defaultValue: '今天' })}</Button>
                  <Button size="small" icon={<RightOutlined />} aria-label={t('meeting.nextMonth', { defaultValue: '下個月' })} onClick={() => setCalValue(v => v.add(1, 'month'))} />
                </Space>
              </div>
              <div className="meeting-cal-legend">
                {CALENDAR_LEGEND_PHASES.map(phase => (
                  <span key={phase} className="meeting-cal-legend-item">
                    <i className="meeting-cal-legend-dot" style={{ background: phaseDot(phase) }} />
                    {phaseMeta(phase).label}
                  </span>
                ))}
              </div>
            </div>
            <Spin spinning={calLoading}>
              <div className="meeting-cal-grid">
                {weekdays.map((label, i) => (
                  <div key={label} className={`meeting-cal-weekday${i === 0 || i === 6 ? ' meeting-cal-weekday--weekend' : ''}`}>{label}</div>
                ))}
                {calCells.map(date => {
                  const list = calByDate[date.format('YYYY-MM-DD')] ?? []
                  const cellClass = [
                    'meeting-cal-cell',
                    date.day() === 0 || date.day() === 6 ? 'meeting-cal-cell--weekend' : '',
                    date.isSame(calValue, 'month') ? '' : 'meeting-cal-cell--other',
                    date.isSame(calValue, 'day') ? 'meeting-cal-cell--selected' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <div key={date.format('YYYY-MM-DD')} className={cellClass} onClick={() => setCalValue(date)}>
                      <div className="meeting-cal-cell-head">
                        <span className={`meeting-cal-date${date.isSame(dayjs(), 'day') ? ' meeting-cal-date--today' : ''}`}>{date.date()}</span>
                        {list.length > 0 && <span className="meeting-cal-count">{list.length}</span>}
                      </div>
                      {list.slice(0, 3).map(item => (
                        <div
                          key={item.id}
                          className={`meeting-cal-chip meeting-cal-chip--${phaseChipVariant(item.phase)}`}
                          title={`${item.startTime.slice(11, 16)} ${item.title}`}
                          onClick={e => { e.stopPropagation(); navigate(`/meeting-detail?id=${item.id}`) }}
                        >
                          <span className="meeting-cal-dot" style={{ background: phaseDot(item.phase) }} />
                          <span className="meeting-cal-time">{item.startTime.slice(11, 16)}</span>
                          <span className="meeting-cal-title">{item.title}</span>
                        </div>
                      ))}
                      {list.length > 3 && (
                        <div className="meeting-cal-more">
                          {t('meeting.calendarMore', { count: list.length - 3, defaultValue: '還有 {{count}} 場' })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Spin>
          </div>

          {/* 当日日程：选中日展开完整清单，操作复用列表操作列，不另做第二套入口 */}
          <div className="meeting-cal-daypanel">
            <div className="meeting-cal-daypanel-head">
              <div className="meeting-cal-daypanel-icon"><CalendarOutlined /></div>
              <span className="meeting-cal-daypanel-title">
                {t('meeting.calendarDayTitle', { defaultValue: '{{month}} 月 {{day}} 日日程', month: calValue.month() + 1, day: calValue.date() })}
              </span>
              <span className="meeting-cal-daypanel-count">
                {t('meeting.sessionCount', { count: dayList.length, defaultValue: '{{count}} 場' })}
              </span>
            </div>
            {dayList.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('meeting.noMeetingRelatedTo', { defaultValue: '這一天沒有與你相關的會議' })} />
            ) : (
              dayList.map(item => (
                <div key={item.id} className="meeting-cal-dayrow">
                  <span className="meeting-cal-dayrow-time">{item.startTime.slice(11, 16)}–{item.endTime.slice(11, 16)}</span>
                  <a className="meeting-cal-dayrow-title" onClick={() => navigate(`/meeting-detail?id=${item.id}`)}>{item.title}</a>
                  <span className="meeting-cal-dayrow-room">{item.roomName}</span>
                  <Tag color={phaseMeta(item.phase).color}>{phaseMeta(item.phase).label}</Tag>
                  {item.myRole !== 'organizer' && item.myResponse === 'pending' && (
                    <Tag color="orange">{t('meeting.pendingResponse', { defaultValue: '待響應' })}</Tag>
                  )}
                  <div className="meeting-cal-dayrow-actions">{renderActions(item)}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
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
