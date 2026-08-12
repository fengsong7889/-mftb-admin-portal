import { useState, useCallback, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Form, message, Tag, DatePicker, Tooltip } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import type { GiftConsumeItem } from '../../api/gift'
import { fetchGiftConsume } from '../../api/gift'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import type { StoreItem } from '../../api/store'
import { fetchStoresByGroup } from '../../api/store'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

const adTypeColorMap: Record<string, string> = {
  new_store: '#52C41A',
  revival: '#E8720C',
  exclusive: '#722ED1',
  gold: '#FAAD14',
  popular_merchant: '#1890FF',
}

const tradeTypeColorMap: Record<string, string> = {
  ad_purchase: 'orange',
  ad_refund: 'green',
  manual_deduct: 'red',
  auto_expire: 'default',
}

export default function GiftConsumeDetail() {
  // 菜单权限：gift-consume-detail
  const { hasPermission } = useAuth()
  const { t } = useTranslation('giftConsumeDetail')
  const [form] = Form.useForm()

  /** 廣告類型 */
  const adTypeOptions = [
    { label: t('common:all'), value: '' },
    { label: t('adTypeNewStore'), value: 'new_store' },
    { label: t('adTypeRevival'), value: 'revival' },
    { label: t('adTypeExclusive'), value: 'exclusive' },
    { label: t('adTypeGold'), value: 'gold' },
    { label: t('adTypePopularMerchant'), value: 'popular_merchant' },
  ]

  const adTypeMap: Record<string, string> = {
    new_store: t('adTypeNewStore'),
    revival: t('adTypeRevival'),
    exclusive: t('adTypeExclusive'),
    gold: t('adTypeGold'),
    popular_merchant: t('adTypePopularMerchant'),
  }

  /** 交易類型 */
  const tradeTypeOptions = [
    { label: t('common:all'), value: '' },
    { label: t('tradeTypePurchase'), value: 'ad_purchase' },
    { label: t('tradeTypeRefund'), value: 'ad_refund' },
    { label: t('tradeTypeDeduct'), value: 'manual_deduct' },
    { label: t('tradeTypeExpire'), value: 'auto_expire' },
  ]

  const tradeTypeMap: Record<string, string> = {
    ad_purchase: t('tradeTypePurchase'),
    ad_refund: t('tradeTypeRefund'),
    manual_deduct: t('tradeTypeDeduct'),
    auto_expire: t('tradeTypeExpire'),
  }
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<GiftConsumeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  // 勾选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [_selectedRows, setSelectedRows] = useState<GiftConsumeItem[]>([])

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
      message.error(t('common:queryFailed'))
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
    message.success(t('common:exportDev'))
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const handleSelectChange = (keys: React.Key[], rows: GiftConsumeItem[]) => {
    setSelectedRowKeys(keys)
    setSelectedRows(rows)
  }

  const columns: TableColumnsType<GiftConsumeItem> = [
    {
      title: t('colGroupInfo'),
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
      title: t('colStoreInfo'),
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
      title: t('common:brand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (brand: string) => <BrandTag value={brand} />,
    },
    {
      title: t('colAdType'),
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
      title: t('colTradeType'),
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
      title: t('colBalanceChange'),
      dataIndex: 'balanceChange',
      key: 'balanceChange',
      width: 110,
      render: (val: number) => (
        <span style={{
          color: val > 0 ? '#52C41A' : '#FF4D4F',
          fontWeight: 600,
          fontSize: 14,
        }}>
          {val > 0 ? '+' : ''}{val} {t('dayUnit')}
        </span>
      ),
    },
    {
      title: t('colChangeDate'),
      dataIndex: 'changeDate',
      key: 'changeDate',
      width: 120,
    },
    {
      title: t('colAlgorithmInfo'),
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
      title: t('colGiftId'),
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
      title: t('colOrderNo'),
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
      title: t('colRemainingDays'),
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 100,
      render: (days: number) => (
        <span style={{ color: days > 0 ? '#52C41A' : '#8C8C8C', fontWeight: days > 0 ? 600 : 400 }}>
          {days} {t('dayUnit')}
        </span>
      ),
    },
    {
      title: t('colRemark'),
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
          <Form.Item name="groupInfo" label={t('searchGroupIdName')}>
            <Select
              placeholder={t('searchGroupIdPlaceholder')}
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
          <Form.Item name="storeInfo" label={t('searchStoreIdName')}>
            <Select
              placeholder={t('searchStoreIdPlaceholder')}
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
          <Form.Item name="brand" label={t('common:brand')}>
            <Select
              placeholder={t('common:all')}
              allowClear
              options={brandOptions}
              value={searchBrand || undefined}
              onChange={(v) => setSearchBrand(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="adType" label={t('colAdType')}>
            <Select
              placeholder={t('common:all')}
              allowClear
              options={adTypeOptions}
              value={searchAdType || undefined}
              onChange={(v) => setSearchAdType(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="tradeType" label={t('colTradeType')}>
            <Select
              placeholder={t('common:all')}
              allowClear
              options={tradeTypeOptions}
              value={searchTradeType || undefined}
              onChange={(v) => setSearchTradeType(v || '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="algorithmInfo" label={t('searchAlgorithmInfo')}>
            <Input
              placeholder={t('searchAlgorithmPlaceholder')}
              allowClear
              value={searchAlgorithmId}
              onChange={(e) => setSearchAlgorithmId(e.target.value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="giftId" label={t('searchGiftId')}>
            <Input
              placeholder={t('searchGiftIdPlaceholder')}
              allowClear
              value={searchGiftId}
              onChange={(e) => setSearchGiftId(e.target.value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="orderNo" label={t('colOrderNo')}>
            <Input
              placeholder={t('searchOrderNoPlaceholder')}
              allowClear
              value={searchOrderNo}
              onChange={(e) => setSearchOrderNo(e.target.value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="changeDate" label={t('searchChangeDate')}>
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
                {t('common:search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common:reset')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按鈕 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('gift-consume-detail:export') && (
            <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
              {t('common:export')}
            </Button>
          )}
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
        rowSelection={{
          selectedRowKeys,
          onChange: handleSelectChange,
          columnWidth: 40,
          fixed: true,
        }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('common:total', { count: total }),
        }}
        scroll={{ x: 1500 }}
      />
    </div>
  )
}
