import { useState , useMemo } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message, Switch } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SwapOutlined,
  ImportOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { TextArea } = Input

/** 同義詞類型 */
const synonymTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '雙向同義', value: 'bidirectional' },
  { label: '單向同義', value: 'unidirectional' },
]

/** 狀態選項 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效中', value: 'active' },
  { label: '已停用', value: 'inactive' },
]

/** 業務場景 */
const scenarioOptions = [
  { label: '全部', value: 'all' },
  { label: '外賣搜索', value: 'takeaway' },
  { label: '超市搜索', value: 'supermarket' },
  { label: '團購搜索', value: 'groupBuy' },
  { label: '通用搜索', value: 'general' },
]

interface SynonymRecord {
  key: string
  id: number
  mainWord: string
  synonymWords: string[]
  type: 'bidirectional' | 'unidirectional'
  scenario: string
  status: 'active' | 'inactive'
  hitCount: number
  updatedBy: string
  updateTime: string
  remark: string
}

const mockData: SynonymRecord[] = [
  {
    key: '1', id: 1,
    mainWord: '漢堡',
    synonymWords: ['汉堡', '堡包', '漢堡包', 'burger'],
    type: 'bidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 2356,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-06-05 10:30:00',
    remark: '常見拼寫變體',
  },
  {
    key: '2', id: 2,
    mainWord: '奶茶',
    synonymWords: ['珍珠奶茶', '波霸奶茶', '絲襪奶茶', '鴛鴦'],
    type: 'bidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 4521,
    updatedBy: '李婉婷(E10045)',
    updateTime: '2026-06-04 15:20:00',
    remark: '飲品類同義詞組',
  },
  {
    key: '3', id: 3,
    mainWord: '外賣',
    synonymWords: ['外送', '送餐', '到家', 'delivery'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 8902,
    updatedBy: '王建華(E10067)',
    updateTime: '2026-06-03 09:15:00',
    remark: '核心業務詞',
  },
  {
    key: '4', id: 4,
    mainWord: 'KFC',
    synonymWords: ['肯德基', '開封菜', '肯記'],
    type: 'unidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 1893,
    updatedBy: '陳美琪(E10089)',
    updateTime: '2026-06-02 14:00:00',
    remark: '品牌簡稱→全稱',
  },
  {
    key: '5', id: 5,
    mainWord: '麥當勞',
    synonymWords: ['麥記', 'McDonald', '金拱門', 'M記'],
    type: 'bidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 3105,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-06-01 11:45:00',
    remark: '品牌別名',
  },
  {
    key: '6', id: 6,
    mainWord: '壽司',
    synonymWords: ['刺身', '日料', 'sushi'],
    type: 'unidirectional',
    scenario: '外賣搜索',
    status: 'inactive',
    hitCount: 567,
    updatedBy: '李婉婷(E10045)',
    updateTime: '2026-05-30 16:30:00',
    remark: '日料類（已停用，精確度不足）',
  },
  {
    key: '7', id: 7,
    mainWord: '打折',
    synonymWords: ['優惠', '折扣', '特價', '減價', '促銷'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 6234,
    updatedBy: '王建華(E10067)',
    updateTime: '2026-05-29 08:20:00',
    remark: '促銷類通用詞',
  },
  {
    key: '8', id: 8,
    mainWord: '紙巾',
    synonymWords: ['紙手巾', '面巾紙', '抽紙', '濕巾'],
    type: 'bidirectional',
    scenario: '超市搜索',
    status: 'active',
    hitCount: 1456,
    updatedBy: '陳美琪(E10089)',
    updateTime: '2026-05-28 13:10:00',
    remark: '日用品類',
  },
  {
    key: '9', id: 9,
    mainWord: '啤酒',
    synonymWords: ['生力', '青島', '百威', '嘉士伯', 'beer'],
    type: 'unidirectional',
    scenario: '超市搜索',
    status: 'active',
    hitCount: 2078,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-05-27 10:00:00',
    remark: '品牌→品類映射',
  },
  {
    key: '10', id: 10,
    mainWord: '洗衣液',
    synonymWords: ['洗衣粉', '洗衣劑', '衣物清潔劑'],
    type: 'bidirectional',
    scenario: '超市搜索',
    status: 'active',
    hitCount: 890,
    updatedBy: '李婉婷(E10045)',
    updateTime: '2026-05-26 14:30:00',
    remark: '清潔用品',
  },
  {
    key: '11', id: 11,
    mainWord: '快餐',
    synonymWords: ['速食', '快餐店', 'fast food'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 5678,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-05-25 10:15:00',
    remark: '快餐類同義詞',
  },
  {
    key: '12', id: 12,
    mainWord: '甜點',
    synonymWords: ['甜品', '甜食', 'dessert'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 4230,
    updatedBy: '陳美琪(E10089)',
    updateTime: '2026-05-24 16:45:00',
    remark: '甜品類同義詞',
  },
]

export default function SynonymConfig() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SynonymRecord | null>(null)
  const [form] = Form.useForm()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [data, setData] = useState<SynonymRecord[]>(mockData)

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ type: 'bidirectional', status: true })
    setIsModalOpen(true)
  }

  const handleEdit = (record: SynonymRecord) => {
    setEditingRecord(record)
    form.setFieldsValue({
      ...record,
      synonymWords: record.synonymWords.join('、'),
      status: record.status === 'active',
    })
    setIsModalOpen(true)
  }

  const handleDelete = (record: SynonymRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除同義詞組「${record.mainWord}」嗎？刪除後該組同義詞將不再參與搜索匹配。`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇要刪除的同義詞組')
      return
    }
    Modal.confirm({
      title: '批量刪除',
      content: `確定要刪除選中的 ${selectedRowKeys.length} 條同義詞組嗎？`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        message.success(`已刪除 ${selectedRowKeys.length} 條`)
        setSelectedRowKeys([])
      },
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }

  const handleToggleStatus = (record: SynonymRecord) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active'
    const actionText = newStatus === 'active' ? '啟用' : '停用'
    
    // 更新数据
    setData(prevData =>
      prevData.map(item =>
        item.id === record.id
          ? { ...item, status: newStatus as 'active' | 'inactive' }
          : item
      )
    )
    
    message.success(`已${actionText}同義詞組「${record.mainWord}」`)
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'mainWord', title: '主詞' },
    { key: 'synonymWords', title: '同義詞' },
    { key: 'type', title: '類型' },
    { key: 'scenario', title: '業務場景' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updateTime', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('synonym-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<SynonymRecord> = [
    {
      title: '主詞',
      dataIndex: 'mainWord',
      key: 'mainWord',
      width: 120,
      render: (val: string) => <span style={{ fontWeight: 600, color: '#2D3436' }}>{val}</span>,
    },
    {
      title: '同義詞',
      dataIndex: 'synonymWords',
      key: 'synonymWords',
      width: 280,
      render: (words: string[]) => (
        <Space size={[4, 4]} wrap>
          {words.map((w, i) => (
            <Tag key={i} color="orange" style={{ margin: 0 }}>{w}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '類型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'bidirectional' ? 'blue' : 'green'} icon={<SwapOutlined />}>
          {type === 'bidirectional' ? '雙向' : '單向'}
        </Tag>
      ),
    },
    {
      title: '業務場景',
      dataIndex: 'scenario',
      key: 'scenario',
      width: 100,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'default'}>
          {status === 'active' ? '生效中' : '已停用'}
        </Tag>
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 150 },
    { title: '最後更新時間', dataIndex: 'updateTime', key: 'updateTime', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 160,
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

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="主詞/同義詞">
            <Input placeholder="請輸入關鍵詞" allowClear />
          </Form.Item>
          <Form.Item label="同義詞類型">
            <Select options={synonymTypeOptions} defaultValue="all" />
          </Form.Item>
          <Form.Item label="業務場景">
            <Select options={scenarioOptions} defaultValue="all" />
          </Form.Item>
          <Form.Item label="狀態">
            <Select options={statusOptions} defaultValue="all" />
          </Form.Item>
          <Form.Item label="更新時間">
            <RangePicker />
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
          <Button icon={<DeleteOutlined />} danger onClick={handleBatchDelete}>批量刪除</Button>
          <Button className="btn-import" icon={<ImportOutlined />}>批量導入</Button>
          <Button className="btn-export" icon={<ExportOutlined />}>導出</Button>
          <span style={{ color: '#999', fontSize: 13 }}>
            共 <b style={{ color: '#E8720C' }}>{data.length}</b> 組同義詞
            {selectedRowKeys.length > 0 && <span>，已選 <b>{selectedRowKeys.length}</b> 條</span>}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增同義詞</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<SynonymRecord>
          columns={applyConfig(columns)}
          dataSource={data}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
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
          scroll={{ x: 1300 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯同義詞組' : '新增同義詞組'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={580}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="主詞"
            name="mainWord"
            rules={[{ required: true, message: '請輸入主詞' }]}
            tooltip="主詞為同義詞組的核心詞，搜索時優先匹配"
          >
            <Input placeholder="請輸入主詞（如：漢堡）" />
          </Form.Item>
          <Form.Item
            label="同義詞"
            name="synonymWords"
            rules={[{ required: true, message: '請輸入同義詞' }]}
            tooltip="多個同義詞用頓號「、」或逗號分隔"
          >
            <TextArea
              placeholder="請輸入同義詞，多個同義詞用頓號「、」分隔（如：汉堡、堡包、漢堡包、burger）"
              rows={3}
              showCount
              maxLength={500}
            />
          </Form.Item>
          <Form.Item
            label="同義詞類型"
            name="type"
            rules={[{ required: true, message: '請選擇類型' }]}
          >
            <Select
              options={[
                { label: '雙向同義 — A搜到B，B也搜到A', value: 'bidirectional' },
                { label: '單向同義 — 搜A可匹配B，搜B不匹配A', value: 'unidirectional' },
              ]}
              placeholder="請選擇同義詞類型"
            />
          </Form.Item>
          <Form.Item
            label="業務場景"
            name="scenario"
            rules={[{ required: true, message: '請選擇業務場景' }]}
          >
            <Select
              options={scenarioOptions.filter(o => o.value !== 'all')}
              placeholder="請選擇適用的業務場景"
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
    </div>
  )
}
