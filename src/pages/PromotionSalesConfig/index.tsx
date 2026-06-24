import { useState, useMemo } from 'react'
import { Button, Space, Table, Tag, Input, Select, Form, Modal, message, InputNumber } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { Search } = Input

/** 销售配置记录 */
interface SalesConfigRecord {
  id: number
  name: string
  type: string
  channel: string
  region: string
  minAmount: number
  maxAmount: number
  discount: number
  status: 'active' | 'inactive'
  updatedBy: string
  updatedAt: string
}

/** 渠道标签 */
const CHANNEL_LABEL: Record<string, string> = {
  home: '大首頁',
  delivery: '外賣',
  groupBuy: '團購',
  supermarket: '超市',
}

/** 类型标签 */
const TYPE_LABEL: Record<string, string> = {
  fullReduce: '滿減',
  discount: '折扣',
  coupon: '優惠券',
  flashSale: '秒殺',
}

/** 类型颜色 */
const TYPE_COLOR: Record<string, string> = {
  fullReduce: 'blue',
  discount: 'green',
  coupon: 'orange',
  flashSale: 'red',
}

/** Mock数据 */
const mockData: SalesConfigRecord[] = [
  {
    id: 1,
    name: '首頁滿減活動',
    type: 'fullReduce',
    channel: 'home',
    region: '澳門',
    minAmount: 100,
    maxAmount: 500,
    discount: 20,
    status: 'active',
    updatedBy: 'admin',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    name: '外賣折扣活動',
    type: 'discount',
    channel: 'delivery',
    region: '氹仔',
    minAmount: 50,
    maxAmount: 300,
    discount: 15,
    status: 'active',
    updatedBy: 'operator',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 3,
    name: '團購優惠券',
    type: 'coupon',
    channel: 'groupBuy',
    region: '珠海',
    minAmount: 200,
    maxAmount: 1000,
    discount: 50,
    status: 'inactive',
    updatedBy: 'admin',
    updatedAt: '2024-01-22 16:45:00',
  },
  {
    id: 4,
    name: '超市秒殺活動',
    type: 'flashSale',
    channel: 'supermarket',
    region: '澳門',
    minAmount: 30,
    maxAmount: 200,
    discount: 30,
    status: 'active',
    updatedBy: 'user001',
    updatedAt: '2024-01-23 09:15:00',
  },
  {
    id: 5,
    name: '外賣滿減促銷',
    type: 'fullReduce',
    channel: 'delivery',
    region: '澳門',
    minAmount: 80,
    maxAmount: 400,
    discount: 25,
    status: 'active',
    updatedBy: 'admin',
    updatedAt: '2024-01-24 15:00:00',
  },
]

export default function PromotionSalesConfig() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<SalesConfigRecord[]>(mockData)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SalesConfigRecord | null>(null)
  const [form] = Form.useForm()

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    if (values.name) {
      result = result.filter(item => item.name.includes(values.name))
    }
    
    if (values.type) {
      result = result.filter(item => item.type === values.type)
    }
    
    if (values.channel) {
      result = result.filter(item => item.channel === values.channel)
    }
    
    if (values.status) {
      result = result.filter(item => item.status === values.status)
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(mockData)
  }

  // 新增/编辑
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('表单数据:', values)
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setModalVisible(false)
      form.resetFields()
      setEditingRecord(null)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  // 删除
  const handleDelete = (record: SalesConfigRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'name', title: '活動名稱' },
    { key: 'type', title: '活動類型' },
    { key: 'channel', title: '業務頻道' },
    { key: 'region', title: '區域' },
    { key: 'minAmount', title: '最低金額' },
    { key: 'maxAmount', title: '最高金額' },
    { key: 'discount', title: '優惠力度' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '更新人' },
    { key: 'updatedAt', title: '更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('promotion-sales-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<SalesConfigRecord> = [
    { 
      title: '活動名稱', 
      dataIndex: 'name', 
      key: 'name', 
      width: 180,
      ellipsis: true,
    },
    {
      title: '活動類型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (v: string) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v]}</Tag>,
    },
    {
      title: '業務頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (v: string) => CHANNEL_LABEL[v],
    },
    {
      title: '區域',
      dataIndex: 'region',
      key: 'region',
      width: 100,
    },
    {
      title: '最低金額',
      dataIndex: 'minAmount',
      key: 'minAmount',
      width: 100,
      render: (v: number) => `MOP ${v}`,
    },
    {
      title: '最高金額',
      dataIndex: 'maxAmount',
      key: 'maxAmount',
      width: 100,
      render: (v: number) => `MOP ${v}`,
    },
    {
      title: '優惠力度',
      dataIndex: 'discount',
      key: 'discount',
      width: 100,
      render: (v: number) => `${v}%`,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => (
        <Tag color={v === 'active' ? 'green' : 'default'}>
          {v === 'active' ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 100,
    },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRecord(record)
              form.setFieldsValue(record)
              setModalVisible(true)
            }}
          >
            編輯
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
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
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="活動名稱" name="name">
            <Input placeholder="請輸入活動名稱" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="活動類型" name="type">
            <Select 
              placeholder="全部" 
              allowClear 
              style={{ width: 120 }}
              options={[
                { label: '滿減', value: 'fullReduce' },
                { label: '折扣', value: 'discount' },
                { label: '優惠券', value: 'coupon' },
                { label: '秒殺', value: 'flashSale' },
              ]}
            />
          </Form.Item>
          <Form.Item label="業務頻道" name="channel">
            <Select 
              placeholder="全部" 
              allowClear 
              style={{ width: 120 }}
              options={[
                { label: '大首頁', value: 'home' },
                { label: '外賣', value: 'delivery' },
                { label: '團購', value: 'groupBuy' },
                { label: '超市', value: 'supermarket' },
              ]}
            />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select 
              placeholder="全部" 
              allowClear 
              style={{ width: 100 }}
              options={[
                { label: '啟用', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingRecord(null)
              form.resetFields()
              setModalVisible(true)
            }}
          >
            新增銷售配置
          </Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<SalesConfigRecord>
          rowKey="id"
          columns={applyConfig(columns)}
          dataSource={filteredData}
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯銷售配置' : '新增銷售配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditingRecord(null)
        }}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item 
            label="活動名稱" 
            name="name"
            rules={[{ required: true, message: '請輸入活動名稱' }]}
          >
            <Input placeholder="請輸入活動名稱" />
          </Form.Item>
          
          <Form.Item 
            label="活動類型" 
            name="type"
            rules={[{ required: true, message: '請選擇活動類型' }]}
          >
            <Select placeholder="請選擇活動類型">
              <Select.Option value="fullReduce">滿減</Select.Option>
              <Select.Option value="discount">折扣</Select.Option>
              <Select.Option value="coupon">優惠券</Select.Option>
              <Select.Option value="flashSale">秒殺</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item 
            label="業務頻道" 
            name="channel"
            rules={[{ required: true, message: '請選擇業務頻道' }]}
          >
            <Select placeholder="請選擇業務頻道">
              <Select.Option value="home">大首頁</Select.Option>
              <Select.Option value="delivery">外賣</Select.Option>
              <Select.Option value="groupBuy">團購</Select.Option>
              <Select.Option value="supermarket">超市</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item 
            label="區域" 
            name="region"
            rules={[{ required: true, message: '請輸入區域' }]}
          >
            <Input placeholder="請輸入區域" />
          </Form.Item>

          <Form.Item 
            label="最低金額" 
            name="minAmount"
            rules={[{ required: true, message: '請輸入最低金額' }]}
          >
            <InputNumber placeholder="請輸入最低金額" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item 
            label="最高金額" 
            name="maxAmount"
            rules={[{ required: true, message: '請輸入最高金額' }]}
          >
            <InputNumber placeholder="請輸入最高金額" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item 
            label="優惠力度(%)" 
            name="discount"
            rules={[{ required: true, message: '請輸入優惠力度' }]}
          >
            <InputNumber placeholder="請輸入優惠力度" suffix="%" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item 
            label="狀態" 
            name="status"
            rules={[{ required: true, message: '請選擇狀態' }]}
          >
            <Select placeholder="請選擇狀態">
              <Select.Option value="active">啟用</Select.Option>
              <Select.Option value="inactive">停用</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
