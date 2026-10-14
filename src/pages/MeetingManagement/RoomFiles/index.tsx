/**
 * 会议室档案（会议管理 → 會議治理 → 會議室檔案）
 *
 * 行政维护资源台账：编号/名称/园区楼栋楼层/容量/设备/照片/可预约窗/时长上下限/是否脱敏主题。
 *
 * 四条界面口径：
 *   1. 统计卡片在搜索区**下方**，数字由服务端按当前筛选条件算出（AGENTS.md §E.8）；
 *   2. 规则列留空=「未单独配置」，页面显式标注生效值来自房间还是全局默认，
 *      否则行政看到 240 分钟却无法判断该改哪里；
 *   3. 新增/编辑走独立页面（§9.1 禁止用弹窗承载表单），列表只负责检索与状态操作；
 *   4. 停用与删除必须二次确认：停用会让房间立刻从预约页消失，删除后原因它是唯一能回答
 *      "为什么这间房没了"的凭据。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Tooltip, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, HomeOutlined, PlusOutlined,
  ReloadOutlined, SearchOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  changeMeetingRoomStatus,
  deleteMeetingRoom,
  fetchBuildings,
  fetchCampuses,
  fetchFloors,
  fetchMeetingRooms,
  type MeetingRoomQuery,
  type MeetingRoomStats,
  type MeetingRoomVO,
} from '../../../api/meeting'
import { FACILITY_LABELS, FACILITY_OPTIONS, roomStatusMeta } from '../meetingMeta'
import MeetingStatCards from '../MeetingStatCards'

const MENU = 'meeting-room'

const EMPTY_STATS: MeetingRoomStats = { total: 0, active: 0, bookable: 0, seatsTotal: 0 }

/** 状态筛选项：与后端 MeetingConstants.ROOM_* 逐字对齐 */
const STATUS_OPTIONS = [
  { value: 'active', label: '使用中' },
  { value: 'maintenance', label: '維護中' },
  { value: 'disabled', label: '已停用' },
]

/** 列配置元数据（§E.3）：编号锁头、操作锁尾，其余列行政可自行显隐与排序 */
const COLUMN_META = [
  { key: 'roomNo', title: '編號' },
  { key: 'roomName', title: '名稱' },
  { key: 'locationText', title: '位置' },
  { key: 'capacity', title: '容納' },
  { key: 'facilities', title: '設備' },
  { key: 'bookableWindow', title: '可預約窗' },
  { key: 'duration', title: '單場時長' },
  { key: 'status', title: '狀態' },
  { key: 'bookable', title: '接受預約' },
  { key: 'hideTitle', title: '主題脫敏' },
  { key: 'updatedAt', title: '最後更新' },
  { key: 'action', title: '操作' },
]

export default function RoomFiles() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${MENU}:edit`) || hasPermission(`${MENU}:create`)

  const [rows, setRows] = useState<MeetingRoomVO[]>([])
  const [stats, setStats] = useState<MeetingRoomStats>(EMPTY_STATS)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState<MeetingRoomQuery>({ page: 1, size: 20 })
  const [form] = Form.useForm()

  const [campuses, setCampuses] = useState<string[]>([])
  const [buildings, setBuildings] = useState<string[]>([])
  const [floors, setFloors] = useState<string[]>([])

  const { configComponent, applyConfig } = useColumnConfig('meeting-room', COLUMN_META, [
    { key: 'roomNo', visible: true, locked: 'head' },
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetchMeetingRooms(query)
      setRows(res.page?.records ?? [])
      setTotal(res.page?.total ?? 0)
      setStats(res.stats ?? EMPTY_STATS)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    void fetchCampuses().then(setCampuses).catch(() => setCampuses([]))
  }, [])

  const campusFilter = query.campus
  const buildingFilter = query.building

  useEffect(() => {
    if (!campusFilter) {
      setBuildings([])
      setFloors([])
      return
    }
    void fetchBuildings(campusFilter).then(setBuildings).catch(() => setBuildings([]))
  }, [campusFilter])

  useEffect(() => {
    if (!campusFilter || !buildingFilter) {
      setFloors([])
      return
    }
    void fetchFloors(campusFilter, buildingFilter).then(setFloors).catch(() => setFloors([]))
  }, [campusFilter, buildingFilter])

  /** 条件快照作为卡片容器 key：条件变更时整组重挂载，避免"数字看着没变=筛选没生效"的误读 */
  const filterKey = useMemo(() => JSON.stringify(query), [query])

  const handleSearch = () => {
    const values = form.getFieldsValue()
    setQuery({
      ...values,
      facilities: values.facilities?.length ? values.facilities : undefined,
      page: 1,
      size: query.size ?? 20,
    })
  }

  const handleReset = () => {
    form.resetFields()
    setQuery({ page: 1, size: query.size ?? 20 })
  }

  /** 停用/启用（§B.8）：Switch 不直接调接口，先二次确认——停用会让房间立刻从预约页消失 */
  const handleToggleBookable = (record: MeetingRoomVO, checked: boolean) => {
    if (!canEdit) return
    const actionText = checked ? '啟用' : '停用'
    Modal.confirm({
      title: `確定要${actionText}「${record.roomName}」的預約嗎？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認',
      cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>會議室：</span><b>{record.roomNo} · {record.roomName}</b></div>
          <div className="confirm-info-row"><span>容納人數：</span><b>{record.capacity} 人</b></div>
          <div className="confirm-info-row">
            <span>{checked ? '啟用後：' : '停用後：'}</span>
            <b>{checked ? '該房間重新出現在預約頁可訂列表' : '該房間不再接受新預約，已存在的會議不受影響'}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        await changeMeetingRoomStatus(record.id, {
          status: checked ? 'active' : 'disabled',
          version: record.version,
        })
        message.success(`已${actionText}預約`)
        void load()
      },
    })
  }

  /** 删除：逻辑删除 + 必填原因（原因是"这间房为什么没了"的唯一凭据） */
  const handleDelete = (record: MeetingRoomVO) => {
    let reason = ''
    Modal.confirm({
      title: `確定要刪除「${record.roomName}」嗎？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>會議室：</span><b>{record.roomNo} · {record.roomName}</b></div>
          <div className="confirm-info-row"><span>刪除方式：</span><b>邏輯刪除，歷史會議仍保留房間快照</b></div>
          <div className="confirm-info-row"><span>限制：</span><b>存在未結束預約時無法刪除，請先取消或改期</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>刪除原因（必填）</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder="如 場地退租／改作他用"
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('請填寫刪除原因')
          // 抛出以阻止弹窗关闭：原因没填就放行，等于允许无凭据删除
          throw new Error('reason required')
        }
        await deleteMeetingRoom(record.id, { reason: reason.trim(), version: record.version })
        message.success('會議室已刪除')
        void load()
      },
    })
  }

  const columns: TableColumnsType<MeetingRoomVO> = [
    { title: '編號', dataIndex: 'roomNo', key: 'roomNo', width: 120, fixed: 'left', ellipsis: true },
    { title: '名稱', dataIndex: 'roomName', key: 'roomName', width: 150, ellipsis: true },
    {
      title: '位置', dataIndex: 'locationText', key: 'locationText', width: 220, ellipsis: true,
      render: (value: string, record) => (
        <Tooltip title={record.locationDesc ?? ''}>
          <span>{value || '-'}</span>
        </Tooltip>
      ),
    },
    { title: '容納', dataIndex: 'capacity', key: 'capacity', width: 80, render: (v: number) => `${v} 人` },
    {
      title: '設備', dataIndex: 'facilities', key: 'facilities', width: 200,
      render: (list: string[]) => (list.length
        ? <Space size={4} wrap>{list.map(code => <Tag key={code}>{FACILITY_LABELS[code] ?? code}</Tag>)}</Space>
        : <span style={{ color: '#BFBFBF' }}>無</span>),
    },
    {
      title: '可預約窗', key: 'bookableWindow', width: 150,
      render: (_, record) => (record.bookableStartTime || record.bookableEndTime
        ? `${record.bookableStartTime ?? '08:00'}–${record.bookableEndTime ?? '22:00'}`
        // 两个都留空时必须显式说明来源，否则行政无法判断该改房间还是改全局规则
        : <Tooltip title="未單獨配置，沿用全局默認 08:00–22:00">
          <span style={{ color: '#8C8C8C' }}>全局默認</span>
        </Tooltip>),
    },
    {
      title: '單場時長', key: 'duration', width: 130,
      render: (_, record) => (record.minDuration != null || record.maxDuration != null
        ? `${record.minDuration ?? '-'} ~ ${record.maxDuration ?? '-'} 分鐘`
        : <Tooltip title="未單獨配置，沿用全局默認（最長 240 分鐘）">
          <span style={{ color: '#8C8C8C' }}>全局默認</span>
        </Tooltip>),
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => {
        const meta = roomStatusMeta(v)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '接受預約', dataIndex: 'bookable', key: 'bookable', width: 110,
      render: (_, record) => (
        // 维护中的房间由状态位决定不可预约，开关置灰并说明原因，避免"点了没反应"
        <Tooltip title={record.status === 'maintenance' ? '維護中的會議室不接受預約，請先恢復狀態' : ''}>
          <Switch
            checked={record.bookable && record.status !== 'maintenance'}
            checkedChildren="啟用"
            unCheckedChildren="停用"
            disabled={!canEdit || record.status === 'maintenance'}
            onChange={checked => handleToggleBookable(record, checked)}
          />
        </Tooltip>
      ),
    },
    {
      title: '主題脫敏', dataIndex: 'hideTitle', key: 'hideTitle', width: 110,
      render: (v: boolean) => (v
        ? <Tooltip title="他人在忙閒視圖只看到「已佔用」，不顯示主題與組織者"><Tag color="orange">脫敏</Tag></Tooltip>
        : <span style={{ color: '#BFBFBF' }}>公開</span>),
    },
    {
      title: '最後更新', key: 'updatedAt', width: 190,
      render: (_, record) => (
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          {record.updatedAt ?? '-'}
          <span style={{ color: '#BFBFBF' }}> · </span>
          {record.updatedBy ?? '-'}
        </span>
      ),
    },
    {
      title: '操作', key: 'action', width: 110, fixed: 'right',
      // 操作列（§B.9）：纯文本 + action-split 分隔，編輯在前、刪除在最后
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" disabled={!canEdit}
            onClick={() => navigate(`/meeting-room-form?id=${record.id}`)}>編輯</Button>
          <Button type="link" size="small" danger disabled={!canEdit}
            onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 页面说明横幅（§E.8：说明横幅留在搜索区上方，不属于统计卡片） */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="會議室檔案全員可查，僅行政可新增與修改"
        description="「可預約窗」與「單場時長」留空表示沿用全局默認規則；需要單獨調整某間房時，在編輯頁填入即以房間配置為準。停用的房間不再接受新預約，歷史會議不受影響。"
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message="會議室清單加載失敗"
          description={error}
          style={{ marginBottom: 16 }}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>重試</Button>}
        />
      )}

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="關鍵字" name="keyword">
            <Input placeholder="編號／名稱／位置" allowClear style={{ width: '100%' }} onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="園區" name="campus">
            <Select placeholder="全部" allowClear style={{ width: '100%' }}
              options={campuses.map(c => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item label="樓棟" name="building">
            <Select placeholder="全部" allowClear style={{ width: '100%' }}
              options={buildings.map(b => ({ value: b, label: b }))} />
          </Form.Item>
          <Form.Item label="樓層" name="floorCode">
            <Select placeholder="全部" allowClear style={{ width: '100%' }}
              options={floors.map(f => ({ value: f, label: f }))} />
          </Form.Item>
          <Form.Item label="最少人數" name="minCapacity">
            <InputNumber min={1} placeholder="不限" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="設備" name="facilities">
            <Select mode="multiple" placeholder="全部" allowClear style={{ width: '100%' }} options={FACILITY_OPTIONS} />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear style={{ width: '100%' }} options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：必须在搜索区之后（§E.8），口径由服务端按当前筛选条件返回 */}
      <MeetingStatCards key={filterKey} loading={loading} items={[
        { icon: <HomeOutlined />, color: '#1890FF', bg: '#E6F7FF', value: stats.total, label: '會議室總數', hint: '隨當前篩選條件變化' },
        { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats.active, label: '使用中' },
        { icon: <CalendarOutlined />, color: '#E8720C', bg: '#FFF7E6', value: stats.bookable, label: '接受預約' },
        { icon: <TeamOutlined />, color: '#722ED1', bg: '#F9F0FF', value: stats.seatsTotal, label: '總座位數' },
      ]} />

      {/* 操作区（§E.2）：右侧只放「新增」与列配置 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/meeting-room-form')}>新增會議室</Button>}
          {configComponent}
        </div>
      </div>

      <Table<MeetingRoomVO>
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
          showTotal: t => `共 ${t} 間`,
          // pageSize 变化必须回到第 1 页，否则会停在一个可能不存在的页码上
          onChange: (page, size) => setQuery(q => ({ ...q, page: size !== q.size ? 1 : page, size: size || 20 })),
        }}
      />
    </div>
  )
}
