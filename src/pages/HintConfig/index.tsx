import { useState , useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  ExportOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import HintCreateModal from '../HintCreate'

const { RangePicker } = DatePicker

/** 所屬品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 展示區域 */
const regionOptions = [
  { label: '全部', value: 'all' },
  { label: '澳門', value: 'macau' },
  { label: '氹仔', value: 'taipa' },
  { label: '高仕德', value: 'costa' },
  { label: '威尼斯', value: 'venetian' },
  { label: '澳門大學', value: 'macauUni' },
]

/** 業務終端 */
const terminalOptions = [
  { label: '全部', value: 'all' },
  { label: 'APP', value: 'app' },
  { label: '微信小程序', value: 'wechatMini' },
  { label: 'Mpay小應用', value: 'mpayMini' },
  { label: '微信H5', value: 'wechatH5' },
]

/** 狀態 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效', value: 'active' },
  { label: '失效', value: 'inactive' },
]

/** 底紋詞源 */
const hintSourceOptions = [
  { label: '運營推廣', value: 'operation' },
  { label: '熱搜推廣', value: 'hotSearch' },
]

/** 搜索頻道 */
const searchChannelOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣頻道', value: 'takeaway' },
  { label: '團購頻道', value: 'groupBuy' },
  { label: '超市頻道', value: 'supermarket' },
]

/** 跳轉類型 */
const jumpTypeOptions = [
  { label: '無跳轉', value: 'none' },
  { label: 'H5鏈接', value: 'h5' },
  { label: 'APP內頁面', value: 'appPage' },
]

/** APP頁面 */
const appPageOptions = [
  { label: '個人中心', value: 'personalCenter' },
  { label: '簽到中心', value: 'checkInCenter' },
  { label: '領取中心', value: 'claimCenter' },
  { label: '優惠券頁', value: 'couponPage' },
  { label: '商家詳情', value: 'shopDetail' },
]

/** 熱搜推廣排名 */
const hotSearchRankOptions = [
  { label: '前5', value: 5 },
  { label: '前10', value: 10 },
]

/** 時段 */
const timeSlotOptions = [
  { label: '全天', value: 'allDay' },
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '下午茶', value: 'afternoonTea' },
  { label: '晚餐', value: 'dinner' },
  { label: '宵夜', value: 'midnightSnack' },
]

/** 人群 */
const crowdOptions = [
  { label: '全部', value: 'all' },
  { label: '新用戶', value: 'newUser' },
  { label: '老用戶', value: 'oldUser' },
  { label: 'VIP用戶', value: 'vip' },
]

interface HintRecord {
  key: string
  hintId: string
  brand: string
  hintSource: string
  searchChannel: string
  region: string[]
  terminal: string[]
  effectStartDate: string
  effectEndDate: string
  lastUpdater: string
  lastUpdateTime: string
  status: string
  // 彈窗用字段
  hintWord?: string
  hotSearchRank?: number
  jumpType?: string
  jumpTarget?: string
  timeSlot?: string
  crowd?: string
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const channelMap: Record<string, string> = { home: '大首頁', takeaway: '外賣頻道', groupBuy: '團購頻道', supermarket: '超市頻道' }
const terminalMap: Record<string, string> = { app: 'APP', wechatMini: '微信小程序', mpayMini: 'Mpay小應用', wechatH5: '微信H5' }
const regionMap: Record<string, string> = { macau: '澳門', taipa: '氹仔', costa: '高仕德', venetian: '威尼斯', macauUni: '澳門大學' }
const hintSourceMap: Record<string, string> = { operation: '運營推廣', hotSearch: '熱搜推廣' }
const timeSlotMap: Record<string, string> = { allDay: '全天', breakfast: '早餐', lunch: '午餐', afternoonTea: '下午茶', dinner: '晚餐', midnightSnack: '宵夜' }
const crowdMap: Record<string, string> = { all: '全部', newUser: '新用戶', oldUser: '老用戶', vip: 'VIP用戶' }

const mockData: HintRecord[] = [
  { key: '1', hintId: 'DW20261221', brand: 'mFood', hintSource: 'operation', searchChannel: 'home', region: ['macau'], terminal: ['app', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '今日特惠外賣', jumpType: 'appPage', jumpTarget: 'checkInCenter', timeSlot: 'lunch', crowd: 'all' },
  { key: '2', hintId: 'DW20261222', brand: 'flashBee', hintSource: 'hotSearch', searchChannel: 'takeaway', region: ['macau', 'taipa'], terminal: ['app', 'mpayMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hotSearchRank: 5, timeSlot: 'allDay', crowd: 'all' },
  { key: '3', hintId: 'DW20261223', brand: 'mFood', hintSource: 'operation', searchChannel: 'home', region: ['costa'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '新鮮水果送到家', jumpType: 'h5', jumpTarget: 'https://m.flashbee.com/fruit', timeSlot: 'allDay', crowd: 'all' },
  { key: '4', hintId: 'DW20261224', brand: 'flashBee', hintSource: 'operation', searchChannel: 'takeaway', region: ['macau', 'taipa'], terminal: ['app', 'wechatH5'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'inactive', hintWord: '下午茶限時折扣', jumpType: 'appPage', jumpTarget: 'couponPage', timeSlot: 'afternoonTea', crowd: 'vip' },
  { key: '5', hintId: 'DW20261225', brand: 'mFood', hintSource: 'hotSearch', searchChannel: 'home', region: ['taipa', 'venetian'], terminal: ['app', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hotSearchRank: 10, timeSlot: 'dinner', crowd: 'all' },
  { key: '6', hintId: 'DW20261226', brand: 'flashBee', hintSource: 'operation', searchChannel: 'groupBuy', region: ['macauUni'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '團購好券天天領', jumpType: 'appPage', jumpTarget: 'claimCenter', timeSlot: 'allDay', crowd: 'newUser' },
  { key: '7', hintId: 'DW20261227', brand: 'mFood', hintSource: 'operation', searchChannel: 'takeaway', region: ['macau'], terminal: ['wechatH5'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'inactive', hintWord: '限時火鍋優惠', jumpType: 'h5', jumpTarget: 'https://mfood.com/hotpot', timeSlot: 'dinner', crowd: 'oldUser' },
  { key: '8', hintId: 'DW20261228', brand: 'flashBee', hintSource: 'hotSearch', searchChannel: 'home', region: ['macau', 'costa'], terminal: ['app', 'mpayMini', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hotSearchRank: 5, timeSlot: 'lunch', crowd: 'all' },
  { key: '9', hintId: 'DW20261229', brand: 'mFood', hintSource: 'operation', searchChannel: 'takeaway', region: ['taipa'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '宵夜狂歡夜', jumpType: 'appPage', jumpTarget: 'shopDetail', timeSlot: 'midnightSnack', crowd: 'all' },
  { key: '10', hintId: 'DW20261230', brand: 'flashBee', hintSource: 'operation', searchChannel: 'home', region: ['macau', 'macauUni'], terminal: ['app', 'wechatH5'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '早餐新選擇', jumpType: 'none', timeSlot: 'breakfast', crowd: 'newUser' },
  { key: '11', hintId: 'DW20261231', brand: 'mFood', hintSource: 'hotSearch', searchChannel: 'home', region: ['macau', 'taipa'], terminal: ['app', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'inactive', hotSearchRank: 10, timeSlot: 'allDay', crowd: 'all' },
  { key: '12', hintId: 'DW20261232', brand: 'flashBee', hintSource: 'operation', searchChannel: 'supermarket', region: ['costa', 'venetian'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '超市新人專享', jumpType: 'appPage', jumpTarget: 'personalCenter', timeSlot: 'allDay', crowd: 'newUser' },
]

export default function HintConfig() {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HintRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<HintRecord | null>(null)
  const [hintType, setHintType] = useState<string>('operation')
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingRecord(null)
    setHintType('operation')
    form.resetFields()
    form.setFieldsValue({ hintSource: 'operation', status: 'active', timeSlot: 'allDay', crowd: 'all', region: ['macau'], terminal: ['app'] })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HintRecord) => {
    setEditingRecord(record)
    setHintType(record.hintSource)
    form.setFieldsValue({
      ...record,
      dateRange: record.effectStartDate && record.effectEndDate ? [record.effectStartDate, record.effectEndDate] : undefined,
    })
    setIsModalOpen(true)
  }

  const handleDetail = (record: HintRecord) => {
    setDetailRecord(record)
    setIsDetailModalOpen(true)
  }

  const handleToggleStatus = (record: HintRecord) => {
    const newStatus = record.status === 'active' ? '失效' : '生效'
    Modal.confirm({
      title: '確認操作',
      content: `確定要將該底紋配置設為「${newStatus}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${newStatus}`),
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'hintId', title: '底紋ID' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'hintSource', title: '底紋來源' },
    { key: 'searchChannel', title: '搜索頻道' },
    { key: 'region', title: '地區' },
    { key: 'terminal', title: '終端' },
    { key: 'effectStartDate', title: '生效開始日' },
    { key: 'effectEndDate', title: '生效結束日' },
    { key: 'lastUpdater', title: '最後更新人' },
    { key: 'lastUpdateTime', title: '最後更新時間' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('hint-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<HintRecord> = [
    {
      title: '底紋ID',
      dataIndex: 'hintId',
      key: 'hintId',
      width: 130,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === '閃蜂' || v === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === '閃蜂' || v === 'flashBee' ? '#d4b106' : '#d46b08',
          background: v === '閃蜂' || v === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[v] || v}
        </Tag>
      ),
    },
    {
      title: '底紋詞源',
      dataIndex: 'hintSource',
      key: 'hintSource',
      width: 100,
      render: (v: string) => <Tag color={v === 'operation' ? 'blue' : 'orange'}>{hintSourceMap[v]}</Tag>,
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 100,
      render: (v: string) => channelMap[v] || v,
    },
    {
      title: '展示區域',
      dataIndex: 'region',
      key: 'region',
      width: 130,
      render: (v: string[]) => v.map(r => regionMap[r] || r).join('、'),
    },
    {
      title: '展示終端',
      dataIndex: 'terminal',
      key: 'terminal',
      width: 170,
      render: (v: string[]) => v.map(t => terminalMap[t] || t).join('、'),
    },
    {
      title: '展示時段',
      dataIndex: 'timeSlot',
      key: 'timeSlot',
      width: 100,
      render: (v: string) => timeSlotMap[v] || v,
    },
    {
      title: '生效時間',
      key: 'effectDate',
      width: 200,
      render: (_, r) => `${r.effectStartDate} - ${r.effectEndDate}`,
    },
    {
      title: '最後更新人',
      dataIndex: 'lastUpdater',
      key: 'lastUpdater',
      width: 120,
    },
    {
      title: '最後更新時間',
      dataIndex: 'lastUpdateTime',
      key: 'lastUpdateTime',
      width: 170,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => v === 'active'
        ? <Tag color="green">生效</Tag>
        : <Tag color="red">失效</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>詳情</Button>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button
            type="link"
            size="small"
            danger={record.status === 'active'}
            style={record.status !== 'active' ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '失效' : '生效'}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="底紋ID">
            <Input placeholder="請輸入底紋ID搜索" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="全部" options={brandOptions} />
          </Form.Item>
          <Form.Item label="搜索頻道">
            <Select placeholder="全部" options={searchChannelOptions} />
          </Form.Item>
          <Form.Item label="展示時段">
            <Select placeholder="全部" options={timeSlotOptions} />
          </Form.Item>
          <Form.Item label="展示區域">
            <Select placeholder="全部" options={regionOptions} />
          </Form.Item>
          <Form.Item label="狀態">
            <Select placeholder="全部" options={statusOptions} />
          </Form.Item>
          <Form.Item label="生效時間">
            <RangePicker placeholder={['開始時間', '結束時間']} />
          </Form.Item>
          <Form.Item label="業務終端">
            <Select placeholder="全部" options={terminalOptions} />
          </Form.Item>
          <Form.Item label="最後更新人">
            <Input placeholder="請輸入申請人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item label="最後更新時間">
            <RangePicker placeholder={['開始時間', '結束時間']} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<ExportOutlined />}>數據導出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>新增</Button>
          <Button icon={<EyeOutlined />} onClick={() => navigate('/hint-verify')}>效果預覽</Button>
        </Space>
              {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<HintRecord>
          columns={applyConfig(columns)}
          dataSource={mockData}
          rowSelection={{}}
          pagination={{
            total: mockData.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1400 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯底紋' : '新增底紋'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="詞源類型" name="hintSource" rules={[{ required: true, message: '請選擇' }]}>
            <Select options={hintSourceOptions} onChange={(v) => setHintType(v)} />
          </Form.Item>

          {hintType === 'operation' && (
            <>
              <Form.Item label="底紋詞" name="hintWord" rules={[{ required: true, message: '請輸入底紋詞' }]}>
                <Input placeholder="請輸入底紋詞內容" maxLength={20} showCount />
              </Form.Item>
              <Form.Item label="跳轉類型" name="jumpType">
                <Select options={jumpTypeOptions} placeholder="請選擇跳轉類型" />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.jumpType !== cur.jumpType}>
                {({ getFieldValue }) => {
                  const jumpType = getFieldValue('jumpType')
                  if (jumpType === 'h5') {
                    return (
                      <Form.Item label="H5鏈接" name="jumpTarget" rules={[{ required: true, message: '請輸入H5鏈接' }]}>
                        <Input placeholder="請輸入H5鏈接地址" />
                      </Form.Item>
                    )
                  }
                  if (jumpType === 'appPage') {
                    return (
                      <Form.Item label="APP頁面" name="jumpTarget" rules={[{ required: true, message: '請選擇APP頁面' }]}>
                        <Select options={appPageOptions} placeholder="請選擇跳轉頁面" />
                      </Form.Item>
                    )
                  }
                  return null
                }}
              </Form.Item>
            </>
          )}

          {hintType === 'hotSearch' && (
            <Form.Item label="熱搜詞排名" name="hotSearchRank" rules={[{ required: true, message: '請選擇' }]}>
              <Select options={hotSearchRankOptions} placeholder="獲取近30天熱搜詞排名" />
            </Form.Item>
          )}

          <Form.Item label="所屬品牌" name="brand" rules={[{ required: true, message: '請選擇' }]}>
            <Select options={brandOptions.filter(o => o.value !== 'all')} placeholder="請選擇" />
          </Form.Item>

          <Form.Item label="展示終端" name="terminal" rules={[{ required: true, message: '請選擇' }]}>
            <Select mode="multiple" options={terminalOptions.filter(o => o.value !== 'all')} placeholder="請選擇展示終端" />
          </Form.Item>

          <Form.Item label="展示區域" name="region" rules={[{ required: true, message: '請選擇' }]}>
            <Select mode="multiple" options={regionOptions.filter(o => o.value !== 'all')} placeholder="請選擇區域" />
          </Form.Item>

          <Space size={24}>
            <Form.Item label="展示時段" name="timeSlot" rules={[{ required: true, message: '請選擇' }]}>
              <Select options={timeSlotOptions} placeholder="請選擇" />
            </Form.Item>
            <Form.Item label="配置人群" name="crowd">
              <Select options={crowdOptions} placeholder="請選擇" />
            </Form.Item>
          </Space>

          <Form.Item label="生效日期" name="dateRange" rules={[{ required: true, message: '請選擇生效日期' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="底紋詳情"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={640}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div><span style={{ color: '#999' }}>底紋ID：</span>{detailRecord.hintId}</div>
              <div><span style={{ color: '#999' }}>所屬品牌：</span>{brandMap[detailRecord.brand]}</div>
              <div><span style={{ color: '#999' }}>底紋詞源：</span>{hintSourceMap[detailRecord.hintSource]}</div>
              <div><span style={{ color: '#999' }}>底紋詞：</span>{detailRecord.hintWord || (detailRecord.hotSearchRank ? `熱搜排名前${detailRecord.hotSearchRank}` : '-')}</div>
              <div><span style={{ color: '#999' }}>展示區域：</span>{detailRecord.region.map(r => regionMap[r]).join('、')}</div>
              <div><span style={{ color: '#999' }}>展示終端：</span>{detailRecord.terminal.map(t => terminalMap[t]).join('、')}</div>
              <div><span style={{ color: '#999' }}>生效時間：</span>{detailRecord.effectStartDate} - {detailRecord.effectEndDate}</div>
              <div><span style={{ color: '#999' }}>狀態：</span>{detailRecord.status === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">失效</Tag>}</div>
              <div><span style={{ color: '#999' }}>最後更新人：</span>{detailRecord.lastUpdater}</div>
              <div><span style={{ color: '#999' }}>最後更新時間：</span>{detailRecord.lastUpdateTime}</div>
              {detailRecord.jumpType && detailRecord.jumpType !== 'none' && (
                <>
                  <div><span style={{ color: '#999' }}>跳轉類型：</span>{jumpTypeOptions.find(o => o.value === detailRecord.jumpType)?.label}</div>
                  <div><span style={{ color: '#999' }}>跳轉目標：</span>{detailRecord.jumpTarget}</div>
                </>
              )}
              {detailRecord.timeSlot && <div><span style={{ color: '#999' }}>展示時段：</span>{timeSlotMap[detailRecord.timeSlot]}</div>}
              {detailRecord.crowd && <div><span style={{ color: '#999' }}>配置人群：</span>{crowdMap[detailRecord.crowd]}</div>}
            </div>
          </div>
        )}
      </Modal>

      {/* 新增底纹词弹窗 */}
      <HintCreateModal
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          message.success('新增成功')
          // 这里可以添加刷新列表的逻辑
        }}
      />
    </div>
  )
}
