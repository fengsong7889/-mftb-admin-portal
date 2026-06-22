import { useState, useMemo } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, message, Upload } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ImportOutlined,
  ExportOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

/* ===== 常量配置 ===== */

/** 品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mfood' },
  { label: '閃峰', value: 'flashBee' },
]
const brandMap: Record<string, string> = { mfood: 'mFood', flashBee: '閃峰' }

/** 搜索入口下拉选项 */
const entryOptions = [
  { label: '全部入口', value: 'all' },
  { label: '大首頁', value: 'home' },
  { label: '外賣搜索', value: 'takeaway' },
  { label: '超市搜索', value: 'supermarket' },
  { label: '團購搜索', value: 'groupBuy' },
]

const entryMap: Record<string, string> = {
  home: '大首頁', takeaway: '外賣搜索', supermarket: '超市搜索', groupBuy: '團購搜索',
}

const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: '美食餐飲', value: 'food' },
  { label: '生鮮超市', value: 'supermarket' },
  { label: '甜點飲品', value: 'dessert' },
  { label: '品牌商家', value: 'brand' },
  { label: '節日活動', value: 'festival' },
  { label: '熱門話題', value: 'trending' },
]

const sourceOptions = [
  { label: '全部', value: 'all' },
  { label: '系統抓取', value: 'system' },
  { label: '運營添加', value: 'operation' },
  { label: '商戶提交', value: 'merchant' },
]

const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效', value: 'active' },
  { label: '停用', value: 'inactive' },
]

const categoryMap: Record<string, string> = {
  food: '美食餐飲', supermarket: '生鮮超市', dessert: '甜點飲品',
  brand: '品牌商家', festival: '節日活動', trending: '熱門話題',
}
const sourceMap: Record<string, string> = { system: '系統抓取', operation: '運營添加', merchant: '商戶提交' }

/** 展示位置 */
const displayPositionOptions = [
  { label: '全部', value: 'all' },
  { label: '頂部', value: 'top' },
  { label: '底部', value: 'bottom' },
]
const displayPositionMap: Record<string, string> = { top: '頂部', bottom: '底部' }

/* ===== 数据模型 ===== */

interface HotSearchWord {
  key: string
  wordId: string
  rank: number
  word: string
  category: string
  source: string
  brand: string
  searchEntry: string
  searchCount: number
  displayPosition: string
  status: 'active' | 'inactive'
  addedBy: string
  addedTime: string
  remark: string
}

/* ===== Mock 数据 ===== */

function makeMockData(): HotSearchWord[] {
  const words: Omit<HotSearchWord, 'key' | 'rank'>[] = [
    // mFood - 大首页
    { wordId: 'MF-HW001', word: '火鍋', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 45623, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '冬季熱門詞' },
    { wordId: 'MF-HW002', word: '珍珠奶茶', category: 'dessert', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 38456, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '穩定熱門詞' },
    { wordId: 'MF-HW003', word: '618大促', category: 'festival', source: 'operation', brand: 'mfood', searchEntry: 'home', searchCount: 35000, displayPosition: 'top', status: 'active', addedBy: '張曉明(E10023)', addedTime: '2026-06-05 10:30', remark: '618活動推廣' },
    { wordId: 'MF-HW004', word: '麥當勞', category: 'brand', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 32145, displayPosition: 'bottom', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '品牌詞' },
    { wordId: 'MF-HW005', word: '壽司', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 21000, displayPosition: 'bottom', status: 'active', addedBy: '系統', addedTime: '2026-06-07 09:00', remark: '' },
    // mFood - 外卖搜索
    { wordId: 'MF-HW010', word: '炸雞', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'takeaway', searchCount: 41000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '外賣熱門' },
    { wordId: 'MF-HW011', word: '漢堡包', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'takeaway', searchCount: 33000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW012', word: '燒臘飯', category: 'food', source: 'merchant', brand: 'mfood', searchEntry: 'takeaway', searchCount: 27000, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-06 09:15', remark: '' },
    { wordId: 'MF-HW013', word: '下午茶套餐', category: 'dessert', source: 'operation', brand: 'mfood', searchEntry: 'takeaway', searchCount: 24000, displayPosition: 'bottom', status: 'active', addedBy: '王美玲(E10089)', addedTime: '2026-06-08 14:20', remark: '下午茶時段' },
    // mFood - 超市搜索
    { wordId: 'MF-HW020', word: '生鮮蔬菜', category: 'supermarket', source: 'system', brand: 'mfood', searchEntry: 'supermarket', searchCount: 30000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW021', word: '牛奶', category: 'supermarket', source: 'system', brand: 'mfood', searchEntry: 'supermarket', searchCount: 28500, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW022', word: '零食大禮包', category: 'supermarket', source: 'merchant', brand: 'mfood', searchEntry: 'supermarket', searchCount: 18000, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-05 11:00', remark: '' },
    // mFood - 团购搜索
    { wordId: 'MF-HW030', word: '自助餐', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'groupBuy', searchCount: 37000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW031', word: 'SPA套餐', category: 'trending', source: 'operation', brand: 'mfood', searchEntry: 'groupBuy', searchCount: 25000, displayPosition: 'bottom', status: 'active', addedBy: '陳浩然(E10067)', addedTime: '2026-06-07 16:00', remark: '團購推廣' },
    // 闪峰 - 大首页
    { wordId: 'SF-HW001', word: '端午禮盒', category: 'festival', source: 'operation', brand: 'flashBee', searchEntry: 'home', searchCount: 34000, displayPosition: 'top', status: 'active', addedBy: '李婉婷(E10045)', addedTime: '2026-06-07 14:30', remark: '端午節推廣' },
    { wordId: 'SF-HW002', word: '咖啡', category: 'dessert', source: 'system', brand: 'flashBee', searchEntry: 'home', searchCount: 31500, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW003', word: '新開業優惠', category: 'brand', source: 'operation', brand: 'flashBee', searchEntry: 'home', searchCount: 28000, displayPosition: 'bottom', status: 'active', addedBy: '陳浩然(E10067)', addedTime: '2026-06-01 09:00', remark: '新店開業' },
    // 闪峰 - 外卖搜索
    { wordId: 'SF-HW010', word: '日式拉麵', category: 'food', source: 'system', brand: 'flashBee', searchEntry: 'takeaway', searchCount: 33200, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW011', word: '泰式炒河', category: 'food', source: 'system', brand: 'flashBee', searchEntry: 'takeaway', searchCount: 25500, displayPosition: 'bottom', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW012', word: '麻辣燙', category: 'food', source: 'merchant', brand: 'flashBee', searchEntry: 'takeaway', searchCount: 22000, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-06 15:00', remark: '' },
    // 闪峰 - 超市搜索
    { wordId: 'SF-HW020', word: '進口水果', category: 'supermarket', source: 'system', brand: 'flashBee', searchEntry: 'supermarket', searchCount: 27000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW021', word: '有機蔬菜', category: 'supermarket', source: 'merchant', brand: 'flashBee', searchEntry: 'supermarket', searchCount: 17500, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-06 09:15', remark: '' },
    // 闪峰 - 团购搜索
    { wordId: 'SF-HW030', word: '酒店自助餐', category: 'food', source: 'system', brand: 'flashBee', searchEntry: 'groupBuy', searchCount: 36000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW031', word: '健身月卡', category: 'trending', source: 'operation', brand: 'flashBee', searchEntry: 'groupBuy', searchCount: 24000, displayPosition: 'bottom', status: 'active', addedBy: '李婉婷(E10045)', addedTime: '2026-06-04 11:00', remark: '團購推廣' },
  ]
  return words.map((w, i) => ({ ...w, key: String(i + 1), rank: 0 }))
    .sort((a, b) => b.searchCount - a.searchCount)
    .map((w, i) => ({ ...w, rank: i + 1 }))
}

const allData = makeMockData()

/* ===== 组件 ===== */

export default function HotSearchLibrary() {
  const [filterBrand, setFilterBrand] = useState('all')
  const [activeEntry, setActiveEntry] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchWord | null>(null)
  const [form] = Form.useForm()

  // 筛选条件
  const [filterWord, setFilterWord] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | undefined>()
  const [filterSource, setFilterSource] = useState<string | undefined>()
  const [filterStatus, setFilterStatus] = useState<string | undefined>()

  // 根据品牌+入口筛选数据
  const filteredData = useMemo(() => {
    let data = allData
    if (filterBrand !== 'all') {
      data = data.filter(d => d.brand === filterBrand)
    }
    if (activeEntry !== 'all') {
      data = data.filter(d => d.searchEntry === activeEntry)
    }
    if (filterWord) {
      data = data.filter(d => d.word.toLowerCase().includes(filterWord.toLowerCase()))
    }
    if (filterCategory && filterCategory !== 'all') {
      data = data.filter(d => d.category === filterCategory)
    }
    if (filterSource && filterSource !== 'all') {
      data = data.filter(d => d.source === filterSource)
    }
    if (filterStatus && filterStatus !== 'all') {
      data = data.filter(d => d.status === filterStatus)
    }
    return data
  }, [filterBrand, activeEntry, filterWord, filterCategory, filterSource, filterStatus])

  const handleReset = () => {
    setFilterWord('')
    setFilterCategory(undefined)
    setFilterSource(undefined)
    setFilterStatus(undefined)
    setFilterBrand('all')
    setActiveEntry('all')
  }

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      brand: filterBrand === 'all' ? 'mfood' : filterBrand,
      searchEntry: activeEntry === 'all' ? 'home' : activeEntry,
      category: 'food',
      source: 'operation',
      displayPosition: 'bottom',
      status: 'active',
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HotSearchWord) => {
    setEditingRecord(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = (record: HotSearchWord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除熱搜詞「${record.word}」嗎？此操作不可恢復。`,
      okText: '確定', okType: 'danger', cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleToggleStatus = (record: HotSearchWord) => {
    const action = record.status === 'active' ? '停用' : '啟用'
    Modal.confirm({
      title: '確認操作',
      content: `確定要將「${record.word}」設為「${action}」嗎？`,
      okText: '確定', cancelText: '取消',
      onOk: () => message.success(`已${action}`),
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }

  /* 表格列 */
  const columns: TableColumnsType<HotSearchWord> = [
    {
      title: '排名', dataIndex: 'rank', key: 'rank', width: 70, align: 'center',
      render: (v: number) => {
        const colors = ['#ff4d4f', '#fa8c16', '#fadb14']
        if (v <= 3) return <Tag color={colors[v - 1]} style={{ fontWeight: 'bold', minWidth: 32, textAlign: 'center' }}>{v}</Tag>
        return <span style={{ color: '#999' }}>{v}</span>
      },
    },
    {
      title: '熱搜詞', dataIndex: 'word', key: 'word', width: 180,
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: '詞庫分類', dataIndex: 'category', key: 'category', width: 110,
      render: (v: string) => <Tag color="blue">{categoryMap[v]}</Tag>,
    },
    {
      title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 90,
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
          {brandMap[v]}
        </Tag>
      ),
    },
    {
      title: '搜索入口', dataIndex: 'searchEntry', key: 'searchEntry', width: 110,
      render: (v: string) => <Tag color="geekblue">{entryMap[v]}</Tag>,
    },
    {
      title: '詞來源', dataIndex: 'source', key: 'source', width: 100,
      render: (v: string) => {
        const map: Record<string, { color: string; text: string }> = {
          system: { color: 'cyan', text: '系統抓取' },
          operation: { color: 'purple', text: '運營添加' },
          merchant: { color: 'orange', text: '商戶提交' },
        }
        const c = map[v] || { color: 'default', text: v }
        return <Tag color={c.color}>{c.text}</Tag>
      },
    },
    {
      title: '搜索次數', dataIndex: 'searchCount', key: 'searchCount', width: 110,
      sorter: (a, b) => a.searchCount - b.searchCount,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '展示位置', dataIndex: 'displayPosition', key: 'displayPosition', width: 80,
      render: (v: string) => <Tag color={v === 'top' ? 'orange' : 'default'}>{displayPositionMap[v] || v}</Tag>,
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 70,
      render: (v: string) => v === 'active' ? <Tag color="green">生效</Tag> : <Tag color="default">停用</Tag>,
    },
    {
      title: '添加人', dataIndex: 'addedBy', key: 'addedBy', width: 140, ellipsis: true,
    },
    {
      title: '添加時間', dataIndex: 'addedTime', key: 'addedTime', width: 150,
    },
    {
      title: '操作', key: 'action', width: 140, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button type="link" size="small" danger={record.status === 'active'} onClick={() => handleToggleStatus(record)}>
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="熱搜詞">
            <Input
              placeholder="輸入關鍵詞"
              allowClear
              value={filterWord}
              onChange={e => setFilterWord(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select
              value={filterBrand}
              onChange={v => { setFilterBrand(v); setActiveEntry('all') }}
              options={brandOptions}
            />
          </Form.Item>
          <Form.Item label="搜索入口">
            <Select
              value={activeEntry}
              onChange={v => setActiveEntry(v || 'all')}
              options={entryOptions}
            />
          </Form.Item>
          <Form.Item label="分類">
            <Select
              placeholder="全部"
              allowClear
              value={filterCategory}
              onChange={setFilterCategory}
              options={categoryOptions}
            />
          </Form.Item>
          <Form.Item label="詞來源">
            <Select
              placeholder="全部"
              allowClear
              value={filterSource}
              onChange={setFilterSource}
              options={sourceOptions}
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              placeholder="全部"
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              options={statusOptions}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区域 */}
      <div className="action-section">
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增熱搜詞</Button>
          <Button icon={<ImportOutlined />} onClick={() => message.info('批量導入功能開發中')}>批量導入</Button>
          <Button icon={<ExportOutlined />} onClick={() => message.success('導出成功')}>數據導出</Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<HotSearchWord>
          columns={columns}
          dataSource={filteredData}
          rowSelection={{}}
          pagination={{
            total: filteredData.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1600 }}
          locale={{ emptyText: '暫無熱搜詞數據' }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯熱搜詞' : '新增熱搜詞'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="熱搜詞" name="word" rules={[{ required: true, message: '請輸入熱搜詞' }]}>
            <Input placeholder="請輸入熱搜詞，如：火鍋、奶茶" maxLength={50} showCount />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="所屬品牌" name="brand" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={brandOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
            <Form.Item label="搜索入口" name="searchEntry" rules={[{ required: true, message: '請選擇搜索入口' }]} style={{ flex: 1 }}>
              <Select options={entryOptions.filter(e => e.value !== 'all')} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="詞庫分類" name="category" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={categoryOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
            <Form.Item label="詞來源" name="source" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={sourceOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
          </div>

          <Form.Item label="展示位置" name="displayPosition" rules={[{ required: true, message: '請選擇展示位置' }]}>
            <Select options={displayPositionOptions.filter(o => o.value !== 'all')} />
          </Form.Item>

          <Form.Item label="配圖" name="imageUrl" extra="建議尺寸：200×200px，支持 JPG/PNG，不超過 2MB">
            <Upload listType="picture-card" maxCount={1} accept=".jpg,.jpeg,.png" beforeUpload={() => false}>
              <div><PlusCircleOutlined /><div style={{ marginTop: 6, fontSize: 12 }}>上傳圖片</div></div>
            </Upload>
          </Form.Item>

          <Form.Item label="備註" name="remark">
            <TextArea rows={3} placeholder="請填寫備註說明" maxLength={200} showCount />
          </Form.Item>

          <Form.Item label="狀態" name="status">
            <Select options={statusOptions.filter(o => o.value !== 'all')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
