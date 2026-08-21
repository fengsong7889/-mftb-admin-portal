import { useState, useEffect, useMemo } from 'react'
import { Table, Button, Input, Select, DatePicker, Form, Space, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/** 类型枚举 */
const PRICE_TYPE = {
  TIERED: 'tiered',
  SINGLE: 'single',
} as const

const PRICE_TYPE_LABEL: Record<string, string> = {
  [PRICE_TYPE.TIERED]: '階梯價格',
  [PRICE_TYPE.SINGLE]: '單一價格',
}

const PRICE_TYPE_TAG_COLOR: Record<string, string> = {
  [PRICE_TYPE.TIERED]: 'orange',
  [PRICE_TYPE.SINGLE]: 'blue',
}

/** 是否补贴枚举 */
const SUBSIDY_STATUS = {
  YES: 'yes',
  NO: 'no',
} as const

/** 数据类型定义 */
interface FlashSaleStatsRecord {
  id: number
  statDate: string
  productId: string
  productName: string
  storeName: string
  priceType: string
  flashSalePrice: number
  orderUsers: number
  totalPrice: number
  totalOrders: number
  totalSales: number
  actualAmount: number
  orderUsersChange: number
  totalPriceChange: number
  totalOrdersChange: number
  totalSalesChange: number
  actualAmountChange: number
  hasSubsidy: string
  discountRate: number
  lastPeriodSubsidy: string
  bdName: string
}

/** Mock 数据 */
const mockData: FlashSaleStatsRecord[] = [
  {
    id: 1,
    statDate: '2026-08-20',
    productId: 'SP001',
    productName: '澳門豬扒包',
    storeName: '大三巴美食店',
    priceType: PRICE_TYPE.TIERED,
    flashSalePrice: 15.00,
    orderUsers: 128,
    totalPrice: 1920.00,
    totalOrders: 156,
    totalSales: 234,
    actualAmount: 1680.00,
    orderUsersChange: 12.5,
    totalPriceChange: 8.3,
    totalOrdersChange: 15.2,
    totalSalesChange: 10.8,
    actualAmountChange: 6.5,
    hasSubsidy: SUBSIDY_STATUS.YES,
    discountRate: 87.5,
    lastPeriodSubsidy: SUBSIDY_STATUS.YES,
    bdName: '张三',
  },
  {
    id: 2,
    statDate: '2026-08-20',
    productId: 'SP002',
    productName: '葡式蛋撻',
    storeName: '安德魯餅店',
    priceType: PRICE_TYPE.SINGLE,
    flashSalePrice: 8.00,
    orderUsers: 256,
    totalPrice: 2048.00,
    totalOrders: 312,
    totalSales: 468,
    actualAmount: 1920.00,
    orderUsersChange: -5.2,
    totalPriceChange: -3.8,
    totalOrdersChange: -6.1,
    totalSalesChange: -4.5,
    actualAmountChange: -2.9,
    hasSubsidy: SUBSIDY_STATUS.NO,
    discountRate: 93.8,
    lastPeriodSubsidy: SUBSIDY_STATUS.NO,
    bdName: '李四',
  },
  {
    id: 3,
    statDate: '2026-08-19',
    productId: 'SP003',
    productName: '水蟹粥',
    storeName: '凼仔官也街餐廳',
    priceType: 'tiered',
    flashSalePrice: 128.00,
    orderUsers: 45,
    totalPrice: 5760.00,
    totalOrders: 52,
    totalSales: 68,
    actualAmount: 5120.00,
    orderUsersChange: 23.5,
    totalPriceChange: 18.2,
    totalOrdersChange: 25.0,
    totalSalesChange: 20.3,
    actualAmountChange: 15.8,
    hasSubsidy: SUBSIDY_STATUS.YES,
    discountRate: 88.9,
    lastPeriodSubsidy: SUBSIDY_STATUS.NO,
    bdName: '王五',
  },
]

export default function FlashSaleStats() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<FlashSaleStatsRecord[]>([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })

  /** 加载数据 */
  const loadData = async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      // TODO: 接入真实 API
      // const values = form.getFieldsValue()
      // const res = await fetchFlashSaleStats({ ...values, page, size: pageSize })
      
      // Mock 数据
      await new Promise(resolve => setTimeout(resolve, 500))
      const start = (page - 1) * pageSize
      const end = start + pageSize
      const pageData = mockData.slice(start, end)
      
      setDataSource(pageData)
      setPagination({
        current: page,
        pageSize,
        total: mockData.length,
      })
    } catch {
      message.error(t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  /** 查询 */
  const handleSearch = () => {
    loadData(1, pagination.pageSize)
  }

  /** 重置 */
  const handleReset = () => {
    form.resetFields()
    loadData(1, pagination.pageSize)
  }

  /** 分页变化 */
  const handleTableChange = (pag: any) => {
    loadData(pag.current, pag.pageSize)
  }

  /** 导出 */
  const handleExport = () => {
    message.info('导出功能开发中...')
  }

  /** 渲染环比值 */
  const renderChange = (value: number) => {
    const color = value > 0 ? '#52C41A' : value < 0 ? '#FF4D4F' : '#8C8C8C'
    const prefix = value > 0 ? '+' : ''
    return <span style={{ color, fontWeight: 500 }}>{prefix}{value}%</span>
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'statDate', title: '統計日期' },
    { key: 'productId', title: '商品ID' },
    { key: 'productName', title: '商品名稱' },
    { key: 'storeName', title: '所屬門店' },
    { key: 'priceType', title: '類型' },
    { key: 'flashSalePrice', title: '秒殺價' },
    { key: 'orderUsers', title: '下單用戶' },
    { key: 'totalPrice', title: '總價' },
    { key: 'totalOrders', title: '訂單總數' },
    { key: 'totalSales', title: '商品總銷量' },
    { key: 'actualAmount', title: '實付總額' },
    { key: 'orderUsersChange', title: '下單用戶環比' },
    { key: 'totalPriceChange', title: '總價環比' },
    { key: 'totalOrdersChange', title: '訂單總數環比' },
    { key: 'totalSalesChange', title: '銷量環比' },
    { key: 'actualAmountChange', title: '實付環比' },
    { key: 'hasSubsidy', title: '是否補貼' },
    { key: 'discountRate', title: '折扣率' },
    { key: 'lastPeriodSubsidy', title: '上期有補貼' },
    { key: 'bdName', title: '所屬BD' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('flash-sale-stats', columnMeta)

  /** 表格列定义 */
  const columns: TableColumnsType<FlashSaleStatsRecord> = [
    {
      title: '統計日期',
      dataIndex: 'statDate',
      key: 'statDate',
      width: 110,
      fixed: 'left',
    },
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
      width: 100,
      fixed: 'left',
    },
    {
      title: '商品名稱',
      dataIndex: 'productName',
      key: 'productName',
      width: 150,
      fixed: 'left',
      ellipsis: true,
    },
    {
      title: '所屬門店',
      dataIndex: 'storeName',
      key: 'storeName',
      width: 160,
      ellipsis: true,
    },
    {
      title: '類型',
      dataIndex: 'priceType',
      key: 'priceType',
      width: 100,
      render: (val: string) => (
        <Tag color={PRICE_TYPE_TAG_COLOR[val]}>
          {PRICE_TYPE_LABEL[val]}
        </Tag>
      ),
    },
    {
      title: '秒殺價',
      dataIndex: 'flashSalePrice',
      key: 'flashSalePrice',
      width: 100,
      align: 'right',
      render: (val: number) => `MOP ${val.toFixed(2)}`,
    },
    {
      title: '下單用戶',
      dataIndex: 'orderUsers',
      key: 'orderUsers',
      width: 100,
      align: 'right',
    },
    {
      title: '總價',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 120,
      align: 'right',
      render: (val: number) => `MOP ${val.toFixed(2)}`,
    },
    {
      title: '訂單總數',
      dataIndex: 'totalOrders',
      key: 'totalOrders',
      width: 100,
      align: 'right',
    },
    {
      title: '商品總銷量',
      dataIndex: 'totalSales',
      key: 'totalSales',
      width: 110,
      align: 'right',
    },
    {
      title: '實付總額',
      dataIndex: 'actualAmount',
      key: 'actualAmount',
      width: 120,
      align: 'right',
      render: (val: number) => `MOP ${val.toFixed(2)}`,
    },
    {
      title: '下單用戶環比',
      dataIndex: 'orderUsersChange',
      key: 'orderUsersChange',
      width: 120,
      align: 'right',
      render: renderChange,
    },
    {
      title: '總價環比',
      dataIndex: 'totalPriceChange',
      key: 'totalPriceChange',
      width: 100,
      align: 'right',
      render: renderChange,
    },
    {
      title: '訂單總數環比',
      dataIndex: 'totalOrdersChange',
      key: 'totalOrdersChange',
      width: 120,
      align: 'right',
      render: renderChange,
    },
    {
      title: '銷量環比',
      dataIndex: 'totalSalesChange',
      key: 'totalSalesChange',
      width: 100,
      align: 'right',
      render: renderChange,
    },
    {
      title: '實付環比',
      dataIndex: 'actualAmountChange',
      key: 'actualAmountChange',
      width: 100,
      align: 'right',
      render: renderChange,
    },
    {
      title: '是否補貼',
      dataIndex: 'hasSubsidy',
      key: 'hasSubsidy',
      width: 100,
      render: (val: string) => (
        <Tag color={val === SUBSIDY_STATUS.YES ? 'green' : 'default'}>
          {val === SUBSIDY_STATUS.YES ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '折扣率',
      dataIndex: 'discountRate',
      key: 'discountRate',
      width: 90,
      align: 'right',
      render: (val: number) => `${val}%`,
    },
    {
      title: '上期有補貼',
      dataIndex: 'lastPeriodSubsidy',
      key: 'lastPeriodSubsidy',
      width: 100,
      render: (val: string) => (
        <Tag color={val === SUBSIDY_STATUS.YES ? 'green' : 'default'}>
          {val === SUBSIDY_STATUS.YES ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '所屬BD',
      dataIndex: 'bdName',
      key: 'bdName',
      width: 100,
    },
  ]

  return (
    <div className="content-area">
      {/* 搜索区域 */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="product" label="商品ID/名稱">
            <Input 
              placeholder="請輸入商品ID或名稱" 
              allowClear 
            />
          </Form.Item>
          <Form.Item name="store" label="所屬門店">
            <Select 
              placeholder="全部" 
              allowClear 
              showSearch
              optionFilterProp="label"
              options={[
                { label: '大三巴美食店', value: 'store1' },
                { label: '安德魯餅店', value: 'store2' },
                { label: '凼仔官也街餐廳', value: 'store3' },
              ]}
            />
          </Form.Item>
          <Form.Item name="dateRange" label="統計日期">
            <RangePicker />
          </Form.Item>
          <Form.Item name="priceType" label="類型">
            <Select 
              placeholder="全部" 
              allowClear 
              options={[
                { label: '階梯價格', value: PRICE_TYPE.TIERED },
                { label: '單一價格', value: PRICE_TYPE.SINGLE },
              ]}
            />
          </Form.Item>
          <Form.Item name="bd" label="所屬BD">
            <Select 
              placeholder="全部" 
              allowClear 
              showSearch
              optionFilterProp="label"
              options={[
                { label: '张三', value: 'bd1' },
                { label: '李四', value: 'bd2' },
                { label: '王五', value: 'bd3' },
              ]}
            />
          </Form.Item>
          <Form.Item className="search-actions">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
                查詢
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按钮区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
          </Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 表格区域 */}
      <Table
        columns={applyConfig(columns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 條`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 2800 }}
        size="middle"
      />
    </div>
  )
}
