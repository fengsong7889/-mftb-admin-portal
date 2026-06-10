import { useState } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, message, InputNumber, Switch, Tabs } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  CalculatorOutlined,
  SortAscendingOutlined,
  ThunderboltOutlined,
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

/** 規則類型 */
const ruleTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '固定扣分', value: 'deduction' },
  { label: '分數打折', value: 'discount' },
  { label: '加權提分', value: 'boost' },
  { label: '排序調整', value: 'sort' },
]

/** 狀態選項 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效', value: 'active' },
  { label: '停用', value: 'inactive' },
]

/** 應用場景 */
const sceneOptions = [
  { label: '搜索排序', value: 'searchSort' },
  { label: '推薦排序', value: 'recommendSort' },
  { label: '廣告排序', value: 'adSort' },
]

interface RuleRecord {
  key: string
  ruleId: string
  ruleName: string
  ruleType: string
  brand: string
  searchChannel: string[]
  scene: string
  value: number
  maxValue: number
  condition: string
  priority: number
  status: 'active' | 'inactive'
  effectStartDate: string
  effectEndDate: string
  updatedBy: string
  updateTime: string
  remark: string
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const channelMap: Record<string, string> = {
  home: '大首頁',
  takeaway: '外賣頻道',
  groupBuy: '團購頻道',
  supermarket: '超市頻道',
}
const ruleTypeMap: Record<string, { text: string; color: string }> = {
  deduction: { text: '固定扣分', color: 'red' },
  discount: { text: '分數打折', color: 'orange' },
  boost: { text: '加權提分', color: 'green' },
  sort: { text: '排序調整', color: 'blue' },
}
const sceneMap: Record<string, string> = {
  searchSort: '搜索排序',
  recommendSort: '推薦排序',
  adSort: '廣告排序',
}

const mockData: RuleRecord[] = [
  {
    key: '1', ruleId: 'GR001', ruleName: '外賣品牌固定扣分規則', ruleType: 'deduction',
    brand: 'mFood', searchChannel: ['takeaway', 'home'], scene: 'searchSort',
    value: 15, maxValue: 50, condition: '未購買推廣的熱門商家',
    priority: 1, status: 'active', effectStartDate: '2026-06-01', effectEndDate: '2026-12-31',
    updatedBy: '古月(001)', updateTime: '2026-06-08 10:30:00', remark: '對未參與推廣的熱門商家進行固定扣分',
  },
  {
    key: '2', ruleId: 'GR002', ruleName: '團購分數打折規則', ruleType: 'discount',
    brand: 'mFood', searchChannel: ['groupBuy'], scene: 'searchSort',
    value: 70, maxValue: 100, condition: '月銷量>1000且未續費廣告',
    priority: 2, status: 'active', effectStartDate: '2026-06-01', effectEndDate: '2026-09-30',
    updatedBy: '加侖(002)', updateTime: '2026-06-07 14:20:00', remark: '對高銷量未續費商家打折處理，折扣率70%',
  },
  {
    key: '3', ruleId: 'GR003', ruleName: '廣告商家加權提分規則', ruleType: 'boost',
    brand: 'mFood', searchChannel: ['home', 'takeaway', 'groupBuy'], scene: 'adSort',
    value: 20, maxValue: 50, condition: '已購買推廣的商家',
    priority: 1, status: 'active', effectStartDate: '2026-06-01', effectEndDate: '2027-06-01',
    updatedBy: '浩源(003)', updateTime: '2026-06-06 09:15:00', remark: '已購買推廣的商家加分提權',
  },
  {
    key: '4', ruleId: 'GR004', ruleName: '超市固定扣分規則', ruleType: 'deduction',
    brand: 'flashBee', searchChannel: ['supermarket'], scene: 'searchSort',
    value: 10, maxValue: 30, condition: '品牌知名度過高佔據搜索首位',
    priority: 3, status: 'active', effectStartDate: '2026-06-15', effectEndDate: '2026-12-15',
    updatedBy: '古月(001)', updateTime: '2026-06-05 11:00:00', remark: '超市搜索中品牌效應過強的商家扣分',
  },
  {
    key: '5', ruleId: 'GR005', ruleName: '推薦排序調整規則', ruleType: 'sort',
    brand: 'mFood', searchChannel: ['home'], scene: 'recommendSort',
    value: 5, maxValue: 10, condition: '新商家上架前7天',
    priority: 4, status: 'active', effectStartDate: '2026-06-10', effectEndDate: '2026-12-10',
    updatedBy: '加侖(002)', updateTime: '2026-06-04 16:00:00', remark: '新商家在推薦排序中獲得位置提升',
  },
  {
    key: '6', ruleId: 'GR006', ruleName: '閃蜂外賣打折規則', ruleType: 'discount',
    brand: 'flashBee', searchChannel: ['takeaway'], scene: 'searchSort',
    value: 80, maxValue: 100, condition: '近3個月未續費廣告',
    priority: 2, status: 'inactive', effectStartDate: '2026-05-01', effectEndDate: '2026-06-01',
    updatedBy: '浩源(003)', updateTime: '2026-05-30 13:20:00', remark: '已過期，原折扣率80%',
  },
]

export default function SearchRuleConfig() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RuleRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<RuleRecord | null>(null)
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      status: 'active',
      searchChannel: ['takeaway'],
      scene: 'searchSort',
      priority: 1,
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: RuleRecord) => {
    setEditingRecord(record)
    form.setFieldsValue({
      ...record,
      dateRange: record.effectStartDate && record.effectEndDate ? [record.effectStartDate, record.effectEndDate] : undefined,
    })
    setIsModalOpen(true)
  }

  const handleDetail = (record: RuleRecord) => {
    setDetailRecord(record)
    setIsDetailModalOpen(true)
  }

  const handleDelete = (record: RuleRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除規則「${record.ruleName}」嗎？此操作不可恢復。`,
      okText: '確定',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleToggleStatus = (record: RuleRecord) => {
    const newStatus = record.status === 'active' ? '停用' : '生效'
    Modal.confirm({
      title: '確認操作',
      content: `確定要將規則「${record.ruleName}」設為「${newStatus}」嗎？`,
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

  const columns: TableColumnsType<RuleRecord> = [
    {
      title: '規則ID',
      dataIndex: 'ruleId',
      key: 'ruleId',
      width: 100,
    },
    {
      title: '規則名稱',
      dataIndex: 'ruleName',
      key: 'ruleName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '規則類型',
      dataIndex: 'ruleType',
      key: 'ruleType',
      width: 110,
      render: (v: string) => {
        const config = ruleTypeMap[v] || { text: v, color: 'default' }
        return <Tag color={config.color}>{config.text}</Tag>
      },
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
      title: '應用場景',
      dataIndex: 'scene',
      key: 'scene',
      width: 100,
      render: (v: string) => sceneMap[v] || v,
    },
    {
      title: '規則值',
      key: 'ruleValue',
      width: 120,
      render: (_, r) => {
        if (r.ruleType === 'deduction') return <span style={{ color: '#ff4d4f' }}>-{r.value} 分</span>
        if (r.ruleType === 'discount') return <span style={{ color: '#fa8c16' }}>{r.value}% 折扣</span>
        if (r.ruleType === 'boost') return <span style={{ color: '#52c41a' }}>+{r.value} 分</span>
        if (r.ruleType === 'sort') return <span style={{ color: '#1890ff' }}>↑{r.value} 位</span>
        return r.value
      },
    },
    {
      title: '上限值',
      key: 'maxValue',
      width: 100,
      render: (_, r) => {
        if (r.ruleType === 'deduction') return `≤${r.maxValue} 分`
        if (r.ruleType === 'discount') return `≤${r.maxValue}%`
        if (r.ruleType === 'boost') return `≤${r.maxValue} 分`
        if (r.ruleType === 'sort') return `≤${r.maxValue} 位`
        return r.maxValue
      },
    },
    {
      title: '觸發條件',
      dataIndex: 'condition',
      key: 'condition',
      width: 200,
      ellipsis: true,
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
      render: (_, r) => `${r.effectStartDate} ~ ${r.effectEndDate}`,
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
      title: '操作人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 110,
    },
    {
      title: '操作時間',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>詳情</Button>
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

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="規則名稱">
            <Input placeholder="請輸入規則名稱" allowClear style={{ height: 30 }} />
          </Form.Item>
          <Form.Item label="規則類型">
            <Select placeholder="全部" options={ruleTypeOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="全部" options={brandOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label="搜索頻道">
            <Select placeholder="全部" options={searchChannelOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label="應用場景">
            <Select placeholder="全部" options={[...sceneOptions.map(s => ({ ...s, label: s.value === 'all' ? '全部' : s.label }))]} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label="狀態">
            <Select placeholder="全部" options={statusOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>搜尋</Button>
              <Button icon={<ReloadOutlined />} style={{ height: 30 }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<ExportOutlined />}>數據導出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增規則</Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<RuleRecord>
          columns={columns}
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
          scroll={{ x: 1800 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯搜索規則' : '新增搜索規則'}
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
            label="規則名稱"
            name="ruleName"
            rules={[{ required: true, message: '請輸入規則名稱' }]}
          >
            <Input placeholder="請輸入規則名稱，如：外賣品牌固定扣分規則" maxLength={100} showCount />
          </Form.Item>

          <Form.Item
            label="規則類型"
            name="ruleType"
            rules={[{ required: true, message: '請選擇規則類型' }]}
            extra="固定扣分：從搜索分數中扣除固定值；分數打折：按比例降低搜索分數；加權提分：增加搜索分數；排序調整：調整排序位置"
          >
            <Select
              options={ruleTypeOptions.filter(o => o.value !== 'all')}
              placeholder="請選擇規則類型"
            />
          </Form.Item>

          <Form.Item
            label="所屬品牌"
            name="brand"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select
              options={brandOptions.filter(o => o.value !== 'all')}
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

          <Form.Item
            label="應用場景"
            name="scene"
            rules={[{ required: true, message: '請選擇應用場景' }]}
          >
            <Select
              options={sceneOptions}
              placeholder="請選擇應用場景"
            />
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item
              label="規則值"
              name="value"
              rules={[{ required: true, message: '請輸入規則值' }]}
              style={{ width: '50%' }}
              extra="扣分值/折扣率(0-100%)/加分值/調整位數"
            >
              <InputNumber min={0} max={10000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="上限值"
              name="maxValue"
              rules={[{ required: true, message: '請輸入上限值' }]}
              style={{ width: '50%' }}
              extra="規則作用的最大值限制"
            >
              <InputNumber min={0} max={10000} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item
            label="觸發條件"
            name="condition"
            rules={[{ required: true, message: '請輸入觸發條件' }]}
          >
            <Input placeholder="請輸入觸發條件，如：未購買推廣的熱門商家" maxLength={200} showCount />
          </Form.Item>

          <Form.Item
            label="優先級"
            name="priority"
            rules={[{ required: true, message: '請輸入優先級' }]}
            extra="數字越小優先級越高"
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            label="生效日期"
            name="dateRange"
            rules={[{ required: true, message: '請選擇生效日期' }]}
          >
            <Input.Group compact>
              <Input placeholder="開始日期" style={{ width: '50%' }} />
              <Input placeholder="結束日期" style={{ width: '50%' }} />
            </Input.Group>
          </Form.Item>

          <Form.Item
            label="備註"
            name="remark"
            rules={[{ required: true, message: '請填寫備註' }]}
          >
            <TextArea
              rows={3}
              placeholder="請填寫規則說明，如：對未參與推廣的熱門商家進行固定扣分"
              maxLength={500}
              showCount
            />
          </Form.Item>

          <Form.Item label="狀態" name="status">
            <Select
              options={statusOptions.filter(o => o.value !== 'all')}
              placeholder="請選擇狀態"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="搜索規則詳情"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={680}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div><span style={{ color: '#999' }}>規則ID：</span>{detailRecord.ruleId}</div>
              <div><span style={{ color: '#999' }}>規則類型：</span><Tag color={ruleTypeMap[detailRecord.ruleType]?.color}>{ruleTypeMap[detailRecord.ruleType]?.text}</Tag></div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#999' }}>規則名稱：</span>{detailRecord.ruleName}</div>
              <div><span style={{ color: '#999' }}>所屬品牌：</span>{brandMap[detailRecord.brand]}</div>
              <div><span style={{ color: '#999' }}>應用場景：</span>{sceneMap[detailRecord.scene]}</div>
              <div><span style={{ color: '#999' }}>搜索頻道：</span>{detailRecord.searchChannel.map(c => channelMap[c]).join('、')}</div>
              <div>
                <span style={{ color: '#999' }}>規則值：</span>
                {detailRecord.ruleType === 'deduction' && <span style={{ color: '#ff4d4f' }}>-{detailRecord.value} 分</span>}
                {detailRecord.ruleType === 'discount' && <span style={{ color: '#fa8c16' }}>{detailRecord.value}% 折扣</span>}
                {detailRecord.ruleType === 'boost' && <span style={{ color: '#52c41a' }}>+{detailRecord.value} 分</span>}
                {detailRecord.ruleType === 'sort' && <span style={{ color: '#1890ff' }}>↑{detailRecord.value} 位</span>}
              </div>
              <div><span style={{ color: '#999' }}>上限值：</span>{detailRecord.maxValue}</div>
              <div><span style={{ color: '#999' }}>優先級：</span>{detailRecord.priority}</div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#999' }}>觸發條件：</span>{detailRecord.condition}</div>
              <div><span style={{ color: '#999' }}>生效時間：</span>{detailRecord.effectStartDate} ~ {detailRecord.effectEndDate}</div>
              <div><span style={{ color: '#999' }}>狀態：</span>{detailRecord.status === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">停用</Tag>}</div>
              <div><span style={{ color: '#999' }}>操作人：</span>{detailRecord.updatedBy}</div>
              <div><span style={{ color: '#999' }}>操作時間：</span>{detailRecord.updateTime}</div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#999' }}>備註：</span>{detailRecord.remark}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
