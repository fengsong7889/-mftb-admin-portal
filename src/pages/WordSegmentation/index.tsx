import { useState, useMemo } from 'react'
import { Button, Space, Input, Table, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

interface WordRecord {
  key: string
  id: number
  word: string
  segmented: string
  corrected: string
  updatedBy: string
  updateTime: string
}

const mockData: WordRecord[] = [
  { key: '1', id: 1, word: '漢堡包', segmented: '漢/堡/包', corrected: '漢堡/包', updatedBy: '張曉明(E10023)', updateTime: '2026-06-05 10:30:00' },
  { key: '2', id: 2, word: '珍珠奶茶', segmented: '珍/珠/奶/茶', corrected: '珍珠/奶茶', updatedBy: '李婉婷(E10045)', updateTime: '2026-06-04 15:20:00' },
  { key: '3', id: 3, word: '麻辣火鍋', segmented: '麻/辣/火/鍋', corrected: '麻辣/火鍋', updatedBy: '張曉明(E10023)', updateTime: '2026-06-03 09:15:00' },
  { key: '4', id: 4, word: '咖喱魚蛋', segmented: '咖/喱/魚/蛋', corrected: '咖喱/魚蛋', updatedBy: '王建華(E10067)', updateTime: '2026-06-02 14:00:00' },
  { key: '5', id: 5, word: '豬扒包', segmented: '豬/扒/包', corrected: '豬扒/包', updatedBy: '陳美琪(E10089)', updateTime: '2026-06-01 11:45:00' },
  { key: '6', id: 6, word: '葡撻', segmented: '葡/撻', corrected: '葡撻', updatedBy: '李婉婷(E10045)', updateTime: '2026-05-30 16:30:00' },
  { key: '7', id: 7, word: '水蟹粥', segmented: '水/蟹/粥', corrected: '水蟹/粥', updatedBy: '張曉明(E10023)', updateTime: '2026-05-29 08:20:00' },
  { key: '8', id: 8, word: '楊枝甘露', segmented: '楊/枝/甘/露', corrected: '楊枝甘露', updatedBy: '王建華(E10067)', updateTime: '2026-05-28 13:10:00' },
  { key: '9', id: 9, word: '酸辣粉', segmented: '酸/辣/粉', corrected: '酸辣/粉', updatedBy: '陳美琪(E10089)', updateTime: '2026-05-27 10:00:00' },
  { key: '10', id: 10, word: '煲仔飯', segmented: '煲/仔/飯', corrected: '煲仔/飯', updatedBy: '張曉明(E10023)', updateTime: '2026-05-26 15:30:00' },
  { key: '11', id: 11, word: '葡撻', segmented: '葡/撻', corrected: '葡撻', updatedBy: '李婉婷(E10045)', updateTime: '2026-05-25 09:20:00' },
  { key: '12', id: 12, word: '雞蛋仔', segmented: '雞/蛋/仔', corrected: '雞蛋/仔', updatedBy: '陳美琪(E10089)', updateTime: '2026-05-24 14:15:00' },
]

export default function WordSegmentation() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WordRecord | null>(null)
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleEdit = (record: WordRecord) => {
    setEditingRecord(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = (record: WordRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除分詞「${record.word}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleBatchDelete = () => {
    Modal.confirm({
      title: '批量刪除',
      content: '確定要刪除選中的分詞記錄嗎？此操作不可恢復。',
      okText: '確定',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => message.success('批量刪除成功'),
    })
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

  const handleBatchExport = () => {
    message.success('導出成功')
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: '序號' },
    { key: 'word', title: '搜索詞' },
    { key: 'segmented', title: 'ES分詞結果' },
    { key: 'corrected', title: '新增分詞' },
    { key: 'lastUpdater', title: '最後更新人' },
    { key: 'lastUpdateTime', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('word-segmentation', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  const columns: TableColumnsType<WordRecord> = [
    {
      title: '搜索詞',
      dataIndex: 'word',
      key: 'word',
      width: 150,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: 'ES分詞結果',
      dataIndex: 'segmented',
      key: 'segmented',
      width: 180,
      render: (text: string) => <span style={{ color: '#999' }}>{text}</span>,
    },
    {
      title: '新增分詞',
      dataIndex: 'corrected',
      key: 'corrected',
      width: 160,
      render: (val: string) => <span style={{ color: '#E8720C', fontWeight: 500 }}>{val}</span>,
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 160,
    },
    {
      title: '最後更新時間',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 170,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
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
          <Form.Item label="搜索詞">
            <Input placeholder="請輸入搜索詞" allowClear style={{ height: 30 }} />
          </Form.Item>
          <Form.Item label="更新人">
            <Input placeholder="請輸入更新人姓名/工號" allowClear style={{ height: 30 }} />
          </Form.Item>
          <Form.Item label="更新時間">
            <RangePicker style={{ height: 30 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>查詢</Button>
              <Button icon={<ReloadOutlined />} style={{ height: 30 }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<ImportOutlined />} onClick={handleBatchImport}>批量導入</Button>
          <Button icon={<ExportOutlined />} onClick={handleBatchExport}>數據導出</Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>批量刪除</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增分詞</Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WordRecord>
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
          scroll={{ x: 900 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯分詞' : '新增分詞'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="搜索詞" name="word" rules={[{ required: true, message: '請輸入搜索詞' }]}>
            <Input placeholder="請輸入需要糾正分詞的搜索詞" />
          </Form.Item>
          <Form.Item label="ES分詞結果" name="segmented">
            <Input placeholder="ES自動分詞結果（僅展示）" disabled />
          </Form.Item>
          <Form.Item label="新增分詞" name="corrected" rules={[{ required: true, message: '請輸入新增的分詞結果' }]}>
            <Input placeholder="請輸入新增分詞，用/分隔" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
