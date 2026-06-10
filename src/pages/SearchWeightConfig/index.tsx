import { useState , useMemo } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { TextArea } = Input

/** 所屬品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 搜索頻道 */
const searchChannelOptions = [
  { label: '全部', value: 'all' },
  { label: '大首頁', value: 'home' },
  { label: '外賣頻道', value: 'takeaway' },
  { label: '團購頻道', value: 'groupBuy' },
  { label: '超市頻道', value: 'supermarket' },
]

/** 降權方式 */
const demotionTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '分數打折', value: 'discount' },
  { label: '固定扣分', value: 'deduction' },
]

/** 狀態 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效', value: 'active' },
  { label: '失效', value: 'inactive' },
]

interface WeightRecord {
  key: string
  weightId: string
  groupName: string
  groupId: string
  brand: string
  searchChannel: string[]
  demotionType: string[]
  effectStartDate: string
  effectEndDate: string
  reason: string
  operator: string
  operateTime: string
  status: string
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const channelMap: Record<string, string> = { home: '大首頁', takeaway: '外賣頻道', groupBuy: '團購頻道', supermarket: '超市頻道' }
const demotionTypeMap: Record<string, string> = { discount: '分數打折', deduction: '固定扣分' }

const mockData: WeightRecord[] = [
  { key: '1', weightId: 'QZ20260601', groupName: '麥當勞集團', groupId: 'M10001', brand: 'mFood', searchChannel: ['takeaway', 'home'], demotionType: ['discount'], effectStartDate: '2026-06-01', effectEndDate: '2026-12-31', reason: '品牌熱度過高，長期不購買廣告推廣', operator: '古月(001)', operateTime: '2026-06-01 10:30:00', status: 'active' },
  { key: '2', weightId: 'QZ20260602', groupName: '星巴克集團', groupId: 'M10002', brand: 'mFood', searchChannel: ['home', 'groupBuy'], demotionType: ['deduction'], effectStartDate: '2026-06-01', effectEndDate: '2026-09-30', reason: '品牌知名度過高佔據搜索首位，未參與任何平台活動', operator: '加侖(002)', operateTime: '2026-06-01 11:00:00', status: 'active' },
  { key: '3', weightId: 'QZ20260603', groupName: '大利來記集團', groupId: 'M10003', brand: 'mFood', searchChannel: ['takeaway'], demotionType: ['discount', 'deduction'], effectStartDate: '2026-06-05', effectEndDate: '2026-12-05', reason: '本地熱門商家，搜索分值常年超高，壓制付費商家', operator: '浩源(003)', operateTime: '2026-06-05 09:15:00', status: 'active' },
  { key: '4', weightId: 'QZ20260604', groupName: '肯德基集團', groupId: 'M10004', brand: 'flashBee', searchChannel: ['takeaway', 'supermarket'], demotionType: ['deduction'], effectStartDate: '2026-05-20', effectEndDate: '2026-08-20', reason: '近3個月未續費廣告，且多次拒絕活動邀請', operator: '古月(001)', operateTime: '2026-05-20 14:30:00', status: 'active' },
  { key: '5', weightId: 'QZ20260605', groupName: '必勝客集團', groupId: 'M10005', brand: 'mFood', searchChannel: ['takeaway', 'groupBuy'], demotionType: ['discount'], effectStartDate: '2026-04-01', effectEndDate: '2026-06-01', reason: '學區熱門品牌，搜索權重過高', operator: '加侖(002)', operateTime: '2026-04-01 16:00:00', status: 'inactive' },
  { key: '6', weightId: 'QZ20260606', groupName: '譚仔三哥集團', groupId: 'M10006', brand: 'flashBee', searchChannel: ['takeaway'], demotionType: ['deduction'], effectStartDate: '2026-06-10', effectEndDate: '2027-01-10', reason: '連鎖品牌效應過強，佔據多個搜索前列', operator: '浩源(003)', operateTime: '2026-06-10 10:00:00', status: 'active' },
  { key: '7', weightId: 'QZ20260607', groupName: '太平洋咖啡集團', groupId: 'M10007', brand: 'mFood', searchChannel: ['home', 'groupBuy'], demotionType: ['discount', 'deduction'], effectStartDate: '2026-06-15', effectEndDate: '2026-12-15', reason: '咖啡類目搜索長期霸榜，未參與平台推廣', operator: '古月(001)', operateTime: '2026-06-15 08:45:00', status: 'active' },
  { key: '8', weightId: 'QZ20260608', groupName: '海底撈集團', groupId: 'M10008', brand: 'flashBee', searchChannel: ['takeaway', 'groupBuy'], demotionType: ['discount'], effectStartDate: '2026-03-01', effectEndDate: '2026-06-01', reason: '火鍋類目壟斷搜索排名', operator: '加侖(002)', operateTime: '2026-03-01 13:20:00', status: 'inactive' },
]

export default function SearchWeightConfig() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WeightRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<WeightRecord | null>(null)
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ demotionType: ['discount'], status: 'active', searchChannel: ['takeaway'] })
    setIsModalOpen(true)
  }

  const handleEdit = (record: WeightRecord) => {
    setEditingRecord(record)
    form.setFieldsValue({
      ...record,
      dateRange: record.effectStartDate && record.effectEndDate ? [record.effectStartDate, record.effectEndDate] : undefined,
    })
    setIsModalOpen(true)
  }

  const handleDetail = (record: WeightRecord) => {
    setDetailRecord(record)
    setIsDetailModalOpen(true)
  }

  const handleToggleStatus = (record: WeightRecord) => {
    const newStatus = record.status === 'active' ? '失效' : '生效'
    Modal.confirm({
      title: '確認操作',
      content: `確定要將集團「${record.groupName}」的降權配置設為「${newStatus}」嗎？`,
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
    { key: 'weightId', title: '權重ID' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'demotionType', title: '降權類型' },
    { key: 'searchChannel', title: '搜索頻道' },
    { key: 'effectDate', title: '生效日期' },
    { key: 'operator', title: '操作人' },
    { key: 'operateTime', title: '操作時間' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('search-weight-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<WeightRecord> = [
    {
      title: '配置ID',
      dataIndex: 'weightId',
      key: 'weightId',
      width: 120,
    },
    {
      title: '集團ID',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100,
    },
    {
      title: '集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 180,
      ellipsis: true,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => brandMap[v] || v,
    },
    {
      title: '降權方式',
      dataIndex: 'demotionType',
      key: 'demotionType',
      width: 180,
      render: (v: string[]) => v.map(t => (
        <Tag key={t} color={t === 'discount' ? 'orange' : 'red'}>{demotionTypeMap[t]}</Tag>
      )),
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 140,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '生效時間',
      key: 'effectDate',
      width: 200,
      render: (_, r) => `${r.effectStartDate} ~ ${r.effectEndDate}`,
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 110,
    },
    {
      title: '操作時間',
      dataIndex: 'operateTime',
      key: 'operateTime',
      width: 160,
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
          <Form.Item label="集團名稱/ID">
            <Input placeholder="請輸入集團名稱或ID" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="全部" options={brandOptions} />
          </Form.Item>
          <Form.Item label="搜索頻道">
            <Select placeholder="全部" options={searchChannelOptions} />
          </Form.Item>
          <Form.Item label="降權方式">
            <Select mode="multiple" placeholder="全部" options={demotionTypeOptions} />
          </Form.Item>
          <Form.Item label="狀態">
            <Select placeholder="全部" options={statusOptions} />
          </Form.Item>
          <Form.Item label="生效時間">
            <RangePicker placeholder={['開始時間', '結束時間']} />
          </Form.Item>
          <Form.Item label="操作人">
            <Input placeholder="請輸入操作人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>搜尋</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<ExportOutlined />}>數據導出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增</Button>
        </Space>
              {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WeightRecord>
          columns={applyConfig(columns)}
          dataSource={mockData}
          rowSelection={{}}
          pagination={{
            total: 200,
            pageSize: 20,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1600 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯降權配置' : '新增降權配置'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="集團ID" name="groupId" rules={[{ required: true, message: '請輸入集團ID' }]}>
            <Input placeholder="請輸入集團ID" />
          </Form.Item>

          <Form.Item label="集團名稱" name="groupName" rules={[{ required: true, message: '請輸入集團名稱' }]}>
            <Input placeholder="請輸入集團名稱搜索" />
          </Form.Item>

          <Form.Item label="所屬品牌" name="brand" rules={[{ required: true, message: '請選擇' }]}>
            <Select options={brandOptions.filter(o => o.value !== 'all')} placeholder="請選擇品牌" />
          </Form.Item>

          <Form.Item label="降權方式" name="demotionType" rules={[{ required: true, message: '請選擇降權方式' }]} extra="支持多選，數值將在搜索規則中配置">
            <Select mode="multiple" options={demotionTypeOptions.filter(o => o.value !== 'all')} placeholder="請選擇降權方式" />
          </Form.Item>
          
          <Form.Item label="降權原因" name="reason" rules={[{ required: true, message: '請填寫降權原因' }]}>
            <TextArea rows={3} placeholder="請填寫降權原因，例如：品牌熱度過高，長期不購買廣告推廣" maxLength={200} showCount />
          </Form.Item>

          <Form.Item label="生效日期" name="dateRange" rules={[{ required: true, message: '請選擇生效日期' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="降權配置詳情"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={640}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div><span style={{ color: '#999' }}>配置ID：</span>{detailRecord.weightId}</div>
              <div><span style={{ color: '#999' }}>集團ID：</span>{detailRecord.groupId}</div>
              <div><span style={{ color: '#999' }}>集團名稱：</span>{detailRecord.groupName}</div>
              <div><span style={{ color: '#999' }}>所屬品牌：</span>{brandMap[detailRecord.brand]}</div>
              <div><span style={{ color: '#999' }}>搜索頻道：</span>{detailRecord.searchChannel.map(c => channelMap[c]).join('、')}</div>
              <div><span style={{ color: '#999' }}>降權方式：</span>{detailRecord.demotionType.map(t => <Tag key={t} color={t === 'discount' ? 'orange' : 'red'}>{demotionTypeMap[t]}</Tag>)}</div>
              <div><span style={{ color: '#999' }}>生效時間：</span>{detailRecord.effectStartDate} ~ {detailRecord.effectEndDate}</div>
              <div><span style={{ color: '#999' }}>狀態：</span>{detailRecord.status === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">失效</Tag>}</div>
              <div><span style={{ color: '#999' }}>操作人：</span>{detailRecord.operator}</div>
              <div><span style={{ color: '#999' }}>操作時間：</span>{detailRecord.operateTime}</div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#999' }}>降權原因：</span>{detailRecord.reason}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
