import { useState, useCallback, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Form, message, Tag, DatePicker, Tooltip } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useSearchParams } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import type { GiftConsumeItem } from '../../api/gift'
import { fetchGiftConsume } from '../../api/gift'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import type { StoreItem } from '../../api/store'
import { fetchStoresByGroup } from '../../api/store'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

/** 廣告類型 */
const adTypeOptions = [
  { label: '全部', value: '' },
  { label: '新店廣告', value: 'new_store' },
  { label: '盤活復蘇', value: 'revival' },
  { label: '獨家商家', value: 'exclusive' },
  { label: '金牌商家', value: 'gold' },
  { label: '人氣商家', value: 'ka' },
]

const adTypeMap: Record<string, string> = {
  new_store: '新店廣告',
  revival: '盤活復蘇',
  exclusive: '獨家商家',
  gold: '金牌商家',
  ka: '人氣商家',
}

const adTypeColorMap: Record<string, string> = {
  new_store: '#52C41A',
  revival: '#E8720C',
  exclusive: '#722ED1',
  gold: '#FAAD14',
  ka: '#1890FF',
}

/** 交易類型 */
const tradeTypeOptions = [
  { label: '全部', value: '' },
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

export default function GiftConsumeDetail() {
  const [form] = Form.useForm()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<GiftConsumeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  // 搜索条件（已生效）
  const [filters, setFilters] = useState<{
    groupId?: number; storeId?: number; brand?: string; adType?: string
    tradeType?: string; giftId?: string; orderNo?: string
    algorithmId?: string; startDate?: string; endDate?: string
  }>({})

  // 搜索条件（表单暂存）
  const [searchGroupId, setSearchGroupId] = useState<number | undefined>()
  const [searchStoreId, setSearchStoreId] = useState<number | undefined>()
  const [searchBrand, setSearchBrand] = useState('')
  const [searchAdType, setSearchAdType] = useState('')
  const [searchTradeType, setSearchTradeType] = useState('')
  const [searchGiftId, setSearchGiftId] = useState('')
  const [searchOrderNo, setSearchOrderNo] = useState('')
  const [searchAlgorithmId, setSearchAlgorithmId] = useState('')
  const [searchDateRange, setSearchDateRange] = useState<[string, string] | null>(null)

  // 集团/门店下拉
  const [groups, setGroups] = useState<MerchantGroupItem[]>([])
  const [stores, setStores] = useState<StoreItem[]>([])

  // 加载集团下拉
  useEffect(() => {
    fetchAllMerchantGroups()
      .then(setGroups)
      .catch(() => {})
  }, [])

  // 当搜索集团变化时加载门店下拉
  useEffect(() => {
    if (searchGroupId) {
      fetchStoresByGroup(searchGroupId)
        .then(setStores)
        .catch(() => setStores([]))
    } else {
      setStores([])
    }
    setSearchStoreId(undefined)
  }, [searchGroupId])

  /** 从贈送明細頁點擊「查看明細」進入時，自動帶入贈送ID */
  useEffect(() => {
    const giftId = searchParams.get('giftId')
    if (giftId) {
      setSearchGiftId(giftId)
      setFilters(prev => ({ ...prev, giftId }))
    }
  }, [searchParams])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchGiftConsume({
        page, size,
        ...filters,
      })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      message.error('查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [page, size, filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSearch = () => {
    setFilters({
      groupId: searchGroupId,
      storeId: searchStoreId,
      brand: searchBrand || undefined,
      adType: searchAdType || undefined,
      tradeType: searchTradeType || undefined,
      giftId: searchGiftId || undefined,
      orderNo: searchOrderNo || undefined,
      algorithmId: searchAlgorithmId || undefined,
      startDate: searchDateRange?.[0],
      endDate: searchDateRange?.[1],
    })
    setPage(1)
  }

  const handleReset = () => {
    form.resetFields()
    setSearchGroupId(undefined)
    setSearchStoreId(undefined)
    setSearchBrand('')
    setSearchAdType('')
    setSearchTradeType('')
    setSearchGiftId('')
    setSearchOrderNo('')
    setSearchAlgorithmId('')
    setSearchDateRange(null)
    setFilters({})
    setPage(1)
  }

  const handleExport = () => {
    message.success('導出功能開發中...')
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const columns: TableColumnsType<GiftConsumeItem> = [
    {
      title: '集團ID/集團名稱',
      key: 'groupInfo',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.groupCode || record.groupId}</span>
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
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.storeCode || record.storeId}</span>
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
              value={searchGroupId}
              onChange={setSearchGroupId}
              options={groups.map(g => ({
                label: `${g.groupCode} - ${g.groupName}`,
                value: g.id,
              }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="storeInfo" label="門店ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              value={searchStoreId}
              onChange={setSearchStoreId}
              disabled={!searchGroupId}
              options={stores.map(s => ({
                label: `${s.storeCode} - ${s.storeName}`,
                value: s.id,
              }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="brand" label="所屬品牌">
            <Select
              placeholder="全部"
              allowClear
              options={brandOptions}
              value={searchBrand || undefined}
              onChange={(v) => setSearchBrand(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="adType" label="廣告類型">
            <Select
              placeholder="全部"
              allowClear
              options={adTypeOptions}
              value={searchAdType || undefined}
              onChange={(v) => setSearchAdType(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="tradeType" label="交易類型">
            <Select
              placeholder="全部"
              allowClear
              options={tradeTypeOptions}
              value={searchTradeType || undefined}
              onChange={(v) => setSearchTradeType(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="algorithmInfo" label="廣告算法ID/名稱">
            <Input
              placeholder="輸入算法ID或名稱搜索"
              allowClear
              value={searchAlgorithmId}
              onChange={(e) => setSearchAlgorithmId(e.target.value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="giftId" label="贈送ID">
            <Input
              placeholder="請輸入贈送ID"
              allowClear
              value={searchGiftId}
              onChange={(e) => setSearchGiftId(e.target.value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="orderNo" label="關聯訂單號">
            <Input
              placeholder="請輸入訂單號"
              allowClear
              value={searchOrderNo}
              onChange={(e) => setSearchOrderNo(e.target.value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="changeDate" label="變動日期">
            <RangePicker
              style={{ width: '100%' }}
              value={searchDateRange ? [dayjs(searchDateRange[0]), dayjs(searchDateRange[1])] : null}
              onChange={(_, strings) => {
                if (strings && strings[0] && strings[1]) {
                  setSearchDateRange([strings[0], strings[1]])
                } else {
                  setSearchDateRange(null)
                }
              }}
            />
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
        rowKey="id"
        loading={loading}
        onChange={handleTableChange}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
        }}
        scroll={{ x: 1500 }}
      />
    </div>
  )
}
