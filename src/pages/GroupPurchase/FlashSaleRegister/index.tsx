import { useState, useEffect, useMemo } from 'react'
import { Table, Button, Input, Select, Form, Space, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

/** 补贴类型枚举 */
const SUBSIDY_TYPE = {
  PLATFORM: 'platform',
  MERCHANT: 'merchant',
  JOINT: 'joint',
} as const

const SUBSIDY_TYPE_LABEL: Record<string, string> = {
  [SUBSIDY_TYPE.PLATFORM]: '平台補貼',
  [SUBSIDY_TYPE.MERCHANT]: '商戶補貼',
  [SUBSIDY_TYPE.JOINT]: '聯合補貼',
}

const SUBSIDY_TYPE_TAG_COLOR: Record<string, string> = {
  [SUBSIDY_TYPE.PLATFORM]: 'blue',
  [SUBSIDY_TYPE.MERCHANT]: 'orange',
  [SUBSIDY_TYPE.JOINT]: 'purple',
}

/** 商品类型枚举 */
const PRODUCT_TYPE = {
  SINGLE: 'single',
  COMBO: 'combo',
  VOUCHER: 'voucher',
} as const

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  [PRODUCT_TYPE.SINGLE]: '單品',
  [PRODUCT_TYPE.COMBO]: '套餐',
  [PRODUCT_TYPE.VOUCHER]: '代金券',
}

/** 秒杀价阶梯：阶梯价 + 阶梯库存 */
interface PriceTier {
  tierPrice: number
  tierStock: number
}

/** 数据类型定义 */
interface FlashSaleRegisterRecord {
  id: number
  subsidyType: string
  seqNo: number
  bdName: string
  storeName: string
  productName: string
  productType: string
  productId: string
  maxPurchasePerUser: number
  flashSaleStock: number
  priceTiers: PriceTier[]
  originalPrice: number
  groupPrice: number
  currentPeriodSales: number
}

/** Mock 数据 */
const mockData: FlashSaleRegisterRecord[] = [
  {
    id: 1,
    subsidyType: SUBSIDY_TYPE.PLATFORM,
    seqNo: 1,
    bdName: '张三',
    storeName: '大三巴美食店',
    productName: '澳門豬扒包',
    productType: PRODUCT_TYPE.SINGLE,
    productId: 'SP001',
    maxPurchasePerUser: 2,
    flashSaleStock: 100,
    priceTiers: [{ tierPrice: 15.0, tierStock: 100 }],
    originalPrice: 32.0,
    groupPrice: 25.0,
    currentPeriodSales: 86,
  },
  {
    id: 2,
    subsidyType: SUBSIDY_TYPE.JOINT,
    seqNo: 2,
    bdName: '李四',
    storeName: '安德魯餅店',
    productName: '葡式蛋撻（4隻裝）',
    productType: PRODUCT_TYPE.COMBO,
    productId: 'SP002',
    maxPurchasePerUser: 1,
    flashSaleStock: 200,
    priceTiers: [
      { tierPrice: 8.0, tierStock: 120 },
      { tierPrice: 6.5, tierStock: 80 },
    ],
    originalPrice: 18.0,
    groupPrice: 12.0,
    currentPeriodSales: 156,
  },
  {
    id: 3,
    subsidyType: SUBSIDY_TYPE.MERCHANT,
    seqNo: 3,
    bdName: '王五',
    storeName: '凼仔官也街餐廳',
    productName: '水蟹粥',
    productType: PRODUCT_TYPE.SINGLE,
    productId: 'SP003',
    maxPurchasePerUser: 2,
    flashSaleStock: 50,
    priceTiers: [{ tierPrice: 128.0, tierStock: 50 }],
    originalPrice: 188.0,
    groupPrice: 158.0,
    currentPeriodSales: 32,
  },
  {
    id: 4,
    subsidyType: SUBSIDY_TYPE.PLATFORM,
    seqNo: 4,
    bdName: '张三',
    storeName: '泰式料理',
    productName: '泰式奶茶',
    productType: PRODUCT_TYPE.SINGLE,
    productId: 'SP004',
    maxPurchasePerUser: 3,
    flashSaleStock: 300,
    priceTiers: [{ tierPrice: 9.9, tierStock: 300 }],
    originalPrice: 22.0,
    groupPrice: 15.0,
    currentPeriodSales: 210,
  },
  {
    id: 5,
    subsidyType: SUBSIDY_TYPE.JOINT,
    seqNo: 5,
    bdName: '李四',
    storeName: '法式甜品店',
    productName: '馬卡龍禮盒兌換券',
    productType: PRODUCT_TYPE.VOUCHER,
    productId: 'SP005',
    maxPurchasePerUser: 1,
    flashSaleStock: 80,
    priceTiers: [
      { tierPrice: 68.0, tierStock: 50 },
      { tierPrice: 58.0, tierStock: 30 },
    ],
    originalPrice: 128.0,
    groupPrice: 98.0,
    currentPeriodSales: 45,
  },
]

/** 团购管理 - 秒杀商品登记 */
export default function FlashSaleRegister() {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<FlashSaleRegisterRecord[]>([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })

  /** 加载数据（Mock 本地过滤，待接入真实 API） */
  const fetchList = async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      // TODO: 接入真实 API
      // const values = form.getFieldsValue()
      // const res = await fetchFlashSaleRegister({ ...values, page, size: pageSize })
      await new Promise(resolve => setTimeout(resolve, 500))
      const values = form.getFieldsValue()
      const keyword: string = (values.product || '').trim()
      const filtered = mockData.filter(item => {
        if (keyword && !item.productId.toLowerCase().includes(keyword.toLowerCase()) && !item.productName.includes(keyword)) return false
        if (values.store && !item.storeName.includes(values.store)) return false
        if (values.bd && item.bdName !== values.bd) return false
        if (values.subsidyType && item.subsidyType !== values.subsidyType) return false
        if (values.productType && item.productType !== values.productType) return false
        return true
      })
      const start = (page - 1) * pageSize
      const end = start + pageSize
      setDataSource(filtered.slice(start, end))
      setPagination({ current: page, pageSize, total: filtered.length })
    } catch {
      message.error(t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 查询 */
  const handleSearch = () => {
    fetchList(1, pagination.pageSize)
  }

  /** 重置 */
  const handleReset = () => {
    form.resetFields()
    fetchList(1, pagination.pageSize)
  }

  /** 分页变化 */
  const handleTableChange = (pag: { current?: number; pageSize?: number }) => {
    fetchList(pag.current, pag.pageSize)
  }

  /** 导出 */
  const handleExport = () => {
    message.info('导出功能开发中...')
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'subsidyType', title: '補貼類型' },
    { key: 'seqNo', title: '序號' },
    { key: 'bdName', title: 'BD' },
    { key: 'storeName', title: '門店名稱' },
    { key: 'productName', title: '商品名稱' },
    { key: 'productType', title: '商品類型' },
    { key: 'productId', title: '商品ID' },
    { key: 'maxPurchasePerUser', title: '每人最多購買' },
    { key: 'flashSaleStock', title: '秒殺庫存' },
    { key: 'priceTiers', title: '秒殺價階梯' },
    { key: 'originalPrice', title: '原價' },
    { key: 'groupPrice', title: '團購價' },
    { key: 'currentPeriodSales', title: '本期秒殺銷量' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('flash-sale-register', columnMeta)

  /** 表格列定义 */
  const columns: TableColumnsType<FlashSaleRegisterRecord> = [
    {
      title: '補貼類型',
      dataIndex: 'subsidyType',
      key: 'subsidyType',
      width: 100,
      fixed: 'left',
      render: (val: string) => (
        <Tag color={SUBSIDY_TYPE_TAG_COLOR[val]}>
          {SUBSIDY_TYPE_LABEL[val]}
        </Tag>
      ),
    },
    {
      title: '序號',
      dataIndex: 'seqNo',
      key: 'seqNo',
      width: 70,
      align: 'center',
    },
    {
      title: 'BD',
      dataIndex: 'bdName',
      key: 'bdName',
      width: 90,
    },
    {
      title: '門店名稱',
      dataIndex: 'storeName',
      key: 'storeName',
      width: 160,
      ellipsis: true,
    },
    {
      title: '商品名稱',
      dataIndex: 'productName',
      key: 'productName',
      width: 160,
      ellipsis: true,
    },
    {
      title: '商品類型',
      dataIndex: 'productType',
      key: 'productType',
      width: 90,
      render: (val: string) => PRODUCT_TYPE_LABEL[val],
    },
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
      width: 100,
    },
    {
      title: '每人最多購買',
      dataIndex: 'maxPurchasePerUser',
      key: 'maxPurchasePerUser',
      width: 110,
      align: 'center',
      render: (val: number) => `${val} 份`,
    },
    {
      title: '秒殺庫存',
      dataIndex: 'flashSaleStock',
      key: 'flashSaleStock',
      width: 90,
      align: 'right',
    },
    {
      title: '秒殺價階梯（多階梯秒殺要提供階梯價及階梯庫存）',
      dataIndex: 'priceTiers',
      key: 'priceTiers',
      width: 220,
      render: (tiers: PriceTier[]) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tiers.map((tier, idx) => (
            <span key={idx} style={{ fontSize: 12, lineHeight: '20px' }}>
              {tiers.length > 1 && (
                <span style={{ color: '#8C8C8C' }}>階梯{idx + 1}：</span>
              )}
              <span style={{ color: '#E8720C', fontWeight: 600 }}>MOP {tier.tierPrice.toFixed(2)}</span>
              <span style={{ color: '#8C8C8C' }}> / 庫存 {tier.tierStock}</span>
            </span>
          ))}
        </div>
      ),
    },
    {
      title: '原價',
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 100,
      align: 'right',
      render: (val: number) => `MOP ${val.toFixed(2)}`,
    },
    {
      title: '團購價',
      dataIndex: 'groupPrice',
      key: 'groupPrice',
      width: 100,
      align: 'right',
      render: (val: number) => `MOP ${val.toFixed(2)}`,
    },
    {
      title: '本期秒殺銷量',
      dataIndex: 'currentPeriodSales',
      key: 'currentPeriodSales',
      width: 110,
      align: 'right',
    },
  ]

  return (
    <div className="content-area">
      {/* 搜索区域 */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="product" label="商品ID/名稱">
            <Input placeholder="請輸入商品ID或名稱" allowClear />
          </Form.Item>
          <Form.Item name="store" label="門店名稱">
            <Input placeholder="請輸入門店名稱" allowClear />
          </Form.Item>
          <Form.Item name="bd" label="BD">
            <Select
              placeholder="全部"
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: '张三', value: '张三' },
                { label: '李四', value: '李四' },
                { label: '王五', value: '王五' },
              ]}
            />
          </Form.Item>
          <Form.Item name="subsidyType" label="補貼類型">
            <Select
              placeholder="全部"
              allowClear
              options={[
                { label: SUBSIDY_TYPE_LABEL[SUBSIDY_TYPE.PLATFORM], value: SUBSIDY_TYPE.PLATFORM },
                { label: SUBSIDY_TYPE_LABEL[SUBSIDY_TYPE.MERCHANT], value: SUBSIDY_TYPE.MERCHANT },
                { label: SUBSIDY_TYPE_LABEL[SUBSIDY_TYPE.JOINT], value: SUBSIDY_TYPE.JOINT },
              ]}
            />
          </Form.Item>
          <Form.Item name="productType" label="商品類型">
            <Select
              placeholder="全部"
              allowClear
              options={[
                { label: PRODUCT_TYPE_LABEL[PRODUCT_TYPE.SINGLE], value: PRODUCT_TYPE.SINGLE },
                { label: PRODUCT_TYPE_LABEL[PRODUCT_TYPE.COMBO], value: PRODUCT_TYPE.COMBO },
                { label: PRODUCT_TYPE_LABEL[PRODUCT_TYPE.VOUCHER], value: PRODUCT_TYPE.VOUCHER },
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
        scroll={{ x: 1500 }}
        size="middle"
      />
    </div>
  )
}
