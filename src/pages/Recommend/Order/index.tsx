import { useState, useMemo } from 'react'
import { Button, Space, Table, Tag, Input, Select, Form, DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../../components/BrandTag'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import {
  AppType, OrderStatus, RecommendChannel, AlgorithmType,
  APP_OPTIONS, ORDER_STATUS_OPTIONS,
} from '../constants'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

interface OrderRecord {
  id: number
  app: AppType
  orderNo: string
  merchantName: string
  algorithmType: AlgorithmType
  channel: RecommendChannel
  slot: string
  region: string
  timePeriod: string
  startDate: string
  endDate: string
  amount: number
  status: OrderStatus
}

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
}

const ALG_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
} as Record<AlgorithmType, string>

const STATUS_COLOR: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: 'orange',
  [OrderStatus.PAID]: 'blue',
  [OrderStatus.DELIVERING]: 'green',
  [OrderStatus.COMPLETED]: 'default',
  [OrderStatus.REFUNDED]: 'red',
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: '待支付',
  [OrderStatus.PAID]: '已支付',
  [OrderStatus.DELIVERING]: '投放中',
  [OrderStatus.COMPLETED]: '已完成',
  [OrderStatus.REFUNDED]: '已退款',
}

const mockData: OrderRecord[] = [
  { id: 1, app: AppType.SHANFENG, orderNo: 'ORD20240601001', merchantName: '澳門茶餐廳', algorithmType: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.HOME, slot: '首頁第一坑', region: '澳門', timePeriod: '全天', startDate: '2024-06-01', endDate: '2024-06-30', amount: 84000, status: OrderStatus.DELIVERING },
  { id: 2, app: AppType.MFOOD, orderNo: 'ORD20240601002', merchantName: '氹仔老火鍋', algorithmType: AlgorithmType.GUESS_YOU_LIKE, channel: RecommendChannel.DELIVERY, slot: '外賣第一坑', region: '氹仔', timePeriod: '11:00-14:00', startDate: '2024-06-05', endDate: '2024-06-12', amount: 12600, status: OrderStatus.PAID },
  { id: 3, app: AppType.SHANFENG, orderNo: 'ORD20240601003', merchantName: '珠海生活超市', algorithmType: AlgorithmType.NEW_STORE_AD, channel: RecommendChannel.SUPERMARKET, slot: '超市第二坑', region: '珠海', timePeriod: '全天', startDate: '2024-05-01', endDate: '2024-05-31', amount: 37200, status: OrderStatus.COMPLETED },
  { id: 4, app: AppType.MFOOD, orderNo: 'ORD20240601004', merchantName: '澳門葡國餐廳', algorithmType: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.GROUP_BUY, slot: '團購首選坑位', region: '澳門', timePeriod: '全天', startDate: '2024-06-10', endDate: '2024-06-20', amount: 15000, status: OrderStatus.DELIVERING },
  { id: 5, app: AppType.SHANFENG, orderNo: 'ORD20240601005', merchantName: '氹仔海鮮坊', algorithmType: AlgorithmType.TRAFFIC_AD, channel: RecommendChannel.HOME, slot: '首頁第三坑', region: '氹仔', timePeriod: '18:00-22:00', startDate: '2024-06-15', endDate: '2024-06-25', amount: 22000, status: OrderStatus.PAID },
  { id: 6, app: AppType.MFOOD, orderNo: 'ORD20240601006', merchantName: '珠海烘焙屋', algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, channel: RecommendChannel.SUPERMARKET, slot: '超市第一坑', region: '珠海', timePeriod: '全天', startDate: '2024-06-01', endDate: '2024-06-30', amount: 33000, status: OrderStatus.DELIVERING },
  { id: 7, app: AppType.SHANFENG, orderNo: 'ORD20240601007', merchantName: '澳門甜品店', algorithmType: AlgorithmType.ORGANIC_TRAFFIC, channel: RecommendChannel.HOME, slot: '首頁第四坑', region: '澳門', timePeriod: '全天', startDate: '2024-05-20', endDate: '2024-06-19', amount: 24000, status: OrderStatus.COMPLETED },
  { id: 8, app: AppType.MFOOD, orderNo: 'ORD20240601008', merchantName: '氹仔燒臘店', algorithmType: AlgorithmType.SEARCH_ALGORITHM, channel: RecommendChannel.DELIVERY, slot: '外賣第三坑', region: '氹仔', timePeriod: '11:00-15:00', startDate: '2024-06-08', endDate: '2024-06-18', amount: 10000, status: OrderStatus.PENDING_PAYMENT },
  { id: 9, app: AppType.SHANFENG, orderNo: 'ORD20240601009', merchantName: '珠海奶茶鋪', algorithmType: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.SUPERMARKET, slot: '超市第三坑', region: '珠海', timePeriod: '全天', startDate: '2024-06-12', endDate: '2024-07-11', amount: 33000, status: OrderStatus.PAID },
  { id: 10, app: AppType.MFOOD, orderNo: 'ORD20240601010', merchantName: '澳門快餐店', algorithmType: AlgorithmType.GUESS_YOU_LIKE, channel: RecommendChannel.GROUP_BUY, slot: '團購第二坑', region: '澳門', timePeriod: '全天', startDate: '2024-06-05', endDate: '2024-06-15', amount: 15000, status: OrderStatus.REFUNDED },
  { id: 11, app: AppType.SHANFENG, orderNo: 'ORD20240601011', merchantName: '氹仔日料店', algorithmType: AlgorithmType.NEW_STORE_AD, channel: RecommendChannel.HOME, slot: '首頁第五坑', region: '氹仔', timePeriod: '全天', startDate: '2024-06-18', endDate: '2024-07-17', amount: 42000, status: OrderStatus.DELIVERING },
  { id: 12, app: AppType.MFOOD, orderNo: 'ORD20240601012', merchantName: '珠海咖啡廳', algorithmType: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.DELIVERY, slot: '外賣第四坑', region: '珠海', timePeriod: '08:00-18:00', startDate: '2024-06-20', endDate: '2024-06-30', amount: 11000, status: OrderStatus.PAID },
  { id: 13, app: AppType.SHANFENG, orderNo: 'ORD20240601013', merchantName: '澳門素食館', algorithmType: AlgorithmType.TRAFFIC_AD, channel: RecommendChannel.GROUP_BUY, slot: '團購第三坑', region: '澳門', timePeriod: '全天', startDate: '2024-06-22', endDate: '2024-07-21', amount: 18000, status: OrderStatus.PENDING_PAYMENT },
  { id: 14, app: AppType.MFOOD, orderNo: 'ORD20240601014', merchantName: '氹仔西餐廳', algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, channel: RecommendChannel.SUPERMARKET, slot: '超市第四坑', region: '氹仔', timePeriod: '全天', startDate: '2024-06-25', endDate: '2024-07-24', amount: 36000, status: OrderStatus.DELIVERING },
  { id: 15, app: AppType.SHANFENG, orderNo: 'ORD20240601015', merchantName: '珠海燒烤店', algorithmType: AlgorithmType.SEARCH_ALGORITHM, channel: RecommendChannel.HOME, slot: '首頁第六坑', region: '珠海', timePeriod: '18:00-02:00', startDate: '2024-06-28', endDate: '2024-07-27', amount: 27000, status: OrderStatus.PAID },
]

export default function Order() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<OrderRecord[]>(mockData)

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    // 所属品牌筛选
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 订单号筛选
    if (values.orderNo) {
      result = result.filter(item => item.orderNo.includes(values.orderNo))
    }
    
    // 商家名称筛选
    if (values.merchantName) {
      result = result.filter(item => item.merchantName.includes(values.merchantName))
    }
    
    // 订单状态筛选
    if (values.status !== undefined && values.status !== null) {
      result = result.filter(item => item.status === values.status)
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(mockData)
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'app', title: '所屬品牌' },
    { key: 'orderNo', title: '訂單號' },
    { key: 'merchantName', title: '商家名稱' },
    { key: 'algorithmType', title: '廣告類型' },
    { key: 'channel', title: '業務頻道' },
    { key: 'slot', title: '坑位' },
    { key: 'region', title: '區域' },
    { key: 'timePeriod', title: '時段' },
    { key: 'startDate', title: '開始日期' },
    { key: 'endDate', title: '結束日期' },
    { key: 'amount', title: '金額' },
    { key: 'status', title: '訂單狀態' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('order', columnMeta)

  const columns: ColumnsType<OrderRecord> = [
    { 
      title: '所屬品牌', 
      dataIndex: 'app', 
      key: 'app', 
      width: 100,
      render: (v: AppType) => (
        <BrandTag value={v} />
      ),
    },
    { title: '訂單號', dataIndex: 'orderNo', key: 'orderNo', width: 160 },
    { title: '商家名稱', dataIndex: 'merchantName', key: 'merchantName', width: 140 },
    { 
      title: '廣告類型', 
      dataIndex: 'algorithmType', 
      key: 'algorithmType',
      width: 120,
      render: (v: AlgorithmType) => ALG_LABEL[v],
    },
    { 
      title: '投放頻道', 
      dataIndex: 'channel', 
      key: 'channel',
      width: 150,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
    },
    { title: '坑位', dataIndex: 'slot', key: 'slot' },
    { title: '區域', dataIndex: 'region', key: 'region' },
    { title: '投放時段', dataIndex: 'timePeriod', key: 'timePeriod' },
    { title: '開始日期', dataIndex: 'startDate', key: 'startDate' },
    { title: '結束日期', dataIndex: 'endDate', key: 'endDate' },
    { title: '金額 (MOP)', dataIndex: 'amount', key: 'amount', render: (v: number) => v.toLocaleString() },
    {
      title: '訂單狀態', dataIndex: 'status', key: 'status',
      render: (v: OrderStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag>,
    },
    {
      title: '操作', key: 'action',
      render: () => (
        <Space>
          <Button type="link" size="small">查看</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="訂單號" name="orderNo">
            <Input placeholder="請輸入訂單號" allowClear />
          </Form.Item>
          <Form.Item label="商戶名稱" name="merchantName">
            <Input placeholder="請輸入商戶名稱" allowClear />
          </Form.Item>
          <Form.Item label="訂單狀態" name="status">
            <Select placeholder="全部" options={ORDER_STATUS_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="日期範圍" name="dateRange">
            <DatePicker.RangePicker placeholder={['開始日期', '結束日期']} />
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />}>新增訂單</Button>
        </Space>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<OrderRecord>
          rowKey="id"
          columns={applyConfig(columns)}
          dataSource={filteredData}
          scroll={{ x: 1400 }}
          pagination={{ 
            pageSize: 10, 
            showTotal: (t) => `共 ${t} 條`, 
            showSizeChanger: true, 
            pageSizeOptions: ['10', '20', '50'], 
            showQuickJumper: true 
          }}
        />
      </div>
    </div>
  )
}
