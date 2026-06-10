import { useState } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, message, Upload, Switch, Tabs, InputNumber, Image } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ImportOutlined,
  ExportOutlined,
  FireOutlined,
  RiseOutlined,
  CloudUploadOutlined,
  PictureOutlined,
} from '@ant-design/icons'

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

/** 詞庫分類 */
const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: '美食餐飲', value: 'food' },
  { label: '生鮮超市', value: 'supermarket' },
  { label: '甜點飲品', value: 'dessert' },
  { label: '品牌商家', value: 'brand' },
  { label: '節日活動', value: 'festival' },
  { label: '熱門話題', value: 'trending' },
]

/** 詞來源 */
const sourceOptions = [
  { label: '全部', value: 'all' },
  { label: '系統抓取', value: 'system' },
  { label: '運營添加', value: 'operation' },
  { label: '商戶提交', value: 'merchant' },
]

/** 審核狀態 */
const auditStatusOptions = [
  { label: '全部', value: 'all' },
  { label: '待審核', value: 'pending' },
  { label: '已通過', value: 'approved' },
  { label: '已駁回', value: 'rejected' },
]

/** 狀態選項 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效', value: 'active' },
  { label: '停用', value: 'inactive' },
]

interface HotSearchWord {
  key: string
  wordId: string
  word: string
  category: string
  source: string
  brand: string
  searchChannel: string[]
  heatScore: number
  searchCount: number
  trend: 'up' | 'down' | 'stable'
  auditStatus: 'pending' | 'approved' | 'rejected'
  status: 'active' | 'inactive'
  addedBy: string
  addedTime: string
  remark: string
  imageUrl?: string
}

interface CustomWord {
  key: string
  wordId: string
  word: string
  category: string
  brand: string
  searchChannel: string[]
  priority: number
  startDate: string
  endDate: string
  status: 'active' | 'inactive'
  addedBy: string
  addedTime: string
  remark: string
  imageUrl?: string
}

const categoryMap: Record<string, string> = {
  food: '美食餐飲',
  supermarket: '生鮮超市',
  dessert: '甜點飲品',
  brand: '品牌商家',
  festival: '節日活動',
  trending: '熱門話題',
}

const sourceMap: Record<string, string> = {
  system: '系統抓取',
  operation: '運營添加',
  merchant: '商戶提交',
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const channelMap: Record<string, string> = {
  home: '大首頁',
  takeaway: '外賣頻道',
  groupBuy: '團購頻道',
  supermarket: '超市頻道',
}

const mockHotWordData: HotSearchWord[] = [
  {
    key: '1',
    wordId: 'HW001',
    word: '火鍋',
    category: 'food',
    source: 'system',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway'],
    heatScore: 9850,
    searchCount: 45623,
    trend: 'up',
    auditStatus: 'approved',
    status: 'active',
    addedBy: '系統',
    addedTime: '2026-06-08 10:00:00',
    remark: '冬季熱門搜索詞，持續上升',
    imageUrl: 'https://via.placeholder.com/60/ff4d4f/fff?text=火鍋',
  },
  {
    key: '2',
    wordId: 'HW002',
    word: '珍珠奶茶',
    category: 'dessert',
    source: 'system',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway'],
    heatScore: 8920,
    searchCount: 38456,
    trend: 'stable',
    auditStatus: 'approved',
    status: 'active',
    addedBy: '系統',
    addedTime: '2026-06-08 10:00:00',
    remark: '穩定熱門詞',
    imageUrl: 'https://via.placeholder.com/60/fa8c16/fff?text=奶茶',
  },
  {
    key: '3',
    wordId: 'HW003',
    word: '麥當勞',
    category: 'brand',
    source: 'system',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway'],
    heatScore: 7650,
    searchCount: 32145,
    trend: 'up',
    auditStatus: 'approved',
    status: 'active',
    addedBy: '系統',
    addedTime: '2026-06-08 10:00:00',
    remark: '品牌詞熱度高',
    imageUrl: '',
  },
  {
    key: '4',
    wordId: 'HW004',
    word: '端午節優惠',
    category: 'festival',
    source: 'operation',
    brand: 'flashBee',
    searchChannel: ['home'],
    heatScore: 5420,
    searchCount: 18934,
    trend: 'up',
    auditStatus: 'approved',
    status: 'active',
    addedBy: '李婉婷(E10045)',
    addedTime: '2026-06-07 14:30:00',
    remark: '節日活動詞',
    imageUrl: 'https://via.placeholder.com/60/722ed1/fff?text=端午',
  },
  {
    key: '5',
    wordId: 'HW005',
    word: '超市生鮮',
    category: 'supermarket',
    source: 'merchant',
    brand: 'flashBee',
    searchChannel: ['supermarket'],
    heatScore: 4230,
    searchCount: 15678,
    trend: 'down',
    auditStatus: 'pending',
    status: 'inactive',
    addedBy: '商家提交',
    addedTime: '2026-06-06 09:15:00',
    remark: '待審核',
    imageUrl: '',
  },
  {
    key: '6',
    wordId: 'HW006',
    word: '炸雞',
    category: 'food',
    source: 'system',
    brand: 'mFood',
    searchChannel: ['takeaway'],
    heatScore: 6780,
    searchCount: 28456,
    trend: 'stable',
    auditStatus: 'approved',
    status: 'active',
    addedBy: '系統',
    addedTime: '2026-06-08 10:00:00',
    remark: '外賣熱門詞',
    imageUrl: 'https://via.placeholder.com/60/52c41a/fff?text=炸雞',
  },
]

const mockCustomWordData: CustomWord[] = [
  {
    key: '1',
    wordId: 'CW001',
    word: '618限時特惠',
    category: 'festival',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway', 'groupBuy'],
    priority: 1,
    startDate: '2026-06-15',
    endDate: '2026-06-20',
    status: 'active',
    addedBy: '張曉明(E10023)',
    addedTime: '2026-06-05 10:30:00',
    remark: '618活動推廣詞',
    imageUrl: 'https://via.placeholder.com/60/1890ff/fff?text=618',
  },
  {
    key: '2',
    wordId: 'CW002',
    word: '新開業優惠',
    category: 'brand',
    brand: 'flashBee',
    searchChannel: ['home'],
    priority: 2,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    status: 'active',
    addedBy: '陳浩然(E10067)',
    addedTime: '2026-06-01 09:00:00',
    remark: '新店開業推廣',
    imageUrl: '',
  },
  {
    key: '3',
    wordId: 'CW003',
    word: '下午茶套餐',
    category: 'dessert',
    brand: 'mFood',
    searchChannel: ['takeaway'],
    priority: 3,
    startDate: '2026-06-10',
    endDate: '2026-07-10',
    status: 'active',
    addedBy: '王美玲(E10089)',
    addedTime: '2026-06-08 14:20:00',
    remark: '下午茶時段推廣',
    imageUrl: 'https://via.placeholder.com/60/fa8c16/fff?text=下午茶',
  },
]

export default function HotSearchLibrary() {
  const [activeTab, setActiveTab] = useState('hotword')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchWord | CustomWord | null>(null)
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      status: 'active',
      searchChannel: ['home'],
      priority: 1,
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HotSearchWord | CustomWord) => {
    setEditingRecord(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = (record: HotSearchWord | CustomWord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除熱搜詞「${record.word}」嗎？此操作不可恢復。`,
      okText: '確定',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleToggleStatus = (record: HotSearchWord | CustomWord) => {
    const newStatus = record.status === 'active' ? '停用' : '生效'
    Modal.confirm({
      title: '確認操作',
      content: `確定要將熱搜詞「${record.word}」設為「${newStatus}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${newStatus}`),
    })
  }

  const handleBatchImport = () => {
    message.info('批量導入功能開發中')
  }

  const handleBatchExport = () => {
    message.success('導出成功')
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }

  const handleBatchAudit = (status: 'approved' | 'rejected') => {
    Modal.confirm({
      title: '批量審核',
      content: `確定要將選中的詞${status === 'approved' ? '通過' : '駁回'}嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`批量${status === 'approved' ? '通過' : '駁回'}成功`),
    })
  }

  const hotWordColumns: TableColumnsType<HotSearchWord> = [
    {
      title: '詞ID',
      dataIndex: 'wordId',
      key: 'wordId',
      width: 90,
    },
    {
      title: '熱搜詞',
      dataIndex: 'word',
      key: 'word',
      width: 180,
      render: (text: string, record: HotSearchWord) => (
        <Space>
          {record.imageUrl ? (
            <Image src={record.imageUrl} width={32} height={32} style={{ borderRadius: 4, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PictureOutlined style={{ color: '#ccc' }} />
            </div>
          )}
          <strong>{text}</strong>
        </Space>
      ),
    },
    {
      title: '詞庫分類',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (v: string) => <Tag color="blue">{categoryMap[v]}</Tag>,
    },
    {
      title: '詞來源',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      render: (v: string) => sourceMap[v] || v,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => brandMap[v] || v,
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 160,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '熱度分值',
      dataIndex: 'heatScore',
      key: 'heatScore',
      width: 100,
      render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{v}</span>,
    },
    {
      title: '搜索次數',
      dataIndex: 'searchCount',
      key: 'searchCount',
      width: 110,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '趨勢',
      dataIndex: 'trend',
      key: 'trend',
      width: 70,
      render: (v: string) => {
        if (v === 'up') return <RiseOutlined style={{ color: '#52c41a' }} />
        if (v === 'down') return <RiseOutlined style={{ color: '#ff4d4f', transform: 'rotate(180deg)' }} />
        return <span style={{ color: '#999' }}>=</span>
      },
    },
    {
      title: '審核狀態',
      dataIndex: 'auditStatus',
      key: 'auditStatus',
      width: 90,
      render: (v: string) => {
        const map: Record<string, { color: string; text: string }> = {
          pending: { color: 'orange', text: '待審核' },
          approved: { color: 'green', text: '已通過' },
          rejected: { color: 'red', text: '已駁回' },
        }
        const config = map[v] || { color: 'default', text: v }
        return <Tag color={config.color}>{config.text}</Tag>
      },
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) =>
        v === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '添加人',
      dataIndex: 'addedBy',
      key: 'addedBy',
      width: 140,
    },
    {
      title: '添加時間',
      dataIndex: 'addedTime',
      key: 'addedTime',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Button
            type="link"
            size="small"
            danger={record.status === 'active'}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  const customWordColumns: TableColumnsType<CustomWord> = [
    {
      title: '詞ID',
      dataIndex: 'wordId',
      key: 'wordId',
      width: 90,
    },
    {
      title: '自定義詞',
      dataIndex: 'word',
      key: 'word',
      width: 180,
      render: (text: string, record: CustomWord) => (
        <Space>
          {record.imageUrl ? (
            <Image src={record.imageUrl} width={32} height={32} style={{ borderRadius: 4, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PictureOutlined style={{ color: '#ccc' }} />
            </div>
          )}
          <strong>{text}</strong>
        </Space>
      ),
    },
    {
      title: '詞庫分類',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (v: string) => <Tag color="purple">{categoryMap[v]}</Tag>,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => brandMap[v] || v,
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 160,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
    },
    {
      title: '生效時間',
      key: 'effectDate',
      width: 200,
      render: (_, r) => `${r.startDate} ~ ${r.endDate}`,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) =>
        v === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '添加人',
      dataIndex: 'addedBy',
      key: 'addedBy',
      width: 140,
    },
    {
      title: '添加時間',
      dataIndex: 'addedTime',
      key: 'addedTime',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Button
            type="link"
            size="small"
            danger={record.status === 'active'}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  const tabItems = [
    {
      key: 'hotword',
      label: (
        <span>
          <FireOutlined />
          熱搜詞庫
        </span>
      ),
      children: (
        <>
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="熱搜詞">
                <Input placeholder="請輸入熱搜詞" allowClear style={{ height: 30 }} />
              </Form.Item>
              <Form.Item label="詞庫分類">
                <Select placeholder="全部" options={categoryOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="詞來源">
                <Select placeholder="全部" options={sourceOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="所屬品牌">
                <Select placeholder="全部" options={brandOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="搜索頻道">
                <Select placeholder="全部" options={searchChannelOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="審核狀態">
                <Select placeholder="全部" options={auditStatusOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="狀態">
                <Select placeholder="全部" options={statusOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>
                    搜尋
                  </Button>
                  <Button icon={<ReloadOutlined />} style={{ height: 30 }}>
                    重置
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <div className="action-section">
            <Space>
              <Button icon={<ImportOutlined />} onClick={handleBatchImport}>
                批量導入
              </Button>
              <Button icon={<ExportOutlined />} onClick={handleBatchExport}>
                數據導出
              </Button>
              <Button
                type="primary"
                style={{ backgroundColor: '#52c41a' }}
                onClick={() => handleBatchAudit('approved')}
              >
                批量通過
              </Button>
              <Button danger onClick={() => handleBatchAudit('rejected')}>
                批量駁回
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                新增熱搜詞
              </Button>
            </Space>
          </div>

          <div className="table-section">
            <Table<HotSearchWord>
              columns={hotWordColumns}
              dataSource={mockHotWordData}
              rowSelection={{}}
              pagination={{
                total: 500,
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
        </>
      ),
    },
    {
      key: 'custom',
      label: (
        <span>
          <FireOutlined />
          自定義詞
        </span>
      ),
      children: (
        <>
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="自定義詞">
                <Input placeholder="請輸入自定義詞" allowClear style={{ height: 30 }} />
              </Form.Item>
              <Form.Item label="詞庫分類">
                <Select placeholder="全部" options={categoryOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="所屬品牌">
                <Select placeholder="全部" options={brandOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="搜索頻道">
                <Select placeholder="全部" options={searchChannelOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="狀態">
                <Select placeholder="全部" options={statusOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>
                    搜尋
                  </Button>
                  <Button icon={<ReloadOutlined />} style={{ height: 30 }}>
                    重置
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <div className="action-section">
            <Space>
              <Button icon={<ImportOutlined />} onClick={handleBatchImport}>
                批量導入
              </Button>
              <Button icon={<ExportOutlined />} onClick={handleBatchExport}>
                數據導出
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                新增自定義詞
              </Button>
            </Space>
          </div>

          <div className="table-section">
            <Table<CustomWord>
              columns={customWordColumns}
              dataSource={mockCustomWordData}
              rowSelection={{}}
              pagination={{
                total: 150,
                pageSize: 20,
                showTotal: (total) => `共 ${total} 條`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showQuickJumper: true,
              }}
              size="middle"
              bordered={false}
              scroll={{ x: 1400 }}
            />
          </div>
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="large" />

      <Modal
        title={editingRecord ? '編輯熱搜詞' : '新增熱搜詞'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="熱搜詞"
            name="word"
            rules={[{ required: true, message: '請輸入熱搜詞' }]}
          >
            <Input placeholder="請輸入熱搜詞，如：火鍋、奶茶" maxLength={50} showCount />
          </Form.Item>

          <Form.Item
            label="詞庫分類"
            name="category"
            rules={[{ required: true, message: '請選擇詞庫分類' }]}
          >
            <Select
              options={categoryOptions.filter((o) => o.value !== 'all')}
              placeholder="請選擇詞庫分類"
            />
          </Form.Item>

          {activeTab === 'hotword' && (
            <Form.Item
              label="詞來源"
              name="source"
              rules={[{ required: true, message: '請選擇詞來源' }]}
            >
              <Select
                options={sourceOptions.filter((o) => o.value !== 'all')}
                placeholder="請選擇詞來源"
              />
            </Form.Item>
          )}

          <Form.Item
            label="所屬品牌"
            name="brand"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select
              options={brandOptions.filter((o) => o.value !== 'all')}
              placeholder="請選擇品牌"
            />
          </Form.Item>

          <Form.Item
            label="搜索頻道"
            name="searchChannel"
            rules={[{ required: true, message: '請選擇搜索頻道' }]}
          >
            <Select
              mode="multiple"
              options={searchChannelOptions}
              placeholder="請選擇搜索頻道"
            />
          </Form.Item>

          {activeTab === 'hotword' && (
            <>
              <Form.Item
                label="熱度分值"
                name="heatScore"
                rules={[{ required: true, message: '請輸入熱度分值' }]}
                extra="分值越高，排名越靠前（0-10000）"
              >
                <InputNumber min={0} max={10000} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="審核狀態"
                name="auditStatus"
                rules={[{ required: true, message: '請選擇審核狀態' }]}
              >
                <Select
                  options={[
                    { label: '待審核', value: 'pending' },
                    { label: '已通過', value: 'approved' },
                    { label: '已駁回', value: 'rejected' },
                  ]}
                />
              </Form.Item>
            </>
          )}

          {activeTab === 'custom' && (
            <>
              <Form.Item
                label="優先級"
                name="priority"
                rules={[{ required: true, message: '請輸入優先級' }]}
                extra="數字越小優先級越高（1-100）"
              >
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="生效時間"
                name="dateRange"
                rules={[{ required: true, message: '請選擇生效時間' }]}
              >
                <Input.Group compact>
                  <Input placeholder="開始日期" style={{ width: '50%' }} />
                  <Input placeholder="結束日期" style={{ width: '50%' }} />
                </Input.Group>
              </Form.Item>
            </>
          )}

          <Form.Item
            label="配圖"
            name="imageUrl"
            extra="建議尺寸：200x200px，支持 JPG/PNG 格式，大小不超過 2MB"
          >
            <Upload
              listType="picture-card"
              maxCount={1}
              accept=".jpg,.jpeg,.png"
              beforeUpload={() => false}
            >
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8, fontSize: 12 }}>上傳圖片</div>
              </div>
            </Upload>
          </Form.Item>

          <Form.Item
            label="備註"
            name="remark"
            rules={[{ required: true, message: '請填寫備註' }]}
          >
            <TextArea
              rows={3}
              placeholder="請填寫備註說明，如：活動推廣詞、節日營銷詞等"
              maxLength={200}
              showCount
            />
          </Form.Item>

          <Form.Item label="狀態" name="status">
            <Select
              options={statusOptions.filter((o) => o.value !== 'all')}
              placeholder="請選擇狀態"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
