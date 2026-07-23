import { useState, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Form, message, Tag, DatePicker, Tooltip } from 'antd'
import type { TableColumnsType } from 'antd'
import { useSearchParams } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/** 廣告類型 */
const adTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '新店廣告', value: 'new_store' },
  { label: '盤活復蘇', value: 'revival' },
  { label: '獨家商家', value: 'exclusive' },
  { label: '金牌商家', value: 'gold' },
  { label: '人氣商家(KA)', value: 'ka' },
]

const adTypeMap: Record<string, string> = {
  new_store: '新店廣告',
  revival: '盤活復蘇',
  exclusive: '獨家商家',
  gold: '金牌商家',
  ka: '人氣商家(KA)',
}

const adTypeColorMap: Record<string, string> = {
  new_store: '#52C41A',
  revival: '#E8720C',
  exclusive: '#722ED1',
  gold: '#FAAD14',
  ka: '#1890FF',
}

/** 交易類型：購買廣告花費 / 廣告退款返回 / 業務手動扣除 / 到期未用自動過期 */
const tradeTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '購買廣告', value: 'ad_purchase' },
  { label: '廣告退款', value: 'ad_refund' },
  { label: '手動扣除', value: 'manual_deduct' },
  { label: '自動過期', value: 'auto_expire' },
]

const tradeTypeMap: Record<string, string> = {
  ad_purchase: '購買廣告',
  ad_refund: '廣告退款',
  manual_deduct: '手動扣除',
  auto_expire: '自動過期',
}

const tradeTypeColorMap: Record<string, string> = {
  ad_purchase: 'orange',
  ad_refund: 'green',
  manual_deduct: 'red',
  auto_expire: 'default',
}

interface GiftConsumeRecord {
  key: string
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  brand: string
  adType: string
  tradeType: string
  balanceChange: number
  changeDate: string
  algorithmId: string
  algorithmName: string
  giftId: string
  orderNo: string
  remainingDays: number
  /** 備註：主要展示推廣贈送菜單扣除天數時填寫的扣除原因 */
  remark: string
}

/** Mock 數據 */
/** Mock 數據：退款為正數（增加余額），其餘為負數（減少余額） */
const mockData: GiftConsumeRecord[] = [
  {
    key: '1',
    groupId: 'G001',
    groupName: '美味餐廳集團',
    storeId: 'S1001',
    storeName: '澳門總店',
    brand: '2',
    adType: 'new_store',
    tradeType: 'ad_purchase',
    balanceChange: -5,
    changeDate: '2024-02-10',
    algorithmId: 'A001',
    algorithmName: '新店廣告-外賣版',
    giftId: '2401-001',
    orderNo: 'AD202402100001',
    remainingDays: 25,
    remark: '',
  },
  {
    key: '2',
    groupId: 'G001',
    groupName: '美味餐廳集團',
    storeId: 'S1001',
    storeName: '澳門總店',
    brand: '2',
    adType: 'new_store',
    tradeType: 'ad_refund',
    balanceChange: 3,
    changeDate: '2024-02-15',
    algorithmId: 'A001',
    algorithmName: '新店廣告-首頁版',
    giftId: '2401-001',
    orderNo: 'AD202402150002',
    remainingDays: 28,
    remark: '',
  },
  {
    key: '3',
    groupId: 'G002',
    groupName: '生鮮超市集團',
    storeId: 'S1002',
    storeName: '氹仔分店',
    brand: '1',
    adType: 'revival',
    tradeType: 'ad_purchase',
    balanceChange: -10,
    changeDate: '2023-11-05',
    algorithmId: 'A002',
    algorithmName: '盤活復蘇-團購版',
    giftId: '2310-001',
    orderNo: 'AD202311050001',
    remainingDays: 20,
    remark: '',
  },
  {
    key: '4',
    groupId: 'G003',
    groupName: '時尚百貨集團',
    storeId: 'S1003',
    storeName: '新馬路店',
    brand: '2',
    adType: 'exclusive',
    tradeType: 'manual_deduct',
    balanceChange: -8,
    changeDate: '2024-01-20',
    algorithmId: 'A003',
    algorithmName: '獨家商家-超市版',
    giftId: '2401-003',
    orderNo: '—',
    remainingDays: 37,
    remark: '商家違規進行虛假宣傳，經運營主管審核手動扣除贈送天數作為惩罰。',
  },
  {
    key: '5',
    groupId: 'G004',
    groupName: '速遞物流集團',
    storeId: 'S1004',
    storeName: '黑沙環店',
    brand: '1',
    adType: 'gold',
    tradeType: 'auto_expire',
    balanceChange: -7,
    changeDate: '2024-03-01',
    algorithmId: 'A004',
    algorithmName: '金牌商家-全渠道',
    giftId: '2306-001',
    orderNo: '—',
    remainingDays: 8,
    remark: '贈送天數有效期到期，系統自動收回剩餘天數。',
  },
  {
    key: '6',
    groupId: 'G005',
    groupName: '甜品屋集團',
    storeId: 'S1005',
    storeName: '官也街老店',
    brand: '2',
    adType: 'ka',
    tradeType: 'ad_refund',
    balanceChange: 4,
    changeDate: '2024-02-28',
    algorithmId: 'A005',
    algorithmName: '人氣商家(KA)-首頁版',
    giftId: '2401-004',
    orderNo: 'AD202402280001',
    remainingDays: 14,
    remark: '',
  },
]

export default function GiftConsumeDetail() {
  const [form] = Form.useForm()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [dataSource] = useState<GiftConsumeRecord[]>(mockData)

  /** 从贈送明細頁點擊「查看明細」進入時，自動帶入贈送ID 並預填搜索條件 */
  useEffect(() => {
    const giftId = searchParams.get('giftId')
    if (giftId) {
      form.setFieldsValue({ giftId })
    }
  }, [searchParams, form])

  const handleSearch = () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      message.success('查詢完成')
    }, 500)
  }

  const handleReset = () => {
    form.resetFields()
  }

  const handleExport = () => {
    message.success('導出功能開發中...')
  }

  const columns: TableColumnsType<GiftConsumeRecord> = [
    {
      title: '集團ID/集團名稱',
      key: 'groupInfo',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.groupId}</span>
          <span>{record.groupName}</span>
        </Space>
      ),
    },
    {
      title: '門店ID/門店名稱',
      key: 'storeInfo',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.storeId}</span>
          <span>{record.storeName}</span>
        </Space>
      ),
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (brand: string) => <BrandTag value={brand} />,
    },
    {
      title: '廣告類型',
      dataIndex: 'adType',
      key: 'adType',
      width: 110,
      render: (adType: string) => (
        <Tag style={{
          background: `${adTypeColorMap[adType] || '#E8720C'}15`,
          color: adTypeColorMap[adType] || '#E8720C',
          border: `1px solid ${adTypeColorMap[adType] || '#E8720C'}40`,
          fontSize: 12,
          padding: '1px 8px',
          borderRadius: 4,
        }}>
          {adTypeMap[adType] || adType}
        </Tag>
      ),
    },
    {
      title: '交易類型',
      dataIndex: 'tradeType',
      key: 'tradeType',
      width: 120,
      render: (type: string) => (
        <Tag color={tradeTypeColorMap[type] || 'default'}>
          {tradeTypeMap[type] || type}
        </Tag>
      ),
    },
    {
      title: '余額變動',
      dataIndex: 'balanceChange',
      key: 'balanceChange',
      width: 110,
      render: (val: number) => (
        <span style={{
          color: val > 0 ? '#52C41A' : '#FF4D4F',
          fontWeight: 600,
          fontSize: 14,
        }}>
          {val > 0 ? '+' : ''}{val} 天
        </span>
      ),
    },
    {
      title: '變動日期',
      dataIndex: 'changeDate',
      key: 'changeDate',
      width: 120,
    },
    {
      title: '廣告算法ID/算法名稱',
      key: 'algorithmInfo',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.algorithmId}</span>
          <span style={{ fontWeight: 500 }}>{record.algorithmName}</span>
        </Space>
      ),
    },
    {
      title: '關聯贈送ID',
      dataIndex: 'giftId',
      key: 'giftId',
      width: 160,
      render: (id: string) => (
        <span style={{ color: '#722ED1', fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: 12 }}>
          {id}
        </span>
      ),
    },
    {
      title: '關聯訂單號',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 150,
      render: (no: string) => (
        <span style={{ color: '#595959', fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: 12 }}>
          {no}
        </span>
      ),
    },
    {
      title: '剩餘天數',
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 100,
      render: (days: number) => (
        <span style={{ color: days > 0 ? '#52C41A' : '#8C8C8C', fontWeight: days > 0 ? 600 : 400 }}>
          {days} 天
        </span>
      ),
    },
    {
      title: '備註',
      dataIndex: 'remark',
      key: 'remark',
      width: 220,
      render: (remark: string) =>
        remark ? (
          <Tooltip title={remark} placement="topLeft">
            <span
              style={{
                display: 'inline-block',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                verticalAlign: 'bottom',
                color: '#595959',
                fontSize: 13,
              }}
            >
              {remark}
            </span>
          </Tooltip>
        ) : (
          <span style={{ color: '#BFBFBF' }}>—</span>
        ),
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('gift-consume-detail', columnMeta, [])
  const configuredColumns = applyConfig(columns)

  return (
    <div className="content-area">
      {/* 搜索區域 */}
      <div className="search-section">
        <Form form={form} layout="inline" style={{ width: '100%' }}>
          <Form.Item name="groupInfo" label="集團ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: 'G001 - 美味餐廳集團', value: 'G001' },
                { label: 'G002 - 生鮮超市集團', value: 'G002' },
                { label: 'G003 - 時尚百貨集團', value: 'G003' },
                { label: 'G004 - 速遞物流集團', value: 'G004' },
                { label: 'G005 - 甜品屋集團', value: 'G005' },
              ]}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="storeInfo" label="門店ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: 'S1001 - 澳門總店', value: 'S1001' },
                { label: 'S1002 - 氹仔分店', value: 'S1002' },
                { label: 'S1003 - 新馬路店', value: 'S1003' },
                { label: 'S1004 - 黑沙環店', value: 'S1004' },
                { label: 'S1005 - 官也街老店', value: 'S1005' },
              ]}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="brand" label="所屬品牌">
            <Select placeholder="全部" allowClear options={brandOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="adType" label="廣告類型">
            <Select placeholder="全部" allowClear options={adTypeOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="tradeType" label="交易類型">
            <Select placeholder="全部" allowClear options={tradeTypeOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="algorithmInfo" label="廣告算法ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: 'A001 - 新店廣告-外賣版', value: 'A001' },
                { label: 'A002 - 盤活復蘇-團購版', value: 'A002' },
                { label: 'A003 - 獨家商家-超市版', value: 'A003' },
                { label: 'A004 - 金牌商家-全渠道', value: 'A004' },
                { label: 'A005 - 人氣商家(KA)-首頁版', value: 'A005' },
              ]}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="giftId" label="贈送ID">
            <Input placeholder="請輸入贈送ID" allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="orderNo" label="關聯訂單號">
            <Input placeholder="請輸入訂單號" allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="changeDate" label="變動日期">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item className="search-actions">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查詢
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按鈕 */}
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

      {/* 表格 */}
      <Table
        columns={configuredColumns}
        dataSource={dataSource}
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 條`,
          pageSize: 10,
        }}
        scroll={{ x: 1500 }}
      />
    </div>
  )
}
