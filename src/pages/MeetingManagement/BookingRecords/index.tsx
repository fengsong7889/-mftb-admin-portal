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
 *   3. 统计卡片在搜索区下方且随筛选条件变化（§E.8）。
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
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  cancelMeeting,
  fetchMeetings,
  releaseMeeting,
  fetchMeetingRooms,
  toMeetingIso,
  type MeetingGroup,
  type MeetingQuery,
  type MeetingRoomVO,
  type MeetingStats,
  type MeetingVO,
} from '../../../api/meeting'
import { BIZ_TYPE_LABELS, phaseMeta } from '../meetingMeta'
import MeetingStatCards from '../MeetingStatCards'

const EMPTY_STATS: MeetingStats = { total: 0, pending: 0, ongoing: 0, finished: 0, cancelled: 0, released: 0 }

const STATUS_OPTIONS = [
  { value: 'booked', label: '已預約' },
  { value: 'checked_in', label: '已簽到' },
  { value: 'finished', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
  { value: 'released', label: '已釋放' },
]

const GROUP_OPTIONS = [
  { value: 'pending', label: '待開會' },
  { value: 'ongoing', label: '進行中' },
  { value: 'done', label: '已結束' },
]

/** 列配置元数据（§E.3）：单号锁头、操作锁尾 */
const COLUMN_META = [
  { key: 'bookingNo', title: '單號' },
  { key: 'title', title: '主題' },
  { key: 'timeText', title: '時間' },
  { key: 'roomName', title: '會議室' },
  { key: 'organizerName', title: '組織者' },
  { key: 'departmentName', title: '部門' },
  { key: 'attendeeCount', title: '人數' },
  { key: 'bizType', title: '類型' },
  { key: 'phase', title: '狀態' },
  { key: 'remark', title: '備註' },
  { key: 'action', title: '操作' },
]

export default function BookingRecords() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('meeting-record:edit')

  const [rows, setRows] = useState<MeetingVO[]>([])
  const [stats, setStats] = useState<MeetingStats>(EMPTY_STATS)
  const [total, setTotal] = useState(0)
  const [rooms, setRooms] = useState<MeetingRoomVO[]>([])
  const [query, setQuery] = useState<MeetingQuery>({ page: 1, size: 20, scope: 'all' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [form] = Form.useForm()

  const { configComponent, applyConfig } = useColumnConfig('meeting-record', COLUMN_META, [
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
      setError(e instanceof Error ? e.message : '預約記錄加載失敗')
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
    setQuery({ page: 1, size: query.size ?? 20, scope: 'all' })
  }

  /** 代取消：必填原因，写入审计并附在通知里（§B.3 校验 → 弹框 → 接口） */
  const handleCancel = (record: MeetingVO) => {
    let reason = ''
    Modal.confirm({
      title: '確認代組織者取消這場會議？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認代取消',
      okButtonProps: { danger: true },
      cancelText: '返回',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>會議主題：</span><b>{record.title}</b></div>
          <div className="confirm-info-row"><span>單號：</span><b>{record.bookingNo}</b></div>
          <div className="confirm-info-row"><span>時間：</span><b>{record.timeText}</b></div>
          <div className="confirm-info-row"><span>會議室：</span><b>{record.roomName}</b></div>
          <div className="confirm-info-row"><span>組織者：</span><b>{record.organizerName}</b></div>
          <div className="confirm-info-row"><span>影響：</span><b>通知組織者與全體參會人，窗口立刻還給他人</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>取消原因（必填）</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder="如 組織者請假／會議改期"
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('請填寫取消原因')
          // 抛出以阻止弹窗关闭：原因没填就放行，等于允许无凭据取消他人的会
          throw new Error('reason required')
        }
        await cancelMeeting(record.id, { reason: reason.trim(), version: record.version })
        message.success('已代組織者取消會議')
        void load()
      },
    })
  }

  /** 释放房间：与代取消分开——释放针对"已开始却无人到场"，会计入爽约 */
  const handleRelease = (record: MeetingVO) => {
    let reason = ''
    Modal.confirm({
      title: '確認釋放這間會議室？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認釋放',
      okButtonProps: { danger: true },
      cancelText: '返回',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>會議主題：</span><b>{record.title}</b></div>
          <div className="confirm-info-row"><span>單號：</span><b>{record.bookingNo}</b></div>
          <div className="confirm-info-row"><span>時間：</span><b>{record.timeText}</b></div>
          <div className="confirm-info-row"><span>會議室：</span><b>{record.roomName}</b></div>
          <div className="confirm-info-row"><span>影響：</span><b>記入爽約統計並通知組織者，窗口立刻可被他人預訂</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>釋放原因（必填）</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder="如 開始 20 分鐘無人到場"
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('請填寫釋放原因')
          throw new Error('reason required')
        }
        await releaseMeeting(record.id, { reason: reason.trim(), version: record.version })
        message.success('會議室已釋放')
        void load()
      },
    })
  }

  const columns: TableColumnsType<MeetingVO> = [
    { title: '單號', dataIndex: 'bookingNo', key: 'bookingNo', width: 150, fixed: 'left', ellipsis: true },
    {
      title: '主題', dataIndex: 'title', key: 'title', width: 220, ellipsis: true,
      render: (value: string, record) => <a onClick={() => navigate(`/meeting-detail?id=${record.id}`)}>{value}</a>,
    },
    {
      title: '時間', key: 'timeText', width: 190,
      render: (_, record) => (
        <div>
          <div>{record.timeText}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{record.durationMinutes} 分鐘</div>
        </div>
      ),
    },
    {
      title: '會議室', key: 'roomName', width: 180,
      render: (_, record) => (
        <div>
          <div>{record.roomName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{record.roomLocation}</div>
        </div>
      ),
    },
    {
      title: '組織者', dataIndex: 'organizerName', key: 'organizerName', width: 130,
      // 台账里"谁点的提交"与"这间房给谁用"必须同时可见：只看组织者会把 20 场代订误读成行政自己在开会
      render: (v: string, record) => (record.delegateForName ? (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>代 {record.delegateForName} 預訂</span>
        </Space>
      ) : v),
    },
    {
      title: '部門', dataIndex: 'departmentName', key: 'departmentName', width: 140,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '人數', key: 'attendeeCount', width: 80,
      render: (_, record) => `${record.attendeeCount ?? 0} 人`,
    },
    {
      title: '類型', key: 'bizType', width: 100,
      render: (_, record) => BIZ_TYPE_LABELS[record.bizType] ?? record.bizType,
    },
    {
      title: '狀態', key: 'phase', width: 120,
      render: (_, record) => {
        const meta = phaseMeta(record.phase)
        return (
          <Space direction="vertical" size={2}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {record.noShow === 1 && <Tag color="red">爽約</Tag>}
          </Space>
        )
      },
    },
    {
      title: '備註', key: 'remark', width: 200, ellipsis: true,
      render: (_, record) => (
        <span style={{ fontSize: 12, color: '#8C8C8C' }} title={record.cancelReason ?? record.releaseReason ?? ''}>
          {record.cancelReason ? `取消：${record.cancelReason}`
            : record.releaseReason ? `釋放：${record.releaseReason}` : '-'}
        </span>
      ),
    },
    {
      title: '操作', key: 'action', width: 190, fixed: 'right',
      // 操作列（§B.9）：纯文本 + action-split 分隔，详情在前、危险操作在后
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/meeting-detail?id=${record.id}`)}>詳情</Button>
          {canEdit && record.canRelease && (
            <Button type="link" size="small" onClick={() => handleRelease(record)}>釋放房間</Button>
          )}
          {canEdit && record.canCancel && (
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>代取消</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 页面说明横幅：把"释放 vs 取消"的口径写在最前面，避免行政用错按钮 */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="「已釋放」與「已取消」分開統計，操作也分開"
        description="釋放針對「已開始卻無人到場」的會議，會計入爽約；代取消針對尚未開始的會議，窗口立刻還給他人。兩者都必填原因，原因會寫入審計並附在通知裡。若你未持有全量查看權限，這裡只顯示與你相關的會議。"
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message="預約記錄加載失敗"
          description={error}
          style={{ marginBottom: 16 }}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重試</Button>}
        />
      )}

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="會議時間" name="range">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="會議室" name="roomId">
            <Select
              placeholder="全部會議室"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={rooms.map(r => ({ value: r.id, label: `${r.roomName}（${r.roomNo}）` }))}
            />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部狀態" allowClear style={{ width: '100%' }} options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="分組" name="group">
            <Select placeholder="全部分組" allowClear style={{ width: '100%' }} options={GROUP_OPTIONS} />
          </Form.Item>
          <Form.Item label="關鍵字" name="keyword">
            <Input placeholder="單號／主題" allowClear style={{ width: '100%' }} onPressEnter={search} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={search}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={reset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：必须在搜索区之后（§E.8），六项口径由服务端按当前条件一次返回 */}
      <MeetingStatCards key={statsKey} loading={loading} items={[
        { icon: <DatabaseOutlined />, color: '#1890FF', bg: '#E6F7FF', value: stats.total, label: '符合條件會議數', hint: '隨時間／會議室／狀態篩選變化' },
        { icon: <ClockCircleOutlined />, color: '#722ED1', bg: '#F9F0FF', value: stats.pending, label: '待開會' },
        { icon: <SyncOutlined />, color: '#E8720C', bg: '#FFF7E6', value: stats.ongoing, label: '進行中' },
        { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats.finished, label: '已完成' },
        { icon: <StopOutlined />, color: '#8C8C8C', bg: '#FAFAFA', value: stats.cancelled, label: '已取消' },
        { icon: <RollbackOutlined />, color: '#FF4D4F', bg: '#FFF1F0', value: stats.released, label: '已釋放（爽約）' },
      ]} />

      {/* 操作区（§E.2）：右侧只放「新增」与列配置 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/meeting-booking')}>預約新會議</Button>
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
          showTotal: t => `共 ${t} 場`,
          // pageSize 变化必须回到第 1 页，否则会停在一个可能不存在的页码上
          onChange: (page, size) => setQuery(q => ({ ...q, page: size !== q.size ? 1 : page, size: size || 20 })),
        }}
      />
    </div>
  )
}
