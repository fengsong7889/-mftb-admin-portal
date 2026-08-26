import { useState, useEffect, useMemo } from 'react'
import { Table, Button, Input, Select, DatePicker, Form, Space, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { REGION_OPTIONS, REGION_LABEL_KEY, type Region } from '../../Recommend/constants'

const { RangePicker } = DatePicker

/** 是否单一价枚举 */
const PRICE_FLAG = {
  SINGLE: 'single',
  TIERED: 'tiered',
} as const

const PRICE_FLAG_LABEL: Record<string, string> = {
  [PRICE_FLAG.SINGLE]: '單一價',
  [PRICE_FLAG.TIERED]: '階梯價',
}

const PRICE_FLAG_TAG_COLOR: Record<string, string> = {
  [PRICE_FLAG.SINGLE]: 'blue',
  [PRICE_FLAG.TIERED]: 'orange',
}

/** 分类选项 */
const CATEGORY_OPTIONS = ['正餐美食', '輕食飲品', '甜品烘焙', '燒烤火鍋']

/** 数据类型定义 */
interface FlashSalePriceRecord {
  id: number
  region: Region
  storeName: string
  groupName: string
  halfYearSales: number
  originalPrice: number
  previewPrice: number
  mainPrice: number
  discount: number
  category: string
  registerDate: string
  issueNo: string
  priceFlag: string
}

/** Mock 数据 */
const mockData: FlashSalePriceRecord[] = [
  {
    id: 1,
    region: 1,
    storeName: '金雞',
    groupName: 'B傳奇套餐',
    halfYearSales: 0,
    originalPrice: 114,
    previewPrice: 49.9,
    mainPrice: 49.9,
    discount: 4.4,
    category: '正餐美食',
    registerDate: '2026-08-17',
    issueNo: '第85期',
    priceFlag: PRICE_FLAG.SINGLE,
  },
  {
    id: 2,
    region: 1,
    storeName: '金雞',
    groupName: 'A經典雙人餐',
    halfYearSales: 320,
    originalPrice: 168,
    previewPrice: 69.9,
    mainPrice: 59.9,
    discount: 3.6,
    category: '正餐美食',
    registerDate: '2026-08-17',
    issueNo: '第85期',
    priceFlag: PRICE_FLAG.TIERED,
  },
  {
    id: 3,
    region: 2,
    storeName: '葡韻茶餐廳',
    groupName: '葡式雙人套餐',
    halfYearSales: 580,
    originalPrice: 128,
    previewPrice: 55.9,
    mainPrice: 49.9,
    discount: 3.9,
    category: '正餐美食',
    registerDate: '2026-08-16',
    issueNo: '第85期',
    priceFlag: PRICE_FLAG.TIERED,
  },
  {
    id: 4,
    region: 3,
    storeName: '澳門豆花',
    groupName: '招牌豆花+小食',
    halfYearSales: 1200,
    originalPrice: 45,
    previewPrice: 16.9,
    mainPrice: 15.9,
    discount: 3.5,
    category: '輕食飲品',
    registerDate: '2026-08-16',
    issueNo: '第85期',
    priceFlag: PRICE_FLAG.TIERED,
  },
  {
    id: 5,
    region: 4,
    storeName: '星際廚房',
    groupName: '商務午餐',
    halfYearSales: 260,
    originalPrice: 88,
    previewPrice: 39.9,
    mainPrice: 39.9,
    discount: 4.5,
    category: '正餐美食',
    registerDate: '2026-08-15',
    issueNo: '第84期',
    priceFlag: PRICE_FLAG.SINGLE,
  },
  {
    id: 6,
    region: 6,
    storeName: '官也街甜品',
    groupName: '芒果糯米飯套餐',
    halfYearSales: 890,
    originalPrice: 68,
    previewPrice: 25.9,
    mainPrice: 22.9,
    discount: 3.4,
    category: '甜品烘焙',
    registerDate: '2026-08-15',
    issueNo: '第84期',
    priceFlag: PRICE_FLAG.TIERED,
  },
  {
    id: 7,
    region: 11,
    storeName: '海邊燒烤場',
    groupName: '雙人燒烤套餐',
    halfYearSales: 150,
    originalPrice: 228,
    previewPrice: 99.9,
    mainPrice: 89.9,
    discount: 3.9,
    category: '燒烤火鍋',
    registerDate: '2026-08-14',
    issueNo: '第84期',
    priceFlag: PRICE_FLAG.TIERED,
  },
  {
    id: 8,
    region: 12,
    storeName: '拱北茶餐廳',
    groupName: '下午茶套餐',
    halfYearSales: 430,
    originalPrice: 58,
    previewPrice: 19.9,
    mainPrice: 19.9,
    discount: 3.4,
    category: '輕食飲品',
    registerDate: '2026-08-13',
    issueNo: '第83期',
    priceFlag: PRICE_FLAG.SINGLE,
  },
  {
    id: 9,
    region: 10,
    storeName: '澳大食堂',
    groupName: '學生優惠套餐',
    halfYearSales: 760,
    originalPrice: 40,
    previewPrice: 14.9,
    mainPrice: 12.9,
    discount: 3.2,
    category: '正餐美食',
    registerDate: '2026-08-12',
    issueNo: '第83期',
    priceFlag: PRICE_FLAG.TIERED,
  },
  {
    id: 10,
    region: 2,
    storeName: '高士德烘焙',
    groupName: '蛋撻一盒（6件）',
    halfYearSales: 2100,
    originalPrice: 72,
    previewPrice: 29.9,
    mainPrice: 29.9,
    discount: 4.2,
    category: '甜品烘焙',
    registerDate: '2026-08-11',
    issueNo: '第83期',
    priceFlag: PRICE_FLAG.SINGLE,
  },
]

/** 团购管理 - 澳觅秒杀价 */
export default function FlashSalePrice() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<FlashSalePriceRecord[]>([])
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
      // const res = await fetchFlashSalePrice({ ...values, page, size: pageSize })
      await new Promise(resolve => setTimeout(resolve, 500))

      const values = form.getFieldsValue()
      let filtered = [...mockData]
      if (values.storeName) {
        filtered = filtered.filter(item => item.storeName.includes(values.storeName))
      }
      if (values.groupName) {
        filtered = filtered.filter(item => item.groupName.includes(values.groupName))
      }
      if (values.region !== undefined) {
        filtered = filtered.filter(item => item.region === values.region)
      }
      if (values.category) {
        filtered = filtered.filter(item => item.category === values.category)
      }
      if (values.issueNo) {
        filtered = filtered.filter(item => item.issueNo.includes(values.issueNo))
      }
      if (values.priceFlag) {
        filtered = filtered.filter(item => item.priceFlag === values.priceFlag)
      }
      const dateRange: [Dayjs, Dayjs] | undefined = values.registerDate
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].format('YYYY-MM-DD')
        const end = dateRange[1].format('YYYY-MM-DD')
        filtered = filtered.filter(item => item.registerDate >= start && item.registerDate <= end)
      }

      const startIdx = (page - 1) * pageSize
      const endIdx = startIdx + pageSize
      setDataSource(filtered.slice(startIdx, endIdx))
      setPagination({
        current: page,
        pageSize,
        total: filtered.length,
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
  const handleTableChange = (pag: { current?: number; pageSize?: number }) => {
    loadData(pag.current, pag.pageSize)
  }

  /** 导出 */
  const handleExport = () => {
    message.info(t('common.underDevelopment', '导出功能开发中...'))
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'region', title: '區域' },
    { key: 'storeName', title: '店鋪' },
    { key: 'groupName', title: '團單' },
    { key: 'halfYearSales', title: '半年售' },
    { key: 'originalPrice', title: '原價' },
    { key: 'previewPrice', title: '預告檔價格' },
    { key: 'mainPrice', title: '主力檔價格' },
    { key: 'discount', title: '折扣' },
    { key: 'category', title: '分類' },
    { key: 'registerDate', title: '登記日期' },
    { key: 'issueNo', title: '期數' },
    { key: 'priceFlag', title: '是否單一價' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('flash-sale-price', columnMeta)

  /** 表格列定义 */
  const columns: TableColumnsType<FlashSalePriceRecord> = [
    {
      title: '區域',
      dataIndex: 'region',
      key: 'region',
      width: 100,
      fixed: 'left',
      render: (val: Region) => t(REGION_LABEL_KEY[val]),
    },
    {
      title: '店鋪',
      dataIndex: 'storeName',
      key: 'storeName',
      width: 130,
      fixed: 'left',
      ellipsis: true,
    },
    {
      title: '團單',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 170,
      fixed: 'left',
      ellipsis: true,
    },
    {
      title: '半年售',
      dataIndex: 'halfYearSales',
      key: 'halfYearSales',
      width: 90,
      align: 'right',
    },
    {
      title: '原價',
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 90,
      align: 'right',
    },
    {
      title: '預告檔價格',
      dataIndex: 'previewPrice',
      key: 'previewPrice',
      width: 110,
      align: 'right',
    },
    {
      title: '主力檔價格',
      dataIndex: 'mainPrice',
      key: 'mainPrice',
      width: 110,
      align: 'right',
    },
    {
      title: '折扣',
      dataIndex: 'discount',
      key: 'discount',
      width: 90,
      render: (val: number) => <span style={{ fontWeight: 600 }}>{val}折</span>,
    },
    {
      title: '分類',
      dataIndex: 'category',
      key: 'category',
      width: 110,
    },
    {
      title: '登記日期',
      dataIndex: 'registerDate',
      key: 'registerDate',
      width: 110,
    },
    {
      title: '期數',
      dataIndex: 'issueNo',
      key: 'issueNo',
      width: 90,
    },
    {
      title: '是否單一價',
      dataIndex: 'priceFlag',
      key: 'priceFlag',
      width: 110,
      render: (val: string) => (
        <Tag color={PRICE_FLAG_TAG_COLOR[val]}>
          {PRICE_FLAG_LABEL[val]}
        </Tag>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 搜索区域 */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="storeName" label="店鋪">
            <Input
              placeholder="請輸入店鋪名稱"
              allowClear
            />
          </Form.Item>
          <Form.Item name="groupName" label="團單">
            <Input
              placeholder="請輸入團單名稱"
              allowClear
            />
          </Form.Item>
          <Form.Item name="region" label="區域">
            <Select
              placeholder="全部"
              allowClear
              showSearch
              optionFilterProp="label"
              options={REGION_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))}
            />
          </Form.Item>
          <Form.Item name="category" label="分類">
            <Select
              placeholder="全部"
              allowClear
              options={CATEGORY_OPTIONS.map(c => ({ label: c, value: c }))}
            />
          </Form.Item>
          <Form.Item name="issueNo" label="期數">
            <Input
              placeholder="請輸入期數"
              allowClear
            />
          </Form.Item>
          <Form.Item name="priceFlag" label="是否單一價">
            <Select
              placeholder="全部"
              allowClear
              options={[
                { label: PRICE_FLAG_LABEL[PRICE_FLAG.SINGLE], value: PRICE_FLAG.SINGLE },
                { label: PRICE_FLAG_LABEL[PRICE_FLAG.TIERED], value: PRICE_FLAG.TIERED },
              ]}
            />
          </Form.Item>
          <Form.Item name="registerDate" label="登記日期">
            <RangePicker />
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
        scroll={{ x: 1400 }}
        size="middle"
      />
    </div>
  )
}
