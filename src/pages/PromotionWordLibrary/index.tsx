import { useState, useMemo } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, Switch, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  ImportOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { TextArea } = Input

/* ──────────── 常量定义 ──────────── */

/** 词库分类 */
const WORD_CATEGORY = {
  product:    { label: '品類詞',     color: 'blue' },
  dish:       { label: '菜名詞',     color: 'orange' },
  ingredient: { label: '食材詞',     color: 'green' },
  flavor:     { label: '口味/做法詞', color: 'purple' },
  brand:      { label: '品牌詞',     color: 'gold' },
  promo:      { label: '營銷詞',     color: 'red' },
  scene:      { label: '場景詞',     color: 'cyan' },
} as const

type CategoryKey = keyof typeof WORD_CATEGORY

/** 词条来源 */
const WORD_SOURCE = {
  manual: '手動錄入',
  system: '系統提取',
  import: '批量導入',
} as const

type SourceKey = keyof typeof WORD_SOURCE

/** 业务频道 */
const CHANNEL_OPTIONS = [
  { label: '美食外賣', value: 'takeaway' },
  { label: '超市百貨', value: 'supermarket' },
  { label: '團購到店', value: 'groupBuy' },
]

const CHANNEL_LABEL: Record<string, string> = {
  takeaway: '美食外賣',
  supermarket: '超市百貨',
  groupBuy: '團購到店',
}

/** 状态选项 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '啟用', value: 'active' },
  { label: '停用', value: 'inactive' },
]

/** 来源选项 */
const sourceOptions = [
  { label: '全部', value: 'all' },
  { label: '手動錄入', value: 'manual' },
  { label: '系統提取', value: 'system' },
  { label: '批量導入', value: 'import' },
]

/** 频道选项 */
const channelFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '美食外賣', value: 'takeaway' },
  { label: '超市百貨', value: 'supermarket' },
  { label: '團購到店', value: 'groupBuy' },
]

/* ──────────── 类型定义 ──────────── */

interface WordRecord {
  key: string
  id: number
  word: string
  category: CategoryKey
  channels: string[]
  source: SourceKey
  status: 'active' | 'inactive'
  matchCount: number
  updatedBy: string
  updateTime: string
  remark: string
}

/* ──────────── Mock 数据 ──────────── */

const mockData: WordRecord[] = [
  { key: '1', id: 1, word: '牛肉面', category: 'product', channels: ['takeaway'], source: 'manual', status: 'active', matchCount: 12580, updatedBy: '張曉明(E10023)', updateTime: '2026-07-28 10:30:00', remark: '核心品類詞' },
  { key: '2', id: 2, word: '奶茶', category: 'product', channels: ['takeaway', 'supermarket'], source: 'manual', status: 'active', matchCount: 23450, updatedBy: '李婉婷(E10045)', updateTime: '2026-07-27 15:20:00', remark: '飲品品類' },
  { key: '3', id: 3, word: '火鍋', category: 'product', channels: ['takeaway'], source: 'system', status: 'active', matchCount: 8920, updatedBy: '王建華(E10067)', updateTime: '2026-07-26 09:15:00', remark: '' },
  { key: '4', id: 4, word: '火爆牛肉面套餐', category: 'dish', channels: ['takeaway'], source: 'system', status: 'active', matchCount: 3260, updatedBy: '陳美琪(E10089)', updateTime: '2026-07-25 14:00:00', remark: '商家上傳菜品提取' },
  { key: '5', id: 5, word: '珍珠奶茶', category: 'dish', channels: ['takeaway'], source: 'system', status: 'active', matchCount: 7840, updatedBy: '張曉明(E10023)', updateTime: '2026-07-24 11:45:00', remark: '' },
  { key: '6', id: 6, word: '麻辣火鍋', category: 'dish', channels: ['takeaway'], source: 'manual', status: 'active', matchCount: 5120, updatedBy: '李婉婷(E10045)', updateTime: '2026-07-23 16:30:00', remark: '辣味火鍋' },
  { key: '7', id: 7, word: '牛肉', category: 'ingredient', channels: ['takeaway', 'supermarket'], source: 'system', status: 'active', matchCount: 18760, updatedBy: '王建華(E10067)', updateTime: '2026-07-22 08:20:00', remark: '高頻食材' },
  { key: '8', id: 8, word: '珍珠', category: 'ingredient', channels: ['takeaway'], source: 'manual', status: 'active', matchCount: 6430, updatedBy: '陳美琪(E10089)', updateTime: '2026-07-21 13:10:00', remark: '奶茶配料' },
  { key: '9', id: 9, word: '豆腐', category: 'ingredient', channels: ['takeaway', 'supermarket'], source: 'import', status: 'active', matchCount: 4210, updatedBy: '張曉明(E10023)', updateTime: '2026-07-20 10:00:00', remark: '批量導入' },
  { key: '10', id: 10, word: '麻辣', category: 'flavor', channels: ['takeaway'], source: 'system', status: 'active', matchCount: 15320, updatedBy: '李婉婷(E10045)', updateTime: '2026-07-19 15:30:00', remark: '高頻口味' },
  { key: '11', id: 11, word: '燒烤', category: 'flavor', channels: ['takeaway'], source: 'manual', status: 'active', matchCount: 9870, updatedBy: '王建華(E10067)', updateTime: '2026-07-18 09:20:00', remark: '' },
  { key: '12', id: 12, word: '紅燒', category: 'flavor', channels: ['takeaway'], source: 'manual', status: 'inactive', matchCount: 2340, updatedBy: '陳美琪(E10089)', updateTime: '2026-07-17 14:15:00', remark: '使用頻率低，已停用' },
  { key: '13', id: 13, word: 'KFC', category: 'brand', channels: ['takeaway'], source: 'manual', status: 'active', matchCount: 4560, updatedBy: '張曉明(E10023)', updateTime: '2026-07-16 10:30:00', remark: '品牌簡稱' },
  { key: '14', id: 14, word: '麥當勞', category: 'brand', channels: ['takeaway'], source: 'manual', status: 'active', matchCount: 6780, updatedBy: '李婉婷(E10045)', updateTime: '2026-07-15 11:00:00', remark: '' },
  { key: '15', id: 15, word: '買一送一', category: 'promo', channels: ['takeaway', 'groupBuy'], source: 'system', status: 'active', matchCount: 8920, updatedBy: '王建華(E10067)', updateTime: '2026-07-14 08:45:00', remark: '常見營銷詞' },
  { key: '16', id: 16, word: '限時優惠', category: 'promo', channels: ['takeaway', 'supermarket', 'groupBuy'], source: 'import', status: 'active', matchCount: 5430, updatedBy: '陳美琪(E10089)', updateTime: '2026-07-13 16:20:00', remark: '' },
  { key: '17', id: 17, word: '早餐', category: 'scene', channels: ['takeaway'], source: 'system', status: 'active', matchCount: 11230, updatedBy: '張曉明(E10023)', updateTime: '2026-07-12 09:30:00', remark: '時段場景詞' },
  { key: '18', id: 18, word: '夜宵', category: 'scene', channels: ['takeaway'], source: 'manual', status: 'active', matchCount: 7650, updatedBy: '李婉婷(E10045)', updateTime: '2026-07-11 14:00:00', remark: '' },
  { key: '19', id: 19, word: '下午茶', category: 'scene', channels: ['takeaway', 'groupBuy'], source: 'manual', status: 'inactive', matchCount: 1890, updatedBy: '王建華(E10067)', updateTime: '2026-07-10 11:15:00', remark: '使用頻率低' },
]

/* ──────────── 组件 ──────────── */

export default function PromotionWordLibrary() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WordRecord | null>(null)
  const [form] = Form.useForm()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [data, setData] = useState<WordRecord[]>(mockData)
  const [remarkModalOpen, setRemarkModalOpen] = useState(false)
  const [remarkContent, setRemarkContent] = useState({ word: '', remark: '' })

  /* ---- 列配置 ---- */
  const columnMeta = useMemo(() => [
    { key: 'word', title: '詞條' },
    { key: 'category', title: '分類' },
    { key: 'channels', title: '所屬頻道' },
    { key: 'source', title: '來源' },
    { key: 'status', title: '狀態' },
    { key: 'matchCount', title: '匹配次數' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updateTime', title: '最後更新時間' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('promotion-word-library', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ---- 事件处理 ---- */
  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ category: 'product', source: 'manual', status: true })
    setIsModalOpen(true)
  }

  const handleEdit = (record: WordRecord) => {
    setEditingRecord(record)
    form.setFieldsValue({
      ...record,
      status: record.status === 'active',
    })
    setIsModalOpen(true)
  }

  const handleDelete = (record: WordRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除詞條「${record.word}」嗎？刪除後將不再參與推薦匹配。`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setData(prev => prev.filter(item => item.id !== record.id))
        message.success('刪除成功')
      },
    })
  }

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇要刪除的詞條')
      return
    }
    Modal.confirm({
      title: '批量刪除',
      content: `確定要刪除選中的 ${selectedRowKeys.length} 條詞條嗎？此操作不可恢復。`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setData(prev => prev.filter(item => !selectedRowKeys.includes(item.id)))
        setSelectedRowKeys([])
        message.success(`已刪除 ${selectedRowKeys.length} 條`)
      },
    })
  }

  const handleToggleStatus = (record: WordRecord) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active'
    const actionText = newStatus === 'active' ? '啟用' : '停用'
    setData(prev =>
      prev.map(item =>
        item.id === record.id ? { ...item, status: newStatus } : item
      )
    )
    message.success(`已${actionText}詞條「${record.word}」`)
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }

  const handleBatchImport = () => {
    message.info('批量導入功能開發中')
  }

  const handleExport = () => {
    message.success('導出成功')
  }

  /* ---- 表格列定义 ---- */
  const columns: TableColumnsType<WordRecord> = [
    {
      title: '詞條',
      dataIndex: 'word',
      key: 'word',
      width: 100,
      render: (val: string) => <span style={{ fontWeight: 600, color: '#2D3436' }}>{val}</span>,
    },
    {
      title: '分類',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: CategoryKey) => {
        const cfg = WORD_CATEGORY[cat]
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: '所屬頻道',
      dataIndex: 'channels',
      key: 'channels',
      width: 150,
      render: (chs: string[]) => (
        <Space size={[4, 4]} wrap>
          {chs.map(ch => <Tag key={ch}>{CHANNEL_LABEL[ch] || ch}</Tag>)}
        </Space>
      ),
    },
    {
      title: '來源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (src: SourceKey) => {
        const colorMap: Record<string, string> = { manual: 'green', system: 'blue', import: 'orange' }
        return <Tag color={colorMap[src]}>{WORD_SOURCE[src]}</Tag>
      },
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record) => (
        <Switch
          size="small"
          checked={status === 'active'}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: '匹配次數',
      dataIndex: 'matchCount',
      key: 'matchCount',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.matchCount - b.matchCount,
      render: (val: number) => <span>{val.toLocaleString()}</span>,
    },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 150 },
    { title: '最後更新時間', dataIndex: 'updateTime', key: 'updateTime', width: 150 },
    {
      title: '備註',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      render: (val: string, record: WordRecord) =>
        val
          ? <Button type="link" size="small" style={{ padding: 0 }} onClick={() => { setRemarkContent({ word: record.word, remark: val }); setRemarkModalOpen(true) }}>查看</Button>
          : <span style={{ color: '#BFBFBF' }}>—</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ),
    },
  ]

  /* ---- 统计数字 ---- */
  const totalCount = data.length
  const activeCount = data.filter(d => d.status === 'active').length

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="詞條關鍵詞">
            <Input placeholder="請輸入關鍵詞" allowClear />
          </Form.Item>
          <Form.Item label="詞庫分類">
            <Select
              options={[
                { label: '全部', value: 'all' },
                ...Object.entries(WORD_CATEGORY).map(([key, val]) => ({ label: val.label, value: key })),
              ]}
              defaultValue="all"
              placeholder="全部"
              allowClear
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select options={statusOptions} defaultValue="all" placeholder="全部" allowClear />
          </Form.Item>
          <Form.Item label="來源">
            <Select options={sourceOptions} defaultValue="all" placeholder="全部" allowClear />
          </Form.Item>
          <Form.Item label="所屬頻道">
            <Select options={channelFilterOptions} defaultValue="all" placeholder="全部" allowClear />
          </Form.Item>
          <Form.Item label="更新時間">
            <RangePicker />
          </Form.Item>
          <Form.Item label="備註">
            <Input placeholder="請輸入備註關鍵詞" allowClear />
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
        <div className="action-section-left">
          <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>批量刪除</Button>
          <Button className="btn-import" icon={<ImportOutlined />} onClick={handleBatchImport}>批量導入</Button>
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
          <span style={{ color: '#999', fontSize: 13 }}>
            共 <b style={{ color: '#E8720C' }}>{totalCount}</b> 條詞條，啟用 <b style={{ color: '#52C41A' }}>{activeCount}</b> 條
            {selectedRowKeys.length > 0 && <span>，已選 <b>{selectedRowKeys.length}</b> 條</span>}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增詞條</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WordRecord>
          columns={applyConfig(columns)}
          dataSource={data}
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            total: data.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1250 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯詞條' : '新增詞條'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="詞條"
            name="word"
            rules={[{ required: true, message: '請輸入詞條' }]}
          >
            <Input placeholder="請輸入詞條（如：牛肉面）" />
          </Form.Item>
          <Form.Item
            label="詞庫分類"
            name="category"
            rules={[{ required: true, message: '請選擇詞庫分類' }]}
          >
            <Select
              options={Object.entries(WORD_CATEGORY).map(([key, val]) => ({
                label: val.label,
                value: key,
              }))}
              placeholder="請選擇詞庫分類"
            />
          </Form.Item>
          <Form.Item
            label="所屬頻道"
            name="channels"
            rules={[{ required: true, message: '請選擇所屬頻道' }]}
          >
            <Select
              mode="multiple"
              options={CHANNEL_OPTIONS}
              placeholder="請選擇適用的業務頻道"
            />
          </Form.Item>
          <Form.Item
            label="來源"
            name="source"
            rules={[{ required: true, message: '請選擇來源' }]}
          >
            <Select
              options={Object.entries(WORD_SOURCE).map(([key, val]) => ({
                label: val,
                value: key,
              }))}
              placeholder="請選擇來源"
            />
          </Form.Item>
          <Form.Item label="是否啟用" name="status" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" defaultChecked />
          </Form.Item>
          <Form.Item label="備註" name="remark">
            <TextArea placeholder="請輸入備註說明（選填）" rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 备注详情弹窗 */}
      <Modal
        title={`備註 — ${remarkContent.word}`}
        open={remarkModalOpen}
        onCancel={() => setRemarkModalOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ padding: '12px 0', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#262626' }}>
          {remarkContent.remark || '暫無備註'}
        </div>
      </Modal>
    </div>
  )
}
