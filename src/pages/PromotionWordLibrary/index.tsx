import { useState, useMemo, useCallback, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, Switch, Radio, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchWordLibraryList,
  createWordLibraryItem,
  updateWordLibraryItem,
  toggleWordLibraryStatus,
  deleteWordLibraryItem,
} from '../../api/wordLibrary'
import type { WordLibraryItem } from '../../api/wordLibrary'

const { RangePicker } = DatePicker
const { TextArea } = Input

/* ──────────── 常量定义 ──────────── */

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

/** 状态选项 — 值对应后端 1=啟用 2=停用 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '啟用', value: 1 },
  { label: '停用', value: 2 },
]

/** 频道选项 */
const channelFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '美食外賣', value: 'takeaway' },
  { label: '超市百貨', value: 'supermarket' },
  { label: '團購到店', value: 'groupBuy' },
]

/* ──────────── 组件 ──────────── */

export default function PromotionWordLibrary() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WordLibraryItem | null>(null)
  const [form] = Form.useForm()
  const [searchForm] = Form.useForm()
  const [data, setData] = useState<WordLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /* ---- 数据加载 ---- */
  const loadData = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const values = searchForm.getFieldsValue()
      const params: Record<string, unknown> = { page: p, size: ps }
      if (values.keyword) params.keyword = values.keyword
      if (values.status && values.status !== 'all') params.status = values.status
      if (values.channel && values.channel !== 'all') params.channel = values.channel
      if (values.updatedBy) params.updatedBy = values.updatedBy
      if (values.remark) params.remark = values.remark
      if (values.dateRange?.[0]) params.startDate = values.dateRange[0].format('YYYY-MM-DD')
      if (values.dateRange?.[1]) params.endDate = values.dateRange[1].format('YYYY-MM-DD')
      const res = await fetchWordLibraryList(params as Parameters<typeof fetchWordLibraryList>[0])
      setData(res.records)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchForm])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- 列配置 ---- */
  const columnMeta = useMemo(() => [
    { key: 'word', title: '詞條' },
    { key: 'channel', title: '所屬頻道' },
    { key: 'matchCount', title: '匹配次數' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updateTime', title: '最後更新時間' },
    { key: 'status', title: '狀態' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('promotion-word-library', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ---- 事件处理 ---- */
  const handleSearch = () => {
    setPage(1)
    loadData(1, pageSize)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setPage(1)
    loadData(1, pageSize)
  }

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ status: true })
    setIsModalOpen(true)
  }

  const handleEdit = (record: WordLibraryItem) => {
    setEditingRecord(record)
    form.setFieldsValue({
      word: record.word,
      channel: record.channel,
      status: record.status === 1,
      remark: record.remark,
    })
    setIsModalOpen(true)
  }

  const handleDelete = (record: WordLibraryItem) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除詞條「${record.word}」嗎？刪除後將不再參與推薦匹配。`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteWordLibraryItem(record.id)
        message.success('刪除成功')
        loadData()
      },
    })
  }

  const handleToggleStatus = (record: WordLibraryItem) => {
    const actionText = record.status === 1 ? '停用' : '啟用'
    const confirmTitle = record.status === 1
      ? `確定要停用詞條「${record.word}」嗎？停用後將不再參與推薦匹配。`
      : `確定要啟用詞條「${record.word}」嗎？`
    Modal.confirm({
      title: confirmTitle,
      okText: '確定',
      cancelText: '取消',
      onOk: async () => {
        await toggleWordLibraryStatus(record.id)
        message.success(`已${actionText}詞條「${record.word}」`)
        loadData()
      },
    })
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const payload = {
      word: values.word,
      channel: values.channel,
      status: values.status ? 1 : 2,
      remark: values.remark,
    }
    if (editingRecord) {
      await updateWordLibraryItem(editingRecord.id, payload)
    } else {
      await createWordLibraryItem(payload)
    }
    message.success(editingRecord ? '編輯成功' : '新增成功')
    setIsModalOpen(false)
    loadData()
  }

  const handleExport = () => {
    message.success('導出成功')
  }

  /* ---- 表格列定义 ---- */
  const columns: TableColumnsType<WordLibraryItem> = [
    {
      title: '詞條',
      dataIndex: 'word',
      key: 'word',
      width: 100,
      render: (val: string) => <span style={{ fontWeight: 600, color: '#2D3436' }}>{val}</span>,
    },
    {
      title: '所屬頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (ch: string) => <Tag>{CHANNEL_LABEL[ch] || ch}</Tag>,
    },
    {
      title: '匹配次數',
      dataIndex: 'matchCount',
      key: 'matchCount',
      width: 100,
      sorter: (a, b) => a.matchCount - b.matchCount,
      render: (val: number) => <span>{val.toLocaleString()}</span>,
    },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 150 },
    { title: '最後更新時間', dataIndex: 'updateTime', key: 'updateTime', width: 150 },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: number) => (
        <Tag color={status === 1 ? 'success' : 'default'}>
          {status === 1 ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '備註',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: true,
      render: (val: string) =>
        val ? <span title={val}>{val}</span> : <span style={{ color: '#BFBFBF' }}>—</span>,
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
            {record.status === 1 ? '停用' : '啟用'}
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
        <Form form={searchForm} layout="inline">
          <Form.Item label="詞條關鍵詞" name="keyword">
            <Input placeholder="請輸入關鍵詞" allowClear />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select options={statusOptions} defaultValue="all" placeholder="全部" allowClear />
          </Form.Item>
          <Form.Item label="所屬頻道" name="channel">
            <Select options={channelFilterOptions} defaultValue="all" placeholder="全部" allowClear />
          </Form.Item>
          <Form.Item label="更新時間" name="dateRange">
            <RangePicker />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input placeholder="請輸入更新人" allowClear />
          </Form.Item>
          <Form.Item label="備註" name="remark">
            <Input placeholder="請輸入備註關鍵詞" allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增詞條</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WordLibraryItem>
          columns={applyConfig(columns)}
          dataSource={data}
          rowKey="id"
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (t) => `共 ${t} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
              loadData(p, ps)
            },
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
            label="所屬頻道"
            name="channel"
            rules={[{ required: true, message: '請選擇所屬頻道' }]}
          >
            <Radio.Group optionType="button" buttonStyle="solid">
              {CHANNEL_OPTIONS.map(opt => (
                <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item label="狀態" name="status" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" defaultChecked />
          </Form.Item>
          <Form.Item label="備註" name="remark">
            <TextArea placeholder="請輸入備註說明（選填）" rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  )
}
